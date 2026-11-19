const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { mongoSanitizeMiddleware } = require('./validate');

/**
 * Đọc danh sách origin được phép từ biến môi trường CORS_ORIGINS (phân tách bằng dấu phẩy)
 */
function getAllowedOrigins(customOrigins) {
  if (Array.isArray(customOrigins) && customOrigins.length > 0) {
    return customOrigins.map((o) => String(o).trim()).filter(Boolean);
  }
  const raw = process.env.CORS_ORIGINS || '';
  const list = raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (list.length > 0) return list;

  // Fallback chỉ khi chạy test nội bộ chưa truyền CORS_ORIGINS
  if (process.env.NODE_ENV === 'test') {
    return ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:4001', 'http://127.0.0.1:4001'];
  }
  return [];
}

/**
 * Tạo CORS options chặt chẽ (0.3 / H15):
 * - Chỉ cho phép origin nằm trong danh sách `CORS_ORIGINS` (hoặc request không có header Origin như server-to-server / supertest).
 * - Tuyệt đối KHÔNG có nhánh fallback `callback(null, true)` cho mọi origin lạ.
 * - `credentials: true` chỉ áp dụng cho origin hợp lệ trong danh sách.
 */
function buildCorsOptions(customOrigins) {
  return {
    origin(origin, callback) {
      const allowed = getAllowedOrigins(customOrigins);
      if (!origin) {
        return callback(null, true);
      }
      if (allowed.includes(origin)) {
        return callback(null, true);
      }
      const err = new Error(`Origin ${origin} không nằm trong danh sách CORS_ORIGINS được phép`);
      err.statusCode = 403;
      err.code = 'CORS_NOT_ALLOWED';
      return callback(err, false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'Origin',
      'X-CSRF-Token'
    ],
    exposedHeaders: ['Content-Range', 'X-Content-Range']
  };
}

function createCorsMiddleware(customOrigins) {
  return cors(buildCorsOptions(customOrigins));
}

function createHelmetMiddleware() {
  return helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false // Cho phép EJS admin views và ảnh Cloudinary hoạt động bình thường
  });
}

function makeLimiter({ windowMs, max, message, keyGenerator }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    ...(keyGenerator ? { keyGenerator } : {}),
    handler: (req, res) => {
      return res.status(429).json({
        message: message || 'Quá nhiều yêu cầu từ thiết bị của bạn. Vui lòng thử lại sau ít phút.'
      });
    }
  });
}

const globalLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 5000 : 600,
  message: 'Hệ thống đang nhận quá nhiều yêu cầu từ địa chỉ IP của bạn. Vui lòng thử lại sau.'
});

const loginLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 50 : 10,
  message: 'Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.'
});

const otpLimiter = makeLimiter({
  windowMs: 10 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 50 : 5,
  message: 'Bạn đã yêu cầu gửi mã OTP quá nhiều lần. Vui lòng đợi 10 phút trước khi thử lại.'
});

const chatbotLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 100 : 15,
  message: 'Bạn đang gửi tin nhắn cho Trợ lý AI quá nhanh. Vui lòng đợi 1 phút.'
});

const uploadLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 200 : 40,
  message: 'Bạn đã tải tệp lên quá nhiều lần. Vui lòng thử lại sau 15 phút.'
});

const withdrawLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 50 : 5,
  message: 'Bạn đã gửi quá nhiều yêu cầu rút tiền. Vui lòng thử lại sau 15 phút.'
});

module.exports = {
  getAllowedOrigins,
  buildCorsOptions,
  createCorsMiddleware,
  createHelmetMiddleware,
  mongoSanitizeMiddleware,
  makeLimiter,
  globalLimiter,
  loginLimiter,
  otpLimiter,
  chatbotLimiter,
  uploadLimiter,
  withdrawLimiter
};
