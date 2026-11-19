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

// --- Controllers & Services ---
const {
  processCheckout,
  settlePaymentSession,
  cancelOrderWithRefundAndRestock
} = require('./controllers/checkoutController');
const { processChatbot } = require('./services/chatbotService');

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
app.use(session({
  secret: 'khoa-bi-mat-haihand',
  resave: false,
  saveUninitialized: false
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
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
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
  description: { type: String, default: 'Chiết khấu 5% từ đơn hàng' }
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
  if (!user || !plainPassword || typeof user.password !== 'string') return false;
  const isBcryptHash = /^\$2[aby]\$\d{2}\$/.test(user.password);
  if (isBcryptHash) {
    return bcrypt.compare(String(plainPassword), user.password);
  }
  if (user.password === String(plainPassword)) {
    try {
      user.password = await bcrypt.hash(String(plainPassword), 10);
      await user.save();
    } catch (e) { }
    return true;
  }
  return false;
}

/**
 * Middleware xác thực Admin hỗ trợ cả Session SSR (req.session.adminId) lẫn Bearer JWT (role === 'Admin').
 * Tự động trả 401 JSON cho route `/api/*` hoặc redirect `/login` cho trang SSR.
 */
const requireAdmin = (req, res, next) => {
  if (req.session.adminId) return next();

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, getJwtSecret());
      if (decoded.role === 'Admin') {
        req.adminId = decoded.id;
        return next();
      }
    } catch (e) { }
  }

  if (req.originalUrl && req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ message: 'Truy cập bị từ chối' });
  }
  res.redirect('/login');
};

/**
 * Middleware xác thực Admin nghiêm ngặt chỉ qua Bearer JWT (phục vụ Admin REST APIs).
 */
const requireAdminJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Truy cập bị từ chối' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (decoded.role !== 'Admin') return res.status(403).json({ message: 'Bạn không có quyền quản trị!' });
    req.adminId = decoded.id;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
  }
};

// ============================================================================
// SECTION 9: GẮN CÁC MODULE ROUTER CHUYÊN BIỆT (MODULAR ROUTERS)
// Lưu ý thứ tự: Gắn trước các route `/api/users/:id` để không bị wildcard che mất
// ============================================================================
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

/** [SSR] Xử lý đăng nhập Admin qua Session */
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await User.findOne({ username, role: 'Admin' });
    if (admin && await verifyAndUpgradeUserPassword(admin, password)) {
      req.session.adminId = admin._id;
      res.redirect('/dashboard');
    } else {
      res.render('login', { error: 'Tài khoản không tồn tại hoặc bạn không phải Admin!' });
    }
  } catch (err) {
    res.render('login', { error: 'Lỗi hệ thống khi đăng nhập: ' + err.message });
  }
});

/** [SSR] Đăng ký nhanh tài khoản từ trang login SSR cũ */
app.post('/register', async (req, res) => {
  try {
    const { name, email, username, password, role } = req.body;
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) return res.render('login', { error: 'Email hoặc Username đã bị trùng!' });

    const newUser = new User({ name, email, username, password, role });
    await newUser.save();
    res.render('login', { error: 'Tạo tài khoản thành công! Hãy đăng nhập.' });
  } catch (error) {
    res.render('login', { error: 'Lỗi hệ thống khi đăng ký!' });
  }
});

/** [SSR] Hủy session và đăng xuất Admin */
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

/** [SSR] Trang gốc tự động chuyển hướng sang /dashboard */
app.get('/', (req, res) => res.redirect('/dashboard'));

