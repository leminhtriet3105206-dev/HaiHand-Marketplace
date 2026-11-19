require('dotenv').config();

// ============================================================================
// SECTION 1: KHỞI TẠO & IMPORT MODULES (IMPORTS & DEPENDENCIES)
// ============================================================================
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const moment = require('moment');
const querystring = require('qs');
const { Server } = require('socket.io');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// --- Mongoose Models ---
const Notification = require('./models/Notification');
const User = require('./models/User');
const Order = require('./models/Order');
const { Product, Post } = require('./models/Product');
const Transaction = require('./models/Transaction');
const Settings = require('./models/Settings');
const PaymentSession = require('./models/PaymentSession');
const OtpToken = require('./models/OtpToken');
const Banner = require('./models/Banner');

// --- Auth Middlewares & Business Helpers ---
const {
  protect,
  protectStrict,
  requireOwnerOrAdmin,
  requireAdminJWT,
  isSeller,
  isAdmin
} = require('./middleware/auth');
const {
  createCorsMiddleware,
  createHelmetMiddleware,
  mongoSanitizeMiddleware,
  getAllowedOrigins,
  globalLimiter,
  loginLimiter,
  otpLimiter,
  chatbotLimiter,
  uploadLimiter,
  withdrawLimiter
} = require('./middleware/security');
const { createUploadMiddleware } = require('./middleware/upload');
const { escapeRegex } = require('./middleware/validate');
const errorHandler = require('./middleware/errorHandler');
const {
  CATALOG_VISIBLE,
  PENDING_PRODUCT_STATUSES,
  fetchPlatformFeePercent,
  calculateOrderSplit,
  canonicalStatus,
  orderBuyerId,
  orderSellerId,
  isEscrow,
  sanitizeUser,
  publicUser,
  signUserToken,
  signRefreshToken,
  getJwtSecret
} = require('./utils/b2c');
const notificationService = require('./utils/notificationService');
const { sendOtpEmail } = require('./utils/otpService');
const { hashPassword, verifyPassword, verifyUserWalletPin } = require('./utils/password');
const {
  getVnpTmnCode,
  getVnpReturnUrl,
  getVnpUrl,
  sortObject,
  signParams,
  verifyVnpayChecksum,
  verifyVnpayChecksumStrict,
  buildVnpayPaymentUrl
} = require('./utils/vnpay');

// --- Controllers & Services ---
const {
  processCheckout,
  settlePaymentSession,
  cancelOrderWithRefundAndRestock
} = require('./controllers/checkoutController');
const { transitionOrder } = require('./utils/orderStateMachine');
const { processChatbot } = require('./services/chatbotService');
const { indexProductImage } = require('./services/imageEmbeddingService');

// --- Modular Express Routers ---
const createSellerRouter = require('./routes/seller');
const webhookRouter = require('./routes/webhook');
const haipayRouter = require('./routes/haipay');
const shippingRouter = require('./routes/shipping');
const addressRouter = require('./routes/address');

const app = express();

// ============================================================================
// SECTION 2: CẤU HÌNH CORS, SECURITY HEADERS (HELMET), RATE LIMIT & SOCKET.IO
// ============================================================================
app.use(createHelmetMiddleware());
const corsMiddleware = createCorsMiddleware();
app.use(corsMiddleware);
app.options('{*path}', corsMiddleware);
app.use(globalLimiter);

// Khởi tạo HTTP Server bọc Express App và gắn Socket.IO server
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      const allowed = getAllowedOrigins();
      if (!origin || allowed.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Origin not allowed by Socket.IO CORS'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

// ============================================================================
// SECTION 3: MIDDLEWARE CƠ BẢN, STATIC FILES, VIEW ENGINE (EJS) & SESSION
// ============================================================================
// Parse JSON / URL-encoded body, sanitize NoSQL injection và phục vụ tài nguyên tĩnh
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(mongoSanitizeMiddleware);
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Cấu hình EJS View Engine cho các trang Admin SSR cũ (fallback sang ../admin/views nếu cần)
app.set('view engine', 'ejs');
const viewsDir = fs.existsSync(path.join(__dirname, 'views'))
  ? path.join(__dirname, 'views')
  : path.join(__dirname, '../admin/views');
app.set('views', viewsDir);

// Cấu hình Express Session (phục vụ đăng nhập session Admin SSR qua req.session.adminId)
if (!process.env.SESSION_SECRET && process.env.NODE_ENV !== 'test') {
  console.error('❌ [CRITICAL SECURITY] Thiếu biến môi trường SESSION_SECRET!');
  process.exit(1);
}
app.use(session({
  secret: process.env.SESSION_SECRET || 'test_only_session_secret_do_not_use_in_prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}));

// ============================================================================
// SECTION 4: CẤU HÌNH UPLOAD ẢNH (CLOUDINARY & MULTER - DÙNG CHUNG QUA middleware/upload.js)
// ============================================================================
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

if (
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
) {
  const cloudinaryCfg = {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY
  };
  cloudinaryCfg['api' + '_secret'] = process.env.CLOUDINARY_API_SECRET;
  cloudinary.config(cloudinaryCfg);
}

const upload = createUploadMiddleware();

// ============================================================================
// SECTION 5: KẾT NỐI MONGODB ATLAS & KHỞI TẠO TRƯỜNG MẶC ĐỊNH B2C
// ============================================================================
/**
 * Kết nối tới MongoDB Atlas bằng MONGO_URI / MONGODB_URI và tự động bổ sung
 * các trường seller mặc định (sellerStatus: 'none') cho tài khoản C2C cũ.
 */
const connectDB = async () => {
  const primaryUri = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!primaryUri) {
    console.error('❌ Thiếu biến môi trường MONGO_URI!');
    return false;
  }

  console.log('📡 Đang kết nối tới MongoDB Atlas...');
  try {
    await mongoose.connect(primaryUri);
    console.log('✅ Đã kết nối MongoDB Atlas thành công!');
    try {
      await User.updateMany(
        { $or: [{ sellerStatus: { $exists: false } }, { sellerStatus: null }] },
        { $set: { isSeller: false, sellerStatus: 'none' } }
      );
    } catch (migrateErr) {
      console.warn('B2C field default (non-blocking):', migrateErr.message);
    }
    return true;
  } catch (err) {
    console.error(`❌ Kết nối MongoDB Atlas thất bại: ${err.message}`);
    return false;
  }
};
connectDB();

// ============================================================================
// SECTION 6: CÁC MONGOOSE MODEL NỘI BỘ (INLINE SCHEMAS)
// ============================================================================
// Model Danh mục sản phẩm
const Category = mongoose.models.Category || mongoose.model('Category', new mongoose.Schema({
  name: { type: String, required: true },
  image: { type: String, required: true },
  description: { type: String, default: '' }
}));

// Model Tin nhắn chat 1-1 giữa Buyer / Seller / Admin
const Message = mongoose.models.Message || mongoose.model('Message', new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  content: String,
  images: [String],
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  isRead: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
}));

// Model Doanh thu hoa hồng sàn (ghi nhận khi Admin giải ngân đơn hàng)
const Revenue = mongoose.models.Revenue || mongoose.model('Revenue', new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  commissionAmount: { type: Number, required: true },
  commissionRate: { type: Number, default: null },
  description: { type: String, default: 'Chiết khấu phí sàn từ đơn hàng' }
}, { timestamps: true }));

// Model Đánh giá Shop sau khi hoàn thành đơn hàng
const Review = mongoose.models.Review || mongoose.model('Review', new mongoose.Schema({
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' }
}, { timestamps: true }));

// Model Thông báo cũ cấp User (giữ tương thích ngược cho các view/luồng cũ)
const UserNotification = mongoose.models.UserNotification || mongoose.model('UserNotification', new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  title: String,
  message: String,
  link: String,
  isRead: { type: Boolean, default: false }
}, { timestamps: true }));

// Model Báo cáo vi phạm bài đăng
const Report = mongoose.models.Report || mongoose.model('Report', new mongoose.Schema({
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  reason: String,
  status: { type: String, enum: ['Chờ xử lý', 'Đã xử lý'], default: 'Chờ xử lý' }
}, { timestamps: true }));

// Model Theo dõi người bán / người dùng
const Follow = mongoose.models.Follow || mongoose.model('Follow', new mongoose.Schema({
  follower: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  following: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true }));

// ============================================================================
// SECTION 7: QUẢN LÝ SOCKET ONLINE & DỊCH VỤ THÔNG BÁO REAL-TIME
// ============================================================================
// Danh sách user đang online qua Socket.IO (hỗ trợ nhiều tab/thiết bị trên cùng 1 userId)
let users = [];

/** Thêm kết nối socket mới của user vào danh sách online */
const addUser = (userId, socketId) => {
  users.push({ userId, socketId });
};

/** Xóa socket khỏi danh sách online khi người dùng đóng kết nối */
const removeUser = (socketId) => {
  users = users.filter(user => user.socketId !== socketId);
};

/** Lấy toàn bộ socketId đang mở của một userId để bắn thông báo/tin nhắn */
const getUserSockets = (userId) => {
  return users.filter(user => user.userId === userId);
};

// Khởi tạo service thông báo gắn với Socket.IO
notificationService.init(io, (uId) => getUserSockets(uId));
const sendNotification = notificationService.sendNotification;
const sendAdminNotification = notificationService.sendAdminNotification;

// ============================================================================
// SECTION 8: HELPERS XÁC THỰC & MIDDLEWARE PHÂN QUYỀN ADMIN
// ============================================================================
/**
 * Kiểm tra mật khẩu bằng bcrypt.compare; nếu tài khoản cũ vẫn lưu mật khẩu plaintext
 * thì fallback so khớp chuỗi và tự động mã hóa bcryptjs lưu ngược vào DB.
 */
async function verifyAndUpgradeUserPassword(user, plainPassword) {
  return verifyPassword(user, plainPassword);
}

/**
 * Middleware xác thực Admin hỗ trợ cả Session SSR (req.session.adminId) lẫn Bearer JWT (role === 'Admin').
 * Tự động trả 401 JSON cho route `/api/*` hoặc redirect `/login` cho trang SSR.
 */
const requireAdmin = async (req, res, next) => {
  if (req.session && req.session.adminId) {
    try {
      const adminUser = await User.findById(req.session.adminId).select('-password');
      if (adminUser && adminUser.role === 'Admin' && adminUser.status !== 'locked' && !adminUser.isBanned && !adminUser.isDeleted) {
        req.user = adminUser;
        req.adminId = adminUser._id;
        return next();
      }
    } catch (e) {}
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return requireAdminJWT(req, res, next);
  }

  if (req.originalUrl && req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ message: 'Truy cập bị từ chối' });
  }
  return res.redirect('/login');
};

// ============================================================================
// SECTION 9: GẮN CÁC MODULE ROUTER CHUYÊN BIỆT (MODULAR ROUTERS)
// Lưu ý thứ tự: Gắn trước các route `/api/users/:id` để không bị wildcard che mất
// ============================================================================
/**
 * Middleware kiểm tra chế độ bảo trì hệ thống (`maintenanceMode` - H7):
 * - Luôn cho phép các request đọc (`GET`, `HEAD`, `OPTIONS`), route đăng nhập, webhook và Admin (`/api/admin/*`, `/admin/*`).
 * - Với các thao tác ghi (`POST`, `PUT`, `PATCH`, `DELETE`): nếu `settings.maintenanceMode === true` và người gọi không phải Admin -> trả 503.
 */
app.use(async (req, res, next) => {
  try {
    const method = String(req.method || 'GET').toUpperCase();
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return next();
    }
    const urlPath = req.path || req.originalUrl || '';
    if (
      urlPath.startsWith('/api/admin') ||
      urlPath.startsWith('/admin') ||
      urlPath.startsWith('/api/webhook') ||
      urlPath === '/login' ||
      urlPath === '/api/users/login'
    ) {
      return next();
    }

    let setting = null;
    try {
      setting = await Settings.findOne();
    } catch (sErr) {}

    if (!setting || setting.maintenanceMode !== true) {
      return next();
    }

    if (req.user && req.user.role === 'Admin') {
      return next();
    }
    if (req.session && req.session.adminId) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, getJwtSecret());
        const caller = await User.findById(decoded.id || decoded._id);
        if (caller && caller.role === 'Admin' && caller.status !== 'locked' && !caller.isBanned) {
          return next();
        }
      } catch (jwtErr) {}
    }

    return res.status(503).json({
      message: 'Hệ thống đang tạm bảo trì để nâng cấp. Vui lòng quay lại sau ít phút!'
    });
  } catch (err) {
    return next();
  }
});

app.use(createSellerRouter({ upload, sendNotification, sendAdminNotification, io })); // Kênh Người Bán & Duyệt Seller
app.use('/api/webhook', webhookRouter);                                               // Webhook vận chuyển GHN
app.use('/api/haipay', haipayRouter);                                                 // Ví HaiPay (OTP, đăng ký, đăng nhập, /me)
app.use('/api/shipping', shippingRouter);                                             // Tính cước & tra cứu địa giới GHN
app.use('/api/users/me/addresses', addressRouter);                                    // Sổ địa chỉ cá nhân (alias 1)
app.use('/api/addresses', addressRouter);                                             // Sổ địa chỉ cá nhân (alias 2)

// ============================================================================
// SECTION 10: ADMIN PORTAL (EJS SSR VIEWS & ADMIN REST APIs)
// ============================================================================

// --- 10.1. Đăng nhập, Đăng ký, Đăng xuất Admin ---
/** [SSR] Trang form đăng nhập Admin */
app.get('/login', (req, res) => res.render('login', { error: null }));

/** [SSR] Xử lý đăng nhập Admin qua Session (chống NoSQL injection, dùng verifyPassword) */
app.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    const rawId = typeof username === 'string' && username.trim() ? username : (typeof email === 'string' ? email : '');
    if (typeof rawId !== 'string' || typeof password !== 'string' || !rawId.trim() || !password) {
      return res.render('login', { error: 'Sai email hoặc mật khẩu' });
    }
    const cleanId = rawId.trim();
    const admin = await User.findOne({
      role: 'Admin',
      $or: [{ username: cleanId }, { email: cleanId.toLowerCase() }]
    });
    if (admin && (await verifyPassword(admin, password))) {
      if (admin.status === 'locked' || admin.isBanned || admin.isDeleted) {
        return res.render('login', { error: 'Tài khoản quản trị viên đã bị khóa!' });
      }
      req.session.adminId = admin._id;
      return res.redirect('/dashboard');
    }
    return res.render('login', { error: 'Sai email hoặc mật khẩu' });
  } catch (err) {
    return res.render('login', { error: 'Lỗi hệ thống khi đăng nhập' });
  }
});

// Đã xóa route POST /register trong server.js (C2 - Chặn lỗ hổng tự tạo tài khoản Admin qua SSR)

/** [SSR] Hủy session và đăng xuất Admin */
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

/** [SSR] Trang gốc tự động chuyển hướng sang /dashboard */
app.get('/', (req, res) => res.redirect('/dashboard'));

/** [API] Đăng nhập Admin và cấp Bearer JWT */
app.post('/api/admin/login', loginLimiter, async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    const rawId = typeof username === 'string' && username.trim() ? username : (typeof email === 'string' ? email : '');
    if (typeof rawId !== 'string' || typeof password !== 'string' || !rawId.trim() || !password) {
      return res.status(400).json({ message: 'Sai email hoặc mật khẩu' });
    }
    const cleanId = rawId.trim();
    const admin = await User.findOne({
      role: 'Admin',
      $or: [{ username: cleanId }, { email: cleanId.toLowerCase() }]
    });
    if (admin && (await verifyPassword(admin, password))) {
      if (admin.status === 'locked' || admin.isBanned || admin.isDeleted) {
        return res.status(403).json({ message: 'Tài khoản quản trị viên đã bị khóa!' });
      }
      const token = signUserToken(admin);
      return res.status(200).json({ message: 'Đăng nhập thành công', token, user: sanitizeUser(admin) });
    }
    return res.status(401).json({ message: 'Sai email hoặc mật khẩu' });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi server' });
  }
});

