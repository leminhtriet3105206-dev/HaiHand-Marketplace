const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'test') {
  process.env.JWT_SECRET = 'haihand_test_jwt_secret_key_2026';
}

if (!process.env.JWT_SECRET) {
  console.error('❌ [CRITICAL SECURITY] Thiếu biến môi trường JWT_SECRET! Hệ thống dừng khởi động để ngăn chặn giả mạo JWT.');
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;

function getJwtSecret() {
  return process.env.JWT_SECRET || JWT_SECRET;
}

const CATALOG_VISIBLE = ['active', 'APPROVED'];
const PENDING_PRODUCT_STATUSES = ['pending', 'PENDING', 'Pending', 'Chờ duyệt'];
const DEFAULT_COMMISSION_PERCENT = 5;

function getPlatformFeePercent(setting) {
  if (!setting) return DEFAULT_COMMISSION_PERCENT;
  const raw = setting.commissionRate ?? setting.platformFeePercentage ?? DEFAULT_COMMISSION_PERCENT;
  const num = Number(raw);
  if (Number.isNaN(num) || num < 0 || num > 50) return DEFAULT_COMMISSION_PERCENT;
  return num;
}

async function fetchPlatformFeePercent() {
  try {
    const Settings = require('../models/Settings');
    const setting = await Settings.findOne();
    return getPlatformFeePercent(setting);
  } catch (e) {
    return DEFAULT_COMMISSION_PERCENT;
  }
}

function calculateOrderSplit(orderOrTotal, feePercentOverride) {
  const isObj = typeof orderOrTotal === 'object' && orderOrTotal !== null;
  const totalAmount = Math.max(0, Number(isObj ? (orderOrTotal.totalPrice ?? orderOrTotal.totalAmount ?? 0) : orderOrTotal) || 0);

  if (isObj && typeof orderOrTotal.sellerReceive === 'number' && !Number.isNaN(orderOrTotal.sellerReceive) && orderOrTotal.sellerReceive >= 0 && orderOrTotal.sellerReceive <= totalAmount) {
    const sellerReceive = Math.round(orderOrTotal.sellerReceive);
    const platformFee = Math.max(0, totalAmount - sellerReceive);
    const feePercent = typeof orderOrTotal.commissionRate === 'number'
      ? orderOrTotal.commissionRate
      : (feePercentOverride != null ? Number(feePercentOverride) : DEFAULT_COMMISSION_PERCENT);
    return { totalAmount, feePercent, platformFee, sellerReceive };
  }

  const feePercent = isObj && typeof orderOrTotal.commissionRate === 'number' && !Number.isNaN(orderOrTotal.commissionRate)
    ? orderOrTotal.commissionRate
    : getPlatformFeePercent({ commissionRate: feePercentOverride });

  const platformFee = Math.round(totalAmount * (feePercent / 100));
  const sellerReceive = Math.max(0, totalAmount - platformFee);
  return { totalAmount, feePercent, platformFee, sellerReceive };
}

const STATUS_TO_CANONICAL = {
  'Chờ xác nhận': 'Pending',
  'Chờ thanh toán VNPay': 'Pending',
  'Đã thanh toán (Admin giữ tiền)': 'Pending',
  'Người bán đã chuẩn bị hàng': 'Processing',
  'Đang giao hàng': 'Shipped',
  'Đang giao': 'Shipped',
  'Hoàn thành': 'Completed',
  'Đã thanh toán cho người bán': 'Completed',
  'Đã hủy': 'Cancelled',
  'Đã hủy (Chờ hoàn tiền)': 'Cancelled',
  Pending: 'Pending',
  Processing: 'Processing',
  Shipped: 'Shipped',
  Delivered: 'Delivered',
  Completed: 'Completed',
  Cancelled: 'Cancelled'
};

function canonicalStatus(status) {
  return STATUS_TO_CANONICAL[status] || status || 'Pending';
}

function productOwnerId(product) {
  if (!product) return '';
  const id = product.sellerId || product.author;
  if (!id) return '';
  const raw = id._id ? id._id : id;
  return raw ? raw.toString() : '';
}

function orderBuyerId(order) {
  if (!order) return null;
  const b = order.buyerId || order.buyer;
  if (!b) return null;
  return b._id ? b._id : b;
}

function orderSellerId(order) {
  if (!order) return null;
  const s = order.sellerId || order.seller;
  if (!s) return null;
  return s._id ? s._id : s;
}

function isEscrow(order) {
  return order.paymentStatus === 'escrow' || order.status === 'Đã thanh toán (Admin giữ tiền)';
}

function sanitizeUser(user) {
  if (!user) return null;
  const o = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  delete o.password;
  return o;
}

function signUserToken(user) {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      isSeller: !!user.isSeller,
      sellerStatus: user.sellerStatus || 'none'
    },
    getJwtSecret(),
    { expiresIn: '7d' }
  );
}

function displayProductName(product) {
  if (!product) return 'Sản phẩm';
  return product.name || product.title || 'Sản phẩm';
}

module.exports = {
  JWT_SECRET,
  getJwtSecret,
  CATALOG_VISIBLE,
  PENDING_PRODUCT_STATUSES,
  DEFAULT_COMMISSION_PERCENT,
  getPlatformFeePercent,
  fetchPlatformFeePercent,
  calculateOrderSplit,
  canonicalStatus,
  productOwnerId,
  orderBuyerId,
  orderSellerId,
  isEscrow,
  sanitizeUser,
  signUserToken,
  displayProductName
};