/** [API] Đăng nhập Admin và cấp Bearer JWT (expiresIn 1d) */
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await User.findOne({ username, role: 'Admin' });
    if (admin && await verifyAndUpgradeUserPassword(admin, password)) {
      const token = jwt.sign({ id: admin._id, role: admin.role }, getJwtSecret(), { expiresIn: '1d' });
      res.status(200).json({ message: 'Đăng nhập thành công', token, user: sanitizeUser(admin) });
    } else {
      res.status(401).json({ message: 'Sai tên đăng nhập hoặc mật khẩu!' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server' });
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
    const COMPLETED = ['Completed', 'Delivered', 'Hoàn thành', 'Đã giao thành công', 'Đã thanh toán (Admin giữ tiền)'];

    const setting = (await safe('settings', () => Settings.findOne().lean(), null)) || { platformFeePercentage: 5 };
    const feePercent = Number(setting.platformFeePercentage ?? setting.commissionRate ?? 5);

    const [userCount, lockedUserCount, postCount, pendingCount, gmvAgg] = await Promise.all([
      safe('userCount', () => User.countDocuments(notDeleted), 0),
      safe('lockedUserCount', () => User.countDocuments(lockedFilter), 0),
      safe('productCount', () => Product.countDocuments({ status: { $nin: ['DELETED', ...PENDING] } }), 0),
      safe('pendingCount', () => Product.countDocuments({ status: { $in: PENDING } }), 0),
      safe('gmv', () => Order.aggregate([
        { $match: { status: { $in: COMPLETED } } },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } }
      ]), [])
    ]);

    const gmv = (gmvAgg[0] && gmvAgg[0].total) || 0;
    res.json({
      stats: {
        userCount,
        activeUserCount: Math.max(0, userCount - lockedUserCount),
        lockedUserCount,
        postCount,
        pendingCount,
        gmv,
        revenue: Math.round(gmv * feePercent / 100),
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

/** [API] Cập nhật cấu hình hệ thống toàn sàn */
app.put('/api/admin/settings', requireAdminJWT, async (req, res) => {
  try {
    const settings = await Settings.getGlobal();
    const updatable = [
      'commissionRate', 'maintenanceMode', 'bannerAnnouncement',
      'allowNewSellerRegistration', 'codEnabled', 'vnpayEnabled', 'haipayEnabled',
      'supportHotline', 'supportEmail'
    ];
    updatable.forEach(key => {
      if (req.body[key] !== undefined) settings[key] = req.body[key];
    });
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
/** [API] Danh sách người dùng có tìm kiếm, lọc trạng thái và phân trang */
app.get('/api/admin/users', requireAdminJWT, async (req, res) => {
  try {
    const { search, status, page = 1, limit = 10 } = req.query;
    let query = {};
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
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

    const users = await User.find(query)
      .select('-password')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(query);
    res.json({ users, total, totalPages: Math.ceil(total / limit) });
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
app.get('/users/edit/:id', async (req, res) => {
  try {
    const user = await mongoose.model('User').findById(req.params.id);
    if (!user) return res.redirect('/users');
    res.render('edit-user', { user });
  } catch (err) {
    res.status(500).send('Lỗi tìm người dùng');
  }
});

/** [SSR] Lưu cập nhật thông tin người dùng */
app.post('/users/edit/:id', async (req, res) => {
  try {
    const { name, email, phone, role } = req.body;
    await mongoose.model('User').findByIdAndUpdate(req.params.id, { name, email, phone, role });
    res.redirect('/users');
  } catch (err) {
    res.status(500).send('Lỗi cập nhật người dùng');
  }
});

/** [SSR] Xóa người dùng theo ID */
app.get('/users/delete/:id', requireAdmin, async (req, res) => {
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
/** [API] Danh sách bài đăng / sản phẩm có lọc trạng thái & phân trang cho Admin React */
app.get('/api/admin/posts', requireAdminJWT, async (req, res) => {
  try {
    const { search, status, page = 1, limit = 10 } = req.query;
    let query = {};
    if (search) query.title = { $regex: search, $options: 'i' };
    if (status && status !== 'all') query.status = status;

    const posts = await Post.find(query)
      .populate('author', 'name username')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await Post.countDocuments(query);
    res.json({ posts, total, totalPages: Math.ceil(total / limit) });
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

/** [SSR] Ẩn/Xóa mềm bài đăng (đặt status = DELETED) */
app.get('/posts/delete/:id', requireAdmin, async (req, res) => {
  try { await Post.findByIdAndUpdate(req.params.id, { status: 'DELETED' }); res.redirect('/posts'); } catch (e) { res.redirect('/posts'); }
});

/** [SSR] Duyệt bài đăng (chuyển status = active và thông báo người bán) */
app.get('/posts/approve/:id', requireAdmin, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).send('Không tìm thấy bài viết');

    post.status = 'active';
    await post.save();

    await UserNotification.create({
      user: post.author,
      title: '✅ Tin đăng đã được duyệt!',
      message: `Tin đăng "${post.title}" của bạn đã chính thức hiển thị trên chợ. Chúc bạn mau chốt đơn nhé!`,
      link: `/post/${post._id}`
    });

    res.redirect('/posts');
  } catch (error) {
    res.status(500).send('Lỗi server khi duyệt bài');
  }
});

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
      await UserNotification.create({
        user: deletedPost.author,
        title: '🚫 Bài viết đã bị xóa!',
        message: `Bài viết "${deletedPost.title}" của bạn đã bị Admin xóa do vi phạm tiêu chuẩn cộng đồng.`,
        link: '/profile'
      });
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

/** [API] Danh sách đơn hàng phân trang cho React Admin */
app.get('/api/admin/orders', requireAdminJWT, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    let query = {};
    if (status && status !== 'all') query.status = status;

    const orders = await Order.find(query)
      .populate('buyer', 'name username')
      .populate('seller', 'name username')
      .populate('items')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await Order.countDocuments(query);
    res.status(200).json({ orders, total, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error });
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

/** [SSR] Alias trang quản lý đơn hàng Admin */
app.get('/admin/orders', async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('buyer', 'name email phone')
      .sort({ createdAt: -1 });
    res.render('orders', { orders });
  } catch (error) {
    res.status(500).send('Lỗi tải danh sách đơn hàng');
  }
});

/** [SSR] Cập nhật trạng thái đơn hàng từ trang /orders (chặn đổi đơn đã chốt sổ / hủy) */
app.post('/orders/update-status/:id', requireAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).send('Không tìm thấy đơn hàng');

    if (order.status === 'Đã thanh toán cho người bán' || order.status === 'Đã hủy') {
      return res.status(400).send(`
                <div style="text-align:center; padding: 50px; font-family: sans-serif;">
                    <h2 style="color: red;">⛔ LỖI BẢO MẬT HỆ THỐNG</h2>
                    <p>Không thể thay đổi trạng thái của đơn hàng đã được CHỐT SỔ hoặc ĐÃ HỦY!</p>
                    <a href="/orders" style="padding: 10px 20px; background: #333; color: white; text-decoration: none; border-radius: 5px;">Quay lại</a>
                </div>
            `);
    }

    order.status = req.body.status;
    await order.save();

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
app.post('/api/admin/release-funds/:orderId', requireAdmin, async (req, res) => {
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

    await UserNotification.create({
      user: sellerRef,
      title: '💰 Tiền đã về ví HaiPay!',
      message: `Tuyệt vời! Bạn vừa được giải ngân ${sellerReceive.toLocaleString('vi-VN')}đ từ đơn hàng #${order._id.toString().slice(-6).toUpperCase()} (Đã trừ ${feePercent}% phí sàn).`,
      link: '/haipay'
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

/** [API] Admin hoàn tiền đơn hàng hủy về ví HaiPay người mua */
app.post('/api/admin/refund-order/:orderId', requireAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

    const current = canonicalStatus(order.status);
    if (current !== 'Cancelled' && order.status !== 'Đã hủy (Chờ hoàn tiền)' && order.paymentStatus !== 'escrow') {
      return res.status(400).json({ message: 'Đơn hàng này không ở trạng thái chờ hoàn tiền!' });
    }

    const buyer = await User.findById(orderBuyerId(order));
    if (buyer) {
      buyer.walletBalance = (buyer.walletBalance || 0) + order.totalPrice;
      await buyer.save();

      await Transaction.create({
        user: buyer._id,
        type: 'Hoàn tiền',
        amount: order.totalPrice,
        status: 'Thành công',
        description: `Hoàn tiền từ đơn hàng đã hủy #${order._id.toString().slice(-6).toUpperCase()}`
      });

      await UserNotification.create({
        user: buyer._id,
        title: '💸 Đã nhận được tiền hoàn!',
        message: `Hệ thống đã hoàn lại ${order.totalPrice.toLocaleString('vi-VN')}đ vào ví HaiPay của bạn từ đơn hàng bị hủy #${order._id.toString().slice(-6).toUpperCase()}.`,
        link: '/haipay'
      });
    }

    order.status = 'Cancelled';
    order.paymentStatus = 'refunded';
    order.cancelledAt = order.cancelledAt || new Date();
    await order.save();

    res.json({ message: '✅ Hoàn tiền thành công và đã cộng vào ví HaiPay của người mua!' });
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

/** [SSR] Danh sách lệnh rút tiền đang chờ xử lý */
app.get('/admin/withdrawals', async (req, res) => {
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

/** [API] Admin xác nhận duyệt lệnh rút tiền */
app.put('/api/admin/withdraw/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    await Transaction.findByIdAndUpdate(id, { status: 'success' });
    res.json({ message: 'Đã duyệt lệnh rút tiền thành công!' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi khi duyệt lệnh' });
  }
});

// --- 10.6. Hỗ trợ CSKH & Thông báo Admin ---
/** [SSR] Trang Chat CSKH trực tuyến phía Admin */
app.get('/admin/chat', requireAdmin, (req, res) => {
  res.render('admin-chat', { active: 'chat' });
});

/** [API] Lấy danh sách thông báo cấp hệ thống dành cho Admin Portal */
app.get('/api/admin/notifications', async (req, res) => {
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
  } catch (error) { res.status(500).json({ error: 'Lỗi: ' + error.message }); }
});

/** [API] Đánh dấu tất cả thông báo Admin là đã đọc */
app.post('/api/admin/notifications/read', async (req, res) => {
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
    res.status(500).json({ error: 'Lỗi cập nhật thông báo: ' + error.message });
  }
});

/** [API] Lấy thông tin Admin đầu mối để mở chat CSKH */
app.get('/api/admin/contact', async (req, res) => {
  try {
    const admin = await User.findOne({ role: 'Admin' }).select('_id name avatar email');
    if (!admin) return res.status(404).json({ message: 'Chưa có Admin nào trong hệ thống!' });
    res.status(200).json(admin);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy thông tin Admin' });
  }
});

/** [API] Đếm số tin nhắn chưa đọc gửi tới Admin */
app.get('/api/admin/unread-chats', async (req, res) => {
  try {
    const admin = await User.findOne({ role: 'Admin' });
    if (!admin) return res.json({ count: 0 });
    const count = await Message.countDocuments({ receiver: admin._id, isRead: false });
    res.json({ count });
  } catch (error) { res.json({ count: 0 }); }
});

/** [API] Bắn thử thông báo real-time tới kênh Admin để kiểm tra Socket */
app.get('/api/admin/test-notif', async (req, res) => {
  try {
    const notif = await sendAdminNotification(
      '🔔 Thông báo Test Hệ thống',
      'Tuyệt vời! Hệ thống chuông báo của Admin đang hoạt động rất trơn tru!',
      '/dashboard',
      'SYSTEM'
    );
    res.json({ message: 'Đã bắn thông báo test!', notif });
  } catch (error) { res.status(500).json({ error: 'Lỗi: ' + error.message }); }
});

// ============================================================================
// SECTION 11: USER ACCOUNT, PROFILE, MẬT KHẨU, THEO DÕI & YÊU THÍCH
// Lưu ý thứ tự: Toàn bộ route tĩnh (`/search`, `/profile`...) phải đặt TRƯỚC `GET /api/users/:id`
// ============================================================================

/** Đăng nhập tài khoản người dùng (hỗ trợ bcrypt + tự nâng cấp plaintext cũ) và trả JWT */
app.post('/api/users/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const cleanEmail = email ? String(email).trim().toLowerCase() : '';
    const user = await User.findOne({ $or: [{ email: cleanEmail }, { email }] });
    if (!user || !(await verifyAndUpgradeUserPassword(user, password))) {
      return res.status(401).json({ message: 'Sai email hoặc mật khẩu' });
    }
    if (user.status === 'locked' || user.isBanned) {
      return res.status(403).json({ message: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ ban quản trị để được hỗ trợ.' });
    }
    const safe = sanitizeUser(user);
    const token = signUserToken(user);
    res.status(200).json({ ...safe, token });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server khi đăng nhập: ' + err.message });
  }
});

/** Đăng ký tài khoản Khách hàng mới (chặn leo thang quyền Admin, băm mật khẩu bcrypt) */
app.post('/api/users/register', async (req, res) => {
  try {
    const { name, phone, address, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Điền đủ Họ tên, Email, Mật khẩu!' });

    const requestedRole = req.body.role || req.body.roles;
    if (requestedRole && /(admin|quản trị|root|superuser)/i.test(String(requestedRole))) {
      return res.status(403).json({ message: 'Không được phép chỉ định vai trò Quản trị viên!' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) return res.status(400).json({ message: 'Email này đã được sử dụng!' });

    const hashedPassword = await bcrypt.hash(String(password), 10);

    const newUser = new User({
      name: name.trim(),
      email: cleanEmail,
      password: hashedPassword,
      phone: phone ? phone.trim() : '',
      address: address ? address.trim() : '',
      role: 'Khách hàng',
      sellerStatus: 'none',
      isSeller: false
    });
    await newUser.save();
    const safe = sanitizeUser(newUser);
    res.status(201).json({ message: 'Đăng ký thành công', user: { ...safe, token: signUserToken(newUser) } });
  } catch (error) { res.status(500).json({ message: 'Lỗi server khi đăng ký' }); }
});

/** Đổi mật khẩu khi biết mật khẩu cũ */
app.put('/api/users/change-password/:id', async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    const isMatch = await verifyAndUpgradeUserPassword(user, oldPassword);
    if (!isMatch) return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng!' });
    user.password = await bcrypt.hash(String(newPassword), 10);
    await user.save();
    res.status(200).json({ message: 'Đổi mật khẩu thành công!' });
  } catch (err) { res.status(500).json({ message: 'Lỗi server khi đổi mật khẩu' }); }
});

/** Quên mật khẩu xác minh bằng SĐT (legacy) */
app.post('/api/users/forgot-password', async (req, res) => {
  try {
    const { email, phone, newPassword } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'Email này chưa đăng ký tài khoản!' });
    if (!user.phone) return res.status(400).json({ message: 'Chưa cập nhật SĐT, liên hệ Admin.' });
    if (user.phone !== phone) return res.status(400).json({ message: 'SĐT không chính xác!' });
    user.password = await bcrypt.hash(String(newPassword), 10);
    await user.save();
    res.status(200).json({ message: 'Lấy lại mật khẩu thành công!' });
  } catch (err) { res.status(500).json({ message: 'Lỗi server' }); }
});

/** Gửi mã OTP 6 chữ số bảo mật qua email để đặt lại mật khẩu (TTL 5 phút) */
app.post('/api/users/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Vui lòng cung cấp email!' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const user = await mongoose.model('User').findOne({ email: cleanEmail });

    if (!user) return res.status(404).json({ message: 'Email này chưa đăng ký tài khoản!' });

    const generatedOtp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(generatedOtp, 10);

    await OtpToken.deleteMany({ identifier: cleanEmail, purpose: 'RESET_PASSWORD' });

    await OtpToken.create({
      identifier: cleanEmail,
      otpHash,
      purpose: 'RESET_PASSWORD',
      attempts: 0
    });

    await sendOtpEmail({ email: cleanEmail, otp: generatedOtp, purpose: 'RESET_PASSWORD' });

    res.json({ success: true, message: 'Mã xác thực OTP đã được gửi đến email của bạn!' });
  } catch (err) {
    console.error('Lỗi khi gửi OTP đặt lại mật khẩu:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi gửi OTP!' });
  }
});

/** Xác thực OTP (tối đa 5 lần thử) và đặt lại mật khẩu mới đã băm bcrypt */
app.post('/api/users/reset-password-otp', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: 'Vui lòng cung cấp đầy đủ email, mã OTP và mật khẩu mới!' });
    }
    const cleanEmail = email.trim().toLowerCase();

    const tokenRecord = await OtpToken.findOne({ identifier: cleanEmail, purpose: 'RESET_PASSWORD' });
    if (!tokenRecord) {
      return res.status(400).json({ message: 'Mã OTP đã hết hạn hoặc không tồn tại!' });
    }

    if (tokenRecord.attempts >= 5) {
      await OtpToken.deleteOne({ _id: tokenRecord._id });
      return res.status(400).json({ message: 'Bạn đã nhập sai quá 5 lần. Vui lòng yêu cầu mã OTP mới!' });
    }

    const isMatch = await bcrypt.compare(String(otp).trim(), tokenRecord.otpHash);
    if (!isMatch) {
      tokenRecord.attempts += 1;
      await tokenRecord.save();
      return res.status(400).json({ message: 'Mã OTP không chính xác!' });
    }

    const user = await mongoose.model('User').findOne({ email: cleanEmail });
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng!' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    await OtpToken.deleteOne({ _id: tokenRecord._id });

    res.json({ success: true, message: 'Đổi mật khẩu thành công!' });
  } catch (err) {
    console.error('Lỗi khi đặt lại mật khẩu bằng OTP:', err);
    res.status(500).json({ message: 'Lỗi hệ thống khi đặt lại mật khẩu!' });
  }
});

/** Tìm kiếm người dùng theo tên/email để bắt đầu trò chuyện */
app.get('/api/users/search', async (req, res) => {
  try {
    const query = req.query.q;
    const excludeId = req.query.exclude;
    if (!query || query.trim() === '') return res.status(200).json([]);

    const usersFound = await User.find({
      $and: [
        { _id: { $ne: excludeId } },
        { $or: [{ name: { $regex: query, $options: 'i' } }, { email: { $regex: query, $options: 'i' } }] }
      ]
    }).select('name email avatar');
    res.status(200).json(usersFound);
  } catch (error) { res.status(500).json({ message: 'Lỗi server khi tìm kiếm' }); }
});

/** Lấy hồ sơ cá nhân theo Bearer JWT (ưu tiên) hoặc query/header userId */
app.get('/api/users/profile', async (req, res) => {
  try {
    let userId = req.query.id || req.query.userId || req.headers['userid'];

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, getJwtSecret());
        if (decoded && (decoded.id || decoded._id)) {
          userId = decoded.id || decoded._id;
        }
      } catch (tokenErr) { }
    }

    if (!userId) {
      return res.status(401).json({ message: 'Vui lòng cung cấp User ID hoặc Token xác thực' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'User ID không hợp lệ' });
    }

    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng trong hệ thống' });
    }

    res.status(200).json(sanitizeUser(user));
  } catch (error) {
    console.error('Lỗi khi lấy thông tin người dùng:', error);
    res.status(500).json({ message: 'Lỗi server khi lấy thông tin cá nhân' });
  }
});

/** Cập nhật thông tin hồ sơ cá nhân & avatar lên Cloudinary */
app.put('/api/users/profile/:id', upload.single('avatar'), async (req, res) => {
  try {
    const updateData = { ...req.body };

    if (req.file) updateData.avatar = req.file.path;
    const updatedUser = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-password');
    res.status(200).json(sanitizeUser(updatedUser));
  } catch (err) { res.status(500).json({ message: 'Lỗi cập nhật' }); }
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

    return res.status(200).json({ user, posts, reviews, followersCount, followingCount, avgRating, responseRate });
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

/** Theo dõi / Bỏ theo dõi người bán (kèm thông báo tới người được theo dõi) */
app.post('/api/users/follow', async (req, res) => {
  try {
    const { followerId, followingId } = req.body;
    if (followerId === followingId) return res.status(400).json({ message: 'Không thể tự theo dõi chính mình!' });

    const existingFollow = await Follow.findOne({ follower: followerId, following: followingId });

    if (existingFollow) {
      await Follow.findByIdAndDelete(existingFollow._id);
      return res.json({ message: 'Đã bỏ theo dõi', isFollowing: false });
    } else {
      await Follow.create({ follower: followerId, following: followingId });

      await UserNotification.create({
        user: followingId,
        title: '👤 Có người theo dõi mới!',
        message: 'Một người dùng vừa bắt đầu theo dõi bạn.',
        link: `/public-profile/${followerId}`
      });
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
      list = await mongoose.models.Follow.find({ following: userId }).populate('follower', 'name avatar email');
    } else {
      list = await mongoose.models.Follow.find({ follower: userId }).populate('following', 'name avatar email');
    }

    list = list.filter(item => item.follower && item.following);

    res.status(200).json(list);
  } catch (e) {
    console.error('Lỗi get follow list:', e.message);
    res.status(200).json([]);
  }
});

/** Thêm / Xóa sản phẩm khỏi danh sách yêu thích (Favorites toggle) */
app.post('/api/users/favorites', async (req, res) => {
  try {
    const user = await User.findById(req.body.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.favorites) user.favorites = [];
    const postIdStr = req.body.postId.toString();
    const index = user.favorites.findIndex(id => id.toString() === postIdStr);

    if (index === -1) user.favorites.push(req.body.postId);
    else user.favorites.splice(index, 1);

    await user.save();
    res.status(200).json({ message: 'Ok' });
  } catch (error) { res.status(500).json({ error: 'Lỗi' }); }
});

/** Lấy danh sách sản phẩm yêu thích của User */
app.get('/api/users/favorites/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).populate('favorites');
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
    const limitNum = Math.max(1, parseInt(limit, 10) || 8);

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

/** Cập nhật thông tin sản phẩm theo ID */
app.put('/api/posts/:id', upload.array('images', 5), async (req, res) => {
  try {
    const { title, price, category, location, description, quantity, details } = req.body;
    let updateData = { title, price, category, location, description, quantity };

    if (details) {
      try {
        updateData.details = JSON.parse(details);
        if (updateData.details.condition) updateData.condition = updateData.details.condition;
      } catch (e) { }
    }

    if (req.files && req.files.length > 0) {
      updateData.images = req.files.map(file => file.path || file.filename);
    }

    const updatedPost = await Post.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.status(200).json(updatedPost);
  } catch (error) { res.status(500).json({ message: 'Lỗi Server: ' + error.message }); }
});

/** Xóa sản phẩm theo ID và gỡ khỏi giỏ hàng / yêu thích của tất cả Users */
app.delete('/api/posts/:id', async (req, res) => {
  try {
    const deletedPost = await Post.findByIdAndDelete(req.params.id);
    if (!deletedPost) return res.status(404).json({ message: 'Không tìm thấy bài đăng để xóa' });

    await mongoose.model('User').updateMany({}, {
      $pull: {
        cart: { product: deletedPost._id },
        favorites: deletedPost._id
      }
    });

    res.status(200).json({ message: 'Đã trảm thành công!' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi Server khi xóa bài' });
  }
});

// --- Giỏ hàng (Cart APIs) ---
/** Lấy chi tiết giỏ hàng của User */
app.get('/api/users/cart/:userId', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
      return res.status(200).json([]);
    }
    const user = await User.findById(req.params.userId);
    if (!user || !user.cart) return res.status(200).json([]);

    let cartWithDetails = [];
    for (let item of user.cart) {
      const postDetail = await Post.findById(item.product).populate('author sellerId', 'name email avatar shopInfo isSeller sellerStatus');
      if (postDetail) cartWithDetails.push({ product: postDetail, quantity: item.quantity });
    }
    res.status(200).json(cartWithDetails);
  } catch (error) { res.status(200).json([]); }
});

/** Xóa toàn bộ giỏ hàng (đặt TRƯỚC route xóa từng món để tránh khớp nhầm `clear` vào `:postId`) */
app.delete('/api/users/cart/clear/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (user) { user.cart = []; await user.save(); }
    res.status(200).json([]);
  } catch (error) { res.status(500).json({ message: 'Lỗi Server' }); }
});

/** Xóa một sản phẩm khỏi giỏ hàng */
app.delete('/api/users/cart/:userId/:postId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy user' });
    user.cart = user.cart.filter(item => item.product && item.product.toString() !== req.params.postId);
    await user.save();
    res.status(200).json(user.cart);
  } catch (error) { res.status(500).json({ message: 'Lỗi Server' }); }
});