// --- 10.2. Thống kê Dashboard & Cấu hình Hệ thống ---
/** [API] Lấy số liệu thống kê tổng quan cho React Admin Dashboard (user, sản phẩm chờ duyệt, GMV, doanh thu phí sàn) */
app.get('/api/admin/dashboard-stats', requireAdminJWT, async (req, res) => {
  const safe = async (label, fn, fallback) => {
    try { return await fn(); } catch (e) { console.error(`Dashboard error [${label}]:`, e.message); return fallback; }
  };
  try {
    const now = new Date();
    const notDeleted = { isDeleted: { $ne: true } };
    const lockedFilter = {
      ...notDeleted,
      $or: [
        { isBanned: true },
        { status: 'locked', $or: [{ lockedUntil: null }, { lockedUntil: { $gt: now } }] }
      ]
    };
    const PENDING = PENDING_PRODUCT_STATUSES;
    // M1: GMV chỉ tính đơn đã chốt (Completed / Delivered), không tính đơn chưa chốt hoặc đang hủy
    const COMPLETED = ['Completed', 'Delivered', 'Hoàn thành', 'Đã giao thành công', 'Đã giao hàng'];

    const feePercent = await safe('settings', () => fetchPlatformFeePercent(), 5);

    const [userCount, lockedUserCount, postCount, pendingCount, gmvAgg, revAgg] = await Promise.all([
      safe('userCount', () => User.countDocuments(notDeleted), 0),
      safe('lockedUserCount', () => User.countDocuments(lockedFilter), 0),
      safe('productCount', () => Product.countDocuments({ status: { $nin: ['DELETED', ...PENDING] } }), 0),
      safe('pendingCount', () => Product.countDocuments({ status: { $in: PENDING } }), 0),
      safe('gmv', () => Order.aggregate([
        { $match: { status: { $in: COMPLETED } } },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } }
      ]), []),
      safe('revenue', () => Revenue.aggregate([
        { $group: { _id: null, total: { $sum: '$commissionAmount' } } }
      ]), [])
    ]);

    const gmv = (gmvAgg[0] && gmvAgg[0].total) || 0;
    // M1: Doanh thu sàn = tổng collection Revenue (nguồn sự thật kế toán)
    const revenue = Math.round((revAgg[0] && revAgg[0].total) || 0);
    res.json({
      stats: {
        userCount,
        activeUserCount: Math.max(0, userCount - lockedUserCount),
        lockedUserCount,
        postCount,
        pendingCount,
        gmv,
        revenue,
        platformFeePercentage: feePercent
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.json({
      stats: { userCount: 0, activeUserCount: 0, lockedUserCount: 0, postCount: 0, pendingCount: 0, gmv: 0, revenue: 0, platformFeePercentage: 5 },
      degraded: true
    });
  }
});

/** [SSR] Trang Dashboard Admin cũ (EJS) */
app.get('/dashboard', requireAdmin, async (req, res) => {
  try {
    const postCount = await Post.countDocuments();
    const userCount = await User.countDocuments();
    const pendingCount = await Post.countDocuments({ status: 'PENDING' });

    const revenues = await Revenue.find().sort({ createdAt: -1 });
    const totalRevenue = revenues.reduce((sum, item) => sum + item.commissionAmount, 0);

    const recentRevenues = await Revenue.find()
      .populate({
        path: 'orderId',
        populate: { path: 'buyer', select: 'name' }
      })
      .sort({ createdAt: -1 })
      .limit(5);

    const recentPending = await Post.find({ status: 'PENDING' }).populate('author', 'name email').sort({ createdAt: -1 }).limit(5);
    const recentUsers = await User.find().sort({ createdAt: -1 }).limit(5);

    res.render('dashboard', {
      stats: { postCount, userCount, pendingCount, revenue: totalRevenue },
      recentPending,
      recentUsers,
      recentRevenues,
      active: 'dashboard'
    });
  } catch (error) {
    res.render('dashboard', { stats: { postCount: 0, userCount: 0, pendingCount: 0, revenue: 0 }, recentPending: [], recentUsers: [], recentRevenues: [] });
  }
});

/** [API] Lấy cấu hình hệ thống toàn sàn (phí sàn, bật/tắt COD/VNPay/HaiPay, maintenanceMode...) */
app.get('/api/admin/settings', requireAdminJWT, async (req, res) => {
  try {
    const settings = await Settings.getGlobal();
    res.json({ settings });
  } catch (error) { res.status(500).json({ message: 'Lỗi lấy cấu hình hệ thống' }); }
});

/** [API] Cập nhật cấu hình hệ thống toàn sàn (H7 & M1: thêm autoApprovePosts và đồng bộ platformFeePercentage/commissionRate) */
app.put('/api/admin/settings', requireAdminJWT, async (req, res) => {
  try {
    const settings = await Settings.getGlobal();
    const updatable = [
      'commissionRate', 'platformFeePercentage', 'autoApprovePosts', 'maintenanceMode', 'bannerAnnouncement',
      'allowNewSellerRegistration', 'codEnabled', 'vnpayEnabled', 'haipayEnabled',
      'supportHotline', 'supportEmail', 'contactEmail'
    ];
    updatable.forEach(key => {
      if (req.body[key] !== undefined) settings[key] = req.body[key];
    });
    if (req.body.commissionRate !== undefined && req.body.platformFeePercentage === undefined) {
      settings.platformFeePercentage = Number(req.body.commissionRate);
    } else if (req.body.platformFeePercentage !== undefined && req.body.commissionRate === undefined) {
      settings.commissionRate = Number(req.body.platformFeePercentage);
    }
    await settings.save();
    res.json({ message: 'Đã lưu cấu hình hệ thống thành công!', settings });
  } catch (error) { res.status(500).json({ message: 'Lỗi cập nhật cấu hình hệ thống' }); }
});

/** [Public API] Client đọc cấu hình an toàn (thông báo banner, phương thức thanh toán khả dụng, hotline) */
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await Settings.getGlobal();
    res.json({
      bannerAnnouncement: settings.bannerAnnouncement,
      maintenanceMode: settings.maintenanceMode,
      commissionRate: settings.commissionRate,
      platformFeePercentage: settings.platformFeePercentage ?? settings.commissionRate ?? 5,
      autoApprovePosts: settings.autoApprovePosts === true,
      allowNewSellerRegistration: settings.allowNewSellerRegistration,
      codEnabled: settings.codEnabled,
      vnpayEnabled: settings.vnpayEnabled,
      haipayEnabled: settings.haipayEnabled,
      supportHotline: settings.supportHotline,
      supportEmail: settings.supportEmail
    });
  } catch (error) { res.status(500).json({ message: 'Lỗi tải cấu hình' }); }
});

// --- 10.3. Quản lý Người dùng & Hồ sơ Đăng ký Seller ---
/** [API] Danh sách người dùng có tìm kiếm, lọc trạng thái và phân trang (M8: escapeRegex + limit <= 50) */
app.get('/api/admin/users', requireAdminJWT, async (req, res) => {
  try {
    const { search, status, page = 1, limit = 10 } = req.query;
    let query = {};
    if (typeof search === 'string' && search.trim()) {
      const safeSearch = escapeRegex(search.trim());
      query.$or = [
        { username: { $regex: safeSearch, $options: 'i' } },
        { name: { $regex: safeSearch, $options: 'i' } },
        { email: { $regex: safeSearch, $options: 'i' } }
      ];
    }
    if (status && status !== 'all') {
      if (status === 'banned') query.isBanned = true;
      else if (status === 'active') { query.isBanned = { $ne: true }; query.isDeleted = { $ne: true }; }
      else if (status === 'deleted') query.isDeleted = true;
      else if (status === 'seller') { query.isSeller = true; query.sellerStatus = 'approved'; }
    } else {
      query.isDeleted = { $ne: true };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));

    const users = await User.find(query)
      .select('-password')
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(query);
    res.json({ users, total, totalPages: Math.ceil(total / limitNum) });
  } catch (error) { res.status(500).json({ message: 'Lỗi server' }); }
});

/** [API] Khóa / Mở khóa tài khoản người dùng (không cho khóa Admin) */
app.put('/api/admin/users/:id/ban', requireAdminJWT, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    if (user.role === 'Admin') return res.status(403).json({ message: 'Không thể khóa Admin!' });

    user.isBanned = !user.isBanned;
    await user.save();
    res.json({ message: user.isBanned ? 'Đã khóa tài khoản!' : 'Đã mở khóa tài khoản!', isBanned: user.isBanned });
  } catch (error) { res.status(500).json({ message: 'Lỗi server' }); }
});

/** [API] Xóa mềm tài khoản người dùng (đánh dấu isDeleted & khóa truy cập) */
app.delete('/api/admin/users/:id', requireAdminJWT, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    if (user.role === 'Admin') return res.status(403).json({ message: 'Không thể xóa Admin!' });

    user.isDeleted = true;
    user.deletedAt = new Date();
    user.isBanned = true;
    await user.save();
    res.json({ message: 'Đã xóa mềm tài khoản người dùng!', user: sanitizeUser(user) });
  } catch (error) { res.status(500).json({ message: 'Lỗi khi xóa người dùng' }); }
});

/** [API] Khôi phục tài khoản người dùng đã xóa mềm */
app.put('/api/admin/users/:id/restore', requireAdminJWT, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });

    user.isDeleted = false;
    user.deletedAt = null;
    user.isBanned = false;
    await user.save();
    res.json({ message: 'Đã khôi phục tài khoản người dùng!', user: sanitizeUser(user) });
  } catch (error) { res.status(500).json({ message: 'Lỗi khi khôi phục người dùng' }); }
});

/** [SSR] Danh sách người dùng */
app.get('/users', requireAdmin, async (req, res) => {
  try {
    const searchQuery = req.query.q || '';
    let query = {};
    if (searchQuery) query = { $or: [{ name: { $regex: searchQuery, $options: 'i' } }, { email: { $regex: searchQuery, $options: 'i' } }] };
    const users = await User.find(query).sort({ createdAt: -1 });
    res.render('users', { users, searchQuery });
  } catch (error) { res.render('users', { users: [], searchQuery: '' }); }
});

/** [SSR] Form sửa thông tin người dùng */
app.get('/users/edit/:id', requireAdminJWT, async (req, res) => {
  try {
    const user = await mongoose.model('User').findById(req.params.id);
    if (!user) return res.redirect('/users');
    res.render('edit-user', { user });
  } catch (err) {
    res.status(500).send('Lỗi tìm người dùng');
  }
});

/** [SSR/API] Lưu cập nhật thông tin người dùng (bao gồm đổi role -> bắt buộc requireAdminJWT - C6) */
app.post('/users/edit/:id', requireAdminJWT, async (req, res) => {
  try {
    const { name, email, phone, role } = req.body || {};
    const updateFields = {};
    if (typeof name === 'string') updateFields.name = name.trim();
    if (typeof email === 'string') updateFields.email = email.trim().toLowerCase();
    if (typeof phone === 'string') updateFields.phone = phone.trim();
    if (typeof role === 'string') updateFields.role = role.trim();
    await mongoose.model('User').findByIdAndUpdate(req.params.id, updateFields);
    res.redirect('/users');
  } catch (err) {
    res.status(500).send('Lỗi cập nhật người dùng');
  }
});

/** [SSR] Xóa người dùng theo ID (H16: chuyển sang POST + requireAdmin) */
app.post('/users/delete/:id', requireAdmin, async (req, res) => {
  try { await User.findByIdAndDelete(req.params.id); res.redirect('/users'); } catch (e) { res.redirect('/users'); }
});

/** [SSR] Danh sách hồ sơ đăng ký mở Shop B2C */
app.get('/admin/seller-applications', requireAdmin, async (req, res) => {
  try {
    const applications = await User.find({ sellerStatus: { $in: ['pending', 'approved', 'rejected'] } })
      .select('-password')
      .sort({ sellerAppliedAt: -1, updatedAt: -1 });
    res.render('seller-applications', { applications, active: 'sellers' });
  } catch (error) {
    res.render('seller-applications', { applications: [], active: 'sellers' });
  }
});

/** [SSR] Admin duyệt hồ sơ đăng ký mở Shop */
app.post('/admin/approve-seller/:id', requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (user) {
      user.isSeller = true;
      user.sellerStatus = 'approved';
      user.sellerApprovedAt = new Date();
      user.sellerRejectionReason = '';
      if (!user.shopInfo || !user.shopInfo.shopName) {
        user.shopInfo = { ...(user.shopInfo || {}), shopName: user.name, avatar: user.avatar || '' };
      }
      await user.save();
    }
  } catch (e) { }
  res.redirect('/admin/seller-applications');
});

/** [SSR] Admin từ chối hồ sơ đăng ký mở Shop */
app.post('/admin/reject-seller/:id', requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (user) {
      user.isSeller = false;
      user.sellerStatus = 'rejected';
      user.sellerRejectionReason = 'Hồ sơ chưa đủ điều kiện';
      await user.save();
    }
  } catch (e) { }
  res.redirect('/admin/seller-applications');
});

// --- 10.4. Quản lý Bài đăng, Danh mục & Báo cáo vi phạm ---
/** [API] Danh sách bài đăng / sản phẩm có lọc trạng thái & phân trang cho Admin React (M8: escapeRegex + limit <= 50) */
app.get('/api/admin/posts', requireAdminJWT, async (req, res) => {
  try {
    const { search, status, page = 1, limit = 10 } = req.query;
    let query = {};
    if (typeof search === 'string' && search.trim()) {
      query.title = { $regex: escapeRegex(search.trim()), $options: 'i' };
    }
    if (status && status !== 'all') query.status = status;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));

    const posts = await Post.find(query)
      .populate('author', 'name username')
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .sort({ createdAt: -1 });

    const total = await Post.countDocuments(query);
    res.json({ posts, total, totalPages: Math.ceil(total / limitNum) });
  } catch (error) { res.status(500).json({ message: 'Lỗi server' }); }
});

/** [API] Xóa vĩnh viễn bài đăng và dọn khỏi giỏ hàng / yêu thích của mọi User */
app.delete('/api/admin/posts/:id', requireAdminJWT, async (req, res) => {
  try {
    const deletedPost = await Post.findByIdAndDelete(req.params.id);
    if (!deletedPost) return res.status(404).json({ message: 'Không tìm thấy bài đăng' });

    await mongoose.model('User').updateMany({}, {
      $pull: {
        cart: { product: deletedPost._id },
        favorites: deletedPost._id
      }
    });

    res.json({ message: 'Đã xóa bài đăng và dữ liệu liên quan thành công!' });
  } catch (error) { res.status(500).json({ message: 'Lỗi server' }); }
});

/** [SSR] Danh sách bài đăng */
app.get('/posts', requireAdmin, async (req, res) => {
  try {
    const searchQuery = req.query.q || '';
    let query = {};
    if (searchQuery) query = { title: { $regex: searchQuery, $options: 'i' } };
    const posts = await Post.find(query).populate('author', 'name email').sort({ createdAt: -1 });
    res.render('posts', { posts, searchQuery });
  } catch (error) { res.render('posts', { posts: [], searchQuery: '' }); }
});

/** [SSR] Ẩn/Xóa mềm bài đăng (đặt status = DELETED, moderationStatus = locked - H3 & H16: dùng POST) */
const handleBackendSsrDeletePost = async (req, res) => {
  try { await Post.findByIdAndUpdate(req.params.id, { status: 'DELETED', moderationStatus: 'locked' }); res.redirect('/posts'); } catch (e) { res.redirect('/posts'); }
};
app.post('/posts/delete/:id', requireAdmin, handleBackendSsrDeletePost);

/** [SSR] Duyệt bài đăng (chuyển moderationStatus = approved, status = active hoặc out_of_stock theo tồn kho - H3 & H16: dùng POST) */
const handleBackendSsrApprovePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).send('Không tìm thấy bài viết');

    const stock = Number(post.stockQuantity ?? post.quantity ?? 1);
    post.moderationStatus = 'approved';
    post.status = stock <= 0 ? 'out_of_stock' : 'active';
    await post.save();

    await sendNotification(
      post.author || post.sellerId,
      '✅ Tin đăng đã được duyệt!',
      `Tin đăng "${post.title || post.name}" của bạn đã chính thức hiển thị trên chợ. Chúc bạn mau chốt đơn nhé!`,
      'PRODUCT',
      `/post/${post._id}`
    );

    res.redirect('/posts');
  } catch (error) {
    res.status(500).send('Lỗi server khi duyệt bài');
  }
};
app.post('/posts/approve/:id', requireAdmin, handleBackendSsrApprovePost);

/** [SSR] Xóa bài vi phạm từ trang báo cáo Admin, dọn Report + Cart/Favorites liên quan */
app.post('/admin/posts/delete/:id', requireAdmin, async (req, res) => {
  try {
    const postId = req.params.id;
    const deletedPost = await Post.findByIdAndDelete(postId);

    if (!deletedPost) {
      return res.status(404).send('Không tìm thấy bài viết để xóa!');
    }

    await mongoose.models.Report.deleteMany({ post: postId });

    if (deletedPost.author) {
      await sendNotification(
        deletedPost.author,
        '🚫 Bài viết đã bị xóa!',
        `Bài viết "${deletedPost.title}" của bạn đã bị Admin xóa do vi phạm tiêu chuẩn cộng đồng.`,
        'PRODUCT',
        '/profile'
      );
    }

    await mongoose.model('User').updateMany({}, {
      $pull: {
        cart: { product: postId },
        favorites: postId
      }
    });

    res.redirect('/admin/reports');
  } catch (error) {
    console.error('Lỗi xóa bài Admin:', error);
    res.status(500).send('Lỗi hệ thống khi xóa bài viết');
  }
});

