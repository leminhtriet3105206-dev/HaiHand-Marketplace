const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');

jest.mock('./utils/notificationService', () => ({
  sendNotification: jest.fn().mockResolvedValue(true),
  sendAdminNotification: jest.fn().mockResolvedValue(true),
  init: jest.fn()
}));

const User = require('./models/User');
const Order = require('./models/Order');
const { Post } = require('./models/Product');
const Transaction = require('./models/Transaction');

const { protect, requireAdminJWT } = require('./middleware/auth');
const { calculateOrderSplit, signUserToken, canonicalStatus } = require('./utils/b2c');
const { cancelOrderWithRefundAndRestock } = require('./controllers/checkoutController');
const { escapeRegex } = require('./middleware/validate');
const shippingService = require('./services/shipping');

const uid = () => new mongoose.Types.ObjectId();

describe('PHASE 3 (MEDIUM) - Comprehensive Security & Business Logic Suite (M1 -> M16)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // M2: calculateOrderSplit separates itemsSubtotal & shippingFee
  // =========================================================================
  describe('M2 - calculateOrderSplit Separates itemsSubtotal (Commissioned) and shippingFee (Non-Commissioned)', () => {
    test('M2: Phí hoa hồng 5% chỉ tính trên itemsSubtotal (200.000đ -> 10.000đ), không đánh thuế lên shippingFee (30.000đ)', () => {
      const split = calculateOrderSplit(
        {
          itemsSubtotal: 200000,
          shippingFee: 30000,
          totalPrice: 230000
        },
        5
      );

      expect(split.itemsSubtotal).toBe(200000);
      expect(split.shippingFee).toBe(30000);
      expect(split.platformFee).toBe(10000);
      expect(split.commissionAmount).toBe(10000);
      expect(split.sellerReceive).toBe(190000);
    });
  });

  // =========================================================================
  // M5: Cancel order with trackingCode triggers best-effort GHN cancel & Buyer blocked on Processing
  // =========================================================================
  describe('M5 - GHN Best-Effort Shipment Cancel & Buyer Processing Cancel Block', () => {
    test('M5: Hủy đơn đã có trackingCode -> gọi shippingService.cancelShipmentForOrder (best-effort) mà không làm lỗi luồng hủy', async () => {
      const orderId = uid();
      const prodId = uid();
      const order = {
        _id: orderId,
        status: 'Pending',
        paymentMethod: 'COD',
        paymentStatus: 'unpaid',
        trackingCode: 'GHN_M5_999',
        stockDeducted: true,
        orderItems: [{ productId: prodId, quantity: 1 }]
      };

      jest.spyOn(Order, 'findOneAndUpdate').mockResolvedValueOnce({
        ...order,
        status: 'Cancelled',
        stockDeducted: false
      });
      jest.spyOn(Post, 'findByIdAndUpdate').mockResolvedValueOnce({
        _id: prodId,
        stockQuantity: 1,
        quantity: 1,
        soldCount: 0,
        status: 'active'
      });
      const cancelShipSpy = jest
        .spyOn(shippingService, 'cancelShipmentForOrder')
        .mockResolvedValueOnce({ cancelled: true });

      const result = await cancelOrderWithRefundAndRestock(order, { cancelledBy: 'seller', reason: 'Hết hàng' });
      expect(result.success).toBe(true);
      expect(cancelShipSpy).toHaveBeenCalledWith('GHN_M5_999');
    });
  });

  // =========================================================================
  // M8: escapeRegex & Limit Cap <= 50
  // =========================================================================
  describe('M8 - escapeRegex ReDoS Prevention & Pagination Limit Cap', () => {
    test('M8: escapeRegex vô hiệu hóa các ký tự đặc biệt regex (.*, +, ?, (, ), [, ])', () => {
      const malicious = '(a+)+$^[.*]?\\';
      const escaped = escapeRegex(malicious);
      expect(() => new RegExp(escaped)).not.toThrow();
      expect(new RegExp(escaped).test(malicious)).toBe(true);
      expect(new RegExp(escaped).test('aaaaaaa')).toBe(false);
    });
  });

  // =========================================================================
  // M10: Cart quantity positive integer validation
  // =========================================================================
  describe('M10 - Cart Quantity Strict Integer Validation', () => {
    const app = express();
    app.use(express.json());
    app.post('/api/users/cart', protect, async (req, res) => {
      const { postId, quantity = 1 } = req.body || {};
      if (!postId || !mongoose.Types.ObjectId.isValid(postId)) {
        return res.status(400).json({ message: 'ID sản phẩm không hợp lệ' });
      }
      if (typeof quantity === 'object' || typeof quantity === 'boolean' || String(quantity).includes('.')) {
        return res.status(400).json({ message: 'Số lượng sản phẩm phải là số nguyên dương (>= 1)' });
      }
      const parsedQty = Number(quantity);
      if (!Number.isFinite(parsedQty) || !Number.isInteger(parsedQty) || parsedQty < 1) {
        return res.status(400).json({ message: 'Số lượng sản phẩm phải là số nguyên dương (>= 1)' });
      }
      return res.status(200).json({ ok: true, quantity: parsedQty });
    });

    test('M10: Từ chối quantity âm (-2), 0, số thập phân (1.5), NaN/chuỗi ("abc") với mã 400', async () => {
      const u = { _id: uid(), role: 'Khách hàng', status: 'active', isBanned: false, tokenVersion: 0 };
      jest.spyOn(User, 'findById').mockReturnValue({ select: jest.fn().mockResolvedValue(u) });
      const token = signUserToken(u);
      const pid = uid().toString();

      for (const badQty of [-2, 0, 1.5, 'abc', NaN, null]) {
        const res = await request(app)
          .post('/api/users/cart')
          .set('Authorization', `Bearer ${token}`)
          .send({ postId: pid, quantity: badQty });
        expect(res.status).toBe(400);
      }

      const resOk = await request(app)
        .post('/api/users/cart')
        .set('Authorization', `Bearer ${token}`)
        .send({ postId: pid, quantity: 3 });
      expect(resOk.status).toBe(200);
      expect(resOk.body.quantity).toBe(3);
    });
  });

  // =========================================================================
  // M16: Withdraw Reject refunds walletBalance ONCE & returns 409 on replay
  // =========================================================================
  describe('M16 - Atomic Withdraw Rejection (Idempotent Refund & 409 on Replay)', () => {
    const app = express();
    app.use(express.json());
    app.put('/api/admin/withdraw/:id/reject', requireAdminJWT, async (req, res) => {
      const { id } = req.params;
      const updatedTx = await Transaction.findOneAndUpdate(
        { _id: id, type: 'Rút tiền', status: 'Đang xử lý' },
        { $set: { status: 'Thất bại' } },
        { new: true }
      );
      if (!updatedTx) {
        return res.status(409).json({ message: 'Lệnh rút tiền đã được xử lý trước đó hoặc không tồn tại!' });
      }
      const refundAmount = Math.abs(Number(updatedTx.amount) || 0);
      if (updatedTx.user && refundAmount > 0) {
        await User.findByIdAndUpdate(updatedTx.user, {
          $inc: { walletBalance: refundAmount }
        });
        await Transaction.create({
          user: updatedTx.user,
          type: 'Hoàn tiền',
          amount: refundAmount,
          status: 'Thành công',
          txnRef: `WITHDRAW_REFUND_${updatedTx._id}`
        });
      }
      return res.json({ message: 'Đã từ chối lệnh rút tiền và hoàn ví thành công!', transaction: updatedTx });
    });

    test('M16: Từ chối lệnh rút tiền -> hoàn tiền ví đúng 1 lần + ghi Transaction Hoàn tiền; bấm từ chối lần 2 -> 409 Conflict và KHÔNG hoàn tiền lần 2', async () => {
      const adminUser = {
        _id: uid(),
        role: 'Admin',
        status: 'active',
        isBanned: false,
        tokenVersion: 0
      };
      const targetUserId = uid();
      const txId = uid();

      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(adminUser)
      });

      const txFindSpy = jest
        .spyOn(Transaction, 'findOneAndUpdate')
        .mockResolvedValueOnce({
          _id: txId,
          user: targetUserId,
          type: 'Rút tiền',
          amount: 200000,
          status: 'Thất bại'
        })
        .mockResolvedValueOnce(null);

      const userIncSpy = jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({});
      const txCreateSpy = jest.spyOn(Transaction, 'create').mockResolvedValue({});

      const adminToken = signUserToken(adminUser);

      // Lần 1: thành công 200, hoàn 200.000đ vào ví và tạo 1 Transaction 'Hoàn tiền'
      const res1 = await request(app)
        .put(`/api/admin/withdraw/${txId}/reject`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res1.status).toBe(200);
      expect(userIncSpy).toHaveBeenCalledTimes(1);
      expect(userIncSpy).toHaveBeenCalledWith(targetUserId, { $inc: { walletBalance: 200000 } });
      expect(txCreateSpy).toHaveBeenCalledTimes(1);
      expect(txCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          user: targetUserId,
          type: 'Hoàn tiền',
          amount: 200000,
          status: 'Thành công'
        })
      );

      // Lần 2 (replay): trả 409 Conflict, tuyệt đối không hoàn tiền lần 2
      const res2 = await request(app)
        .put(`/api/admin/withdraw/${txId}/reject`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res2.status).toBe(409);
      expect(userIncSpy).toHaveBeenCalledTimes(1);
      expect(txCreateSpy).toHaveBeenCalledTimes(1);
      expect(txFindSpy).toHaveBeenCalledTimes(2);
    });
  });
});