/** Thêm hoặc cộng dồn số lượng sản phẩm vào giỏ hàng */
app.post('/api/users/cart', async (req, res) => {
  try {
    const { userId, postId, quantity } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    if (!user.cart) user.cart = [];

    const itemIndex = user.cart.findIndex(item => item.product && item.product.toString() === postId);
    if (itemIndex > -1) {
      user.cart[itemIndex].quantity += quantity;
    } else {
      user.cart.push({ product: postId, quantity });
    }
    await user.save();
    res.status(200).json(user.cart);
  } catch (error) { res.status(500).json({ message: 'Lỗi Server' }); }
});

// --- Đánh giá & Báo cáo vi phạm ---
/** Tạo đánh giá cho đơn hàng đã hoàn thành */
app.post('/api/reviews', async (req, res) => {
  try {
    const { seller, buyer, rating, comment, orderId } = req.body;
    const order = await Order.findById(orderId);
    if (order.isReviewed) return res.status(400).json({ message: 'Đơn hàng này đã được đánh giá rồi!' });

    const newReview = new Review({ seller, buyer, rating, comment, orderId });
    await newReview.save();

    order.isReviewed = true;
    await order.save();

    res.status(200).json({ message: 'Đánh giá thành công!' });
  } catch (error) { res.status(500).json({ error: 'Lỗi gửi đánh giá' }); }
});