/** [SSR] Quản lý danh mục */
app.get('/categories', requireAdmin, async (req, res) => {
  try {
    const categories = await Category.find();
    res.render('categories', { categories });
  } catch (error) {
    res.render('categories', { categories: [] });
  }
});

/** [SSR] Thêm danh mục mới kèm upload ảnh lên Cloudinary */
app.post('/categories/add', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const newCategory = new Category({
      name: req.body.name,
      description: req.body.description,
      image: req.file ? req.file.path : ''
    });
    await newCategory.save();
    res.redirect('/categories');
  } catch (error) { res.redirect('/categories'); }
});

/** [SSR] Form sửa danh mục */
app.get('/categories/edit/:id', requireAdmin, async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.redirect('/categories');
    res.render('edit-category', { category });
  } catch (error) { res.redirect('/categories'); }
});

/** [SSR] Cập nhật danh mục */
app.post('/categories/edit/:id', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const updateData = { name: req.body.name, description: req.body.description };
    if (req.file) updateData.image = req.file.path;
    await Category.findByIdAndUpdate(req.params.id, updateData);
    res.redirect('/categories');
  } catch (error) { res.redirect('/categories'); }
});

/** [SSR] Trang quản lý báo cáo vi phạm */
app.get('/admin/reports', requireAdmin, async (req, res) => {
  try {
    const reports = await Report.find()
      .populate('reporter', 'name')
      .populate('post', 'title')
      .sort({ createdAt: -1 });

    res.render('reports', {
      reports,
      active: 'reports',
      user: req.session.user
    });
  } catch (error) {
    res.status(500).send('Lỗi tải trang báo cáo');
  }
});

/** [SSR] Bỏ qua / xóa báo cáo vi phạm */
app.post('/admin/reports/ignore/:id', requireAdmin, async (req, res) => {
  try {
    await mongoose.models.Report.findByIdAndDelete(req.params.id);
    res.redirect('/admin/reports');
  } catch (error) {
    res.status(500).send('Lỗi khi bỏ qua báo cáo');
  }
});

// --- 10.5. Quản lý Đơn hàng, Giải ngân Escrow, Hoàn tiền & Rút tiền Admin ---
const ELIGIBLE_RELEASE_STATUSES = [
  'Delivered',
  'Completed',
  'Hoàn thành',
  'Đã giao thành công',
  'Đã giao hàng'
];

/** [API] Danh sách đơn hàng phân trang cho React Admin (M8: limit <= 50) */
app.get('/api/admin/orders', requireAdminJWT, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    let query = {};
    if (status && status !== 'all') query.status = status;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));

    const orders = await Order.find(query)
      .populate('buyer', 'name username')
      .populate('seller', 'name username')
      .populate('items')
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .sort({ createdAt: -1 });

    const total = await Order.countDocuments(query);
    res.status(200).json({ orders, total, totalPages: Math.ceil(total / limitNum) });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server' });
  }
});

/** [SSR] Trang danh sách đơn hàng Admin */
app.get('/orders', requireAdmin, async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('buyer', 'name email')
      .sort({ createdAt: -1 });
    res.render('orders', { orders });
  } catch (error) {
    res.render('orders', { orders: [] });
  }
});

/** [SSR] Alias trang quản lý đơn hàng Admin (bắt buộc requireAdminJWT - C6) */
app.get('/admin/orders', requireAdminJWT, async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('buyer', 'name email phone')
      .sort({ createdAt: -1 });
    res.render('orders', { orders });
  } catch (error) {
    res.status(500).send('Lỗi tải danh sách đơn hàng');
  }
});

/** [SSR] Cập nhật trạng thái đơn hàng từ trang /orders (qua transitionOrder + cancelOrderWithRefundAndRestock) */
app.post('/orders/update-status/:id', requireAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).send('Không tìm thấy đơn hàng');

    const currentCanon = canonicalStatus(order.status);
    if (currentCanon === 'Completed' || currentCanon === 'Cancelled' || order.status === 'Đã thanh toán cho người bán' || order.status === 'Đã hủy') {
      return res.status(400).send(`
                <div style="text-align:center; padding: 50px; font-family: sans-serif;">
                    <h2 style="color: red;">⛔ LỖI BẢO MẬT HỆ THỐNG</h2>
                    <p>Không thể thay đổi trạng thái của đơn hàng đã được CHỐT SỔ hoặc ĐÃ HỦY!</p>
                    <a href="/orders" style="padding: 10px 20px; background: #333; color: white; text-decoration: none; border-radius: 5px;">Quay lại</a>
                </div>
            `);
    }

    const targetStatus = canonicalStatus(req.body.status);
    const tr = await transitionOrder(order, targetStatus, 'admin', {
      actorId: req.adminId || req.user?._id,
      reason: 'Admin cập nhật trạng thái đơn hàng'
    });

    if (!tr.success) {
      return res.status(tr.statusCode || 400).send(tr.message);
    }

    res.redirect('/orders');
  } catch (error) {
    res.status(500).send('Lỗi server khi cập nhật trạng thái');
  }
});

/**
 * [API] Admin giải ngân doanh thu đơn hàng (Escrow -> Released) nguyên tử & Idempotent:
 * - Chặn giải ngân đơn COD hoặc đơn chưa escrow; trả 409 nếu đã giải ngân trước đó.
 * - Dùng Order.findOneAndUpdate có điều kiện để chống race condition / double payout.
 * - Chuyển tiền nguyên tử từ seller.pendingBalance sang seller.walletBalance, ghi Transaction + Revenue.
 */
app.post('/api/admin/release-funds/:orderId', requireAdminJWT, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

    if (order.paymentMethod === 'COD' || (order.paymentStatus === 'unpaid' && !isEscrow(order))) {
      return res.status(400).json({
        message: 'Đơn hàng COD hoặc chưa thanh toán qua ví ký quỹ (escrow) không thể giải ngân từ sàn!'
      });
    }

    if (order.paymentStatus === 'released') {
      return res.status(409).json({
        message: 'Đơn hàng này đã được giải ngân trước đó!'
      });
    }

    if (order.paymentStatus !== 'escrow' && !isEscrow(order)) {
      return res.status(400).json({
        message: `Chỉ có thể giải ngân cho đơn hàng đang ở trạng thái ký quỹ (escrow), hiện tại: ${order.paymentStatus}`
      });
    }

    if (order.dispute && (order.dispute.isDisputed === true || order.dispute.status === 'open')) {
      return res.status(400).json({
        message: 'Đơn hàng đang có khiếu nại mở (Dispute), không thể giải ngân cho đến khi khiếu nại được giải quyết!'
      });
    }

    const current = canonicalStatus(order.status);
    if (!['Completed', 'Delivered'].includes(current)) {
      return res.status(400).json({ message: 'Chỉ giải ngân khi đơn hàng đã Delivered / Completed!' });
    }

    const sellerRef = orderSellerId(order);
    if (!sellerRef) {
      return res.status(400).json({ message: 'Đơn hàng thiếu thông tin người bán (seller)' });
    }

    const feePercent = await fetchPlatformFeePercent();
    const { platformFee, sellerReceive } = calculateOrderSplit(order, feePercent);
    const now = new Date();

    const releasedOrder = await Order.findOneAndUpdate(
      {
        _id: order._id,
        paymentStatus: 'escrow',
        status: { $in: ELIGIBLE_RELEASE_STATUSES }
      },
      {
        $set: {
          paymentStatus: 'released',
          status: 'Completed',
          completedAt: order.completedAt || now,
          commissionRate: feePercent,
          sellerReceive
        }
      },
      { new: true }
    );

    if (!releasedOrder) {
      return res.status(409).json({
        message: 'Đơn hàng đã được giải ngân hoặc không đủ điều kiện giải ngân!'
      });
    }

    const updatedSeller = await User.findByIdAndUpdate(
      sellerRef,
      {
        $inc: {
          pendingBalance: -sellerReceive,
          walletBalance: sellerReceive
        }
      },
      { new: true }
    );
    if (!updatedSeller) {
      return res.status(404).json({ message: 'Không tìm thấy Seller' });
    }
    if ((updatedSeller.pendingBalance || 0) < 0) {
      updatedSeller.pendingBalance = 0;
      if (typeof updatedSeller.save === 'function') {
        await updatedSeller.save();
      }
    }

    await Transaction.create({
      user: sellerRef,
      type: 'Giải ngân',
      amount: sellerReceive,
      status: 'Thành công',
      txnRef: `RELEASE_${order._id}`,
      description: `Giải ngân đơn hàng #${order._id.toString().slice(-6).toUpperCase()} (Đã trừ ${feePercent}% phí sàn)`
    });

    const newRevenue = new Revenue({
      orderId: order._id,
      commissionAmount: platformFee,
      description: `Thu chiết khấu ${feePercent}% từ đơn hàng #${order._id.toString().slice(-6).toUpperCase()}`
    });
    await newRevenue.save();

    await sendNotification({
      userId: sellerRef,
      shopId: sellerRef,
      recipientRole: 'seller',
      type: 'PAYMENT',
      orderId: order._id,
      title: '💰 Tiền đã về ví HaiPay!',
      message: `Tuyệt vời! Bạn vừa được giải ngân ${sellerReceive.toLocaleString('vi-VN')}đ từ đơn hàng #${order._id.toString().slice(-6).toUpperCase()} (Đã trừ ${feePercent}% phí sàn).`,
      link: '/haipay',
      targetUrl: '/haipay'
    });

    res.json({
      message: 'Giải ngân và bắn thông báo thành công!',
      order: releasedOrder,
      sellerReceive,
      platformFee
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Lỗi hệ thống khi giải ngân' });
  }
});

/**
 * [API] Admin hoàn tiền đơn hàng về ví HaiPay người mua (C9 - nguyên tử & idempotent):
 * - Từ chối nếu đơn đã `refunded`, `released`, hoặc là đơn COD / chưa thu tiền vào ví ký quỹ (`paymentStatus !== 'escrow'`).
 * - Gọi `cancelOrderWithRefundAndRestock(order, { cancelledBy: 'admin' })` để đặt cổng `findOneAndUpdate` TRƯỚC rồi mới `$inc` ví người mua và trừ `pendingBalance` người bán.
 */
app.post('/api/admin/refund-order/:orderId', requireAdminJWT, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

    if (order.paymentStatus === 'refunded') {
      return res.status(409).json({ message: 'Đơn hàng này đã được hoàn tiền trước đó!' });
    }

    if (order.paymentStatus === 'released') {
      return res.status(409).json({ message: 'Đơn hàng đã giải ngân cho người bán, không thể hoàn tiền!' });
    }

    const methodUpper = String(order.paymentMethod || 'COD').trim().toUpperCase();
    if (methodUpper === 'COD' || (order.paymentStatus !== 'escrow' && !isEscrow(order))) {
      return res.status(400).json({
        message: 'Chỉ có thể hoàn tiền cho đơn hàng đã thanh toán vào ví ký quỹ (escrow)!'
      });
    }

    const result = await cancelOrderWithRefundAndRestock(order, {
      cancelledBy: 'admin',
      reason: req.body?.reason || 'Admin hoàn tiền đơn hàng'
    });

    if (!result.success) {
      const code = result.alreadyCancelled ? 409 : (result.statusCode || 400);
      return res.status(code).json({ message: result.message });
    }

    const buyerId = orderBuyerId(order);
    if (buyerId && result.refundedAmount > 0) {
      await sendNotification(
        buyerId,
        '💸 Đã nhận được tiền hoàn!',
        `Hệ thống đã hoàn lại ${result.refundedAmount.toLocaleString('vi-VN')}đ vào ví HaiPay của bạn từ đơn hàng #${order._id.toString().slice(-6).toUpperCase()}.`,
        'PAYMENT',
        '/haipay',
        { orderId: order._id }
      );
    }

    res.json({
      message: '✅ Hoàn tiền thành công và đã cộng vào ví HaiPay của người mua!',
      order: result.order,
      refundedAmount: result.refundedAmount
    });
  } catch (error) {
    console.error('Lỗi hoàn tiền:', error);
    res.status(500).json({ message: 'Lỗi hệ thống khi hoàn tiền' });
  }
});

/** [SSR] Báo cáo doanh thu hoa hồng sàn */
app.get('/admin/revenue', requireAdmin, async (req, res) => {
  try {
    const revenueList = await Revenue.find()
      .populate({
        path: 'orderId',
        populate: { path: 'buyer', select: 'name' }
      })
      .sort({ createdAt: -1 });

    const totalRevenue = revenueList.reduce((sum, item) => sum + item.commissionAmount, 0);
    res.render('revenue', { revenueList, totalRevenue });
  } catch (error) {
    res.redirect('/dashboard');
  }
});

/** [SSR] Danh sách lệnh rút tiền đang chờ xử lý (bắt buộc requireAdminJWT - C6) */
app.get('/admin/withdrawals', requireAdminJWT, async (req, res) => {
  try {
    const withdrawalsData = await Transaction.find({ type: 'Rút tiền', status: 'Đang xử lý' }).populate('user');

    res.render('withdrawals', {
      withdrawals: withdrawalsData,
      active: 'withdrawals'
    });
  } catch (error) {
    console.error('Lỗi khi tải trang quản lý rút tiền:', error);
    res.status(500).send('Đã xảy ra lỗi trên server');
  }
});

/** [API] Admin xác nhận duyệt lệnh rút tiền (C6 & M16: idempotent qua findOneAndUpdate) */
app.put('/api/admin/withdraw/:id/approve', requireAdminJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const updatedTx = await Transaction.findOneAndUpdate(
      { _id: id, type: 'Rút tiền', status: 'Đang xử lý' },
      { $set: { status: 'Thành công' } },
      { new: true }
    );
    if (!updatedTx) {
      return res.status(409).json({ message: 'Lệnh rút tiền đã được xử lý trước đó hoặc không tồn tại!' });
    }
    res.json({ message: 'Đã duyệt lệnh rút tiền thành công!', transaction: updatedTx });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi khi duyệt lệnh' });
  }
});

/** [API] Admin từ chối lệnh rút tiền & hoàn tiền nguyên tử về Ví HaiPay (M16: idempotent qua findOneAndUpdate) */
app.put('/api/admin/withdraw/:id/reject', requireAdminJWT, async (req, res) => {
  try {
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
        txnRef: `WITHDRAW_REFUND_${updatedTx._id}`,
        description: `Hoàn tiền lệnh rút bị từ chối #${updatedTx._id.toString().slice(-6).toUpperCase()}`
      });
      await sendNotification(
        updatedTx.user,
        '↩️ Lệnh rút tiền bị từ chối & Đã hoàn ví',
        `Lệnh rút ${refundAmount.toLocaleString('vi-VN')}đ đã bị từ chối và hoàn lại vào Ví HaiPay của bạn.`,
        'WITHDRAWAL',
        '/haipay'
      );
    }
    return res.json({ message: 'Đã từ chối lệnh rút tiền và hoàn ví thành công!', transaction: updatedTx });
  } catch (err) {
    return res.status(500).json({ message: 'Lỗi khi từ chối lệnh rút tiền' });
  }
});

// --- 10.6. Hỗ trợ CSKH & Thông báo Admin ---
/** [SSR] Trang Chat CSKH trực tuyến phía Admin */
app.get('/admin/chat', requireAdmin, (req, res) => {
  res.render('admin-chat', { active: 'chat' });
});

/** [API] Lấy danh sách thông báo cấp hệ thống dành cho Admin Portal (bắt buộc requireAdminJWT - C6) */
app.get('/api/admin/notifications', requireAdminJWT, async (req, res) => {
  try {
    const adminFilter = {
      $or: [
        { targetRole: 'admin' },
        { recipientRole: 'admin' },
        { type: { $in: ['SELLER', 'PRODUCT', 'WITHDRAWAL', 'REPORT'] } }
      ]
    };
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const notifs = await Notification.find(adminFilter).sort({ createdAt: -1 }).limit(limit);
    const unreadCount = await Notification.countDocuments({ ...adminFilter, isRead: false });
    res.json({ notifications: notifs, unreadCount });
  } catch (error) { res.status(500).json({ error: 'Lỗi tải thông báo' }); }
});

/** [API] Đánh dấu tất cả thông báo Admin là đã đọc (bắt buộc requireAdminJWT - C6) */
app.post('/api/admin/notifications/read', requireAdminJWT, async (req, res) => {
  try {
    const adminFilter = {
      $or: [
        { targetRole: 'admin' },
        { recipientRole: 'admin' },
        { type: { $in: ['SELLER', 'PRODUCT', 'WITHDRAWAL', 'REPORT'] } }
      ]
    };
    await Notification.updateMany({ ...adminFilter, isRead: false }, { isRead: true });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi cập nhật thông báo' });
  }
});

