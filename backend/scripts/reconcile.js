/**
 * Script đối soát tài chính & ví ký quỹ HaiPay (H12 - CHỈ ĐỌC / READ-ONLY):
 * - KHÔNG tự sửa dữ liệu trong DB.
 * - Kiểm tra 3 nhóm bất thường:
 *   1. Đơn hàng đang ở trạng thái `paymentStatus: 'escrow'` nhưng `PaymentSession` tương ứng chưa `status: 'paid'`.
 *   2. Tài khoản người dùng có `walletBalance < 0` hoặc `pendingBalance < 0`.
 *   3. Tài khoản người bán có `pendingBalance` lệch so với tổng `sellerReceive` của các đơn hàng đang `paymentStatus: 'escrow'`.
 *
 * Cách chạy:
 *   node backend/scripts/reconcile.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');
const PaymentSession = require('../models/PaymentSession');
const { orderSellerId, calculateOrderSplit, fetchPlatformFeePercent } = require('../utils/b2c');

async function runReconciliation({ closeConnection = false } = {}) {
  const report = {
    checkedAt: new Date().toISOString(),
    escrowOrdersWithoutPaidSession: [],
    negativeBalanceUsers: [],
    pendingBalanceMismatches: []
  };

  if (mongoose.connection.readyState !== 1) {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('Thiếu biến môi trường MONGO_URI để chạy đối soát!');
    }
    await mongoose.connect(uri);
  }

  const feePercent = await fetchPlatformFeePercent();

  // 1. Đơn hàng escrow nhưng PaymentSession chưa paid
  const escrowOrders = await Order.find({
    $or: [
      { paymentStatus: 'escrow' },
      { status: 'Đã thanh toán (Admin giữ tiền)' }
    ]
  }).lean();

  const parentIds = [...new Set(escrowOrders.map((o) => o.parentOrderId).filter(Boolean))];
  const sessions = parentIds.length > 0
    ? await PaymentSession.find({ parentOrderId: { $in: parentIds } }).lean()
    : [];
  const sessionMap = new Map(sessions.map((s) => [s.parentOrderId, s]));

  const expectedPendingBySeller = {};

  for (const order of escrowOrders) {
    const pId = order.parentOrderId;
    const sess = pId ? sessionMap.get(pId) : null;
    if (order.paymentMethod !== 'COD' && (!sess || sess.status !== 'paid')) {
      report.escrowOrdersWithoutPaidSession.push({
        orderId: String(order._id),
        parentOrderId: pId || null,
        paymentMethod: order.paymentMethod,
        orderPaymentStatus: order.paymentStatus,
        sessionStatus: sess ? sess.status : 'MISSING_SESSION',
        totalPrice: order.totalPrice || 0
      });
    }

    const sId = orderSellerId(order);
    if (sId) {
      const { sellerReceive } = calculateOrderSplit(order, feePercent);
      expectedPendingBySeller[sId] = (expectedPendingBySeller[sId] || 0) + sellerReceive;
    }
  }

  // 2. Ví âm (walletBalance < 0 hoặc pendingBalance < 0)
  const negativeUsers = await User.find({
    $or: [
      { walletBalance: { $lt: 0 } },
      { pendingBalance: { $lt: 0 } }
    ]
  })
    .select('_id name email walletBalance pendingBalance')
    .lean();

  for (const u of negativeUsers) {
    report.negativeBalanceUsers.push({
      userId: String(u._id),
      email: u.email,
      walletBalance: u.walletBalance || 0,
      pendingBalance: u.pendingBalance || 0
    });
  }

  // 3. Đối chiếu pendingBalance của Seller với tổng sellerReceive của các đơn đang escrow
  const sellersWithPending = await User.find({
    $or: [
      { pendingBalance: { $gt: 0 } },
      { _id: { $in: Object.keys(expectedPendingBySeller).filter((id) => mongoose.Types.ObjectId.isValid(id)) } }
    ]
  })
    .select('_id name email pendingBalance')
    .lean();

  for (const seller of sellersWithPending) {
    const sId = String(seller._id);
    const actualPending = Math.round(Number(seller.pendingBalance) || 0);
    const expectedPending = Math.round(Number(expectedPendingBySeller[sId]) || 0);
    if (actualPending !== expectedPending) {
      report.pendingBalanceMismatches.push({
        sellerId: sId,
        email: seller.email,
        actualPendingBalance: actualPending,
        expectedPendingFromEscrowOrders: expectedPending,
        diff: actualPending - expectedPending
      });
    }
  }

  if (closeConnection && mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }

  return report;
}

if (require.main === module) {
  runReconciliation({ closeConnection: true })
    .then((report) => {
      console.log('=== BÁO CÁO ĐỐI SOÁT VÍ & ESCROW HAIHAND (READ-ONLY) ===');
      console.log(JSON.stringify(report, null, 2));
      const totalIssues =
        report.escrowOrdersWithoutPaidSession.length +
        report.negativeBalanceUsers.length +
        report.pendingBalanceMismatches.length;
      console.log(`Tổng số mục lệch phát hiện: ${totalIssues}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Lỗi khi chạy đối soát:', err.message);
      process.exit(1);
    });
}

module.exports = { runReconciliation };
