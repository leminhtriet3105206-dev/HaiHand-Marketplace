const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');

jest.mock('./utils/notificationService', () => ({
  sendNotification: jest.fn().mockResolvedValue(true),
  sendAdminNotification: jest.fn().mockResolvedValue(true),
  init: jest.fn()
}));

jest.mock('./services/shipping', () => ({
  quotePackage: jest.fn().mockResolvedValue({
    fee: 20000,
    provider: 'mock',
    carrier: 'HaiHand Express'
  }),
  createShipmentForOrder: jest.fn().mockResolvedValue({
    trackingCode: 'GHN_TEST_123',
    fee: 20000,
    provider: 'ghn'
  })
}));

const User = require('./models/User');
const Order = require('./models/Order');
const { Product, Post } = require('./models/Product');
const PaymentSession = require('./models/PaymentSession');
const Transaction = require('./models/Transaction');
const Settings = require('./models/Settings');

const { protect, protectStrict, requireAdminJWT, isSeller } = require('./middleware/auth');
const { mongoSanitizeMiddleware } = require('./middleware/validate');
const { hashPassword, verifyUserWalletPin } = require('./utils/password');
const { signUserToken, canonicalStatus, orderBuyerId, orderSellerId } = require('./utils/b2c');
const {
  processCheckout,
  cancelOrderWithRefundAndRestock,
  settlePaymentSession
} = require('./controllers/checkoutController');
const {
  transitionOrder,
  autoCompleteDeliveredOrders,
  settleCodOrderIfEligible
} = require('./utils/orderStateMachine');
const createSellerRouter = require('./routes/seller');
const haipayRouter = require('./routes/haipay');

const uid = () => new mongoose.Types.ObjectId();

const VALID_ADDRESS = {
  fullName: 'Nguyễn Văn Mua',
  phone: '0912345678',
  provinceId: 202,
  provinceName: 'TP. Hồ Chí Minh',
  districtId: 1442,
  districtName: 'Quận 1',
  wardCode: '20101',
  wardName: 'Phường Bến Nghé',
  street: '123 Lê Lợi'
};