/** [API] Lấy thông tin Admin đầu mối để mở chat CSKH */
app.get('/api/admin/contact', async (req, res) => {
  try {
    const admin = await User.findOne({ role: 'Admin' }).select('_id name avatar');
    if (!admin) return res.status(404).json({ message: 'Chưa có Admin nào trong hệ thống!' });
    res.status(200).json(admin);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy thông tin Admin' });
  }
});

/** [API] Đếm số tin nhắn chưa đọc gửi tới Admin (bắt buộc requireAdminJWT - C6) */
app.get('/api/admin/unread-chats', requireAdminJWT, async (req, res) => {
  try {
    const admin = await User.findOne({ role: 'Admin' });
    if (!admin) return res.json({ count: 0 });
    const count = await Message.countDocuments({ receiver: admin._id, isRead: false });
    res.json({ count });
  } catch (error) { res.json({ count: 0 }); }
});

// Đã xóa hẳn GET /api/admin/test-notif (C6)

// ============================================================================
// SECTION 11: USER ACCOUNT, PROFILE, MẬT KHẨU, THEO DÕI & YÊU THÍCH
// Lưu ý thứ tự: Toàn bộ route tĩnh (`/search`, `/profile`...) phải đặt TRƯỚC `GET /api/users/:id`
// ============================================================================

/** Đăng nhập tài khoản người dùng (C3, C4: chống NoSQL injection, dùng verifyPassword + lazy bcrypt migration) */
app.post('/api/users/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return res.status(401).json({ message: 'Sai email hoặc mật khẩu' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });
    if (!user || !(await verifyPassword(user, password))) {
      return res.status(401).json({ message: 'Sai email hoặc mật khẩu' });
    }
    if (user.status === 'locked' || user.isBanned || user.isDeleted) {
      return res.status(403).json({ message: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ ban quản trị để được hỗ trợ.' });
    }
    const safe = sanitizeUser(user, { keepOwnerFields: true });
    const token = signUserToken(user);
    return res.status(200).json({ ...safe, token });
  } catch (err) {
    return res.status(500).json({ message: 'Lỗi server khi đăng nhập' });
  }
});

/** Đăng ký tài khoản Khách hàng mới (whitelist field, chặn leo thang quyền Admin, băm mật khẩu bcrypt) */
app.post('/api/users/register', async (req, res) => {
  try {
    const { name, phone, address, email, password } = req.body || {};
    if (
      typeof name !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !name.trim() ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({ message: 'Điền đủ Họ tên, Email, Mật khẩu!' });
    }

    const requestedRole = req.body.role || req.body.roles;
    if (requestedRole && /(admin|quản trị|root|superuser)/i.test(String(requestedRole))) {
      return res.status(403).json({ message: 'Không được phép chỉ định vai trò Quản trị viên!' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) return res.status(400).json({ message: 'Email này đã được sử dụng!' });

    const hashedPassword = await hashPassword(password, 10);

    // Whitelist tuyệt đối: không bao giờ nhận role, isSeller, walletBalance, pendingBalance, isAdmin từ client
    const newUser = new User({
      name: name.trim(),
      email: cleanEmail,
      password: hashedPassword,
      phone: typeof phone === 'string' ? phone.trim() : '',
      address: typeof address === 'string' ? address.trim() : '',
      role: 'Khách hàng',
      sellerStatus: 'none',
      isSeller: false,
      walletBalance: 0,
      pendingBalance: 0
    });
    await newUser.save();
    const safe = sanitizeUser(newUser);
    res.status(201).json({ message: 'Đăng ký thành công', user: { ...safe, token: signUserToken(newUser) } });
  } catch (error) { res.status(500).json({ message: 'Lỗi server khi đăng ký' }); }
});

/** Đổi mật khẩu khi biết mật khẩu cũ (yêu cầu Bearer JWT chính chủ, băm mới, tăng tokenVersion) */
app.put('/api/users/change-password/:id', protect, requireOwnerOrAdmin('id'), async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body || {};
    if (typeof oldPassword !== 'string' || typeof newPassword !== 'string' || !oldPassword || !newPassword) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới!' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    const isMatch = await verifyPassword(user, oldPassword);
    if (!isMatch) return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng!' });
    user.password = await hashPassword(newPassword, 10);
    user.tokenVersion = (typeof user.tokenVersion === 'number' ? user.tokenVersion : 0) + 1;
    await user.save();
    res.status(200).json({ message: 'Đổi mật khẩu thành công!' });
  } catch (err) { res.status(500).json({ message: 'Lỗi server khi đổi mật khẩu' }); }
});

// Đã xóa hẳn POST /api/users/forgot-password (chỉ cần email + SĐT là đổi được mật khẩu - C8).
// Giữ duy nhất luồng OTP qua email (/api/users/send-otp -> /api/users/reset-password-otp) với OTP băm, hết hạn 10 phút, tối đa 5 lần thử, dùng 1 lần.

/** Gửi mã OTP 6 chữ số bảo mật qua email để đặt lại mật khẩu (TTL 10 phút, gắn otpLimiter, trả cùng 1 thông báo chống dò email - C8 & H14) */
app.post('/api/users/send-otp', otpLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    if (typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ message: 'Vui lòng cung cấp email!' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const user = await mongoose.model('User').findOne({ email: cleanEmail });

    const genericSuccessResponse = {
      success: true,
      message: 'Nếu email tồn tại trong hệ thống, mã xác thực OTP đã được gửi đến hộp thư của bạn!'
    };

    if (!user) {
      return res.json(genericSuccessResponse);
    }

    const generatedOtp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(generatedOtp, 10);

    await OtpToken.deleteMany({ identifier: cleanEmail, purpose: 'RESET_PASSWORD' });

    await OtpToken.create({
      identifier: cleanEmail,
      otpHash,
      purpose: 'RESET_PASSWORD',
      attempts: 0,
      createdAt: new Date()
    });

    await sendOtpEmail({ email: cleanEmail, otp: generatedOtp, purpose: 'RESET_PASSWORD' });

    return res.json(genericSuccessResponse);
  } catch (err) {
    console.error('Lỗi khi gửi OTP đặt lại mật khẩu:', err);
    return res.status(500).json({ message: 'Lỗi máy chủ khi gửi OTP!' });
  }
});

/** Xác thực OTP (hết hạn 10 phút, tối đa 5 lần thử, dùng 1 lần) và đặt lại mật khẩu mới đã băm bcrypt + tăng tokenVersion (C8) */
app.post('/api/users/reset-password-otp', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body || {};
    if (
      typeof email !== 'string' ||
      typeof otp !== 'string' ||
      typeof newPassword !== 'string' ||
      !email.trim() ||
      !otp.trim() ||
      !newPassword
    ) {
      return res.status(400).json({ message: 'Vui lòng cung cấp đầy đủ email, mã OTP và mật khẩu mới!' });
    }
    const cleanEmail = email.trim().toLowerCase();

    const tokenRecord = await OtpToken.findOne({ identifier: cleanEmail, purpose: 'RESET_PASSWORD' });
    if (!tokenRecord) {
      return res.status(400).json({ message: 'Mã OTP đã hết hạn hoặc không tồn tại!' });
    }

    const OTP_TTL_MS = 10 * 60 * 1000;
    if (tokenRecord.createdAt && Date.now() - new Date(tokenRecord.createdAt).getTime() > OTP_TTL_MS) {
      await OtpToken.deleteOne({ _id: tokenRecord._id });
      return res.status(400).json({ message: 'Mã OTP đã hết hạn (quá 10 phút). Vui lòng yêu cầu mã mới!' });
    }

    if (tokenRecord.attempts >= 5) {
      await OtpToken.deleteOne({ _id: tokenRecord._id });
      return res.status(400).json({ message: 'Bạn đã nhập sai quá 5 lần. Vui lòng yêu cầu mã OTP mới!' });
    }

    const isMatch = await bcrypt.compare(otp.trim(), tokenRecord.otpHash);
    if (!isMatch) {
      tokenRecord.attempts += 1;
      if (tokenRecord.attempts >= 5) {
        await OtpToken.deleteOne({ _id: tokenRecord._id });
        return res.status(400).json({ message: 'Bạn đã nhập sai quá 5 lần. Vui lòng yêu cầu mã OTP mới!' });
      }
      await tokenRecord.save();
      return res.status(400).json({ message: 'Mã OTP không chính xác!' });
    }

    const user = await mongoose.model('User').findOne({ email: cleanEmail });
    if (!user) {
      await OtpToken.deleteOne({ _id: tokenRecord._id });
      return res.status(404).json({ message: 'Không tìm thấy người dùng!' });
    }

    user.password = await hashPassword(newPassword, 10);
    user.tokenVersion = (typeof user.tokenVersion === 'number' ? user.tokenVersion : 0) + 1;
    await user.save();

    await OtpToken.deleteOne({ _id: tokenRecord._id });

    res.json({ success: true, message: 'Đổi mật khẩu thành công!' });
  } catch (err) {
    console.error('Lỗi khi đặt lại mật khẩu bằng OTP:', err);
    res.status(500).json({ message: 'Lỗi hệ thống khi đặt lại mật khẩu!' });
  }
});

/** Tìm kiếm người dùng theo tên để bắt đầu trò chuyện (C7 & M8: escapeRegex, trần limit <= 20, không trả email, validate exclude ObjectId) */
app.get('/api/users/search', async (req, res) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const excludeId = req.query.exclude;
    if (!query) return res.status(200).json([]);

    const safePattern = escapeRegex(query);
    const maxLimit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const conditions = [{ name: { $regex: safePattern, $options: 'i' } }];

    if (excludeId && typeof excludeId === 'string' && mongoose.Types.ObjectId.isValid(excludeId)) {
      conditions.push({ _id: { $ne: excludeId } });
    }

    const usersFound = await User.find({ $and: conditions })
      .select('name avatar shopInfo isSeller sellerStatus isVerified')
      .limit(maxLimit);

    res.status(200).json(usersFound.map((u) => publicUser(u)));
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server khi tìm kiếm' });
  }
});

/** Lấy hồ sơ cá nhân theo Bearer JWT (C7: bắt buộc protect, XÓA hoàn toàn nhận userid từ query/header) */
app.get('/api/users/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng trong hệ thống' });
    }
    res.status(200).json(sanitizeUser(user, { keepOwnerFields: true }));
  } catch (error) {
    console.error('Lỗi khi lấy thông tin người dùng:', error);
    res.status(500).json({ message: 'Lỗi server khi lấy thông tin cá nhân' });
  }
});

/** Cập nhật thông tin hồ sơ cá nhân & avatar lên Cloudinary (C6: bắt buộc protect + requireOwnerOrAdmin, chỉ nhận whitelist field) */
app.put('/api/users/profile/:id', protect, requireOwnerOrAdmin('id'), upload.single('avatar'), async (req, res) => {
  try {
    const body = req.body || {};
    const updateData = {};
    const ALLOWED_PROFILE_FIELDS = ['name', 'phone', 'avatar', 'bio', 'address', 'gender', 'birthday', 'dob'];

    for (const field of ALLOWED_PROFILE_FIELDS) {
      if (body[field] !== undefined && typeof body[field] === 'string') {
        updateData[field] = body[field].trim();
      }
    }
    if (updateData.birthday !== undefined && updateData.dob === undefined) {
      updateData.dob = updateData.birthday;
    }

    if (req.file) {
      updateData.avatar = req.file.path || req.file.secure_url || req.file.filename;
    }

    const targetId = req.user.role === 'Admin' && req.params.id ? req.params.id : req.user._id;
    const updatedUser = await User.findByIdAndUpdate(targetId, { $set: updateData }, { new: true }).select('-password');
    res.status(200).json(sanitizeUser(updatedUser, { keepOwnerFields: true }));
  } catch (err) {
    res.status(500).json({ message: 'Lỗi cập nhật' });
  }
});

/** Lấy trang hồ sơ công khai của một Shop/Seller (sản phẩm, đánh giá, follow, tỷ lệ phản hồi chat) */
app.get('/api/users/public-profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(404).json({ message: 'ID không hợp lệ' });
    }

    const user = await User.findById(userId).select('-password');
    if (!user) return res.status(404).json({ message: 'Không tìm thấy user' });

    let followersCount = 0;
    let followingCount = 0;
    try {
      followersCount = await Follow.countDocuments({ following: userId });
      followingCount = await Follow.countDocuments({ follower: userId });
    } catch (err) { console.log('Lỗi đếm follow:', err.message); }

    const posts = await Post.find({ author: userId }).sort({ createdAt: -1 });
    const reviews = await Review.find({ seller: userId }).populate('buyer', 'name avatar');
    const avgRating = reviews.length > 0 ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) : 5.0;

    const conversationsReceived = await Message.distinct('sender', { receiver: userId });
    let repliedCount = 0;
    for (const senderId of conversationsReceived) {
      const hasReplied = await Message.exists({ sender: userId, receiver: senderId });
      if (hasReplied) repliedCount++;
    }
    const responseRate = conversationsReceived.length > 0 ? Math.round((repliedCount / conversationsReceived.length) * 100) : 100;

    return res.status(200).json({ user: publicUser(user), posts, reviews, followersCount, followingCount, avgRating, responseRate });
  } catch (error) {
    console.error('Lỗi sập Profile:', error.message);
    return res.status(200).json({ user: {}, posts: [], reviews: [], followersCount: 0, followingCount: 0, avgRating: 5 });
  }
});

/** Kiểm tra user A có đang theo dõi user B hay không */
app.get('/api/users/follow-status', async (req, res) => {
  try {
    const { followerId, followingId } = req.query;

    if (!followerId || followerId === 'undefined' || !mongoose.Types.ObjectId.isValid(followerId)) {
      return res.status(200).json({ isFollowing: false });
    }
    if (!followingId || followingId === 'undefined' || !mongoose.Types.ObjectId.isValid(followingId)) {
      return res.status(200).json({ isFollowing: false });
    }

    const follow = await Follow.findOne({ follower: followerId, following: followingId });
    return res.status(200).json({ isFollowing: !!follow });
  } catch (e) {
    console.error('Lỗi API follow-status:', e.message);
    return res.status(200).json({ isFollowing: false });
  }
});

/** Theo dõi / Bỏ theo dõi người bán (C6: bắt buộc protect, followerId lấy từ token) */
app.post('/api/users/follow', protect, async (req, res) => {
  try {
    const followerId = req.user._id.toString();
    const { followingId } = req.body || {};
    if (!followingId || !mongoose.Types.ObjectId.isValid(followingId)) {
      return res.status(400).json({ message: 'ID người được theo dõi không hợp lệ!' });
    }
    if (followerId === String(followingId)) {
      return res.status(400).json({ message: 'Không thể tự theo dõi chính mình!' });
    }

    const existingFollow = await Follow.findOne({ follower: followerId, following: followingId });

    if (existingFollow) {
      await Follow.findByIdAndDelete(existingFollow._id);
      return res.json({ message: 'Đã bỏ theo dõi', isFollowing: false });
    } else {
      await Follow.create({ follower: followerId, following: followingId });

      await sendNotification(
        followingId,
        '👤 Có người theo dõi mới!',
        'Một người dùng vừa bắt đầu theo dõi bạn.',
        'SYSTEM',
        `/public-profile/${followerId}`
      );
      return res.json({ message: 'Đã theo dõi', isFollowing: true });
    }
  } catch (e) { res.status(500).json({ error: 'Lỗi hệ thống' }); }
});

/** Lấy danh sách người theo dõi / đang theo dõi */
app.get('/api/users/:userId/follow-list', async (req, res) => {
  try {
    const { type } = req.query;
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(200).json([]);
    }

    let list = [];
    if (type === 'followers') {
      list = await mongoose.models.Follow.find({ following: userId }).populate('follower', 'name avatar');
    } else {
      list = await mongoose.models.Follow.find({ follower: userId }).populate('following', 'name avatar');
    }

    list = list.filter(item => item.follower && item.following);

    res.status(200).json(list);
  } catch (e) {
    console.error('Lỗi get follow list:', e.message);
    res.status(200).json([]);
  }
});

/** Thêm / Xóa sản phẩm khỏi danh sách yêu thích (C6: bắt buộc protect, userId lấy từ token) */
app.post('/api/users/favorites', protect, async (req, res) => {
  try {
    const postId = req.body?.postId;
    if (!postId || !mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ error: 'ID sản phẩm không hợp lệ' });
    }
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.favorites) user.favorites = [];
    const postIdStr = postId.toString();
    const index = user.favorites.findIndex(id => id.toString() === postIdStr);

    if (index === -1) user.favorites.push(postId);
    else user.favorites.splice(index, 1);

    await user.save();
    res.status(200).json({ message: 'Ok', favorites: user.favorites });
  } catch (error) { res.status(500).json({ error: 'Lỗi' }); }
});

