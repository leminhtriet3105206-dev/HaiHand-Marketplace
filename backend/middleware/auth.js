const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET } = require('../utils/b2c');

async function protect(req, res, next) {
  let userId = null;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const rawToken = authHeader.split(' ')[1];
    if (rawToken && rawToken !== 'undefined' && rawToken !== 'null') {
      try {
        const decoded = jwt.verify(rawToken, JWT_SECRET);
        userId = decoded.id || decoded._id;
        req.tokenPayload = decoded;
      } catch (e) {
        // Nếu có fallback header userid thì cho phép kiểm tra tiếp, nếu không thì trả về 401
        if (!req.headers.userid) {
          return res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
        }
      }
    }
  }

  if (!userId) {
    userId = req.headers.userid || req.headers.userid || req.body?.userId || req.query?.userId;
  }

  if (!userId) {
    return res.status(401).json({ message: 'Vui lòng đăng nhập' });
  }

  const user = await User.findById(userId).select('-password');
  if (!user) {
    return res.status(401).json({ message: 'Không tìm thấy người dùng' });
  }

  req.user = user;
  next();
}

/**
 * Strict JWT-only authentication middleware (A2 / A3).
 * - Chỉ chấp nhận `Authorization: Bearer <token>`, KHÔNG fallback sang header/body/query userId.
 * - Từ chối nếu tài khoản bị khóa, bị ban, đã xóa mềm hoặc tokenVersion không khớp.
 */
async function protectStrict(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Vui lòng đăng nhập (thiếu token xác thực)' });
    }

    const rawToken = authHeader.split(' ')[1];
    if (!rawToken || rawToken === 'undefined' || rawToken === 'null') {
      return res.status(401).json({ message: 'Token xác thực không hợp lệ' });
    }

    let decoded;
    try {
      decoded = jwt.verify(rawToken, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
    }

    if (decoded.type === 'refresh') {
      return res.status(401).json({ message: 'Không thể sử dụng refresh token cho API này' });
    }

    const userId = decoded.id || decoded._id;
    if (!userId) {
      return res.status(401).json({ message: 'Token không chứa thông tin người dùng' });
    }

    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(401).json({ message: 'Không tìm thấy người dùng' });
    }

    if (user.isDeleted) {
      return res.status(403).json({ message: 'Tài khoản đã bị xóa' });
    }

    const isLocked = user.isBanned || (user.status === 'locked' && (!user.lockedUntil || new Date(user.lockedUntil) > new Date()));
    if (isLocked) {
      return res.status(403).json({ message: 'Tài khoản của bạn đã bị khóa' });
    }

    if (
      typeof decoded.tv === 'number' &&
      typeof user.tokenVersion === 'number' &&
      decoded.tv !== user.tokenVersion
    ) {
      return res.status(401).json({ message: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại' });
    }

    req.user = user;
    req.tokenPayload = decoded;
    return next();
  } catch (err) {
    return res.status(500).json({ message: 'Lỗi xác thực người dùng' });
  }
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
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
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

/**
 * Optional JWT-only authentication middleware (Product Analytics).
 * - Chỉ đọc `Authorization: Bearer <token>` (hoặc `req.body.auth` nếu gửi qua sendBeacon/fallback).
 * - KHÔNG bao giờ đọc header `userid`, `req.body.userId` hoặc `req.query.userId`.
 */
async function optionalJwtAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    let rawToken = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      rawToken = authHeader.split(' ')[1];
    } else if (typeof req.body?.auth === 'string' && req.body.auth.trim()) {
      rawToken = req.body.auth.trim();
    }

    if (!rawToken || rawToken === 'undefined' || rawToken === 'null') {
      return next();
    }

    const decoded = jwt.verify(rawToken, JWT_SECRET);
    if (decoded.type === 'refresh') return next();
    const userId = decoded.id || decoded._id;
    if (!userId) return next();

    const user = await User.findById(userId).select('-password');
    if (user && !user.isDeleted && !user.isBanned) {
      req.user = user;
      req.tokenPayload = decoded;
    }
  } catch {
    // Ignore invalid/expired token for optional auth
  }
  return next();
}

module.exports = { protect, protectStrict, optionalJwtAuth, isSeller, isAdmin };