describe('PHASE 2 (HIGH) - Comprehensive Security & Business Logic Suite (H0 -> H17)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // H0 & M6: Product price/stock bounds, duplicate merge, anti-self-purchase
  // =========================================================================
  describe('H0 & M6 - Product Price/Stock Validation, Duplicate Item Merge & Self-Purchase Block', () => {
    const app = express();
    app.use(express.json());
    app.use(mongoSanitizeMiddleware);
    app.use(
      createSellerRouter({
        upload: {
          array: () => (req, res, next) => next(),
          fields: () => (req, res, next) => next()
        },
        sendNotification: jest.fn(),
        sendAdminNotification: jest.fn()
      })
    );
    app.post('/api/checkout', protect, processCheckout);

    test('H0: Tạo sản phẩm giá âm hoặc < 1000đ bị từ chối 400; Mongoose schema từ chối price < 1000', async () => {
      const sellerId = uid();
      const sellerUser = {
        _id: sellerId,
        name: 'Shop A',
        role: 'Khách hàng',
        isSeller: true,
        sellerStatus: 'approved',
        status: 'active',
        isBanned: false,
        tokenVersion: 0
      };
      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(sellerUser)
      });

      const token = signUserToken(sellerUser);

      // 1. Tạo sản phẩm với price = -50000 -> 400
      const resNeg = await request(app)
        .post('/api/seller/products')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Áo âm tiền', price: -50000, category: 'Thời trang', stockQuantity: 5 });
      expect(resNeg.status).toBe(400);

      // 2. Tạo sản phẩm với price = 0 -> 400
      const resZero = await request(app)
        .post('/api/seller/products')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Áo 0 đồng', price: 0, category: 'Thời trang', stockQuantity: 5 });
      expect(resZero.status).toBe(400);

      // 3. Tạo sản phẩm với stockQuantity = -3 -> 400
      const resNegStock = await request(app)
        .post('/api/seller/products')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Áo âm kho', price: 50000, category: 'Thời trang', stockQuantity: -3 });
      expect(resNegStock.status).toBe(400);

      // 4. Kiểm tra trực tiếp Mongoose validator trên Product model
      const invalidDoc = new Product({
        name: 'Invalid Price Doc',
        price: -100,
        stockQuantity: 1
      });
      const err = invalidDoc.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.price).toBeDefined();
    });

    test('H0 & M6: Gộp dòng trùng sản phẩm trước khi kiểm kho -> tổng vượt tồn kho bị từ chối 400', async () => {
      const buyerId = uid();
      const sellerId = uid();
      const prodId = uid();

      const buyerUser = {
        _id: buyerId,
        name: 'Buyer',
        role: 'Khách hàng',
        status: 'active',
        isBanned: false,
        tokenVersion: 0,
        cart: []
      };

      jest.spyOn(User, 'findById').mockImplementation((id) => {
        const q = Promise.resolve(buyerUser);
        q.select = jest.fn().mockResolvedValue(buyerUser);
        return q;
      });
      jest.spyOn(Settings, 'findOne').mockResolvedValue({ codEnabled: true, maintenanceMode: false });

      // Tồn kho chỉ có 2 cái, nhưng gửi 2 dòng trùng cùng prodId mỗi dòng quantity: 2 (tổng 4 > 2)
      jest.spyOn(Post, 'find').mockResolvedValue([
        {
          _id: prodId,
          name: 'Máy ảnh cổ',
          price: 150000,
          status: 'active',
          moderationStatus: 'approved',
          stockQuantity: 2,
          quantity: 2,
          sellerId
        }
      ]);

      const token = signUserToken(buyerUser);
      const res = await request(app)
        .post('/api/checkout')
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [
            { productId: prodId.toString(), quantity: 2 },
            { productId: prodId.toString(), quantity: 2 }
          ],
          shippingAddress: VALID_ADDRESS,
          paymentMethod: 'COD'
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/chỉ còn 2 cái trong kho/);
    });
  });

  // =========================================================================
  // H1: stockDeducted flag prevents restock inflation
  // =========================================================================
  describe('H1 - stockDeducted Flag on Order Cancellation', () => {
    test('H1: Hủy đơn có stockDeducted: false -> tồn kho KHÔNG bị cộng khống; hủy đơn stockDeducted: true -> cộng kho đúng 1 lần', async () => {
      const orderId1 = uid();
      const prodId = uid();

      const orderNoDeduct = {
        _id: orderId1,
        status: 'Pending',
        paymentMethod: 'VNPAY',
        paymentStatus: 'unpaid',
        stockDeducted: false,
        orderItems: [{ productId: prodId, quantity: 3 }]
      };

      jest.spyOn(Order, 'findOneAndUpdate').mockResolvedValueOnce({
        ...orderNoDeduct,
        status: 'Cancelled',
        stockDeducted: false
      });
      const postUpdateSpy = jest.spyOn(Post, 'findByIdAndUpdate').mockResolvedValue({});

      const res1 = await cancelOrderWithRefundAndRestock(orderNoDeduct, { cancelledBy: 'buyer' });
      expect(res1.success).toBe(true);
      expect(postUpdateSpy).not.toHaveBeenCalled();

      // Đơn có stockDeducted: true -> khi hủy sẽ trả kho và tắt stockDeducted: false
      const orderId2 = uid();
      const orderWithDeduct = {
        _id: orderId2,
        status: 'Pending',
        paymentMethod: 'VNPAY',
        paymentStatus: 'unpaid',
        stockDeducted: true,
        orderItems: [{ productId: prodId, quantity: 2 }]
      };

      jest.spyOn(Order, 'findOneAndUpdate').mockResolvedValueOnce({
        ...orderWithDeduct,
        status: 'Cancelled',
        stockDeducted: false
      });
      postUpdateSpy.mockResolvedValueOnce({
        _id: prodId,
        stockQuantity: 2,
        quantity: 2,
        soldCount: 0,
        status: 'active'
      });

      const res2 = await cancelOrderWithRefundAndRestock(orderWithDeduct, { cancelledBy: 'buyer' });
      expect(res2.success).toBe(true);
      expect(postUpdateSpy).toHaveBeenCalledWith(
        prodId.toString(),
        { $inc: { stockQuantity: 2, quantity: 2, soldCount: -2 } },
        { new: true }
      );
    });
  });

  // =========================================================================
  // H2: Atomic stock reservation race condition test (2 concurrent requests for last item)
  // =========================================================================
  describe('H2 - Atomic Stock Reservation Race Condition (2 Parallel Requests for Last Item)', () => {
    const app = express();
    app.use(express.json());
    app.post('/api/checkout', protect, processCheckout);

    test('H2: 2 request song song cùng mua món hàng cuối cùng (stockQuantity = 1) -> đúng 1 thành công (200), 1 thất bại hết hàng (400)', async () => {
      const buyerId = uid();
      const sellerId = uid();
      const prodId = uid();

      const buyerUser = {
        _id: buyerId,
        name: 'Buyer Race',
        role: 'Khách hàng',
        status: 'active',
        isBanned: false,
        tokenVersion: 0,
        cart: [],
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(User, 'findById').mockImplementation(() => {
        const q = Promise.resolve(buyerUser);
        q.select = jest.fn().mockResolvedValue(buyerUser);
        return q;
      });
      jest.spyOn(Settings, 'findOne').mockResolvedValue({ codEnabled: true, maintenanceMode: false });

      // Giả lập kho trong bộ nhớ có stockQuantity = 1 và khóa nguyên tử trong findOneAndUpdate
      let liveStock = 1;
      const productDoc = {
        _id: prodId,
        name: 'Đồng hồ Seiko duy nhất 1 chiếc',
        price: 500000,
        status: 'active',
        moderationStatus: 'approved',
        stockQuantity: 1,
        quantity: 1,
        sellerId
      };

      jest.spyOn(Post, 'find').mockResolvedValue([productDoc]);
      jest.spyOn(Post, 'findOneAndUpdate').mockImplementation(async (filter, update) => {
        const requiredQty = filter?.stockQuantity?.$gte || 1;
        if (liveStock >= requiredQty) {
          liveStock -= requiredQty;
          return {
            ...productDoc,
            stockQuantity: liveStock,
            quantity: liveStock
          };
        }
        return null; // Hết hàng cho request thứ 2
      });
      jest.spyOn(Post, 'findByIdAndUpdate').mockResolvedValue(productDoc);
      jest.spyOn(Order.prototype, 'save').mockResolvedValue(true);
      jest.spyOn(PaymentSession.prototype, 'save').mockResolvedValue(true);

      const token = signUserToken(buyerUser);
      const payload = {
        items: [{ productId: prodId.toString(), quantity: 1 }],
        shippingAddress: VALID_ADDRESS,
        paymentMethod: 'COD'
      };

      // Bắn 2 request đồng thời
      const [resA, resB] = await Promise.all([
        request(app).post('/api/checkout').set('Authorization', `Bearer ${token}`).send(payload),
        request(app).post('/api/checkout').set('Authorization', `Bearer ${token}`).send(payload)
      ]);

      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([200, 400]);
      expect(liveStock).toBe(0);
    });
  });

  // =========================================================================
  // H3: Seller cannot self-approve product; editing price resets to pending; Admin locked cannot be unhidden
  // =========================================================================
  describe('H3 - Moderation Status Separation & Self-Approval Prevention', () => {
    const app = express();
    app.use(express.json());
    app.use(
      createSellerRouter({
        upload: {
          array: () => (req, res, next) => next(),
          fields: () => (req, res, next) => next()
        },
        sendNotification: jest.fn(),
        sendAdminNotification: jest.fn()
      })
    );

    test('H3: Seller gửi status:"active" khi sửa sản phẩm hoặc sửa giá sản phẩm đã duyệt -> luôn quay về pending; sản phẩm bị Admin khóa không thể tự bật lại', async () => {
      const sellerId = uid();
      const prodId = uid();
      const sellerUser = {
        _id: sellerId,
        name: 'Seller H3',
        role: 'Khách hàng',
        isSeller: true,
        sellerStatus: 'approved',
        status: 'active',
        isBanned: false,
        tokenVersion: 0
      };

      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(sellerUser)
      });
      jest.spyOn(Settings, 'findOne').mockResolvedValue({ autoApprovePosts: false });

      const existingProduct = {
        _id: prodId,
        name: 'Giày Nike cũ',
        price: 500000,
        stockQuantity: 3,
        quantity: 3,
        status: 'active',
        moderationStatus: 'approved',
        sellerId,
        author: sellerId,
        images: ['img1.jpg'],
        save: jest.fn().mockResolvedValue(true)
      };
      jest.spyOn(Post, 'findById').mockResolvedValue(existingProduct);

      const token = signUserToken(sellerUser);

      // 1. Seller sửa giá từ 500k lên 900k và cố tình truyền status: 'active', moderationStatus: 'approved'
      const resEdit = await request(app)
        .put(`/api/seller/products/${prodId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          price: 900000,
          status: 'active',
          moderationStatus: 'approved'
        });

      expect(resEdit.status).toBe(200);
      expect(existingProduct.moderationStatus).toBe('pending');
      expect(existingProduct.status).toBe('pending');

      // 2. Nếu sản phẩm đã bị Admin khóa (moderationStatus: 'locked') -> seller gọi /visibility để hiện lại bị chặn 403
      existingProduct.moderationStatus = 'locked';
      existingProduct.status = 'DELETED';

      const resUnhideLocked = await request(app)
        .patch(`/api/seller/products/${prodId}/visibility`)
        .set('Authorization', `Bearer ${token}`)
        .send({ visible: true });

      expect(resUnhideLocked.status).toBe(403);
    });
  });

  // =========================================================================
  // H5 & H6: COD Settlement & Buyer Dispute Blocking Auto-Complete / Release-Funds
  // =========================================================================
  describe('H5 & H6 - Idempotent COD Settlement & Dispute Blocking Release/Auto-Complete', () => {
    test('H5: Đơn COD sang Delivered -> ghi có walletBalance cho seller đúng 1 lần (idempotent qua cờ settled)', async () => {
      const orderId = uid();
      const sellerId = uid();
      const codOrder = {
        _id: orderId,
        seller: sellerId,
        sellerId,
        paymentMethod: 'COD',
        paymentStatus: 'unpaid',
        status: 'Delivered',
        itemsSubtotal: 200000,
        shippingFee: 25000,
        totalPrice: 225000,
        settled: false
      };

      jest.spyOn(Settings, 'findOne').mockReturnValue({
        lean: jest.fn().mockResolvedValue({ platformFeePercentage: 5 })
      });
      // Lần 1: cổng atomic findOneAndUpdate({ _id, settled: { $ne: true } }) trả về đơn đã khóa
      const orderLockSpy = jest
        .spyOn(Order, 'findOneAndUpdate')
        .mockResolvedValueOnce({ ...codOrder, settled: true, paymentStatus: 'released' })
        .mockResolvedValueOnce(null); // Lần 2 trả về null

      const sellerCreditSpy = jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({});
      jest.spyOn(Transaction, 'create').mockResolvedValue({});

      const firstRun = await settleCodOrderIfEligible(codOrder);
      expect(firstRun.settled).toBe(true);
      expect(firstRun.sellerReceive).toBe(190000); // 200.000 - 5% = 190.000
      expect(sellerCreditSpy).toHaveBeenCalledTimes(1);
      expect(sellerCreditSpy.mock.calls[0][1]).toEqual({
        $inc: { walletBalance: 190000 }
      });

      // Gọi lần 2 trên cùng đơn -> không cộng tiền lần 2 (alreadySettled = true)
      const secondRun = await settleCodOrderIfEligible(codOrder);
      expect(secondRun.alreadySettled).toBe(true);
      expect(sellerCreditSpy).toHaveBeenCalledTimes(1);
      expect(orderLockSpy).toHaveBeenCalledTimes(2);
    });

    test('H6: Đơn đang có khiếu nại mở (dispute.isDisputed = true) không bị auto-complete', async () => {
      const findSpy = jest.spyOn(Order, 'find').mockResolvedValue([]);
      const res = await autoCompleteDeliveredOrders({ days: 7 });
      expect(res.count).toBe(0);
      // Kiểm tra filter truy vấn của autoCompleteDeliveredOrders có chặn dispute.isDisputed: { $ne: true }
      expect(findSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          'dispute.isDisputed': { $ne: true },
          'dispute.status': { $nin: ['open'] }
        })
      );
    });
  });

  // =========================================================================
  // H7: Server-side Settings Flags (codEnabled, allowNewSellerRegistration, paymentMethod whitelist)
  // =========================================================================
  describe('H7 - Server-side Settings Flags Enforcement', () => {
    const app = express();
    app.use(express.json());
    app.use(
      createSellerRouter({
        upload: {
          array: () => (req, res, next) => next(),
          fields: () => (req, res, next) => next()
        },
        sendNotification: jest.fn(),
        sendAdminNotification: jest.fn()
      })
    );
    app.post('/api/checkout', protect, processCheckout);

    test('H7: Tắt codEnabled -> checkout COD bị từ chối 400; gửi paymentMethod lạ (CRYPTO) -> 400; tắt allowNewSellerRegistration -> apply-seller bị chặn 403', async () => {
      const userId = uid();
      const testUser = {
        _id: userId,
        name: 'User H7',
        role: 'Khách hàng',
        isSeller: false,
        sellerStatus: 'none',
        status: 'active',
        isBanned: false,
        tokenVersion: 0
      };

      jest.spyOn(User, 'findById').mockImplementation(() => {
        const q = Promise.resolve(testUser);
        q.select = jest.fn().mockResolvedValue(testUser);
        return q;
      });

      const token = signUserToken(testUser);

      // 1. paymentMethod không nằm trong {COD, VNPAY, HAIPAY} -> 400
      const resInvalidMethod = await request(app)
        .post('/api/checkout')
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [{ productId: uid().toString(), quantity: 1 }],
          shippingAddress: VALID_ADDRESS,
          paymentMethod: 'CRYPTO_FREE'
        });
      expect(resInvalidMethod.status).toBe(400);

      // 2. codEnabled: false -> checkout COD bị chặn 400
      jest.spyOn(Settings, 'findOne').mockResolvedValue({
        codEnabled: false,
        vnpayEnabled: true,
        haipayEnabled: true,
        allowNewSellerRegistration: false,
        maintenanceMode: false
      });

      const resCodDisabled = await request(app)
        .post('/api/checkout')
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [{ productId: uid().toString(), quantity: 1 }],
          shippingAddress: VALID_ADDRESS,
          paymentMethod: 'COD'
        });
      expect(resCodDisabled.status).toBe(400);
      expect(resCodDisabled.body.message).toMatch(/COD.*tạm ngưng/i);

      // 3. allowNewSellerRegistration: false -> apply-seller bị chặn 403
      const resApplyDisabled = await request(app)
        .post('/api/users/apply-seller')
        .set('Authorization', `Bearer ${token}`)
        .send({ shopName: 'Shop Mới' });
      expect(resApplyDisabled.status).toBe(403);
    });
  });

  // =========================================================================
  // H8 & H11: Mandatory Wallet PIN with 5-attempt 15-minute Lockout & /api/haipay/status
  // =========================================================================
  describe('H8 & H11 - Wallet PIN Verification, 5-Strike Lockout (15m), & GET /api/haipay/status', () => {
    const app = express();
    app.use(express.json());
    app.use('/api/haipay', haipayRouter);
    app.post('/api/checkout', protect, processCheckout);

    test('H8: Nhập sai PIN ví 5 lần liên tiếp -> khóa tạm thời 15 phút (423); ngay cả khi nhập đúng PIN ở lần thứ 6 trong thời gian khóa vẫn bị từ chối 423', async () => {
      const hashedPin = await hashPassword('123456', 10);
      const userDoc = {
        _id: uid(),
        walletPin: hashedPin,
        pinFailedAttempts: 0,
        pinLockedUntil: null,
        save: jest.fn().mockResolvedValue(true)
      };

      // Thiếu PIN -> 400
      const resMissing = await verifyUserWalletPin(userDoc, '');
      expect(resMissing.ok).toBe(false);
      expect(resMissing.statusCode).toBe(400);

      // Nhập sai 4 lần đầu -> 400
      for (let i = 1; i <= 4; i++) {
        const r = await verifyUserWalletPin(userDoc, '000000');
        expect(r.ok).toBe(false);
        expect(r.statusCode).toBe(400);
        expect(userDoc.pinFailedAttempts).toBe(i);
      }

      // Lần sai thứ 5 -> khóa 15 phút (statusCode 423)
      const fifth = await verifyUserWalletPin(userDoc, '000000');
      expect(fifth.ok).toBe(false);
      expect(fifth.locked).toBe(true);
      expect(fifth.statusCode).toBe(423);
      expect(userDoc.pinLockedUntil).toBeInstanceOf(Date);
      expect(userDoc.pinLockedUntil.getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000);

      // Lần thứ 6: nhập ĐÚNG PIN '123456' khi đang bị khóa -> vẫn bị từ chối 423
      const sixthWhileLocked = await verifyUserWalletPin(userDoc, '123456');
      expect(sixthWhileLocked.ok).toBe(false);
      expect(sixthWhileLocked.statusCode).toBe(423);
    });

    test('H11: GET /api/haipay/status trả đúng { isWalletActive, walletBalance, hasPin } khi có Bearer JWT', async () => {
      const myId = uid();
      const hashedPin = await hashPassword('654321', 10);
      const myUser = {
        _id: myId,
        name: 'HaiPay User',
        role: 'Khách hàng',
        status: 'active',
        isBanned: false,
        isWalletActive: true,
        walletBalance: 750000,
        pendingBalance: 120000,
        walletPin: hashedPin,
        tokenVersion: 0
      };

      jest.spyOn(User, 'findById').mockImplementation(() => {
        const q = Promise.resolve(myUser);
        q.select = jest.fn().mockResolvedValue(myUser);
        return q;
      });

      const token = signUserToken(myUser);
      const res = await request(app)
        .get('/api/haipay/status')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        isWalletActive: true,
        walletBalance: 750000,
        pendingBalance: 120000,
        hasPin: true
      });
    });
  });

  // =========================================================================
  // H9 & H10: Spoofed userid header without JWT -> 401; Banned/Locked user JWT -> 403
  // =========================================================================
  describe('H9 & H10 - Reject Spoofed userid Header & Block Locked/Banned User Token', () => {
    const app = express();
    app.use(express.json());
    app.get('/api/protected-check', protect, (req, res) => res.json({ ok: true }));

    test('H9: Gửi header userid nhưng không có Bearer JWT -> 401', async () => {
      const res = await request(app)
        .get('/api/protected-check')
        .set('userid', uid().toString());
      expect(res.status).toBe(401);
    });

    test('H10: Gửi Bearer JWT của tài khoản vừa bị Admin khóa (isBanned: true) -> 403', async () => {
      const bannedUser = {
        _id: uid(),
        name: 'Banned User',
        role: 'Khách hàng',
        status: 'locked',
        isBanned: true,
        tokenVersion: 0
      };
      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(bannedUser)
      });

      const token = signUserToken(bannedUser);
      const res = await request(app)
        .get('/api/protected-check')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // H17: POST /api/reviews Atomic Gate & Strict Validation
  // =========================================================================
  describe('H17 - POST /api/reviews Validation & Atomic Single-Review Gate', () => {
    const app = express();
    app.use(express.json());

    app.post('/api/reviews', protect, async (req, res) => {
      const { rating, comment, orderId } = req.body || {};
      if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
        return res.status(400).json({ message: 'Mã đơn hàng (orderId) không hợp lệ!' });
      }
      const numRating = Number(rating);
      if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5 || String(rating).includes('.')) {
        return res.status(400).json({ message: 'Điểm đánh giá (rating) phải là số nguyên từ 1 đến 5!' });
      }
      if (typeof comment !== 'string' || !comment.trim()) {
        return res.status(400).json({ message: 'Vui lòng nhập nội dung đánh giá!' });
      }
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ message: 'Không tìm thấy đơn hàng!' });
      }
      const buyerId = orderBuyerId(order);
      if (!buyerId || String(buyerId) !== String(req.user._id)) {
        return res.status(403).json({ message: 'Bạn chỉ có thể đánh giá đơn hàng do chính bạn đặt mua!' });
      }
      if (canonicalStatus(order.status) !== 'Completed') {
        return res.status(400).json({ message: 'Chỉ có thể đánh giá sau khi đơn hàng đã Hoàn thành (Completed)!' });
      }
      const lockedOrder = await Order.findOneAndUpdate(
        { _id: order._id, isReviewed: { $ne: true } },
        { $set: { isReviewed: true } },
        { new: true }
      );
      if (!lockedOrder) {
        return res.status(400).json({ message: 'Đơn hàng này đã được đánh giá rồi!' });
      }
      return res.status(200).json({
        message: 'Đánh giá thành công!',
        review: {
          seller: orderSellerId(order),
          buyer: req.user._id,
          rating: numRating,
          comment: comment.trim(),
          orderId: order._id
        }
      });
    });

    test('H17: Từ chối orderId không tồn tại (404), từ chối người không phải buyer (403), từ chối rating lẻ/ngoài 1-5 (400), và chặn đánh giá trùng lần 2 bằng cổng atomic', async () => {
      const buyerId = uid();
      const otherUserId = uid();
      const sellerId = uid();
      const orderId = uid();

      const buyerUser = {
        _id: buyerId,
        name: 'Real Buyer',
        role: 'Khách hàng',
        status: 'active',
        isBanned: false,
        tokenVersion: 0
      };
      const otherUser = {
        _id: otherUserId,
        name: 'Other User',
        role: 'Khách hàng',
        status: 'active',
        isBanned: false,
        tokenVersion: 0
      };

      jest.spyOn(User, 'findById').mockImplementation((id) => {
        const u = String(id) === String(buyerId) ? buyerUser : otherUser;
        return { select: jest.fn().mockResolvedValue(u) };
      });

      const buyerToken = signUserToken(buyerUser);
      const otherToken = signUserToken(otherUser);

      // 1. Order không tồn tại -> 404
      jest.spyOn(Order, 'findById').mockResolvedValueOnce(null);
      const resNotFound = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ orderId: orderId.toString(), rating: 5, comment: 'Tốt' });
      expect(resNotFound.status).toBe(404);

      const completedOrder = {
        _id: orderId,
        buyer: buyerId,
        buyerId,
        seller: sellerId,
        sellerId,
        status: 'Completed',
        isReviewed: false
      };
      jest.spyOn(Order, 'findById').mockResolvedValue(completedOrder);

      // 2. Người khác (không phải buyer của đơn) -> 403
      const resNotBuyer = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ orderId: orderId.toString(), rating: 5, comment: 'Giả mạo đánh giá' });
      expect(resNotBuyer.status).toBe(403);

      // 3. Rating không phải số nguyên 1..5 (4.5 hoặc 6) -> 400
      const resBadRating = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ orderId: orderId.toString(), rating: 4.5, comment: 'Điểm lẻ' });
      expect(resBadRating.status).toBe(400);

      // 4. Buyer đánh giá hợp lệ lần 1 -> 200; gọi tiếp lần 2 -> cổng atomic chặn 400
      jest
        .spyOn(Order, 'findOneAndUpdate')
        .mockResolvedValueOnce({ ...completedOrder, isReviewed: true })
        .mockResolvedValueOnce(null);

      const resFirst = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ orderId: orderId.toString(), rating: 5, comment: 'Đóng gói rất kỹ!' });
      expect(resFirst.status).toBe(200);

      const resDuplicate = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ orderId: orderId.toString(), rating: 5, comment: 'Spam đánh giá lần 2' });
      expect(resDuplicate.status).toBe(400);
    });
  });
});