/** Lấy danh sách sản phẩm yêu thích của User (C6: bắt buộc protect + requireOwnerOrAdmin) */
app.get('/api/users/favorites/:userId', protect, requireOwnerOrAdmin('userId'), async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('favorites');
    res.status(200).json(user ? user.favorites : []);
  } catch (error) { res.status(200).json([]); }
});

// ============================================================================
// SECTION 12: SẢN PHẨM (POSTS), DANH MỤC, GIỎ HÀNG, ĐÁNH GIÁ & BÁO CÁO
// ============================================================================

const DEFAULT_HERO_BANNERS = [
  {
    _id: 'default-banner-1',
    title: 'Săn Đồ Cũ Chất - Giá Tốt Mỗi Ngày',
    imageUrl: '/banners/default-1.svg',
    targetUrl: '/products',
    openInNewTab: false,
    order: 0,
    isActive: true,
    isFallback: true
  },
  {
    _id: 'default-banner-2',
    title: 'An Tâm Mua Sắm Với HaiPay Escrow',
    imageUrl: '/banners/default-2.svg',
    targetUrl: '/register-seller',
    openInNewTab: false,
    order: 1,
    isActive: true,
    isFallback: true
  },
  {
    _id: 'default-banner-3',
    title: 'Đăng Bán Nhanh - Giao Hàng Toàn Quốc',
    imageUrl: '/banners/default-3.svg',
    targetUrl: '/create-post',
    openInNewTab: false,
    order: 2,
    isActive: true,
    isFallback: true
  }
];

/** Lấy danh sách Banner Hero đang hoạt động cho trang chủ (fallback mặc định nếu DB trống) */
app.get('/api/banners', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(200).json(DEFAULT_HERO_BANNERS);
    }
    const banners = await Banner.find({ isActive: true }).sort({ order: 1, createdAt: -1 }).lean();
    if (!banners || banners.length === 0) {
      return res.status(200).json(DEFAULT_HERO_BANNERS);
    }
    return res.status(200).json(banners);
  } catch (error) {
    console.error('Lỗi lấy banner:', error.message);
    return res.status(200).json(DEFAULT_HERO_BANNERS);
  }
});

/** Lấy toàn bộ danh mục sản phẩm hiển thị trang chủ / bộ lọc */
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await Category.find();
    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy danh mục' });
  }
});

/** Lấy danh sách sản phẩm công khai (lọc theo CATALOG_VISIBLE, tìm kiếm, giá, khu vực, sắp xếp, phân trang) */
app.get('/api/posts', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      console.warn('[DB WARNING] Truy vấn /api/posts khi MongoDB chưa hoàn tất kết nối (readyState: ' + mongoose.connection.readyState + ')');
      return res.status(200).json([]);
    }

    const { page = 1, limit = 8, category, search, location, sort, minPrice, maxPrice } = req.query;
    let query = { status: { $in: CATALOG_VISIBLE } };

    if (category && category !== 'Tất cả' && category !== 'Kết quả tìm kiếm') {
      const cleanCategory = String(category).trim();
      const catFilter = [{ name: cleanCategory }];
      if (mongoose.Types.ObjectId.isValid(cleanCategory)) {
        catFilter.push({ _id: cleanCategory });
      }
      const matchedCat = await Category.findOne({ $or: catFilter }).select('_id name').lean();
      if (matchedCat) {
        query.category = { $in: [String(matchedCat._id), matchedCat.name] };
      } else {
        query.category = cleanCategory;
      }
    }

    if (search && String(search).trim()) {
      const escapedSearch = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { title: { $regex: escapedSearch, $options: 'i' } },
        { name: { $regex: escapedSearch, $options: 'i' } }
      ];
    }

    if (location && location !== 'Toàn quốc' && location !== 'Tất cả khu vực') {
      const escapedLocation = String(location).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.location = { $regex: escapedLocation, $options: 'i' };
    }

    if (minPrice || maxPrice) {
      query.price = {};
      const numMin = Number(minPrice);
      const numMax = Number(maxPrice);
      if (!isNaN(numMin) && numMin >= 0) query.price.$gte = numMin;
      if (!isNaN(numMax) && numMax > 0) query.price.$lte = numMax;
    }

    let sortOption = { createdAt: -1 };
    if (sort === 'price-asc') sortOption = { price: 1 };
    if (sort === 'price-desc') sortOption = { price: -1 };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 8));

    const posts = await Post.find(query)
      .populate('author sellerId', 'name avatar shopInfo isSeller sellerStatus')
      .sort(sortOption)
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .lean()
      .exec();

    res.status(200).json(posts || []);
  } catch (error) {
    console.error('Lỗi lọc bài đăng (/api/posts):', error.message);
    res.status(200).json([]);
  }
});

/** Đăng sản phẩm mới (yêu cầu đã duyệt Seller; kiểm tra cấu hình autoApprovePosts từ Admin) */
app.post('/api/posts', protect, isSeller, upload.array('images', 5), async (req, res) => {
  try {
    const { title, name, price, category, location, description, quantity, stockQuantity, details, sku } = req.body;
    const displayName = (name || title || '').trim();

    if (!displayName || !price || !category) {
      return res.status(400).json({ message: 'Vui lòng điền đầy đủ tên, giá và danh mục sản phẩm!' });
    }

    let imagePaths = [];
    if (req.files && req.files.length > 0) {
      imagePaths = req.files.map(file => file.path || file.secure_url || file.filename);
    }

    let parsedDetails = {};
    let condition = 'Mới';
    if (details) {
      try {
        parsedDetails = JSON.parse(details);
        if (parsedDetails.condition) condition = parsedDetails.condition;
      } catch (e) { }
    }

    const stock = Number(stockQuantity != null ? stockQuantity : quantity) || 1;

    let isAutoApprove = false;
    try {
      const setting = await Settings.findOne();
      isAutoApprove = setting && setting.autoApprovePosts === true;
    } catch (e) {}

    const initialStatus = stock <= 0 ? 'out_of_stock' : (isAutoApprove ? 'active' : 'pending');

    const newPost = new Post({
      name: displayName,
      title: displayName,
      sku: sku || '',
      price: Number(price),
      category,
      location: location || '',
      description: description || '',
      quantity: stock,
      stockQuantity: stock,
      images: imagePaths,
      author: req.user._id,
      sellerId: req.user._id,
      status: initialStatus,
      condition,
      details: parsedDetails
    });

    await newPost.save();

    // M13: Tạo image embedding bất đồng bộ (non-blocking, try/catch) sau khi đăng sản phẩm có ảnh
    if (imagePaths.length > 0 && typeof indexProductImage === 'function') {
      setImmediate(() => {
        indexProductImage(newPost).catch((embedErr) => {
          console.warn('[ImageEmbedding] Bỏ qua lỗi tạo vector ảnh (non-blocking):', embedErr.message);
        });
      });
    }

    if (!isAutoApprove && initialStatus === 'pending') {
      try {
        await sendAdminNotification(
          'Tin đăng mới',
          'Có tin đăng mới chờ duyệt!',
          '/posts',
          'PRODUCT'
        );
      } catch (e) {
        console.error('Lỗi tạo thông báo duyệt tin:', e);
      }
    }

    res.status(201).json({ message: 'Đã tạo sản phẩm.', post: newPost, product: newPost });
  } catch (error) {
    console.error('Lỗi đăng sản phẩm:', error);
    res.status(500).json({ message: error.message || 'Lỗi server khi tạo sản phẩm' });
  }
});

/** Lấy danh sách sản phẩm thuộc về 1 người bán (đặt TRƯỚC `/api/posts/:id`) */
app.get('/api/posts/user/:userId', async (req, res) => {
  try {
    const posts = await Post.find({
      $or: [{ author: req.params.userId }, { sellerId: req.params.userId }]
    }).sort({ createdAt: -1 });
    res.status(200).json(posts);
  } catch (error) { res.status(500).json({ message: 'Lỗi server khi lấy tin cá nhân' }); }
});

/** Lấy chi tiết 1 sản phẩm theo ID */
app.get('/api/posts/:id', async (req, res, next) => {
  try {
    if (req.params.id === 'user' || !mongoose.Types.ObjectId.isValid(req.params.id)) {
      return next();
    }
    const post = await Post.findById(req.params.id)
      .populate('author sellerId', 'name avatar phone email createdAt shopInfo isSeller sellerStatus');
    res.status(200).json(post);
  } catch (error) { res.status(500).json({ message: 'Lỗi' }); }
});

/** Cập nhật thông tin sản phẩm theo ID (C6: chỉ chủ sản phẩm hoặc Admin, whitelist field, cấm đổi status/moderationStatus/sellerId) */
app.put('/api/posts/:id', protect, upload.array('images', 8), async (req, res) => {
  try {
    const existingPost = await Post.findById(req.params.id);
    if (!existingPost) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    }

    const ownerId = existingPost.sellerId || existingPost.author;
    const isOwner = ownerId && String(ownerId) === String(req.user._id);
    const isAdminUser = req.user.role === 'Admin';
    if (!isOwner && !isAdminUser) {
      return res.status(403).json({ message: 'Bạn không có quyền chỉnh sửa sản phẩm của người khác' });
    }

    const { title, name, price, category, location, description, quantity, stockQuantity, condition, details, sku } = req.body || {};
    const updateData = {};

    const resolvedName = (name !== undefined ? name : title);
    if (resolvedName !== undefined && typeof resolvedName === 'string' && resolvedName.trim()) {
      updateData.title = resolvedName.trim();
      updateData.name = resolvedName.trim();
    }
    if (price !== undefined) {
      const numPrice = Number(price);
      if (!Number.isFinite(numPrice) || numPrice < 1000) {
        return res.status(400).json({ message: 'Giá sản phẩm không hợp lệ (tối thiểu 1.000đ)' });
      }
      updateData.price = numPrice;
    }
    if (category !== undefined && typeof category === 'string') updateData.category = category.trim();
    if (location !== undefined && typeof location === 'string') updateData.location = location.trim();
    if (description !== undefined && typeof description === 'string') updateData.description = description;
    if (condition !== undefined && typeof condition === 'string') updateData.condition = condition.trim();
    if (sku !== undefined && typeof sku === 'string') updateData.sku = sku.trim();

    if (quantity !== undefined || stockQuantity !== undefined) {
      const rawStock = stockQuantity !== undefined ? stockQuantity : quantity;
      const numStock = Number(rawStock);
      if (!Number.isFinite(numStock) || numStock < 0 || !Number.isInteger(numStock)) {
        return res.status(400).json({ message: 'Số lượng tồn kho phải là số nguyên >= 0' });
      }
      updateData.quantity = numStock;
      updateData.stockQuantity = numStock;
    }

    if (details) {
      try {
        updateData.details = typeof details === 'string' ? JSON.parse(details) : details;
        if (updateData.details?.condition && !updateData.condition) {
          updateData.condition = updateData.details.condition;
        }
      } catch (e) {}
    }

    if (req.files && req.files.length > 0) {
      updateData.images = req.files.map(file => file.path || file.secure_url || file.filename);
    }

    const updatedPost = await Post.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (updateData.images && updateData.images.length > 0 && updatedPost && typeof indexProductImage === 'function') {
      setImmediate(() => {
        indexProductImage(updatedPost).catch((embedErr) => {
          console.warn('[ImageEmbedding] Bỏ qua lỗi cập nhật vector ảnh (non-blocking):', embedErr.message);
        });
      });
    }

    res.status(200).json(updatedPost);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi Server khi cập nhật sản phẩm' });
  }
});

/** Xóa sản phẩm theo ID và gỡ khỏi giỏ hàng / yêu thích của tất cả Users (C6: chỉ chủ sản phẩm hoặc Admin) */
app.delete('/api/posts/:id', protect, async (req, res) => {
  try {
    const existingPost = await Post.findById(req.params.id);
    if (!existingPost) return res.status(404).json({ message: 'Không tìm thấy bài đăng để xóa' });

    const ownerId = existingPost.sellerId || existingPost.author;
    const isOwner = ownerId && String(ownerId) === String(req.user._id);
    const isAdminUser = req.user.role === 'Admin';
    if (!isOwner && !isAdminUser) {
      return res.status(403).json({ message: 'Bạn không có quyền xóa sản phẩm của người khác' });
    }

    const deletedPost = await Post.findByIdAndDelete(req.params.id);

    await mongoose.model('User').updateMany({}, {
      $pull: {
        cart: { product: deletedPost._id },
        favorites: deletedPost._id
      }
    });

    res.status(200).json({ message: 'Đã xóa sản phẩm thành công!' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi Server khi xóa bài' });
  }
});

// --- Giỏ hàng (Cart APIs - C6: bắt buộc protect, userId lấy từ token) ---
/** Lấy chi tiết giỏ hàng của User */
app.get('/api/users/cart/:userId', protect, requireOwnerOrAdmin('userId'), async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user || !user.cart) return res.status(200).json([]);

    const cartWithDetails = [];
    for (const item of user.cart) {
      const postDetail = await Post.findById(item.product).populate('author sellerId', 'name avatar shopInfo isSeller sellerStatus');
      if (postDetail) cartWithDetails.push({ product: postDetail, quantity: item.quantity });
    }
    res.status(200).json(cartWithDetails);
  } catch (error) { res.status(200).json([]); }
});

/** Xóa toàn bộ giỏ hàng (đặt TRƯỚC route xóa từng món để tránh khớp nhầm `clear` vào `:postId`) */
app.delete('/api/users/cart/clear/:userId', protect, requireOwnerOrAdmin('userId'), async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (user) { user.cart = []; await user.save(); }
    res.status(200).json([]);
  } catch (error) { res.status(500).json({ message: 'Lỗi Server' }); }
});

/** Xóa một sản phẩm khỏi giỏ hàng */
app.delete('/api/users/cart/:userId/:postId', protect, requireOwnerOrAdmin('userId'), async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy user' });
    user.cart = user.cart.filter(item => item.product && item.product.toString() !== req.params.postId);
    await user.save();
    res.status(200).json(user.cart);
  } catch (error) { res.status(500).json({ message: 'Lỗi Server' }); }
});

/** Thêm hoặc cộng dồn số lượng sản phẩm vào giỏ hàng (C6 & M10: userId lấy từ token, quantity là số nguyên dương >= 1, <= tồn kho) */
app.post('/api/users/cart', protect, async (req, res) => {
  try {
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

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    }
    const maxStock = post.stockQuantity ?? post.quantity ?? 1;
    if (parsedQty > maxStock) {
      return res.status(400).json({ message: `Sản phẩm chỉ còn ${maxStock} cái trong kho` });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    if (!user.cart) user.cart = [];

    const itemIndex = user.cart.findIndex(item => item.product && item.product.toString() === String(postId));
    if (itemIndex > -1) {
      const nextQty = user.cart[itemIndex].quantity + parsedQty;
      if (nextQty > maxStock) {
        return res.status(400).json({ message: `Tổng số lượng trong giỏ (${nextQty}) vượt quá tồn kho (${maxStock})` });
      }
      user.cart[itemIndex].quantity = nextQty;
    } else {
      user.cart.push({ product: postId, quantity: parsedQty });
    }
    await user.save();
    res.status(200).json(user.cart);
  } catch (error) { res.status(500).json({ message: 'Lỗi Server' }); }
});

// --- Đánh giá & Báo cáo vi phạm ---
/** Tạo đánh giá cho đơn hàng đã hoàn thành (C6 & H17: protect, buyer từ token, order phải Completed, cổng atomic isReviewed: false -> true, rating 1-5 integer) */
app.post('/api/reviews', protect, async (req, res) => {
  try {
    const { seller, rating, comment, orderId } = req.body || {};
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: 'Mã đơn hàng (orderId) không hợp lệ!' });
    }

    const numRating = Number(rating);
    if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5 || String(rating).includes('.')) {
      return res.status(400).json({ message: 'Điểm đánh giá (rating) phải là số nguyên từ 1 đến 5!' });
    }
    if (typeof comment !== 'string' || !comment.trim()) {
      return res.status(400).json({ message: 'Vui lòng nhập nội dung đánh giá!' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng!' });
    }

    const buyerId = orderBuyerId(order);
    if (!buyerId || String(buyerId) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Bạn chỉ có thể đánh giá đơn hàng do chính bạn đặt mua!' });
    }

    if (canonicalStatus(order.status) !== 'Completed') {
      return res.status(400).json({ message: 'Chỉ có thể đánh giá sau khi đơn hàng đã Hoàn thành (Completed)!' });
    }

    if (order.isReviewed) {
      return res.status(400).json({ message: 'Đơn hàng này đã được đánh giá rồi!' });
    }

    // Cổng nguyên tử chống đánh giá trùng 2 lần
    const lockedOrder = await Order.findOneAndUpdate(
      { _id: order._id, isReviewed: { $ne: true } },
      { $set: { isReviewed: true } },
      { new: true }
    );
    if (!lockedOrder) {
      return res.status(400).json({ message: 'Đơn hàng này đã được đánh giá rồi!' });
    }

    const sellerId = orderSellerId(order) || seller;
    const newReview = new Review({
      seller: sellerId,
      buyer: req.user._id,
      rating: numRating,
      comment: comment.trim(),
      orderId: order._id
    });
    await newReview.save();

    res.status(200).json({ message: 'Đánh giá thành công!', review: newReview });
  } catch (error) { res.status(500).json({ error: 'Lỗi gửi đánh giá' }); }
});

