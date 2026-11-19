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

/**
 * Tính toán phân chia dòng tiền đơn hàng (Order Split):
 * - Sàn CHỈ thu phí hoa hồng (`feePercent`, mặc định 5%) trên tiền hàng (`itemsSubtotal`),
 *   KHÔNG thu phí hoa hồng trên phí vận chuyển (`shippingFee`).
 * - Công thức chuẩn:
 *   + `commissionAmount = Math.round(itemsSubtotal * (feePercent / 100))`
 *   + Khi sàn đối soát cước vận chuyển với hãng vận chuyển (GHN `payment_type_id = 1` do sàn/hệ thống chi trả):
 *     `sellerReceive = itemsSubtotal - commissionAmount`
 *   + Nếu Shop tự nạp ví GHN và tự trả cước vận chuyển (`includeShippingInSellerReceive: true`):
 *     `sellerReceiveWithShipping = (itemsSubtotal - commissionAmount) + shippingFee`
 */
function calculateOrderSplit(orderOrTotal, feePercentOverride) {
  const isObj = typeof orderOrTotal === 'object' && orderOrTotal !== null;
  const shippingFee = isObj ? Math.max(0, Number(orderOrTotal.shippingFee) || 0) : 0;
  const rawTotal = isObj
    ? Number(orderOrTotal.totalPrice ?? orderOrTotal.totalAmount ?? 0)
    : Number(orderOrTotal);
  const totalAmount = Math.max(0, Number.isFinite(rawTotal) ? rawTotal : 0);

  let itemsSubtotal;
  if (isObj && orderOrTotal.itemsSubtotal !== undefined && orderOrTotal.itemsSubtotal !== null) {
    itemsSubtotal = Math.max(0, Number(orderOrTotal.itemsSubtotal) || 0);
  } else {
    itemsSubtotal = Math.max(0, totalAmount - shippingFee);
  }

  const feePercent =
    isObj && typeof orderOrTotal.commissionRate === 'number' && !Number.isNaN(orderOrTotal.commissionRate)
      ? orderOrTotal.commissionRate
      : getPlatformFeePercent({ commissionRate: feePercentOverride });

  const commissionAmount = Math.round(itemsSubtotal * (feePercent / 100));

  // Nếu đơn hàng đã lưu snapshot sellerReceive hợp lệ thì ưu tiên dùng để khớp tuyệt đối với pendingBalance
  if (
    isObj &&
    typeof orderOrTotal.sellerReceive === 'number' &&
    !Number.isNaN(orderOrTotal.sellerReceive) &&
    orderOrTotal.sellerReceive >= 0 &&
    orderOrTotal.sellerReceive <= Math.max(totalAmount, itemsSubtotal)
  ) {
    const sellerReceive = Math.round(orderOrTotal.sellerReceive);
    const effectivePlatformFee =
      itemsSubtotal > 0 ? commissionAmount : Math.max(0, totalAmount - sellerReceive);
    return {
      totalAmount: totalAmount || itemsSubtotal + shippingFee,
      itemsSubtotal,
      shippingFee,
      feePercent,
      commissionAmount: effectivePlatformFee,
      platformFee: effectivePlatformFee,
      sellerReceive,
      sellerReceiveWithShipping: sellerReceive + shippingFee
    };
  }

  const sellerReceive = Math.max(0, itemsSubtotal - commissionAmount);
  const sellerReceiveWithShipping = Math.max(0, sellerReceive + shippingFee);

  return {
    totalAmount: totalAmount || itemsSubtotal + shippingFee,
    itemsSubtotal,
    shippingFee,
    feePercent,
    commissionAmount,
    platformFee: commissionAmount,
    sellerReceive,
    sellerReceiveWithShipping
  };
}

const STATUS_TO_CANONICAL = {
  'Chờ xác nhận': 'Pending',
  'Chờ thanh toán VNPay': 'Pending',
  'Đã thanh toán (Admin giữ tiền)': 'Pending',
  'Người bán đã chuẩn bị hàng': 'Processing',
  'Đang giao hàng': 'Shipped',
  'Đang giao': 'Shipped',
  'Đã giao hàng': 'Delivered',
  'Đã giao thành công': 'Delivered',
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
  if (!order) return false;
  return order.paymentStatus === 'escrow' || order.status === 'Đã thanh toán (Admin giữ tiền)';
}

const SENSITIVE_USER_FIELDS = [
  'password',
  'walletPin',
  'cccd',
  'taxId',
  'bankInfo',
  'tokenVersion',
  'firebaseUid',
  'pinFailedAttempts',
  'pinLockedUntil'
];

function sanitizeUser(user, { keepOwnerFields = false } = {}) {
  if (!user) return null;
  const o = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  for (const field of SENSITIVE_USER_FIELDS) {
    if (keepOwnerFields && ['bankInfo', 'cccd', 'taxId'].includes(field)) {
      continue;
    }
    delete o[field];
  }
  return o;
}

function publicUser(user) {
  if (!user) return null;
  const o = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  const safeShopInfo = o.shopInfo
    ? {
        shopName: o.shopInfo.shopName || '',
        description: o.shopInfo.description || '',
        address: o.shopInfo.address || '',
        avatar: o.shopInfo.avatar || '',
        banner: o.shopInfo.banner || ''
      }
    : undefined;

  return {
    _id: o._id,
    name: o.name || '',
    username: o.username || '',
    avatar: o.avatar || '',
    avatarFrame: o.avatarFrame || 'none',
    profileTitle: o.profileTitle || 'Người Mới',
    bio: o.bio || '',
    role: o.role || 'Khách hàng',
    isVerified: !!o.isVerified,
    isSeller: !!o.isSeller,
    sellerStatus: o.sellerStatus || 'none',
    shopInfo: safeShopInfo,
    rating: o.rating ?? 0,
    createdAt: o.createdAt,
    lastActive: o.lastActive
  };
}

function signUserToken(user, { expiresIn, tokenType = 'access', extra = {} } = {}) {
  const tv = typeof user.tokenVersion === 'number' ? user.tokenVersion : 0;
  const ttl = expiresIn || process.env.JWT_EXPIRES_IN || '2h';
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      isSeller: !!user.isSeller,
      sellerStatus: user.sellerStatus || 'none',
      tv,
      tokenType,
      ...extra
    },
    getJwtSecret(),
    { expiresIn: ttl }
  );
}

function signRefreshToken(user, { expiresIn } = {}) {
  const tv = typeof user.tokenVersion === 'number' ? user.tokenVersion : 0;
  const ttl = expiresIn || process.env.JWT_REFRESH_EXPIRES_IN || '7d';
  return jwt.sign(
    {
      id: user._id,
      tv,
      tokenType: 'refresh'
    },
    getJwtSecret(),
    { expiresIn: ttl }
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
  publicUser,
  signUserToken,
  signRefreshToken,
  displayProductName
};