/** Người dùng gửi báo cáo bài đăng vi phạm tới Admin */
app.post('/api/reports', async (req, res) => {
  try {
    const { reporterId, postId, reason } = req.body;
    await Report.create({ reporter: reporterId, post: postId, reason });

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
const vnp_TmnCode = process.env.VNP_TMNCODE || 'IYQYHLU4';
const vnp_HashSecret = process.env.VNP_HASHSECRET || 'BBZJECZFZLUQSVOBCVTQSPDPYQZKGUEB';
const vnp_Url = process.env.VNP_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
const vnp_ReturnUrl = process.env.VNP_RETURNURL || 'http://localhost:3000/haipay/return';

/** Sắp xếp và URL-encode tham số theo chuẩn ký HMAC-SHA512 của VNPAY */
function sortObject(obj) {
  let sorted = {};
  let str = [];
  for (let key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      str.push(encodeURIComponent(key));
    }
  }
  str.sort();
  for (let key = 0; key < str.length; key++) {
    sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, '+');
  }
  return sorted;
}

/** Xác thực chữ ký vnp_SecureHash từ VNPAY Return/IPN */
function verifyVnpayChecksum(params, secureHash) {
  if (!secureHash) return true;
  let vnp_Params = { ...params };
  delete vnp_Params['vnp_SecureHash'];
  delete vnp_Params['vnp_SecureHashType'];

  vnp_Params = sortObject(vnp_Params);
  const signData = querystring.stringify(vnp_Params, { encode: false });
  const hmac = crypto.createHmac('sha512', vnp_HashSecret);
  const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

  return secureHash.toLowerCase() === signed.toLowerCase();
}

/** Tạo URL chuyển hướng sang cổng thanh toán VNPAY */
function buildVnpayPaymentUrl({ orderId, amount, ipAddr = '127.0.0.1', orderInfo, returnUrl }) {
  const createDate = moment(new Date()).format('YYYYMMDDHHmmss');

  let vnp_Params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: vnp_TmnCode,
    vnp_Locale: 'vn',
    vnp_CurrCode: 'VND',
    vnp_TxnRef: orderId.toString(),
    vnp_OrderInfo: orderInfo || ('Thanh toan don hang HaiHand ' + orderId),
    vnp_OrderType: 'other',
    vnp_Amount: Math.round(Number(amount) * 100),
    vnp_ReturnUrl: returnUrl || vnp_ReturnUrl,
    vnp_IpAddr: ipAddr,
    vnp_CreateDate: createDate
  };

  vnp_Params = sortObject(vnp_Params);
  const signData = querystring.stringify(vnp_Params, { encode: false });
  const hmac = crypto.createHmac('sha512', vnp_HashSecret);
  const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
  vnp_Params['vnp_SecureHash'] = signed;

  return vnp_Url + '?' + querystring.stringify(vnp_Params, { encode: false });
}