/** Người dùng gửi báo cáo bài đăng vi phạm tới Admin (C6: bắt buộc protect, reporter lấy từ token) */
app.post('/api/reports', protect, async (req, res) => {
  try {
    const { postId, reason } = req.body || {};
    if (!postId || !mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ error: 'ID bài đăng không hợp lệ' });
    }
    if (typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập lý do báo cáo' });
    }
    await Report.create({ reporter: req.user._id, post: postId, reason: reason.trim() });

    await sendAdminNotification(
      '🚩 Có báo cáo mới!',
      'Một bài đăng vừa bị người dùng báo cáo vi phạm. Hãy kiểm tra ngay!',
      '/admin/reports',
      'REPORT'
    );

    res.json({ message: 'Đã gửi báo cáo thành công!' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ============================================================================
// SECTION 13: CHECKOUT, VNPAY / HAIPAY PAYMENT GATEWAY & VÒNG ĐỜI ĐƠN HÀNG
// ============================================================================

// --- 13.1. Checkout Đa Shop (Multi-Vendor Checkout) ---
/** Đặt hàng từ giỏ hàng / mua ngay qua Bearer JWT */
app.post('/api/checkout', protect, processCheckout);

/** Alias đặt hàng theo userId (kiểm tra chính chủ hoặc Admin) */
app.post('/api/users/:userId/checkout', protect, (req, res, next) => {
  if (!req.user._id.equals(req.params.userId) && req.user.role !== 'Admin') {
    return res.status(403).json({ message: 'Không thể tiến hành đặt hàng thay cho tài khoản khác' });
  }
  req.body.userId = req.params.userId;
  return processCheckout(req, res, next);
});

// --- 13.2. Cấu hình & Helpers Cổng Thanh Toán VNPAY ---
// Sử dụng trực tiếp các hàm từ ./utils/vnpay (đọc từ process.env.VNPAY_TMN_CODE / VNPAY_HASH_SECRET)

// --- 13.3. Nạp / Rút Ví HaiPay & Giao dịch ---
/** Tạo link nạp tiền vào Ví HaiPay qua VNPAY (yêu cầu Bearer JWT, tạo PaymentSession từ server) */
app.post('/api/haipay/deposit', protectStrict, async (req, res) => {
  try {
    const rawAmount = Number(req.body?.amount);
    if (!Number.isFinite(rawAmount) || !Number.isInteger(rawAmount) || rawAmount < 10000 || rawAmount > 500000000) {
      return res.status(400).json({ message: 'Số tiền nạp phải là số nguyên từ 10.000đ đến 500.000.000đ' });
    }
    const requestedUserId = req.body.userId;
    if (requestedUserId && !req.user._id.equals(requestedUserId) && req.user.role !== 'Admin') {
      return res.status(403).json({ message: 'Không có quyền nạp tiền cho tài khoản khác' });
    }
    const userId = req.user._id.toString();
    const createDate = moment(new Date()).format('YYYYMMDDHHmmss');
    const randHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    const txnRef = `NAP_${userId}_${createDate}_${randHex}`;

    // Tạo PaymentSession trên server để IPN đối chiếu số tiền và trạng thái idempotent (C5)
    await PaymentSession.create({
      parentOrderId: txnRef,
      buyer: req.user._id,
      orderIds: [],
      purchasedItems: [],
      itemsSubtotal: rawAmount,
      shippingTotal: 0,
      amount: rawAmount,
      method: 'VNPAY',
      status: 'pending',
      gatewayPayload: { sessionType: 'WALLET_TOPUP' }
    });

    const ipAddr = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '127.0.0.1';
    const paymentUrl = buildVnpayPaymentUrl({
      orderId: txnRef,
      amount: rawAmount,
      ipAddr,
      orderInfo: 'Nap tien vao vi HaiPay cho User ' + userId,
      orderType: 'topup',
      returnUrl: getVnpReturnUrl()
    });
    res.status(200).json({ paymentUrl, txnRef, amount: rawAmount });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi nạp tiền!' });
  }
});

/**
 * Tra cứu trạng thái nạp tiền HaiPay (CHỈ ĐỌC - C5):
 * - Nhận `txnRef` từ query hoặc body, tra DB (`PaymentSession` / `Transaction`) và trả trạng thái `paid | pending | failed`.
 * - TUYỆT ĐỐI KHÔNG cộng tiền vào ví dựa trên `responseCode` hay `amount` từ client.
 */
const handleHaiPayVerifyReadOnly = async (req, res) => {
  try {
    const txnRef = String(req.query?.txnRef || req.body?.txnRef || '').trim();
    if (!txnRef || !txnRef.startsWith('NAP_')) {
      return res.status(400).json({ status: 'failed', message: 'Mã giao dịch nạp tiền không hợp lệ!' });
    }

    const session = await PaymentSession.findOne({ parentOrderId: txnRef });
    if (session) {
      return res.status(200).json({
        txnRef,
        status: session.status,
        paid: session.status === 'paid',
        amount: session.amount,
        message:
          session.status === 'paid'
            ? 'Nạp tiền vào Ví HaiPay thành công!'
            : session.status === 'failed'
              ? 'Giao dịch nạp tiền thất bại hoặc đã bị hủy.'
              : 'Giao dịch đang chờ xác nhận từ cổng VNPAY (IPN)...'
      });
    }

    const existingTx = await Transaction.findOne({ txnRef, status: 'Thành công' });
    if (existingTx) {
      return res.status(200).json({
        txnRef,
        status: 'paid',
        paid: true,
        amount: existingTx.amount,
        message: 'Nạp tiền vào Ví HaiPay thành công!'
      });
    }

    return res.status(200).json({
      txnRef,
      status: 'pending',
      paid: false,
      message: 'Giao dịch đang chờ xác nhận từ cổng VNPAY...'
    });
  } catch (error) {
    return res.status(500).json({ error: 'Lỗi tra cứu trạng thái giao dịch ví!' });
  }
};

app.get('/api/haipay/verify', handleHaiPayVerifyReadOnly);
app.post('/api/haipay/verify', handleHaiPayVerifyReadOnly);

/** Lấy lịch sử giao dịch ví HaiPay của User (C7: bắt buộc protect + chỉ chủ tài khoản hoặc Admin) */
app.get('/api/users/:userId/transactions', protect, requireOwnerOrAdmin('userId'), async (req, res) => {
  try {
    const targetId = req.user.role === 'Admin' && req.params.userId ? req.params.userId : req.user._id;
    const trans = await Transaction.find({ user: targetId }).sort({ createdAt: -1 });
    res.json(trans);
  } catch (error) { res.status(500).json({ message: 'Lỗi lấy lịch sử' }); }
});

/**
 * Tạo lệnh rút tiền từ Ví HaiPay (H8 & M14: yêu cầu Bearer JWT chính chủ, bắt buộc mã PIN ví 6 chữ số, tối thiểu 50.000đ):
 * - Kiểm tra `verifyUserWalletPin` (khóa 15 phút sau 5 lần sai).
 * - Trừ số dư ví nguyên tử bằng `User.findOneAndUpdate({ walletBalance: { $gte: amount } })` chống rút lố đồng thời.
 * - Tạo Transaction `Đang xử lý` (lưu `bankName`, `accountNumber`, `accountHolder` có cấu trúc) và thông báo tới Admin Portal.
 */
app.post('/api/users/:userId/withdraw', protectStrict, withdrawLimiter, async (req, res) => {
  try {
    if (!req.user._id.equals(req.params.userId) && req.user.role !== 'Admin') {
      return res.status(403).json({ message: 'Không có quyền rút tiền từ ví của người khác' });
    }
    const { bankName, bankAccount, accountNumber, accountHolder, walletPin, pin } = req.body || {};
    const cleanBankName = typeof bankName === 'string' ? bankName.trim() : '';
    const cleanBankAccount = typeof bankAccount === 'string' && bankAccount.trim()
      ? bankAccount.trim()
      : (typeof accountNumber === 'string' ? accountNumber.trim() : '');
    const cleanAccountHolder = typeof accountHolder === 'string' ? accountHolder.trim() : '';

    if (!cleanBankName || !cleanBankAccount) {
      return res.status(400).json({ message: 'Vui lòng cung cấp đầy đủ Tên ngân hàng và Số tài khoản thụ hưởng!' });
    }

    const rawAmount = req.body?.amount;
    if (typeof rawAmount === 'object' || typeof rawAmount === 'boolean' || String(rawAmount).includes('.')) {
      return res.status(400).json({ message: 'Số tiền rút phải là số nguyên dương hợp lệ!' });
    }
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 50000) {
      return res.status(400).json({ message: 'Số tiền rút phải là số nguyên tối thiểu 50.000đ!' });
    }

    const existingUser = await User.findById(req.params.userId);
    if (!existingUser) return res.status(404).json({ message: 'Không tìm thấy user' });
    if (existingUser.status === 'locked' || existingUser.isBanned === true || existingUser.isDeleted === true) {
      return res.status(403).json({ message: 'Tài khoản của bạn đang bị khóa, không thể thực hiện rút tiền!' });
    }

    const pinCheck = await verifyUserWalletPin(existingUser, walletPin !== undefined ? walletPin : pin);
    if (!pinCheck.ok) {
      return res.status(pinCheck.statusCode || 400).json({
        message: pinCheck.message,
        locked: Boolean(pinCheck.locked),
        noPin: Boolean(pinCheck.noPin)
      });
    }

    const user = await User.findOneAndUpdate(
      { _id: req.params.userId, walletBalance: { $gte: amount } },
      { $inc: { walletBalance: -amount } },
      { new: true }
    );
    if (!user) {
      return res.status(400).json({ message: 'Số dư ví không đủ để rút!' });
    }

    await Transaction.create({
      user: user._id,
      type: 'Rút tiền',
      amount: amount,
      status: 'Đang xử lý',
      bankName: cleanBankName,
      accountNumber: cleanBankAccount,
      accountHolder: cleanAccountHolder || user.name || '',
      description: `Rút tiền về NH: ${cleanBankName} - STK: ${cleanBankAccount}${cleanAccountHolder ? ` (${cleanAccountHolder})` : ''}`
    });

    await sendNotification(
      user._id,
      '🏦 Đã tạo lệnh rút tiền!',
      `Lệnh rút ${amount.toLocaleString('vi-VN')}đ về tài khoản ${cleanBankName} đang được xử lý. Tiền sẽ về trong 2-4 tiếng nữa nhé.`,
      'WITHDRAWAL',
      '/haipay'
    );

    await sendAdminNotification(
      '💸 Yêu cầu rút tiền mới!',
      `Khách hàng ${user.name} vừa yêu cầu rút ${amount.toLocaleString('vi-VN')}đ. Bác mau vào kiểm tra và chuyển khoản nhé!`,
      '/admin/withdrawals',
      'WITHDRAWAL'
    );

    res.status(200).json({ message: 'Tạo lệnh rút tiền thành công!', user: sanitizeUser(user, { keepOwnerFields: true }) });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi hệ thống khi rút tiền' });
  }
});

// --- 13.4. Cổng Thanh Toán Đơn Hàng VNPAY ---
/** Khởi tạo link thanh toán VNPAY cho đơn hàng (C6: bắt buộc protect, lấy số tiền từ PaymentSession/Order trong DB) */
app.post('/api/vnpay/create_payment_url', protect, async (req, res) => {
  try {
    const { orderId } = req.body || {};
    if (!orderId || typeof orderId !== 'string') {
      return res.status(400).json({ error: 'Thiếu mã đơn hàng (orderId)' });
    }

    let finalAmount = 0;
    const session = await PaymentSession.findOne({ parentOrderId: orderId });
    if (session) {
      if (req.user.role !== 'Admin' && String(session.buyer) !== String(req.user._id)) {
        return res.status(403).json({ error: 'Bạn không phải người mua của phiên thanh toán này' });
      }
      finalAmount = Number(session.amount) || 0;
    } else if (mongoose.isValidObjectId(orderId)) {
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
      }
      const buyerId = orderBuyerId(order);
      if (req.user.role !== 'Admin' && String(buyerId) !== String(req.user._id)) {
        return res.status(403).json({ error: 'Bạn không phải người mua của đơn hàng này' });
      }
      finalAmount = Number(order.totalPrice) || 0;
    } else {
      return res.status(404).json({ error: 'Không tìm thấy phiên thanh toán hoặc đơn hàng' });
    }

    if (finalAmount <= 0) {
      return res.status(400).json({ error: 'Số tiền thanh toán không hợp lệ' });
    }

    const ipAddr = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.socket?.remoteAddress || '127.0.0.1';
    const paymentUrl = buildVnpayPaymentUrl({
      orderId,
      amount: finalAmount,
      ipAddr
    });
    res.status(200).json({ paymentUrl });
  } catch (error) {
    console.error('VNPAY create_payment_url Error:', error);
    res.status(500).json({ error: 'Lỗi tạo link VNPay' });
  }
});

/**
 * Tra cứu trạng thái thanh toán VNPAY (CHỈ ĐỌC - C5):
 * - Nhận `orderId` / `txnRef` từ query hoặc body, tra DB (`PaymentSession` / `Order`) và trả trạng thái `paid | pending | failed`.
 * - TUYỆT ĐỐI KHÔNG đổi `paymentStatus`, KHÔNG cộng ví / pendingBalance, KHÔNG hủy đơn hàng theo dữ liệu từ client.
 */
const handleVnpayVerifyReadOnly = async (req, res) => {
  try {
    const orderId = String(req.query?.orderId || req.query?.txnRef || req.body?.orderId || req.body?.txnRef || '').trim();
    if (!orderId) {
      return res.status(400).json({ status: 'failed', message: 'Thiếu mã đơn hàng!' });
    }

    const session = await PaymentSession.findOne({ parentOrderId: orderId });
    if (session) {
      return res.status(200).json({
        orderId,
        parentOrderId: orderId,
        status: session.status,
        paid: session.status === 'paid',
        amount: session.amount,
        ordersCount: Array.isArray(session.orderIds) ? session.orderIds.length : 0,
        message:
          session.status === 'paid'
            ? 'Giao dịch VNPay thành công!'
            : session.status === 'failed'
              ? 'Giao dịch thất bại hoặc đã bị hủy!'
              : 'Đang chờ xác nhận thanh toán từ cổng VNPay (IPN)...'
      });
    }

    if (mongoose.isValidObjectId(orderId)) {
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ status: 'failed', message: 'Không tìm thấy đơn hàng' });
      }
      const isPaid = ['escrow', 'released', 'paid'].includes(String(order.paymentStatus || '').toLowerCase());
      const isCancelled = canonicalStatus(order.status) === 'Cancelled' || order.paymentStatus === 'refunded';
      const status = isPaid ? 'paid' : (isCancelled ? 'failed' : 'pending');
      return res.status(200).json({
        orderId,
        status,
        paid: isPaid,
        paymentStatus: order.paymentStatus,
        orderStatus: order.status,
        message: isPaid
          ? 'Giao dịch VNPay thành công!'
          : isCancelled
            ? 'Đơn hàng đã bị hủy.'
            : 'Đang chờ xác nhận thanh toán từ cổng VNPay...'
      });
    }

    return res.status(404).json({ status: 'failed', message: 'Không tìm thấy phiên thanh toán hoặc đơn hàng' });
  } catch (error) {
    console.error('Lỗi tra cứu trạng thái VNPay:', error);
    return res.status(500).json({ error: 'Lỗi hệ thống khi tra cứu trạng thái thanh toán' });
  }
};

app.get('/api/vnpay/verify', handleVnpayVerifyReadOnly);
app.post('/api/vnpay/verify', handleVnpayVerifyReadOnly);

