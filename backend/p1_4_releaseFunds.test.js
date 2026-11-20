/**
 * Automated Test Suite for [P1-4]:
 * Giải ngân nguyên tử (POST /api/admin/release-funds/:orderId) & đồng nhất tính phí sàn:
 * - Chống giải ngân 2 lần (Double Payout) bằng Order.findOneAndUpdate có điều kiện paymentStatus = 'escrow'
 * - Chặn giải ngân đơn COD / unpaid
 * - Ghi nhận Transaction loại 'Giải ngân'
 * - Đồng nhất công thức phí sàn qua calculateOrderSplit / fetchPlatformFeePercent
 */

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');

const User = require('./models/User');
const Order = require('./models/Order');
const Transaction = require('./models/Transaction');
const Settings = require('./models/Settings');
const {
  fetchPlatformFeePercent,
  calculateOrderSplit,
  canonicalStatus,
  orderSellerId,
  isEscrow
} = require('./utils/b2c');

describe('[P1-4] Atomic Release Funds & Unified Commission Helper', () => {
  const sellerId = new mongoose.Types.ObjectId();
  let usersMap;
  let ordersMap;
  let transactionsList;
  let revenuesList;
  let app;

  const ELIGIBLE_RELEASE_STATUSES = [
    'Delivered',
    'Completed',
    'Hoàn thành',
    'Đã giao thành công',
    'Đã giao hàng'
  ];

  beforeEach(() => {
    jest.restoreAllMocks();

    usersMap = {
      [String(sellerId)]: {
        _id: sellerId,
        name: 'Shop Điện Tử A',
        email: 'seller@haihand.vn',
        walletBalance: 50000,
        pendingBalance: 190000 // 95% của đơn 200.000đ
      }
    };

    ordersMap = {};
    transactionsList = [];
    revenuesList = [];

    jest.spyOn(Settings, 'findOne').mockResolvedValue({ commissionRate: 5, platformFeePercentage: 5 });

    jest.spyOn(Order, 'findById').mockImplementation(async (id) => {
      return ordersMap[String(id)] || null;
    });

    jest.spyOn(Order, 'findOneAndUpdate').mockImplementation(async (filter, update) => {
      const o = ordersMap[String(filter._id)];
      if (!o) return null;
      if (filter.paymentStatus && o.paymentStatus !== filter.paymentStatus) {
        return null;
      }
      if (filter.status && filter.status.$in && !filter.status.$in.includes(o.status)) {
        return null;
      }
      if (update.$set) {
        Object.assign(o, update.$set);
      }
      return o;
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

    jest.spyOn(Transaction, 'create').mockImplementation(async (doc) => {
      const created = { _id: new mongoose.Types.ObjectId(), ...doc };
      transactionsList.push(created);
      return created;
    });

    app = express();
    app.use(express.json());

    // Mount endpoint matching backend/server.js POST /api/admin/release-funds/:orderId
    app.post('/api/admin/release-funds/:orderId', async (req, res) => {
      try {
        const order = await Order.findById(req.params.orderId);
        if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

        if (order.paymentMethod === 'COD' || (order.paymentStatus === 'unpaid' && !isEscrow(order))) {
          return res.status(400).json({
            message: 'Đơn hàng COD hoặc chưa thanh toán qua ví ký quỹ (escrow) không thể giải ngân từ sàn!'
          });
        }

        if (order.paymentStatus === 'released') {
          return res.status(409).json({
            message: 'Đơn hàng này đã được giải ngân trước đó!'
          });
        }

        if (order.paymentStatus !== 'escrow' && !isEscrow(order)) {
          return res.status(400).json({
            message: `Chỉ có thể giải ngân cho đơn hàng đang ở trạng thái ký quỹ (escrow), hiện tại: ${order.paymentStatus}`
          });
        }

        const current = canonicalStatus(order.status);
        if (!['Completed', 'Delivered'].includes(current)) {
          return res.status(400).json({ message: 'Chỉ giải ngân khi đơn hàng đã Delivered / Completed!' });
        }

        const sellerRef = orderSellerId(order);
        const feePercent = await fetchPlatformFeePercent();
        const { platformFee, sellerReceive } = calculateOrderSplit(order, feePercent);
        const now = new Date();

        const releasedOrder = await Order.findOneAndUpdate(
          {
            _id: order._id,
            paymentStatus: 'escrow',
            status: { $in: ELIGIBLE_RELEASE_STATUSES }
          },
          {
            $set: {
              paymentStatus: 'released',
              status: 'Completed',
              completedAt: order.completedAt || now,
              commissionRate: feePercent,
              sellerReceive
            }
          },
          { new: true }
        );

        if (!releasedOrder) {
          return res.status(409).json({
            message: 'Đơn hàng đã được giải ngân hoặc không đủ điều kiện giải ngân!'
          });
        }

        const updatedSeller = await User.findByIdAndUpdate(
          sellerRef,
          {
            $inc: {
              pendingBalance: -sellerReceive,
              walletBalance: sellerReceive
            }
          },
          { new: true }
        );
        if (!updatedSeller) {
          return res.status(404).json({ message: 'Không tìm thấy Seller' });
        }

        await Transaction.create({
          user: sellerRef,
          type: 'Giải ngân',
          amount: sellerReceive,
          status: 'Thành công',
          txnRef: `RELEASE_${order._id}`,
          description: `Giải ngân đơn hàng #${order._id.toString().slice(-6).toUpperCase()}`
        });

        revenuesList.push({
          orderId: order._id,
          commissionAmount: platformFee
        });

        return res.json({
          message: 'Giải ngân và bắn thông báo thành công!',
          order: releasedOrder,
          sellerReceive,
          platformFee
        });
      } catch (err) {
        return res.status(500).json({ message: 'Lỗi hệ thống khi giải ngân' });
      }
    });
  });

  test('1. Gọi release-funds 2 lần liên tiếp -> chỉ cộng walletBalance đúng 1 lần, pendingBalance về 0 (không âm), tạo đúng 1 Transaction Giải ngân', async () => {
    const orderId = new mongoose.Types.ObjectId();
    ordersMap[String(orderId)] = {
      _id: orderId,
      seller: sellerId,
      sellerId,
      totalPrice: 200000,
      paymentMethod: 'HAIPAY',
      paymentStatus: 'escrow',
      status: 'Delivered'
    };

    const firstRes = await request(app).post(`/api/admin/release-funds/${orderId}`);
    expect(firstRes.status).toBe(200);
    expect(firstRes.body.sellerReceive).toBe(190000);
    expect(firstRes.body.platformFee).toBe(10000);

    // Gọi lần 2 liên tiếp trên cùng đơn
    const secondRes = await request(app).post(`/api/admin/release-funds/${orderId}`);
    expect(secondRes.status).toBe(409);

    // Kiểm tra số dư Seller: walletBalance = 50.000 + 190.000 = 240.000, pendingBalance = 0 (không âm)
    expect(usersMap[String(sellerId)].walletBalance).toBe(240000);
    expect(usersMap[String(sellerId)].pendingBalance).toBe(0);

    // Chỉ có đúng 1 bản ghi Transaction 'Giải ngân' và 1 bản ghi Revenue
    expect(transactionsList).toHaveLength(1);
    expect(transactionsList[0].type).toBe('Giải ngân');
    expect(transactionsList[0].amount).toBe(190000);
    expect(revenuesList).toHaveLength(1);
    expect(revenuesList[0].commissionAmount).toBe(10000);
  });

  test('2. Gọi release-funds cho đơn COD hoặc đơn paymentStatus !== escrow bị từ chối (400), số dư không đổi', async () => {
    const codOrderId = new mongoose.Types.ObjectId();
    ordersMap[String(codOrderId)] = {
      _id: codOrderId,
      seller: sellerId,
      sellerId,
      totalPrice: 300000,
      paymentMethod: 'COD',
      paymentStatus: 'unpaid',
      status: 'Delivered'
    };

    const codRes = await request(app).post(`/api/admin/release-funds/${codOrderId}`);
    expect(codRes.status).toBe(400);
    expect(codRes.body.message).toMatch(/COD|escrow/i);

    // Đơn đã hoàn tiền (refunded)
    const refundedOrderId = new mongoose.Types.ObjectId();
    ordersMap[String(refundedOrderId)] = {
      _id: refundedOrderId,
      seller: sellerId,
      sellerId,
      totalPrice: 200000,
      paymentMethod: 'VNPAY',
      paymentStatus: 'refunded',
      status: 'Delivered'
    };

    const refundedRes = await request(app).post(`/api/admin/release-funds/${refundedOrderId}`);
    expect(refundedRes.status).toBe(400);

    // Số dư Seller hoàn toàn không bị thay đổi
    expect(usersMap[String(sellerId)].walletBalance).toBe(50000);
    expect(usersMap[String(sellerId)].pendingBalance).toBe(190000);
    expect(transactionsList).toHaveLength(0);
  });

  test('3. Đồng nhất phí sàn: giữ nguyên sellerReceive snapshot khi Admin đổi commissionRate từ 5% sang 8%', async () => {
    // Đơn tạo lúc phí sàn 5% đã lưu sellerReceive = 190000
    const orderId = new mongoose.Types.ObjectId();
    ordersMap[String(orderId)] = {
      _id: orderId,
      seller: sellerId,
      sellerId,
      totalPrice: 200000,
      commissionRate: 5,
      sellerReceive: 190000,
      paymentMethod: 'VNPAY',
      paymentStatus: 'escrow',
      status: 'Completed'
    };

    // Sau đó Admin đổi phí sàn lên 8%
    Settings.findOne.mockResolvedValue({ commissionRate: 8, platformFeePercentage: 8 });

    // Đơn mới sẽ tính theo 8% (92% cho Seller)
    const newSplit = calculateOrderSplit(100000, await fetchPlatformFeePercent());
    expect(newSplit.feePercent).toBe(8);
    expect(newSplit.platformFee).toBe(8000);
    expect(newSplit.sellerReceive).toBe(92000);

    // Nhưng đơn cũ đã snapshot sellerReceive = 190000 vẫn giải ngân đúng 190000 để pendingBalance về đúng 0
    const releaseRes = await request(app).post(`/api/admin/release-funds/${orderId}`);
    expect(releaseRes.status).toBe(200);
    expect(releaseRes.body.sellerReceive).toBe(190000);
    expect(usersMap[String(sellerId)].pendingBalance).toBe(0);
    expect(usersMap[String(sellerId)].walletBalance).toBe(240000);
  });
});