// --- 13.3. Nạp / Rút Ví HaiPay & Giao dịch ---
/** Tạo link nạp tiền vào Ví HaiPay qua VNPAY (yêu cầu Bearer JWT) */
app.post('/api/haipay/deposit', protectStrict, async (req, res) => {
  try {
    const { amount } = req.body;
    const requestedUserId = req.body.userId;
    if (requestedUserId && !req.user._id.equals(requestedUserId) && req.user.role !== 'Admin') {
      return res.status(403).json({ message: 'Không có quyền nạp tiền cho tài khoản khác' });
    }
    const userId = req.user._id.toString();
    const createDate = moment(new Date()).format('YYYYMMDDHHmmss');
    const txnRef = `NAP_${userId}_${createDate}`;

    let vnp_Params = {
      vnp_Version: '2.1.0', vnp_Command: 'pay', vnp_TmnCode: vnp_TmnCode,
      vnp_Locale: 'vn', vnp_CurrCode: 'VND', vnp_TxnRef: txnRef,
      vnp_OrderInfo: 'Nap tien vao vi HaiPay cho User ' + userId,
      vnp_OrderType: 'topup', vnp_Amount: amount * 100,
      vnp_ReturnUrl: vnp_ReturnUrl,
      vnp_IpAddr: req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '127.0.0.1',
      vnp_CreateDate: createDate
    };

    vnp_Params = sortObject(vnp_Params);
    const signData = querystring.stringify(vnp_Params, { encode: false });
    const hmac = crypto.createHmac('sha512', vnp_HashSecret);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
    vnp_Params['vnp_SecureHash'] = signed;

    const paymentUrl = vnp_Url + '?' + querystring.stringify(vnp_Params, { encode: false });
    res.status(200).json({ paymentUrl });
  } catch (error) { res.status(500).json({ error: 'Lỗi nạp tiền!' }); }
});