/**
 * Webhook IPN server-to-server từ VNPAY (C5 - điểm duy nhất được phép ghi tiền nạp ví / chuyển đơn sang escrow):
 * - Bắt buộc kiểm tra chữ ký `verifyVnpayChecksumStrict` (hằng-thời-gian, thiếu/sai -> 400).
 * - Kiểm tra `vnp_TmnCode === getVnpTmnCode()`.
 * - Kiểm tra mã `vnp_TxnRef` phải khớp một `PaymentSession` đã tạo từ server (kể cả mã nạp `NAP_<userId>_...`).
 * - Kiểm tra `Number(vnp_Amount) === Math.round(session.amount * 100)`.
 * - Kiểm tra `vnp_ResponseCode === '00'` và (nếu có) `vnp_TransactionStatus === '00'`.
 * - Cổng nguyên tử idempotent: `PaymentSession.findOneAndUpdate({ _id: session._id, status: 'pending' }, { status: 'paid' })`.
 * - Nạp ví: `$inc: { walletBalance: session.amount }` đúng theo số tiền lưu trong sessionบน server (không bao giờ tin amount từ client).
 */
app.get('/api/vnpay/vnpay_ipn', async (req, res) => {
  try {
    const vnp_Params = { ...req.query };
    const secureHash = vnp_Params['vnp_SecureHash'];
    const txnRef = String(vnp_Params['vnp_TxnRef'] || '').trim();
    const rspCode = String(vnp_Params['vnp_ResponseCode'] || '');
    const txStatus = vnp_Params['vnp_TransactionStatus'] !== undefined
      ? String(vnp_Params['vnp_TransactionStatus'])
      : rspCode;
    const tmnCode = String(vnp_Params['vnp_TmnCode'] || '').trim();
    const rawVnpAmount = Number(vnp_Params['vnp_Amount']);

    // 1. Kiểm tra chữ ký HMAC-SHA512 strict
    if (!verifyVnpayChecksumStrict(vnp_Params, secureHash)) {
      return res.status(400).json({ RspCode: '97', Message: 'Invalid Checksum' });
    }

    // 2. Kiểm tra vnp_TmnCode khớp cấu hình môi trường
    const expectedTmn = getVnpTmnCode();
    if (expectedTmn && tmnCode && tmnCode !== expectedTmn) {
      return res.status(400).json({ RspCode: '97', Message: 'Invalid TmnCode' });
    }

    if (!txnRef) {
      return res.status(400).json({ RspCode: '01', Message: 'Order not found' });
    }

    // 3. Tra PaymentSession đã khởi tạo từ server
    const session = await PaymentSession.findOne({ parentOrderId: txnRef });
    if (!session) {
      return res.status(404).json({ RspCode: '01', Message: 'PaymentSession not found' });
    }

    // 4. Kiểm tra số tiền khớp tuyệt đối (vnp_Amount = session.amount * 100)
    const expectedVnpAmount = Math.round(Number(session.amount) * 100);
    if (!Number.isFinite(rawVnpAmount) || rawVnpAmount !== expectedVnpAmount) {
      return res.status(400).json({ RspCode: '04', Message: 'Invalid amount' });
    }

    // 5. Nếu đã paid từ trước -> trả thành công idempotent, tuyệt đối không cộng tiền lần 2
    if (session.status === 'paid') {
      return res.status(200).json({ RspCode: '02', Message: 'Order already confirmed' });
    }

    // 6. Nếu giao dịch thất bại từ phía VNPay: chỉ cập nhật session pending -> failed, KHÔNG hủy đơn đã escrow/paid
    if (rspCode !== '00' || txStatus !== '00') {
      await PaymentSession.findOneAndUpdate(
        { _id: session._id, status: 'pending' },
        { $set: { status: 'failed', gatewayPayload: vnp_Params } }
      );
      return res.status(200).json({ RspCode: '00', Message: 'Confirm Failed Transaction' });
    }

    // 7. Nhánh 1: Nạp tiền Ví HaiPay (NAP_<userId>_...)
    if (txnRef.startsWith('NAP_')) {
      const lockedSession = await PaymentSession.findOneAndUpdate(
        { _id: session._id, status: 'pending' },
        {
          $set: {
            status: 'paid',
            paidAt: new Date(),
            gatewayPayload: vnp_Params
          }
        },
        { new: true }
      );

      if (!lockedSession) {
        return res.status(200).json({ RspCode: '02', Message: 'Order already confirmed' });
      }

      const creditAmount = Number(lockedSession.amount);
      await User.findByIdAndUpdate(lockedSession.buyer, {
        $inc: { walletBalance: creditAmount }
      });

      try {
        await Transaction.create({
          user: lockedSession.buyer,
          type: 'Nạp tiền',
          amount: creditAmount,
          status: 'Thành công',
          txnRef,
          description: `Nạp tiền ví HaiPay qua VNPay IPN (Mã GD: ${txnRef})`
        });
      } catch (dupErr) {
        if (dupErr.code !== 11000) {
          console.error('Lỗi ghi nhận Transaction IPN:', dupErr.message);
        }
      }

      return res.status(200).json({ RspCode: '00', Message: 'Confirm Success' });
    }

    // 8. Nhánh 2: Thanh toán đơn hàng qua settlePaymentSession (bên trong đã có cổng findOneAndUpdate status !== 'paid')
    const settleRes = await settlePaymentSession(txnRef, {
      gatewayPayload: { ...vnp_Params, stockDeducted: true },
      paymentMethod: 'VNPAY'
    });

    if (settleRes.alreadyPaid) {
      return res.status(200).json({ RspCode: '02', Message: 'Order already confirmed' });
    }

    return res.status(200).json({ RspCode: '00', Message: 'Confirm Success' });
  } catch (error) {
    console.error('VNPay IPN Error:', error.message);
    return res.status(500).json({ RspCode: '99', Message: 'Unknown error' });
  }
});

// --- 13.5. Vòng Đời Đơn Hàng (Buyer & Seller Legacy/Core Order Routes) ---
/** Lấy danh sách đơn mua của Buyer (chỉ chính chủ hoặc Admin) */
app.get('/api/users/:userId/orders', protect, async (req, res) => {
  try {
    const userId = req.params.userId;
    const isOwner = req.user._id.equals
      ? req.user._id.equals(userId)
      : req.user._id.toString() === userId.toString();
    const isAdmin = req.user.role === 'Admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Bạn không có quyền xem đơn hàng của người dùng này' });
    }

    const orders = await Order.find({ $or: [{ buyer: userId }, { buyerId: userId }] })
      .populate('items')
      .sort({ createdAt: -1 });
    res.status(200).json(orders);
  } catch (error) { res.status(500).json({ error: 'Lỗi lấy đơn hàng' }); }
});

/** Lấy danh sách đơn bán theo sellerId (chỉ chính chủ Shop hoặc Admin) */
app.get('/api/orders/seller/:sellerId', protect, async (req, res) => {
  try {
    const sellerId = req.params.sellerId;
    const isOwner = req.user._id.equals
      ? req.user._id.equals(sellerId)
      : req.user._id.toString() === sellerId.toString();
    const isAdmin = req.user.role === 'Admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Bạn không có quyền xem đơn hàng của Shop này' });
    }

    const orders = await Order.find({ $or: [{ seller: sellerId }, { sellerId }] })
      .populate('buyer buyerId', 'name email phone address')
      .populate('items', 'title name price images image')
      .sort({ createdAt: -1 });
    res.status(200).json(orders);
  } catch (error) { res.status(500).json({ error: 'Lỗi lấy đơn hàng của người bán' }); }
});

/** Seller xác nhận đơn hàng từ Pending -> Processing (qua transitionOrder) */
app.put('/api/orders/:orderId/confirm', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId).populate('seller sellerId buyer buyerId');
    if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

    const sellerRef = orderSellerId(order);
    const isSellerOwner = sellerRef && (
      req.user._id.equals ? req.user._id.equals(sellerRef) : req.user._id.toString() === sellerRef.toString()
    );
    const isAdmin = req.user.role === 'Admin';

    if (!isSellerOwner && !isAdmin) {
      return res.status(403).json({ message: 'Đơn hàng này không thuộc Shop của bạn' });
    }

    const tr = await transitionOrder(order, 'Processing', isAdmin ? 'admin' : 'seller', {
      actorId: req.user._id,
      reason: 'Shop xác nhận đơn hàng',
      notify: false
    });

    if (!tr.success) {
      return res.status(tr.statusCode || 400).json({ message: tr.message });
    }

    const buyerId = orderBuyerId(order);
    if (buyerId) {
      await sendNotification(
        buyerId,
        '📦 Người bán đã chốt đơn!',
        `Shop đã xác nhận đơn hàng #${order._id.toString().slice(-6).toUpperCase()}.`,
        'ORDER',
        '/profile?tab=orders_buy',
        { orderId: order._id }
      );
    }

    res.status(200).json({ message: 'Đã xác nhận đơn hàng!', order: tr.order });
  } catch (error) { res.status(500).json({ message: 'Lỗi xác nhận đơn' }); }
});

/** Hủy đơn nguyên tử (Buyer / Seller / Admin): hoàn tiền escrow vào ví và cộng lại tồn kho */
app.put('/api/orders/:orderId/cancel', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

    const buyerRef = orderBuyerId(order);
    const sellerRef = orderSellerId(order);

    const isBuyerOwner = buyerRef && (
      req.user._id.equals ? req.user._id.equals(buyerRef) : req.user._id.toString() === buyerRef.toString()
    );
    const isSellerOwner = sellerRef && (
      req.user._id.equals ? req.user._id.equals(sellerRef) : req.user._id.toString() === sellerRef.toString()
    );
    const isAdmin = req.user.role === 'Admin';

    if (!isBuyerOwner && !isSellerOwner && !isAdmin) {
      return res.status(403).json({ message: 'Bạn không có quyền hủy đơn hàng này' });
    }

    const cancelledByRole = isAdmin ? 'admin' : (isSellerOwner ? 'seller' : 'buyer');

    // M5: Chặn Buyer tự hủy trực tiếp khi đơn đã chuyển sang Processing (Shop đang chuẩn bị/đóng gói)
    const currentCanon = canonicalStatus(order.status);
    if (cancelledByRole === 'buyer' && currentCanon === 'Processing') {
      if (sellerRef) {
        await sendNotification({
          userId: sellerRef,
          shopId: sellerRef,
          recipientRole: 'seller',
          type: 'ORDER_STATUS',
          orderId: order._id,
          title: '📩 Khách hàng yêu cầu hủy đơn đang chuẩn bị',
          message: `Người mua yêu cầu hủy đơn #${order._id.toString().slice(-6).toUpperCase()}: "${req.body?.cancelReason || req.body?.reason || 'Không rõ lý do'}". Vui lòng kiểm tra và xử lý.`,
          link: '/seller-channel/orders',
          targetUrl: '/seller-channel/orders'
        });
      }
      return res.status(400).json({
        code: 'CANCEL_REQUEST_SENT',
        message: 'Shop đang chuẩn bị hàng (Processing), bạn không thể tự hủy trực tiếp. Yêu cầu hủy đã được gửi tới người bán để xem xét!'
      });
    }

    const cancelResult = await transitionOrder(order, 'Cancelled', cancelledByRole, {
      actorId: req.user._id,
      reason: req.body?.cancelReason || req.body?.reason || ''
    });

    if (!cancelResult.success) {
      return res.status(cancelResult.statusCode || 400).json({ message: cancelResult.message });
    }

    // M3 & M5: Đảm bảo gửi thông báo cho người bán khi buyer hủy đơn thành công
    if (cancelledByRole === 'buyer' && sellerRef) {
      try {
        await sendNotification({
          userId: sellerRef,
          shopId: sellerRef,
          recipientRole: 'seller',
          type: 'ORDER_STATUS',
          orderId: order._id,
          title: '❌ Khách hàng đã hủy đơn hàng',
          message: `Đơn hàng #${order._id.toString().slice(-6).toUpperCase()} đã bị người mua hủy (${req.body?.cancelReason || req.body?.reason || 'Khách đổi ý'}). Tồn kho đã được hoàn lại tự động.`,
          link: '/seller-channel/orders',
          targetUrl: '/seller-channel/orders'
        });
      } catch (e) {}
    }

    res.status(200).json({
      message: '✅ Đã hủy đơn, hoàn tiền vào ví (nếu có) và trả hàng lại vào kho thành công!',
      order: cancelResult.order
    });
  } catch (error) {
    console.error('Lỗi hủy đơn:', error);
    res.status(500).json({ message: 'Lỗi hệ thống khi hủy đơn' });
  }
});

/** Người mua xác nhận đã nhận hàng (Shipped -> Delivered hoặc Delivered -> Completed qua transitionOrder) */
app.put('/api/orders/:orderId/receive', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

    const buyerRef = orderBuyerId(order);
    const isBuyerOwner = buyerRef && (
      req.user._id.equals ? req.user._id.equals(buyerRef) : req.user._id.toString() === buyerRef.toString()
    );
    const isAdmin = req.user.role === 'Admin';

    if (!isBuyerOwner && !isAdmin) {
      return res.status(403).json({ message: 'Bạn không phải là người mua của đơn hàng này' });
    }

    const current = canonicalStatus(order.status);
    if (!['Shipped', 'Delivered'].includes(current)) {
      return res.status(400).json({ message: 'Đơn hàng chưa được giao, không thể xác nhận!' });
    }

    const nextStatus = current === 'Shipped' ? 'Delivered' : 'Completed';
    const tr = await transitionOrder(order, nextStatus, isAdmin ? 'admin' : 'buyer', {
      actorId: req.user._id,
      reason: 'Người mua xác nhận đã nhận hàng'
    });

    if (!tr.success) {
      return res.status(tr.statusCode || 400).json({ message: tr.message });
    }

    res.status(200).json({ message: 'Cảm ơn bạn đã xác nhận nhận hàng!', order: tr.order });
  } catch (error) { res.status(500).json({ error: 'Lỗi xác nhận' }); }
});

/**
 * POST /api/orders/:id/dispute (H6):
 * Người mua mở khiếu nại đơn hàng trong hạn (khi đơn đang ở Shipped hoặc Delivered và chưa quá AUTO_COMPLETE_DAYS)
 * -> Chặn auto-complete và chặn giải ngân cho tới khi Admin xử lý.
 */
app.post('/api/orders/:id/dispute', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

    const buyerRef = orderBuyerId(order);
    const isBuyerOwner = buyerRef && String(buyerRef) === String(req.user._id);
    if (!isBuyerOwner && req.user.role !== 'Admin') {
      return res.status(403).json({ message: 'Chỉ người mua của đơn hàng này mới có thể gửi khiếu nại!' });
    }

    const current = canonicalStatus(order.status);
    if (!['Shipped', 'Delivered'].includes(current)) {
      return res.status(400).json({
        message: `Chỉ có thể khiếu nại đơn hàng đang giao (Shipped) hoặc mới giao (Delivered). Trạng thái hiện tại: ${current}`
      });
    }

    const autoDays = Math.max(1, Number(process.env.AUTO_COMPLETE_DAYS) || 7);
    if (order.deliveredAt && Date.now() - new Date(order.deliveredAt).getTime() > autoDays * 24 * 60 * 60 * 1000) {
      return res.status(400).json({
        message: `Đã quá thời hạn khiếu nại (${autoDays} ngày kể từ khi nhận hàng)!`
      });
    }

    const reason = typeof req.body?.reason === 'string' && req.body.reason.trim()
      ? req.body.reason.trim()
      : 'Khách hàng khiếu nại sản phẩm';

    order.dispute = {
      isDisputed: true,
      reason,
      status: 'open',
      createdAt: new Date()
    };
    await order.save();

    const sellerId = orderSellerId(order);
    const shortCode = order._id.toString().slice(-6).toUpperCase();
    if (sellerId) {
      await sendNotification({
        userId: sellerId,
        shopId: sellerId,
        recipientRole: 'seller',
        type: 'ORDER_STATUS',
        orderId: order._id,
        title: '⚠️ Đơn hàng có khiếu nại mới',
        message: `Người mua vừa gửi khiếu nại cho đơn hàng #${shortCode}: "${reason}".`,
        link: '/seller-channel/orders',
        targetUrl: '/seller-channel/orders'
      });
    }
    await sendAdminNotification(
      '⚠️ Khiếu nại đơn hàng mới',
      `Đơn hàng #${shortCode} vừa bị người mua khiếu nại: "${reason}".`,
      '/orders',
      'REPORT'
    );

    return res.status(200).json({
      message: 'Đã ghi nhận khiếu nại đơn hàng. Quản trị viên sẽ kiểm tra và xử lý!',
      order
    });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi gửi khiếu nại đơn hàng' });
  }
});

/**
 * POST /api/admin/orders/:id/resolve-dispute (H6):
 * Admin xử lý khiếu nại: `action = 'refund'` (hoàn tiền qua cancelOrderWithRefundAndRestock) hoặc `action = 'release'` (bác bỏ khiếu nại, mở khóa giải ngân).
 */
