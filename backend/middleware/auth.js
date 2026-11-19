const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getJwtSecret, sanitizeUser, publicUser } = require('../utils/b2c');

/**
 * Kiểm tra trạng thái tài khoản: từ chối nếu bị khóa, bị cấm hoặc đã xóa
 */
function isAccountBlocked(user) {
  if (!user) return true;
  return user.status === 'locked' || user.isBanned === true || user.isDeleted === true;
}

/**
 * Strict JWT authentication middleware (0.3 / H9 / H10):
 * - Bắt buộc mọi request đi qua `protect` / `protectStrict` đều phải gửi `Authorization: Bearer <token>`.
 * - XÓA hoàn toàn fallback `userid` ở header/body/query và `STRICT_PATH_PATTERNS`.
 * - Nạp user từ DB và từ chối nếu `isBanned`, `status === 'locked'`, `isDeleted`.
 * - Kiểm tra `tokenVersion` (`tv` trong JWT payload) để thu hồi ngay các token cũ sau khi đổi mật khẩu hoặc khóa tài khoản.
 */
async function protect(req, res, next) {
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

  if (decoded?.tokenType === 'refresh') {
    return res.status(401).json({ message: 'Không thể dùng Refresh Token để gọi API trực tiếp' });
  }

  const userId = decoded?.id || decoded?._id;
  if (!userId) {
    return res.status(401).json({ message: 'Token không chứa thông tin định danh người dùng' });
  }

  const user = await User.findById(userId).select('-password');
  if (!user) {
    return res.status(401).json({ message: 'Không tìm thấy người dùng' });
  }

  if (isAccountBlocked(user)) {
    return res.status(403).json({
      message: 'Tài khoản của bạn đã bị khóa hoặc ngừng hoạt động. Vui lòng liên hệ ban quản trị để được hỗ trợ.'
    });
  }

  const currentTv = typeof user.tokenVersion === 'number' ? user.tokenVersion : 0;
  const tokenTv = typeof decoded.tv === 'number' ? decoded.tv : 0;
  if (tokenTv !== currentTv) {
    return res.status(401).json({
      message: 'Phiên đăng nhập đã hết hiệu lực (mật khẩu hoặc trạng thái bảo mật đã thay đổi). Vui lòng đăng nhập lại.'
    });
  }

  req.tokenPayload = decoded;
  req.user = user;
  return next();
}

// Giữ protectStrict làm alias của protect để không vỡ import hiện tại
const protectStrict = protect;

/**
 * Middleware: Yêu cầu chủ sở hữu tài nguyên (`req.user._id === req.params[paramName]`) hoặc Admin
 */
function requireOwnerOrAdmin(paramName = 'id') {
  return async (req, res, next) => {
    const proceed = () => {
      if (!req.user) {
        return res.status(401).json({ message: 'Vui lòng đăng nhập' });
      }
      if (isAccountBlocked(req.user)) {
        return res.status(403).json({ message: 'Tài khoản của bạn đã bị khóa' });
      }
      if (req.user.role === 'Admin') {
        return next();
      }
      const targetId = req.params?.[paramName];
      if (!targetId || String(req.user._id) !== String(targetId)) {
        return res.status(403).json({ message: 'Bạn không có quyền truy cập hoặc chỉnh sửa tài nguyên của người khác' });
      }
      return next();
    };

    if (req.user) {
      return proceed();
    }
    return protect(req, res, proceed);
  };
}

/**
 * Middleware: Bắt buộc Bearer JWT của Admin (nạp từ DB để xác nhận role === 'Admin' và chưa bị khóa/thu hồi token)
 */
async function requireAdminJWT(req, res, next) {
  const verifyAdminRole = () => {
    if (!req.user) {
      return res.status(401).json({ message: 'Vui lòng đăng nhập quyền Quản trị viên (Bearer JWT)' });
    }
    if (isAccountBlocked(req.user)) {
      return res.status(403).json({ message: 'Tài khoản quản trị viên đã bị khóa' });
    }
    if (req.user.role !== 'Admin') {
      return res.status(403).json({ message: 'Bạn không có quyền quản trị viên (Admin)' });
    }
    req.adminId = req.user._id;
    return next();
  };

  if (req.user) {
    return verifyAdminRole();
  }
  return protect(req, res, verifyAdminRole);
}

function isSeller(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Vui lòng đăng nhập' });
  }
  if (isAccountBlocked(req.user)) {
    return res.status(403).json({ message: 'Tài khoản của bạn đã bị khóa.' });
  }
  if (req.user.isSeller === true && req.user.sellerStatus === 'approved') {
    return next();
  }
  return res.status(403).json({ message: 'Bạn cần được Admin duyệt Seller Registration để vào Kênh Người Bán.' });
}

/**
 * Middleware isAdmin: hỗ trợ Bearer JWT Admin (qua requireAdminJWT) hoặc session Admin SSR đã xác thực
 */
async function isAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return requireAdminJWT(req, res, next);
  }

  if (req.user && req.user.role === 'Admin') {
    if (isAccountBlocked(req.user)) {
      return res.status(403).json({ message: 'Tài khoản quản trị viên đã bị khóa' });
    }
    req.adminId = req.user._id;
    return next();
  }

  if (req.session && req.session.adminId) {
    try {
      const adminUser = await User.findById(req.session.adminId).select('-password');
      if (!adminUser || adminUser.role !== 'Admin' || isAccountBlocked(adminUser)) {
        return res.status(403).json({ message: 'Phiên quản trị không hợp lệ hoặc tài khoản đã bị khóa' });
      }
      req.user = adminUser;
      req.adminId = adminUser._id;
      return next();
    } catch (e) {
      return res.status(401).json({ message: 'Lỗi xác thực phiên quản trị' });
    }
  }

  return res.status(403).json({ message: 'Bạn không có quyền quản trị' });
}

module.exports = {
  protect,
  protectStrict,
  requireOwnerOrAdmin,
  requireAdminJWT,
  isSeller,
  isAdmin,
  isAccountBlocked,
  sanitizeUser,
  publicUser
};