/** Xác nhận nạp tiền HaiPay từ VNPAY Return (chống replay attack theo txnRef) */
app.post('/api/haipay/verify', async (req, res) => {
  try {
    const { txnRef, responseCode, amount, vnp_Params, secureHash } = req.body;

    if (secureHash && vnp_Params) {
      const isValid = verifyVnpayChecksum(vnp_Params, secureHash);
      if (!isValid) {
        return res.status(400).json({ message: 'Chữ ký checksum không hợp lệ (Invalid Checksum)!' });
      }
    }

    if (responseCode === '00') {
      const parts = txnRef.split('_');
      const userId = parts[1];
      const actualAmount = parseInt(amount || req.body.amount) / 100;

      const existingTx = await Transaction.findOne({ txnRef });
      if (existingTx) {
        const currentUser = await User.findById(userId);
        return res.status(200).json({ message: 'Giao dịch đã được ghi nhận trước đó!', user: currentUser });
      }

      try {
        await Transaction.create({
          user: userId,
          type: 'Nạp tiền',
          amount: actualAmount,
          status: 'Thành công',
          txnRef,
          description: `Nạp tiền ví HaiPay qua VNPay (Mã GD: ${txnRef})`
        });
        const updatedUser = await User.findByIdAndUpdate(userId, { $inc: { walletBalance: actualAmount } }, { new: true });
        return res.status(200).json({ message: 'Nạp tiền thành công!', user: updatedUser });
      } catch (dupErr) {
        if (dupErr.code === 11000) {
          const currentUser = await User.findById(userId);
          return res.status(200).json({ message: 'Giao dịch đã được ghi nhận!', user: currentUser });
        }
        throw dupErr;
      }
    } else {
      res.status(400).json({ message: 'Giao dịch thất bại!' });
    }
  } catch (error) { res.status(500).json({ error: 'Lỗi xử lý ví!' }); }
});

/** Lấy lịch sử giao dịch ví HaiPay của User */
app.get('/api/users/:userId/transactions', async (req, res) => {
  try {
    const trans = await Transaction.find({ user: req.params.userId }).sort({ createdAt: -1 });
    res.json(trans);
  } catch (error) { res.status(500).json({ message: 'Lỗi lấy lịch sử' }); }
});

/**
 * Tạo lệnh rút tiền từ Ví HaiPay (yêu cầu Bearer JWT chính chủ, tối thiểu 50.000đ):
 * - Trừ số dư ví nguyên tử bằng `User.findOneAndUpdate({ walletBalance: { $gte: amount } })` chống rút lố đồng thời.
 * - Tạo Transaction `Đang xử lý` và thông báo tới Admin Portal.
 */
app.post('/api/users/:userId/withdraw', protectStrict, async (req, res) => {
  try {
    if (!req.user._id.equals(req.params.userId) && req.user.role !== 'Admin') {
      return res.status(403).json({ message: 'Không có quyền rút tiền từ ví của người khác' });
    }
    const { bankName, bankAccount } = req.body;
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount < 50000) {
      return res.status(400).json({ message: 'Số tiền rút tối thiểu là 50.000đ!' });
    }

    const existingUser = await User.findById(req.params.userId);
    if (!existingUser) return res.status(404).json({ message: 'Không tìm thấy user' });

    const user = await User.findOneAndUpdate(
      { _id: req.params.userId, walletBalance: { $gte: amount } },
      { $inc: { walletBalance: -amount } },
      { new: true }
    );
    if (!user) {
      return res.status(400).json({ message: 'Số dư ví không đủ để rút!' });
    }

    await Transaction.create({
      user: user._id, type: 'Rút tiền', amount: amount, status: 'Đang xử lý',
      description: `Rút tiền về NH: ${bankName} - STK: ${bankAccount}`
    });

    await UserNotification.create({
      user: user._id, title: '🏦 Đã tạo lệnh rút tiền!',
      message: `Lệnh rút ${amount.toLocaleString('vi-VN')}đ về tài khoản ${bankName} đang được xử lý. Tiền sẽ về trong 2-4 tiếng nữa nhé.`,
      link: '/haipay'
    });

    await sendAdminNotification(
      '💸 Yêu cầu rút tiền mới!',
      `Khách hàng ${user.name} vừa yêu cầu rút ${amount.toLocaleString('vi-VN')}đ. Bác mau vào kiểm tra và chuyển khoản nhé!`,
      '/admin/withdrawals',
      'WITHDRAWAL'
    );

    res.status(200).json({ message: 'Tạo lệnh rút tiền thành công!', user });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi hệ thống khi rút tiền' });
  }
});

// --- 13.4. Cổng Thanh Toán Đơn Hàng VNPAY ---
/** Khởi tạo link thanh toán VNPAY cho đơn hàng */
app.post('/api/vnpay/create_payment_url', async (req, res) => {
  try {
    const { amount, orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: 'Thiếu mã đơn hàng (orderId)' });
    }
    const ipAddr = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.socket?.remoteAddress || '127.0.0.1';
    const paymentUrl = buildVnpayPaymentUrl({
      orderId,
      amount: Number(amount) || 0,
      ipAddr
    });
    res.status(200).json({ paymentUrl });
  } catch (error) {
    console.error('VNPAY create_payment_url Error:', error);
    res.status(500).json({ error: 'Lỗi tạo link VNPay' });
  }
});

