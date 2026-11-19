const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

jest.mock('./utils/notificationService', () => ({
  sendNotification: jest.fn().mockResolvedValue(true),
  sendAdminNotification: jest.fn().mockResolvedValue(true),
  init: jest.fn()
}));

const User = require('./models/User');
const Order = require('./models/Order');
const { Post } = require('./models/Product');
const PaymentSession = require('./models/PaymentSession');
const Transaction = require('./models/Transaction');
const OtpToken = require('./models/OtpToken');
const Settings = require('./models/Settings');

const { protect, requireAdminJWT, requireOwnerOrAdmin, sanitizeUser, publicUser } = require('./middleware/auth');
const { mongoSanitizeMiddleware, escapeRegex } = require('./middleware/validate');
const { hashPassword, verifyPassword, BCRYPT_PREFIX_REGEX } = require('./utils/password');
const { signParams, verifyVnpayChecksumStrict, getVnpTmnCode } = require('./utils/vnpay');
const { signUserToken } = require('./utils/b2c');
const { cancelOrderWithRefundAndRestock, settlePaymentSession } = require('./controllers/checkoutController');
const webhookRouter = require('./routes/webhook');
const haipayRouter = require('./routes/haipay');

const uid = () => new mongoose.Types.ObjectId();

describe('PHASE 1 (CRITICAL) - Comprehensive Security & Business Logic Suite (C1 -> C10)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // C2: Chặn tự tạo Admin hoặc truyền role/walletBalance khi đăng ký & sửa profile
  // =========================================================================
  describe('C2 & C6 - Privilege Escalation Prevention (role:"Admin", walletBalance, isSeller)', () => {
    const app = express();
    app.use(express.json());
    app.use(mongoSanitizeMiddleware);

    // Mô phỏng route POST /api/users/register và PUT /api/users/profile/:id như trong backend/server.js
    app.post('/api/users/register', async (req, res) => {
      const { name, email, password, role, roles } = req.body || {};
      if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ message: 'Dữ liệu không hợp lệ' });
      }
      const requestedRole = role || roles;
      if (requestedRole && /(admin|quản trị|root|superuser)/i.test(String(requestedRole))) {
        return res.status(403).json({ message: 'Không được phép chỉ định vai trò Quản trị viên!' });
      }
      const hashedPassword = await hashPassword(password, 10);
      const created = {
        _id: uid(),
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: hashedPassword,
        role: 'Khách hàng',
        isSeller: false,
        sellerStatus: 'none',
        walletBalance: 0,
        pendingBalance: 0
      };
      return res.status(201).json({ user: sanitizeUser(created) });
    });

    app.put('/api/users/profile/:id', protect, requireOwnerOrAdmin('id'), async (req, res) => {
      const body = req.body || {};
      const ALLOWED = ['name', 'phone', 'avatar', 'bio', 'address', 'gender', 'birthday', 'dob'];
      const updateData = {};
      for (const f of ALLOWED) {
        if (typeof body[f] === 'string') updateData[f] = body[f].trim();
      }
      const updated = { ...req.user, ...updateData };
      return res.status(200).json(sanitizeUser(updated));
    });

    test('Gửi role:"Admin" khi đăng ký -> bị từ chối 403; gửi walletBalance/isSeller -> luôn bị ép về 0/false', async () => {
      const resAdminAttempt = await request(app).post('/api/users/register').send({
        name: 'Attacker',
        email: 'attacker@haihand.vn',
        password: 'password123',
        role: 'Admin'
      });
      expect(resAdminAttempt.status).toBe(403);

      const resBalanceAttempt = await request(app).post('/api/users/register').send({
        name: 'Normal User',
        email: 'normal@haihand.vn',
        password: 'password123',
        isSeller: true,
        walletBalance: 999999999
      });
      expect(resBalanceAttempt.status).toBe(201);
      expect(resBalanceAttempt.body.user.role).toBe('Khách hàng');
      expect(resBalanceAttempt.body.user.isSeller).toBe(false);
      expect(resBalanceAttempt.body.user.walletBalance).toBe(0);
    });

    test('PUT /api/users/profile/:id bỏ qua hoàn toàn role:"Admin", walletBalance, isSeller, isBanned', async () => {
      const myId = uid();
      const myUser = {
        _id: myId,
        name: 'User Cũ',
        email: 'u@haihand.vn',
        role: 'Khách hàng',
        isSeller: false,
        walletBalance: 10000,
        status: 'active',
        isBanned: false,
        isDeleted: false,
        tokenVersion: 0
      };
      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(myUser)
      });

      const token = signUserToken(myUser);
      const res = await request(app)
        .put(`/api/users/profile/${myId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'User Mới',
          role: 'Admin',
          isSeller: true,
          walletBalance: 500000000,
          email: 'hacked@haihand.vn'
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('User Mới');
      expect(res.body.role).toBe('Khách hàng');
      expect(res.body.isSeller).toBe(false);
      expect(res.body.walletBalance).toBe(10000);
      expect(res.body.email).toBe('u@haihand.vn');
    });
  });

  // =========================================================================
  // C3 & C4: NoSQL injection trên login + Lazy bcrypt migration + tương thích HaiPay
  // =========================================================================
  describe('C3 & C4 - Login NoSQL Injection Protection & Lazy Bcrypt Migration', () => {
    const app = express();
    app.use(express.json());
    app.use(mongoSanitizeMiddleware);

    app.post('/api/users/login', async (req, res) => {
      const { email, password } = req.body || {};
      if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
        return res.status(401).json({ message: 'Sai email hoặc mật khẩu' });
      }
      const user = await User.findOne({ email: email.trim().toLowerCase() });
      if (!user || !(await verifyPassword(user, password))) {
        return res.status(401).json({ message: 'Sai email hoặc mật khẩu' });
      }
      return res.status(200).json({ ...sanitizeUser(user), token: signUserToken(user) });
    });

    test('Gửi {"password":{"$ne":""}} khi login -> bị chặn 401 ("Sai email hoặc mật khẩu")', async () => {
      const findSpy = jest.spyOn(User, 'findOne');
      const res = await request(app)
        .post('/api/users/login')
        .send({ email: 'admin@haihand.vn', password: { $ne: '' } });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Sai email hoặc mật khẩu');
      expect(findSpy).not.toHaveBeenCalled();
    });

    test('User cũ có mật khẩu thô (legacy plaintext) đăng nhập 1 lần -> DB tự băm thành bcrypt, không bao giờ trả password ra response', async () => {
      const legacyUser = {
        _id: uid(),
        name: 'Khách Cũ',
        email: 'legacy@haihand.vn',
        password: 'plain_password_123',
        role: 'Khách hàng',
        status: 'active',
        isBanned: false,
        save: jest.fn().mockResolvedValue(true),
        toObject() {
          return { ...this };
        }
      };
      jest.spyOn(User, 'findOne').mockResolvedValue(legacyUser);

      // Lần 1: Đăng nhập với mật khẩu đúng -> thành công + DB đã được nâng cấp lên bcrypt
      const res1 = await request(app)
        .post('/api/users/login')
        .send({ email: 'legacy@haihand.vn', password: 'plain_password_123' });

      expect(res1.status).toBe(200);
      expect(res1.body.token).toBeTruthy();
      expect(res1.body.password).toBeUndefined();
      expect(BCRYPT_PREFIX_REGEX.test(legacyUser.password)).toBe(true);
      expect(legacyUser.save).toHaveBeenCalledTimes(1);

      // Lần 2: Đăng nhập lại trên hash bcrypt mới -> vẫn thành công
      const res2 = await request(app)
        .post('/api/users/login')
        .send({ email: 'legacy@haihand.vn', password: 'plain_password_123' });
      expect(res2.status).toBe(200);
    });
  });

  // =========================================================================
  // C5: Verify chỉ đọc trạng thái, IPN đã ký mới ghi tiền & idempotent
  // =========================================================================
  describe('C5 - Read-only /verify & Signed Idempotent VNPay IPN', () => {
    let app;
    let sessionsMap;
    let usersMap;
    let ordersMap;
    let txList;
    const buyerId = uid();
    const sellerId = uid();
    const orderId = uid();

    beforeEach(() => {
      process.env.VNPAY_TMN_CODE = 'TESTTMN1';
      process.env.VNPAY_HASH_SECRET = 'test_vnpay_hash_secret_key_for_c5';

      usersMap = {
        [String(buyerId)]: { _id: buyerId, walletBalance: 100000, pendingBalance: 0, cart: [] },
        [String(sellerId)]: { _id: sellerId, walletBalance: 0, pendingBalance: 0 }
      };

      ordersMap = {
        [String(orderId)]: {
          _id: orderId,
          parentOrderId: 'HH20261119ABC123',
          buyer: buyerId,
          buyerId,
          seller: sellerId,
          sellerId,
          itemsSubtotal: 200000,
          shippingFee: 30000,
          totalPrice: 230000,
          paymentMethod: 'VNPAY',
          paymentStatus: 'unpaid',
          status: 'Pending',
          save: jest.fn().mockImplementation(async function () {
            ordersMap[String(orderId)] = this;
            return this;
          })
        }
      };

      sessionsMap = {
        NAP_TOPUP_1: {
          _id: uid(),
          parentOrderId: 'NAP_TOPUP_1',
          buyer: buyerId,
          orderIds: [],
          amount: 500000,
          method: 'VNPAY',
          status: 'pending'
        },
        HH20261119ABC123: {
          _id: uid(),
          parentOrderId: 'HH20261119ABC123',
          buyer: buyerId,
          orderIds: [orderId],
          purchasedItems: [],
          amount: 230000,
          method: 'VNPAY',
          status: 'pending',
          gatewayPayload: { stockDeducted: true }
        }
      };

      txList = [];

      jest.spyOn(Settings, 'findOne').mockResolvedValue({ commissionRate: 5 });
      jest.spyOn(PaymentSession, 'findOne').mockImplementation(async ({ parentOrderId }) => {
        return sessionsMap[parentOrderId] || null;
      });
      jest.spyOn(PaymentSession, 'findOneAndUpdate').mockImplementation(async (filter, update) => {
        const s = Object.values(sessionsMap).find(
          (item) =>
            (filter._id && String(item._id) === String(filter._id)) ||
            (filter.parentOrderId && item.parentOrderId === filter.parentOrderId)
        );
        if (!s) return null;
        if (filter.status === 'pending' && s.status !== 'pending') return null;
        if (filter.status && filter.status.$ne === 'paid' && s.status === 'paid') return null;
        if (update.$set) Object.assign(s, update.$set);
        return s;
      });
      jest.spyOn(Order, 'find').mockImplementation(async () => [ordersMap[String(orderId)]]);
      jest.spyOn(User, 'findById').mockImplementation(async (id) => usersMap[String(id)] || null);
      jest.spyOn(User, 'findByIdAndUpdate').mockImplementation(async (id, update) => {
        const u = usersMap[String(id)];
        if (!u) return null;
        if (update.$inc) {
          for (const [k, v] of Object.entries(update.$inc)) {
            u[k] = (u[k] || 0) + Number(v);
          }
        }
        return u;
      });
      jest.spyOn(Transaction, 'create').mockImplementation(async (doc) => {
        txList.push(doc);
        return doc;
      });

      app = express();
      app.use(express.json());

      // Read-only verify routes như trong backend/server.js
      app.post('/api/haipay/verify', async (req, res) => {
        const txnRef = String(req.body?.txnRef || '').trim();
        const session = await PaymentSession.findOne({ parentOrderId: txnRef });
        return res.status(200).json({
          txnRef,
          status: session ? session.status : 'pending',
          paid: session?.status === 'paid'
        });
      });

      app.post('/api/vnpay/verify', async (req, res) => {
        const ref = String(req.body?.orderId || '').trim();
        const session = await PaymentSession.findOne({ parentOrderId: ref });
        return res.status(200).json({
          orderId: ref,
          status: session ? session.status : 'pending',
          paid: session?.status === 'paid'
        });
      });

      app.get('/api/vnpay/vnpay_ipn', async (req, res) => {
        const vnp_Params = { ...req.query };
        const secureHash = vnp_Params.vnp_SecureHash;
        const txnRef = String(vnp_Params.vnp_TxnRef || '').trim();
        const rspCode = String(vnp_Params.vnp_ResponseCode || '');
        const txStatus = vnp_Params.vnp_TransactionStatus !== undefined ? String(vnp_Params.vnp_TransactionStatus) : rspCode;
        const tmnCode = String(vnp_Params.vnp_TmnCode || '').trim();
        const rawVnpAmount = Number(vnp_Params.vnp_Amount);

        if (!verifyVnpayChecksumStrict(vnp_Params, secureHash)) {
          return res.status(400).json({ RspCode: '97', Message: 'Invalid Checksum' });
        }
        if (tmnCode && tmnCode !== getVnpTmnCode()) {
          return res.status(400).json({ RspCode: '97', Message: 'Invalid TmnCode' });
        }
        const session = await PaymentSession.findOne({ parentOrderId: txnRef });
        if (!session) return res.status(404).json({ RspCode: '01', Message: 'Session not found' });
        if (rawVnpAmount !== Math.round(Number(session.amount) * 100)) {
          return res.status(400).json({ RspCode: '04', Message: 'Invalid amount' });
        }
        if (session.status === 'paid') {
          return res.status(200).json({ RspCode: '02', Message: 'Order already confirmed' });
        }
        if (rspCode !== '00' || txStatus !== '00') {
          return res.status(200).json({ RspCode: '00', Message: 'Failed tx' });
        }
        if (txnRef.startsWith('NAP_')) {
          const locked = await PaymentSession.findOneAndUpdate(
            { _id: session._id, status: 'pending' },
            { $set: { status: 'paid', paidAt: new Date() } },
            { new: true }
          );
          if (!locked) return res.status(200).json({ RspCode: '02', Message: 'Order already confirmed' });
          await User.findByIdAndUpdate(locked.buyer, { $inc: { walletBalance: Number(locked.amount) } });
          await Transaction.create({ user: locked.buyer, type: 'Nạp tiền', amount: Number(locked.amount), txnRef });
          return res.status(200).json({ RspCode: '00', Message: 'Confirm Success' });
        }
        const settleRes = await settlePaymentSession(txnRef, { gatewayPayload: vnp_Params, paymentMethod: 'VNPAY' });
        if (settleRes.alreadyPaid) return res.status(200).json({ RspCode: '02', Message: 'Order already confirmed' });
        return res.status(200).json({ RspCode: '00', Message: 'Confirm Success' });
      });
    });

    test('1. Gọi /api/haipay/verify và /api/vnpay/verify với responseCode:"00" không chữ ký -> ví không đổi, đơn không thành escrow', async () => {
      const rTopup = await request(app)
        .post('/api/haipay/verify')
        .send({ txnRef: 'NAP_TOPUP_1', responseCode: '00', amount: 50000000 });
      expect(rTopup.status).toBe(200);
      expect(rTopup.body.paid).toBe(false);
      expect(usersMap[String(buyerId)].walletBalance).toBe(100000); // Không tăng

      const rOrder = await request(app)
        .post('/api/vnpay/verify')
        .send({ orderId: 'HH20261119ABC123', responseCode: '00' });
      expect(rOrder.status).toBe(200);
      expect(rOrder.body.paid).toBe(false);
      expect(ordersMap[String(orderId)].paymentStatus).toBe('unpaid'); // Không thành escrow
    });

    test('2. IPN chữ ký sai hoặc thiếu chữ ký -> 400; amount lệch -> 400', async () => {
      const baseParams = {
        vnp_TxnRef: 'NAP_TOPUP_1',
        vnp_Amount: '50000000',
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
        vnp_TmnCode: 'TESTTMN1'
      };

      // Chữ ký sai -> 400
      const rBadSig = await request(app)
        .get('/api/vnpay/vnpay_ipn')
        .query({ ...baseParams, vnp_SecureHash: 'deadbeef' });
      expect(rBadSig.status).toBe(400);
      expect(usersMap[String(buyerId)].walletBalance).toBe(100000);

      // Amount lệch (chỉ trả 1.000đ cho phiên 500.000đ) dù chữ ký đúng -> 400
      const wrongAmountParams = { ...baseParams, vnp_Amount: '100000' };
      const wrongSig = signParams(wrongAmountParams);
      const rWrongAmt = await request(app)
        .get('/api/vnpay/vnpay_ipn')
        .query({ ...wrongAmountParams, vnp_SecureHash: wrongSig });
      expect(rWrongAmt.status).toBe(400);
      expect(usersMap[String(buyerId)].walletBalance).toBe(100000);
    });

    test('3. IPN đúng chữ ký & đúng số tiền gọi 2 lần liên tiếp -> ví chỉ cộng đúng 1 lần', async () => {
      const validParams = {
        vnp_TxnRef: 'NAP_TOPUP_1',
        vnp_Amount: '50000000',
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
        vnp_TmnCode: 'TESTTMN1'
      };
      const sig = signParams(validParams);

      const r1 = await request(app)
        .get('/api/vnpay/vnpay_ipn')
        .query({ ...validParams, vnp_SecureHash: sig });
      expect(r1.status).toBe(200);
      expect(r1.body.RspCode).toBe('00');
      expect(usersMap[String(buyerId)].walletBalance).toBe(600000); // 100k + 500k

      // Gọi lặp lần 2 -> không cộng lần 2
      const r2 = await request(app)
        .get('/api/vnpay/vnpay_ipn')
        .query({ ...validParams, vnp_SecureHash: sig });
      expect(r2.status).toBe(200);
      expect(r2.body.RspCode).toBe('02');
      expect(usersMap[String(buyerId)].walletBalance).toBe(600000);
      expect(txList).toHaveLength(1);
    });
  });

  // =========================================================================
  // C7: Chống lộ dữ liệu cá nhân/tài chính trên public-profile, search, GET /api/users/:id
  // =========================================================================
  describe('C7 - PII & Financial Data Protection', () => {
    test('publicUser ẩn hoàn toàn email, phone, cccd, taxId, bankInfo, walletBalance, pendingBalance, walletPin', () => {
      const fullUser = {
        _id: uid(),
        name: 'Shop Đồ Cũ',
        email: 'secret@haihand.vn',
        phone: '0988777666',
        cccd: '079099001122',
        taxId: '888999000',
        walletBalance: 12500000,
        pendingBalance: 950000,
        walletPin: '$2a$10$pinhash',
        bankInfo: { name: 'MBBank', accountNumber: '123456', accountName: 'SHOP DO CU' },
        shopInfo: { shopName: 'Shop Đồ Cũ', phone: '0988777666', taxCode: '888999000' }
      };

      const pub = publicUser(fullUser);
      expect(pub.name).toBe('Shop Đồ Cũ');
      expect(pub.email).toBeUndefined();
      expect(pub.phone).toBeUndefined();
      expect(pub.cccd).toBeUndefined();
      expect(pub.taxId).toBeUndefined();
      expect(pub.walletBalance).toBeUndefined();
      expect(pub.pendingBalance).toBeUndefined();
      expect(pub.walletPin).toBeUndefined();
      expect(pub.bankInfo).toBeUndefined();
      expect(pub.shopInfo.phone).toBeUndefined();
      expect(pub.shopInfo.taxCode).toBeUndefined();
    });
  });

  // =========================================================================
  // C9: Admin refund-order gọi 2 lần -> ví người mua chỉ tăng đúng 1 lần
  // =========================================================================
  describe('C9 - Idempotent Admin Order Refund (/api/admin/refund-order/:orderId)', () => {
    const app = express();
    app.use(express.json());

    const adminId = uid();
    const buyerId = uid();
    const sellerId = uid();
    const productId = uid();
    let orderDoc;
    let usersMap;

    beforeEach(() => {
      usersMap = {
        [String(adminId)]: { _id: adminId, role: 'Admin', status: 'active', isBanned: false, isDeleted: false, tokenVersion: 0 },
        [String(buyerId)]: { _id: buyerId, role: 'Khách hàng', walletBalance: 100000, pendingBalance: 0 },
        [String(sellerId)]: { _id: sellerId, role: 'Khách hàng', walletBalance: 50000, pendingBalance: 190000 }
      };

      orderDoc = {
        _id: uid(),
        buyer: buyerId,
        buyerId,
        seller: sellerId,
        sellerId,
        itemsSubtotal: 200000,
        shippingFee: 0,
        totalPrice: 200000,
        commissionRate: 5,
        sellerReceive: 190000,
        paymentMethod: 'HAIPAY',
        paymentStatus: 'escrow',
        status: 'Pending',
        orderItems: [{ productId, quantity: 1, price: 200000 }]
      };

      jest.spyOn(Settings, 'findOne').mockResolvedValue({ commissionRate: 5 });
      jest.spyOn(User, 'findById').mockImplementation((id) => ({
        select: jest.fn().mockResolvedValue(usersMap[String(id)] || null),
        then: (resolve) => Promise.resolve(usersMap[String(id)] || null).then(resolve)
      }));
      jest.spyOn(User, 'findByIdAndUpdate').mockImplementation(async (id, update) => {
        const u = usersMap[String(id)];
        if (!u) return null;
        if (update.$inc) {
          for (const [k, v] of Object.entries(update.$inc)) {
            u[k] = (u[k] || 0) + Number(v);
          }
        }
        return u;
      });
      jest.spyOn(Order, 'findById').mockImplementation(async (id) => {
        return String(id) === String(orderDoc._id) ? orderDoc : null;
      });
      jest.spyOn(Order, 'findOneAndUpdate').mockImplementation(async (filter, update) => {
        if (String(filter._id) !== String(orderDoc._id)) return null;
        if (filter.paymentStatus?.$nin && filter.paymentStatus.$nin.includes(orderDoc.paymentStatus)) {
          return null;
        }
        Object.assign(orderDoc, update.$set);
        return orderDoc;
      });
      jest.spyOn(Post, 'findByIdAndUpdate').mockResolvedValue({ stockQuantity: 2, status: 'active' });
      jest.spyOn(Transaction, 'create').mockResolvedValue({});

      app.post('/api/admin/refund-order/:orderId', requireAdminJWT, async (req, res) => {
        const order = await Order.findById(req.params.orderId);
        if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
        if (order.paymentStatus === 'refunded') {
          return res.status(409).json({ message: 'Đơn hàng này đã được hoàn tiền trước đó!' });
        }
        if (order.paymentMethod === 'COD' || order.paymentStatus !== 'escrow') {
          return res.status(400).json({ message: 'Chỉ hoàn tiền đơn escrow!' });
        }
        const result = await cancelOrderWithRefundAndRestock(order, {
          cancelledBy: 'admin',
          reason: 'Admin hoàn tiền'
        });
        if (!result.success) {
          return res.status(409).json({ message: result.message });
        }
        return res.status(200).json({ message: 'Hoàn tiền thành công', refundedAmount: result.refundedAmount });
      });
    });

    test('Gọi POST /api/admin/refund-order/:orderId 2 lần -> lần 1 hoàn 200k (200), lần 2 bị chặn (409), ví chỉ tăng đúng 1 lần', async () => {
      const adminToken = signUserToken(usersMap[String(adminId)]);

      const r1 = await request(app)
        .post(`/api/admin/refund-order/${orderDoc._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r1.status).toBe(200);
      expect(usersMap[String(buyerId)].walletBalance).toBe(300000); // 100k + 200k
      expect(usersMap[String(sellerId)].pendingBalance).toBe(0); // 190k - 190k

      const r2 = await request(app)
        .post(`/api/admin/refund-order/${orderDoc._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r2.status).toBe(409);
      expect(usersMap[String(buyerId)].walletBalance).toBe(300000); // Giữ nguyên 300k
      expect(usersMap[String(sellerId)].pendingBalance).toBe(0);
    });
  });

  // =========================================================================
  // C10: Webhook GHN bắt buộc token, bỏ qua delivered cho đơn đã Cancelled, không lộ trackingLogs
  // =========================================================================
  describe('C10 - Authenticated & State-Guarded GHN Webhook', () => {
    const app = express();
    app.use(express.json());
    app.use('/api/webhook', webhookRouter);

    const oldToken = process.env.GHN_WEBHOOK_TOKEN;
    beforeEach(() => {
      process.env.GHN_WEBHOOK_TOKEN = 'ghn_super_secret_token_2026';
    });
    afterEach(() => {
      if (oldToken === undefined) delete process.env.GHN_WEBHOOK_TOKEN;
      else process.env.GHN_WEBHOOK_TOKEN = oldToken;
    });

    test('1. Không có token hoặc sai token -> 401', async () => {
      const rNoToken = await request(app)
        .post('/api/webhook/ghn')
        .send({ ClientOrderCode: String(uid()), Status: 'delivering' });
      expect(rNoToken.status).toBe(401);

      const rWrongToken = await request(app)
        .post('/api/webhook/ghn')
        .set('x-ghn-token', 'wrong_token')
        .send({ ClientOrderCode: String(uid()), Status: 'delivering' });
      expect(rWrongToken.status).toBe(401);
    });

    test('2. Gửi delivered cho đơn đã Cancelled -> bỏ qua (status vẫn là Cancelled) và response không lộ trackingLogs', async () => {
      const cancelledOrder = {
        _id: uid(),
        status: 'Cancelled',
        paymentStatus: 'refunded',
        trackingLogs: [{ status: 'cancel', description: 'Đã hủy' }],
        save: jest.fn().mockResolvedValue(true)
      };
      jest.spyOn(Order, 'findById').mockResolvedValue(cancelledOrder);

      const res = await request(app)
        .post('/api/webhook/ghn')
        .set('x-ghn-token', 'ghn_super_secret_token_2026')
        .send({ ClientOrderCode: String(cancelledOrder._id), Status: 'delivered' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.ignored).toBe(true);
      expect(res.body.trackingLogs).toBeUndefined();
      expect(cancelledOrder.status).toBe('Cancelled');
      expect(cancelledOrder.save).not.toHaveBeenCalled();
    });
  });
});