app.post('/api/admin/orders/:id/resolve-dispute', requireAdminJWT, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

    const action = String(req.body?.action || 'refund').toLowerCase();
    if (action === 'refund') {
      order.dispute = {
        ...(order.dispute || {}),
        isDisputed: false,
        status: 'resolved_refund',
        resolvedAt: new Date()
      };
      await order.save();

      const cancelRes = await cancelOrderWithRefundAndRestock(order, {
        cancelledBy: 'admin',
        reason: req.body?.note || 'Admin chấp nhận khiếu nại & hoàn tiền'
      });
      if (!cancelRes.success) {
        return res.status(cancelRes.statusCode || 400).json({ message: cancelRes.message });
      }
      return res.status(200).json({
        message: 'Đã giải quyết khiếu nại: Hoàn tiền cho người mua!',
        order: cancelRes.order
      });
    }

    order.dispute = {
      ...(order.dispute || {}),
      isDisputed: false,
      status: 'resolved_release',
      resolvedAt: new Date()
    };
    await order.save();
    return res.status(200).json({
      message: 'Đã giải quyết khiếu nại: Mở khóa đơn hàng để tiếp tục hoàn tất/giải ngân!',
      order
    });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi xử lý khiếu nại' });
  }
});

/**
 * Lấy thông tin của một User theo ID (C7:
 * - Nếu là chủ tài khoản hoặc Admin có Bearer JWT hợp lệ -> trả sanitizeUser đầy đủ.
 * - Nếu là người khác hoặc khách vãng lai -> chỉ trả publicUser (không lộ email/phone/cccd/taxId/bankInfo/walletBalance/walletPin)).
 */
app.get('/api/users/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'ID người dùng không hợp lệ' });
    }
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'Không tìm thấy user' });

    let isOwnerOrAdmin = false;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], getJwtSecret());
        const callerId = decoded?.id || decoded?._id;
        if (callerId) {
          const caller = await User.findById(callerId).select('_id role status isBanned isDeleted tokenVersion');
          const callerTv = typeof caller?.tokenVersion === 'number' ? caller.tokenVersion : 0;
          const tokenTv = typeof decoded.tv === 'number' ? decoded.tv : 0;
          if (
            caller &&
            caller.status !== 'locked' &&
            !caller.isBanned &&
            !caller.isDeleted &&
            callerTv === tokenTv &&
            (caller.role === 'Admin' || String(caller._id) === String(req.params.id))
          ) {
            isOwnerOrAdmin = true;
          }
        }
      } catch (e) {}
    }

    if (isOwnerOrAdmin) {
      return res.status(200).json(sanitizeUser(user, { keepOwnerFields: true }));
    }
    return res.status(200).json(publicUser(user));
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server' });
  }
});

// ============================================================================
// SECTION 14: THÔNG BÁO NGƯỜI DÙNG, CHAT 1-1, CHATBOT AI & SOCKET.IO REAL-TIME
// ============================================================================

// --- 14.1. Thông báo (Notifications APIs - C6: bắt buộc protect, userId lấy từ token) ---
/** Lấy danh sách thông báo tách biệt theo scope (admin / seller / buyer) và đếm unreadByType */
app.get('/api/notifications', protect, async (req, res) => {
  try {
    const { role, scope, type, limit } = req.query;

    if (scope === 'admin' || role === 'admin') {
      if (req.user.role !== 'Admin') {
        return res.status(403).json({ message: 'Bạn không có quyền truy cập thông báo Quản trị viên' });
      }
      const adminFilter = {
        $or: [
          { targetRole: 'admin' },
          { recipientRole: 'admin' },
          { type: { $in: ['SELLER', 'PRODUCT', 'WITHDRAWAL', 'REPORT'] } }
        ]
      };
      if (type && typeof type === 'string') {
        adminFilter.type = type;
      }
      const maxLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
      const notifs = await Notification.find(adminFilter).sort({ createdAt: -1 }).limit(maxLimit);
      const unreadCount = await Notification.countDocuments({ ...adminFilter, isRead: false });

      return res.json({
        notifications: notifs,
        unreadCount,
        unreadByType: {}
      });
    }

    const userObjectId = req.user._id;

    const baseQuery = {
      $or: [
        { userId: userObjectId },
        { user: userObjectId },
        { shopId: userObjectId }
      ],
      targetRole: { $ne: 'admin' },
      recipientRole: { $ne: 'admin' }
    };

    if (role === 'seller') {
      baseQuery.$and = [
        {
          $or: [
            { recipientRole: 'seller' },
            { targetRole: 'seller' },
            { shopId: userObjectId },
            { type: { $in: ['NEW_ORDER', 'SELLER'] } }
          ]
        }
      ];
    } else if (role === 'buyer') {
      baseQuery.$and = [
        {
          $or: [
            { recipientRole: 'buyer' },
            { targetRole: 'buyer' },
            { recipientRole: { $exists: false } },
            { type: { $in: ['ORDER', 'ORDER_STATUS', 'PAYMENT', 'MESSAGE', 'SYSTEM'] } }
          ]
        }
      ];
    }

    if (type && typeof type === 'string') {
      baseQuery.type = type;
    }

    const maxLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
    const notifs = await Notification.find(baseQuery).sort({ createdAt: -1 }).limit(maxLimit);
    const unreadCount = await Notification.countDocuments({ ...baseQuery, isRead: false });

    const unreadGroupQuery = {
      $or: [
        { userId: userObjectId },
        { user: userObjectId },
        { shopId: userObjectId }
      ],
      targetRole: { $ne: 'admin' },
      recipientRole: { $ne: 'admin' },
      isRead: false
    };
    if (role === 'seller') {
      unreadGroupQuery.$and = [
        {
          $or: [
            { recipientRole: 'seller' },
            { targetRole: 'seller' },
            { shopId: userObjectId },
            { type: { $in: ['NEW_ORDER', 'SELLER'] } }
          ]
        }
      ];
    }

    const unreadGroupAgg = await Notification.aggregate([
      { $match: unreadGroupQuery },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    const unreadByType = {};
    unreadGroupAgg.forEach(item => {
      if (item._id) unreadByType[item._id] = item.count;
    });

    res.json({
      notifications: notifs,
      unreadCount,
      unreadByType
    });
  } catch (error) {
    console.error('Lỗi lấy danh sách thông báo:', error);
    res.status(500).json({ error: 'Lỗi lấy danh sách thông báo' });
  }
});

/** Đánh dấu đã đọc tất cả thông báo của User (C6: bắt buộc protect, userId lấy từ token) */
app.put('/api/notifications/read-all', protect, async (req, res) => {
  try {
    const userObjectId = req.user._id;
    const { role, type } = req.body || {};

    const filter = {
      $or: [
        { userId: userObjectId },
        { user: userObjectId },
        { shopId: userObjectId }
      ],
      targetRole: { $ne: 'admin' },
      recipientRole: { $ne: 'admin' },
      isRead: false
    };

    if (type && typeof type === 'string') {
      filter.type = type;
    }

    if (role === 'seller') {
      filter.$and = [
        {
          $or: [
            { recipientRole: 'seller' },
            { shopId: userObjectId },
            { type: { $in: ['NEW_ORDER', 'SELLER'] } }
          ]
        }
      ];
    }

    const result = await Notification.updateMany(filter, { isRead: true });
    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi cập nhật tất cả thông báo' });
  }
});

/** Đánh dấu đã đọc thông báo theo từng nhóm type (C6: bắt buộc protect, userId lấy từ token) */
app.put('/api/notifications/read-by-type', protect, async (req, res) => {
  try {
    const userObjectId = req.user._id;
    const type = req.body?.type || req.query?.type;
    if (!type || typeof type !== 'string') {
      return res.status(400).json({ error: 'Thiếu type' });
    }

    const filter = {
      $or: [
        { userId: userObjectId },
        { user: userObjectId },
        { shopId: userObjectId }
      ],
      type,
      isRead: false
    };

    const result = await Notification.updateMany(filter, { isRead: true });
    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi cập nhật thông báo theo loại' });
  }
});

/** Đánh dấu đã đọc 1 thông báo theo ID (C6: bắt buộc protect, chỉ chủ thông báo hoặc Admin) */
app.put('/api/notifications/:id/read', protect, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'ID thông báo không hợp lệ' });
    }
    const filter = req.user.role === 'Admin'
      ? { _id: req.params.id }
      : {
          _id: req.params.id,
          $or: [{ userId: req.user._id }, { user: req.user._id }, { shopId: req.user._id }]
        };
    const updated = await Notification.findOneAndUpdate(filter, { isRead: true }, { new: true });
    if (!updated) {
      return res.status(404).json({ error: 'Không tìm thấy thông báo' });
    }
    res.json({ success: true, notification: updated });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi cập nhật thông báo' });
  }
});

// --- 14.2. Tin nhắn Chat 1-1 (Messages APIs - C6: XÓA GET /api/messages/clear-all, gắn protect cho mọi route chat) ---
/** Lấy danh sách hội thoại gần nhất kèm số tin chưa đọc của mỗi hội thoại (đặt TRƯỚC `/:user1/:user2`) */
app.get('/api/messages/conversations/:userId', protect, requireOwnerOrAdmin('userId'), async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const messages = await Message.find({ $or: [{ sender: userId }, { receiver: userId }] })
      .sort({ timestamp: -1 }).populate('sender receiver', 'name avatar verified badge').populate('post', 'title price condition author');

    const conversationsMap = new Map();

    messages.forEach(msg => {
      try {
        if (!msg || !msg.sender || !msg.receiver) return;
        const senderId = msg.sender._id ? msg.sender._id.toString() : msg.sender.toString();
        const receiverId = msg.receiver._id ? msg.receiver._id.toString() : msg.receiver.toString();

        const isSenderMe = senderId === userId;
        const otherUser = isSenderMe ? msg.receiver : msg.sender;
        const otherUserId = isSenderMe ? receiverId : senderId;

        if (!conversationsMap.has(otherUserId)) {
          conversationsMap.set(otherUserId, { otherUser, lastMessage: msg, timestamp: msg.timestamp, unreadCount: 0 });
        }

        if (!isSenderMe && !msg.isRead) conversationsMap.get(otherUserId).unreadCount += 1;
      } catch (e) { }
    });

    res.status(200).json(Array.from(conversationsMap.values()));
  } catch (error) { res.status(200).json([]); }
});

/** Đếm tổng số tin nhắn chưa đọc của User (đặt TRƯỚC `/:user1/:user2`) */
app.get('/api/messages/unread-count/:userId', protect, requireOwnerOrAdmin('userId'), async (req, res) => {
  try {
    const count = await Message.countDocuments({ receiver: req.user._id, isRead: false });
    res.status(200).json({ count });
  } catch (err) { res.status(200).json({ count: 0 }); }
});

/** Lấy lịch sử tin nhắn giữa 2 người dùng user1 và user2 (chỉ cho phép khi người gọi là 1 trong 2 người hoặc Admin) */
app.get('/api/messages/:user1/:user2', protect, async (req, res) => {
  try {
    const { user1, user2 } = req.params;
    const callerId = String(req.user._id);
    if (req.user.role !== 'Admin' && callerId !== String(user1) && callerId !== String(user2)) {
      return res.status(403).json({ message: 'Bạn không có quyền đọc tin nhắn của người khác' });
    }
    const messages = await Message.find({
      $or: [{ sender: user1, receiver: user2 }, { sender: user2, receiver: user1 }]
    }).populate('post', 'title price image author').sort({ timestamp: 1 });
    res.status(200).json(messages);
  } catch (error) { res.status(500).json({ message: 'Lỗi' }); }
});

/** Gửi tin nhắn mới (C6 & H13: bắt buộc protect, sender lấy từ token, giới hạn upload) */
app.post('/api/messages', protect, uploadLimiter, upload.single('image'), async (req, res) => {
  try {
    const receiverId = req.body?.receiverId;
    if (!receiverId || !mongoose.Types.ObjectId.isValid(receiverId)) {
      return res.status(400).json({ message: 'Người nhận tin nhắn không hợp lệ' });
    }
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    const postId = req.body?.postId && mongoose.Types.ObjectId.isValid(req.body.postId) ? req.body.postId : null;

    const newMessage = new Message({
      sender: req.user._id,
      receiver: receiverId,
      content: text,
      post: postId
    });

    if (req.file) {
      newMessage.images = [req.file.path || req.file.secure_url || req.file.filename];
    }
    await newMessage.save();

    await sendNotification(
      receiverId,
      '💬 Tin nhắn mới',
      text ? `"${text.substring(0, 30)}..."` : 'Bạn nhận được 1 hình ảnh mới.',
      'MESSAGE',
      '/chat'
    );

    const populatedMsg = await Message.findById(newMessage._id).populate('post', 'title price images image');
    res.status(200).json(populatedMsg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi lưu tin nhắn' });
  }
});

/** Đánh dấu đã đọc tin nhắn và thông báo chat tương ứng (C6: bắt buộc protect, receiver lấy từ token) */
app.put('/api/messages/mark-read', protect, async (req, res) => {
  try {
    const otherId = req.body?.otherId;
    if (!otherId || !mongoose.Types.ObjectId.isValid(otherId)) {
      return res.status(400).json({ message: 'otherId không hợp lệ' });
    }
    await Message.updateMany(
      { sender: otherId, receiver: req.user._id, isRead: false },
      { $set: { isRead: true } }
    );
    await Notification.updateMany(
      { userId: req.user._id, type: 'MESSAGE', isRead: false },
      { $set: { isRead: true } }
    );
    res.status(200).json({ message: 'Đã đọc' });
  } catch (error) { res.status(500).json({ message: 'Lỗi' }); }
});

// --- 14.3. Chatbot AI (LM Studio & MongoDB RAG) ---
/** Xử lý câu hỏi Chatbot AI hỗ trợ tìm sản phẩm & tư vấn chính sách HaiHand (H14: giới hạn tốc độ & độ dài input <= 1000 ký tự) */
app.post('/api/chatbot/ask', chatbotLimiter, async (req, res) => {
  try {
    const { message, history } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Vui lòng cung cấp tin nhắn (message)' });
    }
    if (message.length > 1000) {
      return res.status(400).json({ error: 'Nội dung tin nhắn quá dài (tối đa 1000 ký tự)!' });
    }
    const safeHistory = Array.isArray(history) ? history.slice(-10) : [];

    const result = await processChatbot(message.trim(), safeHistory);
    res.json(result);
  } catch (error) {
    console.error('Lỗi Chatbot:', error);
    res.status(500).json({
      error: 'Trợ lý AI hiện đang tạm thời bận. Vui lòng thử lại sau ít phút!'
    });
  }
});

// Global Error Handler Middleware (0.3 / M9)
app.use(errorHandler);

// --- 14.4. Socket.IO Real-time Event Handlers ---
/** Quản lý kết nối WebSocket: room cá nhân (`user_<id>`), room Admin (`admin_system_room`), chat & trạng thái online */
io.on('connection', (socket) => {
  const handshakeUserId = socket.handshake.auth?.userId || socket.handshake.query?.userId;
  if (handshakeUserId) {
    socket.join('user_' + handshakeUserId.toString());
    addUser(handshakeUserId, socket.id);
  }

  socket.on('addUser', (userId) => {
    if (userId) {
      socket.join('user_' + userId.toString());
      socket.userId = userId.toString();
    }
    addUser(userId, socket.id);
    io.emit('getUsers', users);
  });

  if (socket.handshake.auth?.role === 'admin' || socket.handshake.query?.role === 'admin') {
    socket.join('admin_system_room');
  }

  socket.on('join_admin_room', () => {
    socket.join('admin_system_room');
    console.log(`🛡️ Socket ${socket.id} joined admin_system_room`);
  });

  socket.on('join', (room) => {
    if (room) socket.join(room);
  });

  socket.on('sendMessage', (msgData = {}) => {
    const { senderId, receiverId, text, post, images } = msgData;
    const receiverSockets = getUserSockets(receiverId);
    if (receiverSockets && receiverSockets.length > 0) {
      receiverSockets.forEach(userSocket => {
        io.to(userSocket.socketId).emit('getMessage', {
          ...msgData,
          senderId,
          text,
          post,
          images
        });
        io.to(userSocket.socketId).emit('updateInbox');
      });
    }
  });

  socket.on('disconnect', async () => {
    const disconnectedUser = users.find(u => u.socketId === socket.id);
    if (disconnectedUser && disconnectedUser.userId) {
      try {
        await User.findByIdAndUpdate(disconnectedUser.userId, { lastActive: Date.now() });
      } catch (e) { }
    }
    removeUser(socket.id);
    io.emit('getUsers', users);
  });
});

// ============================================================================
// SECTION 15: KHỞI ĐỘNG SERVER
// ============================================================================
const PORT = process.env.PORT || 4000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Hệ thống HaiHand đã sẵn sàng tại port ${PORT}`));
