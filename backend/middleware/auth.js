const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getJwtSecret } = require('../utils/b2c');

const STRICT_PATH_PATTERNS = [
  /^\/api\/seller(\/|$)/i,
  /^\/api\/users\/apply-seller(\/|$)/i,
  /^\/api\/checkout(\/|$)/i,
  /^\/api\/users\/[^/]+\/checkout(\/|$)/i,
  /^\/api\/orders(\/|$)/i,
  /^\/api\/users\/[^/]+\/orders(\/|$)/i,
  /^\/api\/users\/[^/]+\/withdraw(\/|$)/i,
  /^\/api\/haipay(\/|$)/i
];

function isStrictProtectedRoute(req) {
  const fullPath = String(req.originalUrl || req.url || '').split('?')[0];
  return STRICT_PATH_PATTERNS.some((re) => re.test(fullPath));
}

/**
 * Strict JWT authentication middleware:
 * Requires a valid Authorization: Bearer <token> header.
 * Never accepts spoofable headers/body/query `userid` fallbacks.
 */
async function protectStrict(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Vui lòng đăng nhập bằng Token hợp lệ (Bearer JWT)' });
  }

  const rawToken = authHeader.split(' ')[1];
  if (!rawToken || rawToken === 'undefined' || rawToken === 'null') {
    return res.status(401).json({ message: 'Token xác thực không hợp lệ' });
  }

  let decoded;
  try {
    decoded = jwt.verify(rawToken, getJwtSecret());
  } catch (e) {
    return res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
  }

  const userId = decoded?.id || decoded?._id;
  if (!userId) {
    return res.status(401).json({ message: 'Token không chứa thông tin định danh người dùng' });
  }

  const user = await User.findById(userId).select('-password');
  if (!user) {
    return res.status(401).json({ message: 'Không tìm thấy người dùng' });
  }

  req.tokenPayload = decoded;
  req.user = user;
  return next();
}

async function protect(req, res, next) {
  // Sensitive Seller, Checkout, Order, and Wallet routes strictly require Bearer JWT
  if (isStrictProtectedRoute(req)) {
    return protectStrict(req, res, next);
  }

  let userId = null;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const rawToken = authHeader.split(' ')[1];
    if (rawToken && rawToken !== 'undefined' && rawToken !== 'null') {
      try {
        const decoded = jwt.verify(rawToken, getJwtSecret());
        userId = decoded.id || decoded._id;
        req.tokenPayload = decoded;
      } catch (e) {
        return res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
      }
    }
  }

  if (!userId) {
    userId = req.headers.userid || req.body?.userId || req.query?.userId;
  }

  if (!userId) {
    return res.status(401).json({ message: 'Vui lòng đăng nhập' });
  }

  const user = await User.findById(userId).select('-password');
  if (!user) {
    return res.status(401).json({ message: 'Không tìm thấy người dùng' });
  }

  req.user = user;
  return next();
}

function isSeller(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Vui lòng đăng nhập' });
  }
  if (req.user.isSeller === true && req.user.sellerStatus === 'approved') {
    return next();
  }
  return res.status(403).json({ message: 'Bạn cần được Admin duyệt Seller Registration để vào Kênh Người Bán.' });
}

function isAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], getJwtSecret());
      if (decoded.role === 'Admin') {
        req.adminId = decoded.id;
        return next();
      }
    } catch (e) {
      return res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
    }
  }

  if (req.user && req.user.role === 'Admin') {
    req.adminId = req.user._id;
    return next();
  }

  if (req.session && req.session.adminId) {
    req.adminId = req.session.adminId;
    return next();
  }

  return res.status(403).json({ message: 'Bạn không có quyền quản trị' });
}

module.exports = { protect, protectStrict, isSeller, isAdmin };