/** Xác nhận thanh toán VNPAY Return cho PaymentSession đa shop hoặc đơn lẻ cũ */
app.post('/api/vnpay/verify', async (req, res) => {
  try {
    const { orderId, responseCode, vnp_Params, secureHash } = req.body;
    if (!orderId) return res.status(400).json({ message: 'Thiếu mã đơn hàng!' });

    if (secureHash && vnp_Params) {
      const isValid = verifyVnpayChecksum(vnp_Params, secureHash);
      if (!isValid) {
        return res.status(400).json({ message: 'Chữ ký checksum không hợp lệ (Invalid Checksum)!' });
      }
    }

    const session = await PaymentSession.findOne({ parentOrderId: orderId });
    if (session) {
      if (responseCode === '00') {
        const result = await settlePaymentSession(orderId, {
          gatewayPayload: { vnp_Params, responseCode },
          paymentMethod: 'VNPAY'
        });
        return res.status(200).json({
          message: 'Giao dịch VNPay thành công!',
          parentOrderId: orderId,
          ordersCount: result.orders?.length || 0
        });
      } else {
        session.status = 'failed';
        session.gatewayPayload = { vnp_Params, responseCode };
        await session.save();

        await Order.updateMany(
          { _id: { $in: session.orderIds } },
          { $set: { status: 'Cancelled', cancelReason: 'Thanh toán VNPay không thành công hoặc khách hủy' } }
        );
        return res.status(400).json({ message: 'Giao dịch thất bại hoặc đã bị khách hủy!' });
      }
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

    if (responseCode === '00') {
      order.paymentStatus = 'escrow';
      order.status = 'Pending';
      order.paidAt = new Date();
      await order.save();

      const user = await User.findById(order.buyer);
      if (user && user.cart && user.cart.length > 0) {
        const purchasedIds = (order.items || []).map((id) => id.toString());
        user.cart = user.cart.filter((c) => c.product && !purchasedIds.includes(c.product.toString()));
        await user.save();
      }

      await Notification.create({
        user: order.seller,
        title: '🎉 Bạn có đơn hàng mới!',
        message: `Khách hàng vừa thanh toán đơn hàng #${order._id.toString().slice(-6).toUpperCase()}. Hãy chuẩn bị hàng nhé!`,
        link: '/seller-channel/orders'
      });

      return res.status(200).json({ message: 'Giao dịch VNPay thành công!' });
    } else {
      order.status = 'Cancelled';
      order.cancelReason = 'Thanh toán VNPay thất bại hoặc bị hủy';
      await order.save();
      return res.status(400).json({ message: 'Giao dịch thất bại hoặc đã bị khách hủy!' });
    }
  } catch (error) {
    console.error('Lỗi Verify VNPay:', error);
    res.status(500).json({ error: 'Lỗi hệ thống khi xác nhận thanh toán: ' + error.message });
  }
});

/** Webhook IPN server-to-server từ VNPAY (xử lý cả Nạp tiền NAP_* lẫn thanh toán đơn hàng) */
app.get('/api/vnpay/vnpay_ipn', async (req, res) => {
  try {
    let vnp_Params = { ...req.query };
    const secureHash = vnp_Params['vnp_SecureHash'];
    const orderId = vnp_Params['vnp_TxnRef'];
    const rspCode = vnp_Params['vnp_ResponseCode'];

    delete vnp_Params['vnp_SecureHash'];
    delete vnp_Params['vnp_SecureHashType'];

    vnp_Params = sortObject(vnp_Params);
    const signData = querystring.stringify(vnp_Params, { encode: false });
    const hmac = crypto.createHmac('sha512', vnp_HashSecret);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    if (secureHash && secureHash.toLowerCase() === signed.toLowerCase()) {
      if (rspCode === '00') {
        if (orderId && orderId.startsWith('NAP_')) {
          const parts = orderId.split('_');
          const userId = parts[1];
          const amount = parseInt(vnp_Params['vnp_Amount']) / 100;

          const existingTx = await Transaction.findOne({ txnRef: orderId });
          if (!existingTx) {
            try {
              await Transaction.create({
                user: userId,
                type: 'Nạp tiền',
                amount,
                status: 'Thành công',
                txnRef: orderId,
                description: `Nạp tiền ví HaiPay qua VNPay IPN (Mã GD: ${orderId})`
              });
              await User.findByIdAndUpdate(userId, { $inc: { walletBalance: amount } });
            } catch (dupErr) {
              if (dupErr.code !== 11000) {
                console.error('Lỗi ghi nhận Transaction IPN:', dupErr);
              }
            }
          }
        } else if (orderId) {
          const session = await PaymentSession.findOne({ parentOrderId: orderId });
          if (session) {
            await settlePaymentSession(orderId, {
              gatewayPayload: vnp_Params,
              paymentMethod: 'VNPAY'
            });
          } else if (mongoose.isValidObjectId(orderId)) {
            const order = await Order.findById(orderId);
            if (order && order.paymentStatus !== 'escrow') {
              order.paymentStatus = 'escrow';
              order.status = 'Pending';
              order.paidAt = new Date();
              await order.save();
            }
          }
        }
        res.status(200).json({ RspCode: '00', Message: 'Confirm Success' });
      } else {
        res.status(200).json({ RspCode: '00', Message: 'Confirm Success' });
      }
    } else {
      res.status(200).json({ RspCode: '97', Message: 'Fail Checksum' });
    }
  } catch (error) {
    res.status(200).json({ RspCode: '99', Message: 'Unknown error' });
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

/** Seller xác nhận đơn hàng từ Pending -> Processing */
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

    const current = canonicalStatus(order.status);
    if (!['Pending'].includes(current)) {
      return res.status(400).json({ message: 'Trạng thái đơn hàng không hợp lệ để xác nhận' });
    }
    order.status = 'Processing';
    await order.save();

    await Notification.create({
      title: '📦 Người bán đã chốt đơn!',
      message: `Shop đã xác nhận đơn hàng #${order._id.toString().slice(-6).toUpperCase()}.`,
      orderId: order._id
    });

    res.status(200).json({ message: 'Đã xác nhận đơn hàng!', order });
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
    const cancelResult = await cancelOrderWithRefundAndRestock(order, {
      cancelledBy: cancelledByRole,
      reason: req.body?.cancelReason || req.body?.reason || ''
    });

    if (!cancelResult.success) {
      return res.status(cancelResult.statusCode || 400).json({ message: cancelResult.message });
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

/** Người mua xác nhận đã nhận hàng (Shipped -> Delivered hoặc Delivered -> Completed) */
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

    order.status = current === 'Shipped' ? 'Delivered' : 'Completed';
    if (order.status === 'Delivered') order.deliveredAt = new Date();
    if (order.status === 'Completed') order.completedAt = new Date();
    await order.save();
    res.status(200).json({ message: 'Cảm ơn bạn đã xác nhận nhận hàng!', order });
  } catch (error) { res.status(500).json({ error: 'Lỗi xác nhận' }); }
});

/**
 * Lấy thông tin cơ bản của một User theo ID (ẩn password).
 * ĐẶT Ở CUỐI NHÓM `/api/users/*` ĐỂ KHÔNG CHẶN CÁC ROUTE TĨNH NHƯ `/search`, `/profile`...
 */
app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy user' });
    res.status(200).json(sanitizeUser(user));
  } catch (err) { res.status(500).json({ message: 'Lỗi server' }); }
});

