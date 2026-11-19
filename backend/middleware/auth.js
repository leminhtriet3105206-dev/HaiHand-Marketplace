const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getJwtSecret } = require('../utils/b2c');

/**
 * Strict JWT authentication middleware:
 * - Bắt buộc mọi request đi qua protect / protectStrict đều phải gửi header `Authorization: Bearer <token>` hợp lệ.
 * - Loại bỏ hoàn toàn fallback lấy userId từ `req.headers.userid`, `req.body.userId`, `req.query.userId` để chống giả mạo danh tính (ID Spoofing / Account Takeover).
 * - Kiểm tra tài khoản không bị khóa (`user.status !== 'locked' && !user.isBanned`).
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

  if (user.status === 'locked' || user.isBanned === true) {
    return res.status(403).json({
      message: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ ban quản trị để được hỗ trợ.'
    });
  }

  req.tokenPayload = decoded;
  req.user = user;
  return next();
}

async function protect(req, res, next) {
  return protectStrict(req, res, next);
}

function isSeller(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Vui lòng đăng nhập' });
  }
  if (req.user.status === 'locked' || req.user.isBanned === true) {
    return res.status(403).json({ message: 'Tài khoản của bạn đã bị khóa.' });
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
    if (req.user.status === 'locked' || req.user.isBanned === true) {
      return res.status(403).json({ message: 'Tài khoản quản trị viên đã bị khóa' });
    }
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
