const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { mongoSanitizeMiddleware } = require('./validate');

const DEFAULT_ALLOWED_ORIGINS = [
  'https://hai-hand.vercel.app',
  'https://haihand-marketplace.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4001',
  'http://127.0.0.1:4001'
];

function normalizeOrigin(origin) {
  return String(origin || '').trim().replace(/\/+$/, '');
}

/**
 * Đọc danh sách origin được phép từ cấu hình mặc định, FRONTEND_URL và CORS_ORIGINS
 */
function getAllowedOrigins(customOrigins) {
  if (Array.isArray(customOrigins) && customOrigins.length > 0) {
    return Array.from(new Set(customOrigins.map(normalizeOrigin).filter(Boolean)));
  }

  const envList = [
    ...(process.env.CORS_ORIGINS || '').split(','),
    ...(process.env.FRONTEND_URL || '').split(',')
  ]
    .map(normalizeOrigin)
    .filter(Boolean);

  return Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...envList]));
}

/**
 * Kiểm tra origin có hợp lệ theo chính sách CORS HaiHand (Production Vercel + Localhost)
 */
function isOriginAllowed(origin, customOrigins) {
  if (!origin) {
    return true;
  }

  const normalized = normalizeOrigin(origin);
  const allowed = getAllowedOrigins(customOrigins);
  if (allowed.includes(normalized)) {
    return true;
  }

  if (Array.isArray(customOrigins) && customOrigins.length > 0) {
    return false;
  }

  if (
    normalized.startsWith('http://localhost:') ||
    normalized === 'http://localhost' ||
    normalized.startsWith('http://127.0.0.1:') ||
    normalized === 'http://127.0.0.1'
  ) {
    return true;
  }

  try {
    const parsed = new URL(normalized);
    if (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      parsed.hostname.endsWith('.vercel.app')
    ) {
      return true;
    }
  } catch (e) {
    if (normalized.endsWith('.vercel.app')) {
      return true;
    }
  }

  return false;
}

/**
 * Tạo CORS options cho phép Production Frontend (Vercel), FRONTEND_URL, CORS_ORIGINS và Localhost.
 * - Cho phép request không có Origin (server-to-server, curl, Postman).
 * - Từ chối các origin lạ bằng lỗi 403 (CORS_NOT_ALLOWED).
 */
function buildCorsOptions(customOrigins) {
  return {
    origin(origin, callback) {
      if (isOriginAllowed(origin, customOrigins)) {
        return callback(null, true);
      }
      const err = new Error(`Origin ${origin} không nằm trong danh sách CORS được phép`);
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
      'userid',
      'UserId',
      'X-Requested-With',
      'Origin',
      'X-CSRF-Token'
    ],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    optionsSuccessStatus: 204
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
    validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
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
  keyGenerator: (req) => {
    const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.ip || '127.0.0.1';
    const rawId = req.body && (typeof req.body.email === 'string' ? req.body.email : typeof req.body.username === 'string' ? req.body.username : typeof req.body.identifier === 'string' ? req.body.identifier : '');
    const cleanId = rawId ? rawId.trim().toLowerCase() : 'anon';
    return `${ip}:${cleanId}`;
  },
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
  DEFAULT_ALLOWED_ORIGINS,
  getAllowedOrigins,
  isOriginAllowed,
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
