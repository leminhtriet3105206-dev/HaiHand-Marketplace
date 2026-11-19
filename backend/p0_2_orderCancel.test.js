/**
 * Automated Test Suite for [P0-2]:
 * Seller/Buyer hủy đơn hàng (Escrow & COD):
 * - Hoàn tiền nguyên tử vào buyer.walletBalance ($inc)
 * - Trừ nguyên tử seller.pendingBalance ($inc)
 * - Ghi nhận Transaction loại 'Hoàn tiền'
 * - Cộng trả tồn kho chính xác (cộng dồn += khi cùng productId xuất hiện nhiều dòng trong orderItems)
 * - Chống hoàn tiền / cộng kho 2 lần khi gọi lặp hoặc đua (idempotency)
 */

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');

const User = require('./models/User');
const Order = require('./models/Order');
const { Post } = require('./models/Product');
const Transaction = require('./models/Transaction');
const Settings = require('./models/Settings');
const { signUserToken } = require('./utils/b2c');
const createSellerRouter = require('./routes/seller');
const { cancelOrderWithRefundAndRestock } = require('./controllers/checkoutController');

describe('[P0-2] Unified Atomic Order Cancellation (Seller & Buyer)', () => {
  const buyerId = new mongoose.Types.ObjectId();
  const sellerId = new mongoose.Types.ObjectId();
  const productId = new mongoose.Types.ObjectId();

  let usersMap;
  let productsMap;
  let ordersMap;
  let transactionsList;
  let app;
  let sellerToken;
  let buyerToken;

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_haihand_2026';

    usersMap = {
      [String(buyerId)]: {
        _id: buyerId,
        name: 'Người Mua A',
        email: 'buyer@haihand.vn',
        role: 'Khách hàng',
        isSeller: false,
        sellerStatus: 'none',
        status: 'active',
        isBanned: false,
        walletBalance: 500000, // Sau khi trừ 200.000đ tiền đơn hàng
        pendingBalance: 0
      },
      [String(sellerId)]: {
        _id: sellerId,
        name: 'Chủ Shop B',
        email: 'seller@haihand.vn',
        role: 'Khách hàng',
        isSeller: true,
        sellerStatus: 'approved',
        status: 'active',
        isBanned: false,
        walletBalance: 100000,
        pendingBalance: 190000 // 95% của đơn 200.000đ đang tạm giữ
      }
    };

    productsMap = {
      [String(productId)]: {
        _id: productId,
        name: 'Áo Khoác Denim HaiHand',
        title: 'Áo Khoác Denim HaiHand',
        price: 40000,
        stockQuantity: 0, // Đã bán hết 5 cái (2 + 3)
        quantity: 0,
        status: 'out_of_stock',
        sellerId,
        author: sellerId
      }
    };

    ordersMap = {};
    transactionsList = [];

    sellerToken = signUserToken(usersMap[String(sellerId)]);
    buyerToken = signUserToken(usersMap[String(buyerId)]);

    jest.spyOn(Settings, 'findOne').mockResolvedValue({ commissionRate: 5, platformFeePercentage: 5 });

    jest.spyOn(User, 'findById').mockImplementation((id) => {
      const u = usersMap[String(id)] || null;
      return {
        select: jest.fn().mockResolvedValue(u),
        then: (resolve) => Promise.resolve(u).then(resolve)
      };
    });

    jest.spyOn(User, 'findByIdAndUpdate').mockImplementation(async (id, update) => {
      const u = usersMap[String(id)];
      if (!u) return null;
      if (update && update.$inc) {
        for (const [k, v] of Object.entries(update.$inc)) {
          u[k] = (u[k] || 0) + Number(v);
        }
      }
      return u;
    });

    jest.spyOn(Post, 'findByIdAndUpdate').mockImplementation(async (id, update) => {
      const p = productsMap[String(id)];
      if (!p) return null;
      if (update && update.$inc) {
        for (const [k, v] of Object.entries(update.$inc)) {
          p[k] = (p[k] || 0) + Number(v);
        }
      }
      if (update && update.$set) {
        Object.assign(p, update.$set);
      }
      return p;
    });

    jest.spyOn(Transaction, 'create').mockImplementation(async (doc) => {
      const created = { _id: new mongoose.Types.ObjectId(), ...doc };
      transactionsList.push(created);
      return created;
    });

    jest.spyOn(Order, 'findById').mockImplementation((id) => {
      const o = ordersMap[String(id)] || null;
      return {
        populate: jest.fn().mockResolvedValue(o),
        then: (resolve) => Promise.resolve(o).then(resolve)
      };
    });

    jest.spyOn(Order, 'findOneAndUpdate').mockImplementation(async (filter, update) => {
      const o = ordersMap[String(filter._id)];
      if (!o) return null;
      if (filter.status && filter.status.$in && !filter.status.$in.includes(o.status)) {
        return null; // Điều kiện nguyên tử không khớp (đã bị hủy hoặc đã giao)
      }
      if (update.$set) {
        Object.assign(o, update.$set);
      }
      if (update.$push && update.$push.trackingLogs) {
        o.trackingLogs = o.trackingLogs || [];
        o.trackingLogs.push(update.$push.trackingLogs);
      }
      return o;
    });

    const upload = multer({ storage: multer.memoryStorage() });
    app = express();
    app.use(express.json());
    app.use(
      createSellerRouter({
        upload,
        sendNotification: jest.fn().mockResolvedValue(true),
        sendAdminNotification: jest.fn().mockResolvedValue(true),
        io: null
      })
    );

    // Route người mua hủy đơn tương đương backend/server.js
    const { protect } = require('./middleware/auth');
    app.put('/api/orders/:orderId/cancel', protect, async (req, res) => {
      const order = await Order.findById(req.params.orderId);
      if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
      const result = await cancelOrderWithRefundAndRestock(order, {
        cancelledBy: 'buyer',
        reason: req.body?.cancelReason || 'Khách đổi ý'
      });
      if (!result.success) {
        return res.status(result.statusCode || 400).json({ message: result.message });
      }
      return res.status(200).json({ message: 'Đã hủy đơn', order: result.order });
    });
  });

  test('1. Seller hủy đơn trả trước (escrow) -> hoàn tiền Buyer, trừ pendingBalance Seller, cộng dồn tồn kho và ghi Transaction Hoàn tiền', async () => {
    const orderId = new mongoose.Types.ObjectId();
    ordersMap[String(orderId)] = {
      _id: orderId,
      buyer: buyerId,
      buyerId,
      seller: sellerId,
      sellerId,
      totalPrice: 200000,
      paymentMethod: 'HAIPAY',
      paymentStatus: 'escrow',
      status: 'Pending',
      trackingCode: 'GHN_EXISTING_123',
      trackingLogs: [],
      // Cùng 1 sản phẩm xuất hiện ở 2 dòng phân loại với quantity 2 và 3 (tổng = 5)
      orderItems: [
        { productId, name: 'Áo Khoác Denim - Size M', quantity: 2, price: 40000 },
        { productId, name: 'Áo Khoác Denim - Size L', quantity: 3, price: 40000 }
      ],
      items: [productId]
    };

    const res = await request(app)
      .put(`/api/seller/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ status: 'Cancelled', cancelReason: 'Hết hàng trong kho' });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('Cancelled');
    expect(res.body.order.paymentStatus).toBe('refunded');
    expect(res.body.order.cancelReason).toBe('Hết hàng trong kho');

    // Kiểm tra hoàn tiền vào ví người mua: 500.000 + 200.000 = 700.000
    expect(usersMap[String(buyerId)].walletBalance).toBe(700000);

    // Kiểm tra trừ pendingBalance người bán: 190.000 - 190.000 = 0
    expect(usersMap[String(sellerId)].pendingBalance).toBe(0);

    // Kiểm tra tồn kho cộng dồn 2 + 3 = 5 và tự động mở lại status = 'active'
    expect(productsMap[String(productId)].stockQuantity).toBe(5);
    expect(productsMap[String(productId)].quantity).toBe(5);
    expect(productsMap[String(productId)].status).toBe('active');

    // Kiểm tra bản ghi Transaction 'Hoàn tiền'
    expect(transactionsList).toHaveLength(1);
    expect(transactionsList[0].type).toBe('Hoàn tiền');
    expect(transactionsList[0].amount).toBe(200000);
    expect(String(transactionsList[0].user)).toBe(String(buyerId));

    // Kiểm tra cảnh báo vận đơn GHN được đẩy vào trackingLogs
    expect(ordersMap[String(orderId)].trackingLogs).toHaveLength(1);
    expect(ordersMap[String(orderId)].trackingLogs[0].description).toMatch(/GHN_EXISTING_123/);
  });

  test('2. Idempotency: Gọi hủy lần 2 trên cùng đơn không hoàn tiền lần 2 và không cộng kho lần 2', async () => {
    const orderId = new mongoose.Types.ObjectId();
    ordersMap[String(orderId)] = {
      _id: orderId,
      buyer: buyerId,
      buyerId,
      seller: sellerId,
      sellerId,
      totalPrice: 200000,
      paymentMethod: 'HAIPAY',
      paymentStatus: 'escrow',
      status: 'Pending',
      orderItems: [{ productId, name: 'Áo Khoác Denim', quantity: 2, price: 100000 }],
      items: [productId]
    };

    const firstRes = await request(app)
      .put(`/api/seller/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ status: 'Cancelled', cancelReason: 'Hết hàng' });
    expect(firstRes.status).toBe(200);

    // Gọi hủy lần 2 từ cả Seller lẫn Buyer
    const secondResSeller = await request(app)
      .put(`/api/seller/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ status: 'Cancelled', cancelReason: 'Hủy lần 2' });
    expect(secondResSeller.status).toBe(400);

    const secondResBuyer = await request(app)
      .put(`/api/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ cancelReason: 'Hủy lần 2' });
    expect(secondResBuyer.status).toBe(400);

    // Số dư và tồn kho chỉ thay đổi đúng 1 lần
    expect(usersMap[String(buyerId)].walletBalance).toBe(700000);
    expect(usersMap[String(sellerId)].pendingBalance).toBe(0);
    expect(productsMap[String(productId)].stockQuantity).toBe(2);
    expect(transactionsList).toHaveLength(1);
  });

  test('3. Đơn COD bị hủy -> chỉ hoàn kho, không đụng ví người mua hay pendingBalance người bán', async () => {
    const orderId = new mongoose.Types.ObjectId();
    ordersMap[String(orderId)] = {
      _id: orderId,
      buyer: buyerId,
      buyerId,
      seller: sellerId,
      sellerId,
      totalPrice: 150000,
      paymentMethod: 'COD',
      paymentStatus: 'unpaid',
      status: 'Pending',
      orderItems: [{ productId, name: 'Áo Khoác Denim', quantity: 3, price: 50000 }],
      items: [productId]
    };

    const res = await request(app)
      .put(`/api/seller/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ status: 'Cancelled', cancelReason: 'Khách nhờ hủy đơn COD' });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('Cancelled');
    expect(res.body.order.paymentStatus).toBe('unpaid');

    // Ví Buyer và pendingBalance Seller giữ nguyên không đổi
    expect(usersMap[String(buyerId)].walletBalance).toBe(500000);
    expect(usersMap[String(sellerId)].pendingBalance).toBe(190000);
    expect(transactionsList).toHaveLength(0);

    // Tồn kho vẫn được cộng trả 3 sản phẩm
    expect(productsMap[String(productId)].stockQuantity).toBe(3);
    expect(productsMap[String(productId)].status).toBe('active');
  });
});