// ============================================================================
// SECTION 14: THÔNG BÁO NGƯỜI DÙNG, CHAT 1-1, CHATBOT AI & SOCKET.IO REAL-TIME
// ============================================================================

// --- 14.1. Thông báo (Notifications APIs) ---
/** Lấy danh sách thông báo tách biệt theo scope (admin / seller / buyer) và đếm unreadByType */
app.get('/api/notifications', async (req, res) => {
  try {
    const { role, scope, type, limit } = req.query;

    if (scope === 'admin' || role === 'admin') {
      const adminFilter = {
        $or: [
          { targetRole: 'admin' },
          { recipientRole: 'admin' },
          { type: { $in: ['SELLER', 'PRODUCT', 'WITHDRAWAL', 'REPORT'] } }
        ]
      };
      if (type) {
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

    let userId = req.headers['userid'] || req.query.userId;
    if (!userId && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(req.headers.authorization.split(' ')[1], getJwtSecret());
        userId = decoded.id || decoded._id;
      } catch (e) {}
    }

    if (!userId) {
      return res.json({ notifications: [], unreadCount: 0, unreadByType: {} });
    }

    const userObjectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;

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

    if (type) {
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
    res.status(500).json({ error: 'Lỗi lấy danh sách thông báo: ' + error.message });
  }
});

/** Đánh dấu đã đọc tất cả thông báo của User (lọc tùy chọn theo role/type) */
app.put('/api/notifications/read-all', async (req, res) => {
  try {
    let userId = req.headers['userid'] || req.body.userId || req.query.userId;
    if (!userId && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(req.headers.authorization.split(' ')[1], getJwtSecret());
        userId = decoded.id || decoded._id;
      } catch (e) {}
    }

    if (!userId) {
      return res.status(400).json({ error: 'Thiếu userId' });
    }

    const userObjectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
    const { role, type } = req.body;

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

    if (type) {
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

/** Đánh dấu đã đọc thông báo theo từng nhóm type (VD: NEW_ORDER trên sidebar Seller) */
app.put('/api/notifications/read-by-type', async (req, res) => {
  try {
    let userId = req.headers['userid'] || req.body.userId || req.query.userId;
    if (!userId && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(req.headers.authorization.split(' ')[1], getJwtSecret());
        userId = decoded.id || decoded._id;
      } catch (e) {}
    }

    const type = req.body.type || req.query.type;
    if (!userId || !type) {
      return res.status(400).json({ error: 'Thiếu userId hoặc type' });
    }

    const userObjectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
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

/** Đánh dấu đã đọc 1 thông báo theo ID */
app.put('/api/notifications/:id/read', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'ID thông báo không hợp lệ' });
    }
    const updated = await Notification.findByIdAndUpdate(req.params.id, { isRead: true }, { new: true });
    res.json({ success: true, notification: updated });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi cập nhật thông báo' });
  }
});

// --- 14.2. Tin nhắn Chat 1-1 (Messages APIs) ---
/** [Dev Tool] Xóa sạch lịch sử tin nhắn trong DB */
app.get('/api/messages/clear-all', async (req, res) => {
  try {
    await Message.deleteMany({});
    res.status(200).send("<h1 style='color:green; text-align:center; margin-top:50px;'>✅ ĐÃ DỌN SẠCH RÁC TIN NHẮN!</h1>");
  } catch (e) { res.status(500).send('Lỗi dọn rác!'); }
});

/** Lấy danh sách hội thoại gần nhất kèm số tin chưa đọc của mỗi hội thoại (đặt TRƯỚC `/:user1/:user2`) */
app.get('/api/messages/conversations/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
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
app.get('/api/messages/unread-count/:userId', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
      return res.status(200).json({ count: 0 });
    }
    const count = await Message.countDocuments({ receiver: req.params.userId, isRead: false });
    res.status(200).json({ count });
  } catch (err) { res.status(200).json({ count: 0 }); }
});

/** Lấy lịch sử tin nhắn giữa 2 người dùng user1 và user2 */
app.get('/api/messages/:user1/:user2', async (req, res) => {
  try {
    const { user1, user2 } = req.params;
    const messages = await Message.find({
      $or: [{ sender: user1, receiver: user2 }, { sender: user2, receiver: user1 }]
    }).populate('post', 'title price image author').sort({ timestamp: 1 });
    res.status(200).json(messages);
  } catch (error) { res.status(500).json({ message: 'Lỗi' }); }
});

/** Gửi tin nhắn mới (hỗ trợ đính kèm 1 ảnh lên Cloudinary và gắn sản phẩm đang hỏi) */
app.post('/api/messages', upload.single('image'), async (req, res) => {
  try {
    const newMessage = new Message({
      sender: req.body.senderId,
      receiver: req.body.receiverId,
      content: req.body.text || '',
      post: req.body.postId || null
    });

    if (req.file) {
      newMessage.images = [req.file.path];
    }
    await newMessage.save();

    await sendNotification(
      req.body.receiverId,
      '💬 Tin nhắn mới',
      req.body.text ? `"${req.body.text.substring(0, 30)}..."` : 'Bạn nhận được 1 hình ảnh mới.',
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

/** Đánh dấu đã đọc tin nhắn và thông báo chat tương ứng */
app.put('/api/messages/mark-read', async (req, res) => {
  try {
    await Message.updateMany(
      { sender: req.body.otherId, receiver: req.body.userId, isRead: false },
      { $set: { isRead: true } }
    );
    await Notification.updateMany(
      { userId: req.body.userId, type: 'MESSAGE', isRead: false },
      { $set: { isRead: true } }
    );
    res.status(200).json({ message: 'Đã đọc' });
  } catch (error) { res.status(500).json({ message: 'Lỗi' }); }
});

// --- 14.3. Chatbot AI (LM Studio & MongoDB RAG) ---
/** Xử lý câu hỏi Chatbot AI hỗ trợ tìm sản phẩm & tư vấn chính sách HaiHand */
app.post('/api/chatbot/ask', chatbotLimiter, async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Vui lòng cung cấp tin nhắn (message)' });
    }

    const result = await processChatbot(message, history);
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
