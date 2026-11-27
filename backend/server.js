require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const querystring = require('qs');
const Notification = require('./models/Notification');
const Message = require('./models/Message');
const User = require('./models/User');
const SupportConversation = require('./models/SupportConversation');
const Order = require('./models/Order');
const { Product, Post } = require('./models/Product');
const { protect, protectStrict, isSeller } = require('./middleware/auth');
const { initSocket } = require('./socket');
const Transaction = require('./models/Transaction');
const Settings = require('./models/Settings');
const {
  createHelmetMiddleware,
  isOriginAllowed,
  buildCorsOptions
} = require('./middleware/security');
const {
  CATALOG_VISIBLE,
  canonicalStatus,
  productOwnerId,
  orderBuyerId,
  orderSellerId,
  isEscrow,
  sanitizeUser,
  signUserToken,
  displayProductName
} = require('./utils/b2c');
const createSellerRouter = require('./routes/seller');
const createMessagesRouter = require('./routes/messages');
const haipayRouter = require('./routes/haipay');
const { refreshProductSearch } = require('./services/chatbotService');
const shippingRouter = require('./routes/shipping');
const addressRouter = require('./routes/address');
const PaymentSession = require('./models/PaymentSession');
const { processCheckout, settlePaymentSession } = require('./controllers/checkoutController');
const { buildVnpayPaymentUrl: buildSignedVnpayPaymentUrl, formatVnpayDate, verifyVnpayChecksumStrict } = require('./utils/vnpay');
const { isHash, verifyPassword, hashPassword } = require('./utils/password');
const trackRouter = require('./routes/track');
const { trackServerEvent } = require('./analytics/track');
const recommendationsRouter = require('./routes/recommendations');
const createAdminPortalRouter = require('./routes/adminPortal');
const UserEvent = require('./models/UserEvent');
const {
  recordServerEvent,
  mergeUserIdentity,
  runNightlyMaintenance
} = require('./services/behaviorAnalysisService');

const app = express();
app.set('trust proxy', 1);

// ============================================================================
// SECTION 2: CẤU HÌNH CORS, SECURITY HEADERS (HELMET) & SOCKET.IO
// ============================================================================
const corsOptions = buildCorsOptions();
const corsMiddleware = cors(corsOptions);
app.use(corsMiddleware);
app.options(/.*/, corsMiddleware);
app.use(createHelmetMiddleware());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Origin not allowed by Socket.IO CORS'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'userid',
      'UserId',
      'X-Requested-With',
      'Origin',
      'X-CSRF-Token',
      'x-anonymous-id',
      'X-Anonymous-Id'
    ],
    credentials: true
  }
});

app.use(express.json({ limit: '7mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));



const fs = require('fs');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');


cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});


const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'HaiHand_Images',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp']
  }
});

const upload = multer({ storage: storage });

const DB_URL = process.env.MONGO_URI || process.env.MONGODB_URI;

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




const Category = mongoose.models.Category || mongoose.model('Category', new mongoose.Schema({
  name: { type: String, required: true },
  image: { type: String, required: true },
  description: { type: String, default: '' }
}));

const Revenue = mongoose.models.Revenue || mongoose.model('Revenue', new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  commissionAmount: { type: Number, required: true },
  description: { type: String, default: 'Chiết khấu 5% từ đơn hàng' }
}, { timestamps: true }));

const Review = mongoose.models.Review || mongoose.model('Review', new mongoose.Schema({
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' }
}, { timestamps: true }));

const UserNotification = mongoose.models.UserNotification || mongoose.model('UserNotification', new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  title: String,
  message: String,
  link: String,
  isRead: { type: Boolean, default: false }
}, { timestamps: true }));

const Report = mongoose.models.Report || mongoose.model('Report', new mongoose.Schema({
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  reason: String,
  status: { type: String, enum: ['Chờ xử lý', 'Đã xử lý'], default: 'Chờ xử lý' }
}, { timestamps: true }));

const Follow = mongoose.models.Follow || mongoose.model('Follow', new mongoose.Schema({
  follower: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  following: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true }));

const socketHub = initSocket(io);

const notificationService = require('./utils/notificationService');
notificationService.init(io);
const sendNotification = notificationService.sendNotification;
const sendAdminNotification = notificationService.sendAdminNotification;

const session = require('express-session');
const isCookieSecure = process.env.COOKIE_SECURE === 'true';

app.use(session({
  secret: process.env.SESSION_SECRET || 'khoa-bi-mat-haihand',
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isCookieSecure,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use((req, res, next) => {
  if (!req.headers.cookie || !req.headers.cookie.includes('XSRF_TOKEN=')) {
    const token = crypto.randomBytes(24).toString('hex');
    res.cookie('XSRF_TOKEN', token, {
      httpOnly: false,
      sameSite: 'lax',
      secure: isCookieSecure
    });
  }
  next();
});

const requireAdmin = (req, res, next) => {
  if (req.session?.user?.role === 'Admin' && req.session.user.status !== 'locked' && !req.session.user.isBanned) {
    return next();
  }
  if (req.session?.adminId) return next();

  // Support Bearer JWT for API endpoints
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
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

app.use(createSellerRouter({ upload, sendNotification, sendAdminNotification, io }));
const shippingController = require('./controllers/shippingController');
const webhookRouter = require('./routes/webhook');
app.post('/api/seller/orders/:orderId/ship', protect, shippingController.createShipmentGHN);
app.use('/api/webhook', webhookRouter);
app.use('/api/haipay', haipayRouter);
app.use('/api/shipping', shippingRouter);
app.use('/api/users/me/addresses', addressRouter);
app.use('/api/addresses', addressRouter);
app.use('/api', trackRouter);
app.use('/api', recommendationsRouter);
app.post('/api/checkout', protect, processCheckout);

// Schedule nightly maintenance for behavioral engine (runs once every 24h)
setInterval(() => {
  runNightlyMaintenance().catch((err) => console.warn('Nightly maintenance schedule error:', err.message));
}, 24 * 60 * 60 * 1000).unref();

app.use(
  createAdminPortalRouter({
    User,
    Product,
    Post,
    Order,
    Revenue,
    Transaction,
    Report,
    Notification,
    Message,
    SupportConversation,
    Category,
    GlobalSetting: Settings,
    UserEvent,
    UserNotification,
    upload,
    sanitizeUser,
    verifyPassword,
    hashPassword,
    isHash,
    trackServerEvent
  })
);

app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    // Tạm thời so sánh plaintext, sau này cần đổi qua bcrypt.compare()
    const admin = await User.findOne({ username, password, role: 'Admin' });
    if (admin) {
      const jwt = require('jsonwebtoken');
      const token = jwt.sign({ id: admin._id, role: admin.role }, process.env.JWT_SECRET || 'secret123', { expiresIn: '1d' });
      res.status(200).json({ message: 'Đăng nhập thành công', token, user: admin });
    } else {
      res.status(401).json({ message: 'Sai tên đăng nhập hoặc mật khẩu!' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server' });
  }
});

// Middleware xác thực JWT cho Admin
const requireAdminJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Truy cập bị từ chối' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
    if (decoded.role !== 'Admin') return res.status(403).json({ message: 'Bạn không có quyền quản trị!' });
    req.adminId = decoded.id;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
  }
};

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
    const PENDING = ['PENDING', 'Pending', 'Chờ duyệt'];
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

// Thêm Admin REST APIs cho React Frontend
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
      // By default don't show deleted users unless filtered
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

// Admin Global Settings APIs
app.get('/api/admin/settings', requireAdminJWT, async (req, res) => {
  try {
    const settings = await Settings.getGlobal();
    res.json({ settings });
  } catch (error) { res.status(500).json({ message: 'Lỗi lấy cấu hình hệ thống' }); }
});

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

// Public Global Settings (Safe read for clients)
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

app.delete('/api/admin/posts/:id', requireAdminJWT, async (req, res) => {
  try {
    const deletedPost = await Post.findByIdAndDelete(req.params.id);
    if (!deletedPost) return res.status(404).json({ message: 'Không tìm thấy bài đăng' });

    // Xoá bài đăng khỏi mảng cart & favorites của mọi users
    await mongoose.model('User').updateMany({}, {
      $pull: {
        cart: { product: deletedPost._id },
        favorites: deletedPost._id
      }
    });

    res.json({ message: 'Đã xóa bài đăng và dữ liệu liên quan thành công!' });
  } catch (error) { res.status(500).json({ message: 'Lỗi server' }); }
});

// Legacy Admin SSR routes removed (handled by routes/adminPortal.js)

// Replace existing /api/admin/orders with JWT auth and pagination
app.get('/api/admin/orders', requireAdminJWT, async (req, res) => {
  try {
    const { search, status, page = 1, limit = 10 } = req.query;
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


// Legacy post/order/category SSR routes removed (handled by routes/adminPortal.js)


app.post('/api/admin/release-funds/:orderId', requireAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: "Không tìm thấy đơn hàng" });


    const current = canonicalStatus(order.status);
    if (!['Completed', 'Delivered', 'Hoàn thành'].includes(current) && order.status !== 'Hoàn thành') {
      return res.status(400).json({ message: "Chỉ giải ngân khi đơn hàng đã Delivered / Completed!" });
    }

    const platformFee = order.totalPrice * 0.05;
    const sellerReceive = order.totalPrice - platformFee;
    const sellerRef = orderSellerId(order);

    const seller = await User.findById(sellerRef);
    if (!seller) return res.status(404).json({ message: 'Không tìm thấy Seller' });
    seller.pendingBalance = Math.max(0, (seller.pendingBalance || 0) - sellerReceive);
    seller.walletBalance = (seller.walletBalance || 0) + sellerReceive;
    await seller.save();

    const newRevenue = new Revenue({
      orderId: order._id,
      commissionAmount: platformFee,
      description: `Thu chiết khấu 5% từ đơn hàng #${order._id.toString().slice(-6).toUpperCase()}`
    });
    await newRevenue.save();

    order.status = 'Completed';
    order.paymentStatus = 'released';
    order.completedAt = order.completedAt || new Date();
    await order.save();

    await UserNotification.create({
      user: sellerRef,
      title: '💰 Tiền đã về ví HaiPay!',
      message: `Tuyệt vời! Bạn vừa được giải ngân ${sellerReceive.toLocaleString('vi-VN')}đ từ đơn hàng #${order._id.toString().slice(-6).toUpperCase()} (Đã trừ 5% phí sàn).`,
      link: '/haipay'
    });

    res.json({ message: "Giải ngân và bắn thông báo thành công!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Lỗi hệ thống khi giải ngân" });
  }
});


app.post('/api/admin/refund-order/:orderId', requireAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: "Không tìm thấy đơn hàng" });


    const current = canonicalStatus(order.status);
    if (current !== 'Cancelled' && order.status !== 'Đã hủy (Chờ hoàn tiền)' && order.paymentStatus !== 'escrow') {
      return res.status(400).json({ message: "Đơn hàng này không ở trạng thái chờ hoàn tiền!" });
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

    trackServerEvent('order_cancelled', {
      userId: order.buyerId || order.buyer,
      props: { orderId: order._id, by: 'admin' }
    });

    res.json({ message: "✅ Hoàn tiền thành công và đã cộng vào ví HaiPay của người mua!" });
  } catch (error) {
    console.error("Lỗi hoàn tiền:", error);
    res.status(500).json({ message: "Lỗi hệ thống khi hoàn tiền" });
  }
});


// Legacy /admin/revenue removed (handled by routes/adminPortal.js)

app.delete('/api/posts/:id', async (req, res) => {
  try {
    const deletedPost = await Post.findByIdAndDelete(req.params.id);
    if (!deletedPost) return res.status(404).json({ message: "Không tìm thấy bài đăng để xóa" });

    // Fix Orphaned Records: Remove the deleted post from all carts and favorites
    await mongoose.model('User').updateMany({}, {
      $pull: {
        cart: { product: deletedPost._id },
        favorites: deletedPost._id
      }
    });

    res.status(200).json({ message: "Đã trảm thành công!" });
  } catch (error) {
    res.status(500).json({ message: "Lỗi Server khi xóa bài" });
  }
});

// Legacy /api/admin/notifications & /admin/reports removed (handled by routes/adminPortal.js)

/** [API] Lấy thông tin Admin đầu mối để mở chat CSKH (fallback sang Settings mặc định để tránh lỗi console) */
app.get('/api/admin/contact', async (req, res) => {
  try {
    let settings = null;
    let admin = null;
    if (mongoose.connection.readyState === 1) {
      [admin, settings] = await Promise.all([
        User.findOne({ role: 'Admin' }).select('_id name avatar').lean().catch(() => null),
        Settings.getGlobal().catch(() => null)
      ]);
    }

    const supportHotline = settings?.supportHotline || '1900-6868';
    const supportEmail = settings?.supportEmail || settings?.contactEmail || 'cskh@haihand.vn';

    if (admin) {
      return res.status(200).json({
        ...admin,
        supportHotline,
        supportEmail
      });
    }

    return res.status(200).json({
      _id: null,
      name: 'Hỗ trợ CSKH HaiHand',
      avatar: '',
      supportHotline,
      supportEmail,
      isFallback: true
    });
  } catch (error) {
    console.error('Lỗi lấy thông tin Admin (/api/admin/contact):', error.message);
    return res.status(200).json({
      _id: null,
      name: 'Hỗ trợ CSKH HaiHand',
      avatar: '',
      supportHotline: '1900-6868',
      supportEmail: 'cskh@haihand.vn',
      isFallback: true
    });
  }
});

app.get('/api/admin/unread-chats', async (req, res) => {
  try {
    const admin = await User.findOne({ role: 'Admin' });
    if (!admin) return res.json({ count: 0 });
    const count = await Message.countDocuments({ receiver: admin._id, isRead: false });
    res.json({ count });
  } catch (error) { res.json({ count: 0 }); }
});


app.get('/api/admin/test-notif', async (req, res) => {
  try {
    const notif = await sendAdminNotification(
      '🔔 Thông báo Test Hệ thống',
      'Tuyệt vời! Hệ thống chuông báo của Admin đang hoạt động rất trơn tru!',
      '/dashboard',
      'SYSTEM'
    );
    res.json({ message: "Đã bắn thông báo test!", notif });
  } catch (error) { res.status(500).json({ error: "Lỗi: " + error.message }); }
});


app.put('/api/admin/withdraw/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;

    await Transaction.findByIdAndUpdate(id, { status: 'success' });
    res.json({ message: 'Đã duyệt lệnh rút tiền thành công!' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi khi duyệt lệnh' });
  }
});

app.get('/users/edit/:id', async (req, res) => {
  try {
    const user = await mongoose.model('User').findById(req.params.id);
    if (!user) return res.redirect('/users');
    res.render('edit-user', { user });
  } catch (err) {
    res.status(500).send("Lỗi tìm người dùng");
  }
});


app.post('/users/edit/:id', async (req, res) => {
  try {
    const { name, email, phone, role } = req.body;
    await mongoose.model('User').findByIdAndUpdate(req.params.id, { name, email, phone, role });
    res.redirect('/users');
  } catch (err) {
    res.status(500).send("Lỗi cập nhật người dùng");
  }
});





app.get('/api/users/search', async (req, res) => {
  try {
    const query = req.query.q;
    const excludeId = req.query.exclude;
    if (!query || query.trim() === '') return res.status(200).json([]);

    const users = await User.find({
      $and: [
        { _id: { $ne: excludeId } },
        { $or: [{ name: { $regex: query, $options: 'i' } }, { email: { $regex: query, $options: 'i' } }] }
      ]
    }).select('name email avatar');
    res.status(200).json(users);
  } catch (error) { res.status(500).json({ message: 'Lỗi server khi tìm kiếm' }); }
});

app.put('/api/users/change-password/:id', async (req, res) => {
  try {
    const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!bearer) return res.status(401).json({ message: 'Vui lòng đăng nhập.' });
    const decoded = jwt.verify(bearer, process.env.JWT_SECRET || 'secret123');
    if (String(decoded.id || decoded._id) !== req.params.id) return res.status(403).json({ message: 'Không thể đổi mật khẩu người khác.' });
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    if (!(await verifyPassword(oldPassword, user.password))) return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng!' });
    user.password = await hashPassword(newPassword);
    await user.save();
    res.status(200).json({ message: 'Đổi mật khẩu thành công!' });
  } catch (err) { res.status(err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' ? 401 : 500).json({ message: 'Không thể đổi mật khẩu. Vui lòng đăng nhập lại.' }); }
});

app.post('/api/users/forgot-password', async (req, res) => {
  res.status(410).json({ message: 'Vui lòng đặt lại mật khẩu bằng mã OTP.' });
});

app.post('/api/users/login', async (req, res) => {
  try {
    const { email, password, anonymousId } = req.body;
    const user = await User.findOne({ email: String(email || '').trim().toLowerCase() });
    if (!user || !(await verifyPassword(String(password || ''), user.password))) return res.status(401).json({ message: 'Sai email hoặc mật khẩu' });
    if (user.status === 'locked' || user.isBanned) {
      return res.status(403).json({ message: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ ban quản trị để được hỗ trợ.' });
    }
    if (!isHash(user.password)) {
      user.password = await hashPassword(password);
      await user.save();
    }
    const safe = sanitizeUser(user);
    const token = signUserToken(user);

    // Merge anonymous browsing events if anonymousId was passed
    if (anonymousId && typeof anonymousId === 'string') {
      setImmediate(() => {
        mergeUserIdentity(anonymousId, user._id).catch((e) => console.warn('Login merge warning:', e.message));
      });
    }

    res.status(200).json({ ...safe, token });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server khi đăng nhập: ' + err.message });
  }
});

app.post('/api/users/register', async (req, res) => {
  try {
    // 1. Strict Input Sanitization: Whitelist ONLY safe fields
    const { name, phone, address, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Điền đủ Họ tên, Email, Mật khẩu!' });

    // 2. Privilege Escalation Guard: Reject any attempt to pass Admin roles or privileges
    const requestedRole = req.body.role || req.body.roles;
    if (requestedRole && /(admin|quản trị|root|superuser)/i.test(String(requestedRole))) {
      return res.status(403).json({ message: 'Không được phép chỉ định vai trò Quản trị viên!' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) return res.status(400).json({ message: 'Email này đã được sử dụng!' });

    // 3. Force default safe role ('Khách hàng') and reset seller flags
    const newUser = new User({
      name: name.trim(),
      email: cleanEmail,
      password: await hashPassword(password),
      phone: phone ? phone.trim() : '',
      address: address ? address.trim() : '',
      role: 'Khách hàng', // Strictly forced safe default
      sellerStatus: 'none',
      isSeller: false
    });
    await newUser.save();

    trackServerEvent('signup', {
      userId: newUser._id,
      sessionId: req.headers['x-hh-sid'],
      anonymousId: req.headers['x-hh-aid'],
      props: { method: 'email' }
    });

    // Merge anonymous browsing events if anonymousId was passed
    if (req.body.anonymousId && typeof req.body.anonymousId === 'string') {
      setImmediate(() => {
        mergeUserIdentity(req.body.anonymousId, newUser._id).catch((e) => console.warn('Register merge warning:', e.message));
      });
    }

    const safe = sanitizeUser(newUser);
    res.status(201).json({ message: 'Đăng ký thành công', user: { ...safe, token: signUserToken(newUser) } });
  } catch (error) { res.status(500).json({ message: 'Lỗi server khi đăng ký' }); }
});

app.get('/api/users/profile', async (req, res) => {
  try {
    let userId = req.query.id || req.query.userId || req.headers['userid'];

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
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

app.put('/api/users/profile/:id', upload.single('avatar'), async (req, res) => {
  try {
    const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!bearer) return res.status(401).json({ message: 'Vui lòng đăng nhập.' });
    const decoded = jwt.verify(bearer, process.env.JWT_SECRET || 'secret123');
    if (String(decoded.id || decoded._id) !== req.params.id) return res.status(403).json({ message: 'Không thể sửa hồ sơ người khác.' });
    const allowed = ['name', 'phone', 'address', 'bio', 'cccd', 'username', 'taxId', 'gender', 'dob', 'avatarFrame', 'profileTitle'];
    const updateData = Object.fromEntries(allowed.filter(key => req.body[key] !== undefined).map(key => [key, req.body[key]]));
    if (req.file) updateData.avatar = req.file.path;
    const updatedUser = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-password');
    if (!updatedUser) return res.status(404).json({ message: 'Không tìm thấy người dùng.' });
    res.status(200).json(sanitizeUser(updatedUser));
  } catch (err) { res.status(err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' ? 401 : 500).json({ message: 'Không thể cập nhật hồ sơ. Vui lòng đăng nhập lại.' }); }
});

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

/** Lấy danh sách Banner Hero đang hoạt động cho trang chủ (fallback mặc định) */
app.get('/api/banners', async (req, res) => {
  return res.status(200).json(DEFAULT_HERO_BANNERS);
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
      let cleanCat = String(category).trim();

      // Khắc phục triệt để trường hợp URL bị cắt bởi ký tự '&' chưa encode
      if (req.query[' Phụ kiện'] !== undefined || req.query['Phụ kiện'] !== undefined) {
        if (cleanCat.includes('Điện thoại')) cleanCat = 'Điện thoại & Phụ kiện';
        else if (cleanCat.includes('Thời trang')) cleanCat = 'Thời trang & Phụ kiện';
        else if (cleanCat.includes('Xe cộ')) cleanCat = 'Xe cộ & Phụ tùng';
      }
      if (req.query[' Công nghệ'] !== undefined || req.query['Công nghệ'] !== undefined) {
        cleanCat = 'Điện tử & Công nghệ';
      }
      if (req.query[' Nội thất'] !== undefined || req.query['Nội thất'] !== undefined) {
        cleanCat = 'Đồ gia dụng & Nội thất';
      }
      if (req.query[' Bé'] !== undefined || req.query['Bé'] !== undefined) {
        cleanCat = 'Đồ chơi, Mẹ & Bé';
      }
      if (req.query[' Dã ngoại'] !== undefined || req.query['Dã ngoại'] !== undefined) {
        cleanCat = 'Thể thao & Dã ngoại';
      }
      if (req.query[' Đồ dùng'] !== undefined || req.query['Đồ dùng'] !== undefined) {
        cleanCat = 'Thú cưng & Đồ dùng';
      }

      const CATEGORY_MAP = {
        'Đồ điện tử': ['Điện tử & Công nghệ', 'Đồ điện tử'],
        'Điện tử': ['Điện tử & Công nghệ', 'Đồ điện tử'],
        'Điện tử & Công nghệ': ['Điện tử & Công nghệ'],
        'Điện tử - Công nghệ': ['Điện tử & Công nghệ'],
        'Laptop & Máy tính': ['Điện tử & Công nghệ'],
        'Điện thoại & Phụ kiện': ['Điện thoại & Phụ kiện'],
        'Điện thoại & Tablet': ['Điện thoại & Phụ kiện'],
        'Điện thoại': ['Điện thoại & Phụ kiện', 'Điện thoại'],
        'Xe cộ': ['Xe cộ & Phụ tùng', 'Xe cộ'],
        'Xe cộ & Phụ tùng': ['Xe cộ & Phụ tùng'],
        'Xe máy & Phương tiện': ['Xe cộ & Phụ tùng'],
        'Thời trang': ['Thời trang & Phụ kiện', 'Thời trang'],
        'Thời trang & Phụ kiện': ['Thời trang & Phụ kiện'],
        'Đồ gia dụng': ['Đồ gia dụng & Nội thất', 'Đồ gia dụng'],
        'Đồ gia dụng & Nội thất': ['Đồ gia dụng & Nội thất'],
        'Nội thất': ['Đồ gia dụng & Nội thất'],
        'Nhà cửa & Đời sống': ['Đồ gia dụng & Nội thất'],
        'Điện tử & Phụ kiện': ['Điện tử & Công nghệ', 'Điện thoại & Phụ kiện'],
        'Thể thao & Du lịch': ['Thể thao & Dã ngoại'],
        'Bất Động Sản': ['Bất Động Sản'],
        'Thú cưng': ['Thú cưng & Đồ dùng', 'Thú cưng'],
        'Thú cưng & Đồ dùng': ['Thú cưng & Đồ dùng'],
        'Đồ chơi': ['Đồ chơi, Mẹ & Bé', 'Đồ chơi'],
        'Đồ chơi, Mẹ': ['Đồ chơi, Mẹ & Bé', 'Đồ chơi'],
        'Mẹ & Bé': ['Đồ chơi, Mẹ & Bé'],
        'Đồ chơi, Mẹ & Bé': ['Đồ chơi, Mẹ & Bé'],
        'Thể thao': ['Thể thao & Dã ngoại', 'Thể thao'],
        'Dã ngoại': ['Thể thao & Dã ngoại'],
        'Thể thao & Dã ngoại': ['Thể thao & Dã ngoại']
      };
      const mapped = CATEGORY_MAP[cleanCat] || [cleanCat];
      query.category = mapped.length === 1 ? mapped[0] : { $in: mapped };
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

    let sortOption = { createdAt: -1, _id: -1 };
    if (sort === 'price-asc') sortOption = { price: 1, _id: -1 };
    if (sort === 'price-desc') sortOption = { price: -1, _id: -1 };

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
    console.error("Lỗi lọc bài đăng (/api/posts):", error.message);
    res.status(200).json([]);
  }
});

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
    if (updatedPost) await refreshProductSearch(updatedPost, Boolean(req.files?.length));
    res.status(200).json(updatedPost);
  } catch (error) { res.status(500).json({ message: "Lỗi Server: " + error.message }); }
});

// ==========================================
// VNPAY CONFIGURATION & HELPERS
// ==========================================
const vnp_TmnCode = process.env.VNP_TMNCODE || "IYQYHLU4";
const vnp_HashSecret = process.env.VNP_HASHSECRET || "BBZJECZFZLUQSVOBCVTQSPDPYQZKGUEB";
const vnp_Url = process.env.VNP_URL || "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
const vnp_ReturnUrl = process.env.VNP_RETURNURL || "http://localhost:3000/haipay/return";

function sortObject(obj) {
  let sorted = {};
  let str = [];
  let key;
  for (key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      str.push(encodeURIComponent(key));
    }
  }
  str.sort();
  for (key = 0; key < str.length; key++) {
    sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, "+");
  }
  return sorted;
}

function buildVnpayPaymentUrl({ orderId, amount, ipAddr = '127.0.0.1', orderInfo, returnUrl }) {
  return buildSignedVnpayPaymentUrl({ orderId, amount, ipAddr, orderInfo, returnUrl });
}

// ==========================================
// CHECKOUT CONTROLLER (POST /api/users/:userId/checkout & /api/checkout)
// ==========================================
app.post('/api/users/:userId/checkout', protect, (req, res, next) => {
  if (!req.user._id.equals(req.params.userId) && req.user.role !== 'Admin') {
    return res.status(403).json({ message: 'Không thể tiến hành đặt hàng thay cho tài khoản khác' });
  }
  req.body.userId = req.params.userId;
  return processCheckout(req, res, next);
});

app.get('/api/users/public-profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(404).json({ message: "ID không hợp lệ" });
    }

    const user = await User.findById(userId).select('-password');
    if (!user) return res.status(404).json({ message: "Không tìm thấy user" });

    let followersCount = 0;
    let followingCount = 0;
    try {
      followersCount = await Follow.countDocuments({ following: userId });
      followingCount = await Follow.countDocuments({ follower: userId });
    } catch (err) { console.log("Lỗi đếm follow:", err.message); }

    const posts = await Post.find({ author: userId }).sort({ createdAt: -1 });
    const reviews = await Review.find({ seller: userId }).populate('buyer', 'name avatar');
    let avgRating = reviews.length > 0 ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) : 5.0;

    const conversationsReceived = await Message.distinct('sender', { receiver: userId });
    let repliedCount = 0;
    for (const senderId of conversationsReceived) {
      const hasReplied = await Message.exists({ sender: userId, receiver: senderId });
      if (hasReplied) repliedCount++;
    }
    const responseRate = conversationsReceived.length > 0 ? Math.round((repliedCount / conversationsReceived.length) * 100) : 100;

    return res.status(200).json({ user, posts, reviews, followersCount, followingCount, avgRating, responseRate });
  } catch (error) {
    console.error("Lỗi sập Profile:", error.message);

    return res.status(200).json({ user: {}, posts: [], reviews: [], followersCount: 0, followingCount: 0, avgRating: 5 });
  }
});

app.post('/api/reviews', async (req, res) => {
  try {
    const { seller, buyer, rating, comment, orderId } = req.body;


    const order = await Order.findById(orderId);
    if (order.isReviewed) return res.status(400).json({ message: "Đơn hàng này đã được đánh giá rồi!" });


    const newReview = new Review({ seller, buyer, rating, comment, orderId });
    await newReview.save();


    order.isReviewed = true;
    await order.save();

    res.status(200).json({ message: "Đánh giá thành công!" });
  } catch (error) { res.status(500).json({ error: "Lỗi gửi đánh giá" }); }
});

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
    console.error("Lỗi API follow-status:", e.message);

    return res.status(200).json({ isFollowing: false });
  }
});

app.get('/api/notifications', async (req, res) => {
  try {
    const { role, scope, type, limit } = req.query;

    // 1. Admin portal scope: Return ONLY admin/system-level notifications
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
        const decoded = jwt.verify(req.headers.authorization.split(' ')[1], process.env.JWT_SECRET || 'secret123');
        userId = decoded.id || decoded._id;
      } catch (e) {}
    }

    if (!userId) {
      return res.json({ notifications: [], unreadCount: 0, unreadByType: {} });
    }

    const userObjectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;

    // Base query for personal user notifications (strictly exclude admin notifications)
    const baseQuery = {
      $or: [
        { userId: userObjectId },
        { user: userObjectId },
        { shopId: userObjectId }
      ],
      targetRole: { $ne: 'admin' },
      recipientRole: { $ne: 'admin' }
    };

    // Filter by role context if requested
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

    // Optional type filter
    if (type) {
      baseQuery.type = type;
    }

    const maxLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
    const notifs = await Notification.find(baseQuery).sort({ createdAt: -1 }).limit(maxLimit);
    const unreadCount = await Notification.countDocuments({ ...baseQuery, isRead: false });

    // Aggregate unread notifications grouped by type for sidebar badges
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
    res.status(500).json({ error: "Lỗi lấy danh sách thông báo: " + error.message });
  }
});

app.put('/api/notifications/:id/read', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "ID thông báo không hợp lệ" });
    }
    const updated = await Notification.findByIdAndUpdate(req.params.id, { isRead: true }, { new: true });
    res.json({ success: true, notification: updated });
  } catch (error) {
    res.status(500).json({ error: "Lỗi cập nhật thông báo" });
  }
});

app.put('/api/notifications/read-all', async (req, res) => {
  try {
    let userId = req.headers['userid'] || req.body.userId || req.query.userId;
    if (!userId && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(req.headers.authorization.split(' ')[1], process.env.JWT_SECRET || 'secret123');
        userId = decoded.id || decoded._id;
      } catch (e) {}
    }

    if (!userId) {
      return res.status(400).json({ error: "Thiếu userId" });
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
    res.status(500).json({ error: "Lỗi cập nhật tất cả thông báo" });
  }
});

app.put('/api/notifications/read-by-type', async (req, res) => {
  try {
    let userId = req.headers['userid'] || req.body.userId || req.query.userId;
    if (!userId && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(req.headers.authorization.split(' ')[1], process.env.JWT_SECRET || 'secret123');
        userId = decoded.id || decoded._id;
      } catch (e) {}
    }

    const type = req.body.type || req.query.type;
    if (!userId || !type) {
      return res.status(400).json({ error: "Thiếu userId hoặc type" });
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
    res.status(500).json({ error: "Lỗi cập nhật thông báo theo loại" });
  }
});
// ------------------------------------------


app.get('/api/users/:userId/transactions', async (req, res) => {
  try {
    const trans = await Transaction.find({ user: req.params.userId }).sort({ createdAt: -1 });
    res.json(trans);
  } catch (error) { res.status(500).json({ message: 'Lỗi lấy lịch sử' }); }
});

app.post('/api/users/:userId/withdraw', async (req, res) => {
  try {
    const { amount, bankName, bankAccount } = req.body;
    const user = await User.findById(req.params.userId);

    if (!user) return res.status(404).json({ message: 'Không tìm thấy user' });
    if (amount < 50000) return res.status(400).json({ message: 'Số tiền rút tối thiểu là 50.000đ!' });
    if (user.walletBalance < amount) return res.status(400).json({ message: 'Số dư ví không đủ để rút!' });

    user.walletBalance -= amount;
    await user.save();

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

    res.json({ message: "Đã gửi báo cáo thành công!" });
  } catch (e) { res.status(500).json({ error: "Lỗi" }); }
});

app.post('/api/users/follow', async (req, res) => {
  try {
    const { followerId, followingId } = req.body;
    if (followerId === followingId) return res.status(400).json({ message: "Không thể tự theo dõi chính mình!" });

    const existingFollow = await Follow.findOne({ follower: followerId, following: followingId });

    if (existingFollow) {
      await Follow.findByIdAndDelete(existingFollow._id);
      return res.json({ message: "Đã bỏ theo dõi", isFollowing: false });
    } else {
      await Follow.create({ follower: followerId, following: followingId });

      await UserNotification.create({
        user: followingId,
        title: '👤 Có người theo dõi mới!',
        message: `Một người dùng vừa bắt đầu theo dõi bạn.`,
        link: `/public-profile/${followerId}`
      });
      return res.json({ message: "Đã theo dõi", isFollowing: true });
    }
  } catch (e) { res.status(500).json({ error: "Lỗi hệ thống" }); }
});

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
    console.error("Lỗi get follow list:", e.message);

    res.status(200).json([]);
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy user' });
    res.status(200).json(sanitizeUser(user));
  } catch (err) { res.status(500).json({ message: 'Lỗi server' }); }
});






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

    const current = canonicalStatus(order.status);
    if (current === 'Cancelled') return res.status(400).json({ message: 'Đơn này đã bị hủy từ trước rồi!' });
    if (['Shipped', 'Delivered', 'Completed'].includes(current)) {
      return res.status(400).json({ message: 'Đơn hàng đang giao hoặc đã hoàn thành, không thể hủy!' });
    }

    if (isEscrow(order) || order.paymentStatus === 'escrow') {
      await User.findByIdAndUpdate(orderBuyerId(order), {
        $inc: { walletBalance: order.totalPrice }
      });
      const sellerIdRef = orderSellerId(order);
      if (sellerIdRef) {
        await User.findByIdAndUpdate(sellerIdRef, {
          $inc: { pendingBalance: -(order.totalPrice * 0.95) }
        });
      }
      order.paymentStatus = 'refunded';
    }

    const qtyByProduct = {};
    (order.orderItems || []).forEach((item) => {
      if (item.productId) qtyByProduct[item.productId.toString()] = item.quantity || 1;
    });
    for (let postId of (order.items || [])) {
      const post = await Post.findById(postId);
      if (post) {
        const add = qtyByProduct[postId.toString()] || 1;
        const nextStock = (post.stockQuantity ?? post.quantity ?? 0) + add;
        post.stockQuantity = nextStock;
        post.quantity = nextStock;
        if (post.status === 'out_of_stock' || post.status === 'SOLD') post.status = 'active';
        await post.save();
      }
    }

    order.status = 'Cancelled';
    order.cancelledAt = new Date();
    await order.save();

    res.status(200).json({ message: '✅ Đã hủy đơn, hoàn tiền vào ví (nếu có) và trả hàng lại vào kho thành công!' });
  } catch (error) {
    console.error("Lỗi hủy đơn:", error);
    res.status(500).json({ message: 'Lỗi hệ thống khi hủy đơn' });
  }
});


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

app.post('/api/users/favorites', async (req, res) => {
  try {
    const user = await User.findById(req.body.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.favorites) user.favorites = [];
    const postIdStr = req.body.postId.toString();
    const index = user.favorites.findIndex(id => id.toString() === postIdStr);

    let isAdded = false;
    if (index === -1) {
      user.favorites.push(req.body.postId);
      isAdded = true;
    } else {
      user.favorites.splice(index, 1);
    }

    await user.save();

    // Server-side favorite event tracking
    try {
      recordServerEvent({
        userId: user._id,
        type: isAdded ? 'favorite_add' : 'favorite_remove',
        productId: req.body.postId,
        source: 'favorites'
      });
    } catch (e) {}

    res.status(200).json({ message: 'Ok', favorited: isAdded });
  } catch (error) { res.status(500).json({ error: 'Lỗi' }); }
});

app.get('/api/users/favorites/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).populate('favorites');
    res.status(200).json(user ? user.favorites : []);
  } catch (error) { res.status(200).json([]); }
});

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

    // Check Auto-Approve setting from GlobalSetting
    let isAutoApprove = false;
    try {
      const Settings = require('./models/Settings');
      const setting = await Settings.findOne();
      isAutoApprove = setting && setting.autoApprovePosts === true;
    } catch(e) {}

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

    await refreshProductSearch(newPost);

    // Trigger 1: When a user creates a new Product/Post (and auto-approve is false), automatically create a notification for Admins
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
    console.error("Lỗi đăng sản phẩm:", error);
    res.status(500).json({ message: error.message || 'Lỗi server khi tạo sản phẩm' });
  }
});

app.get('/api/posts/user/:userId', async (req, res) => {
  try {
    const posts = await Post.find({
      $or: [{ author: req.params.userId }, { sellerId: req.params.userId }]
    }).sort({ createdAt: -1 });
    res.status(200).json(posts);
  } catch (error) { res.status(500).json({ message: 'Lỗi server khi lấy tin cá nhân' }); }
});

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

app.delete('/api/users/cart/clear/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (user) { user.cart = []; await user.save(); }
    res.status(200).json([]);
  } catch (error) { res.status(500).json({ message: "Lỗi Server" }); }
});

app.delete('/api/users/cart/:userId/:postId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: "Không tìm thấy user" });
    user.cart = user.cart.filter(item => item.product && item.product.toString() !== req.params.postId);
    await user.save();

    // Server-side cart event tracking
    try {
      recordServerEvent({
        userId: user._id,
        type: 'cart_add',
        productId: postId,
        source: 'cart',
        meta: { quantity }
      });
    } catch (e) {}

    res.status(200).json(user.cart);
  } catch (error) { res.status(500).json({ message: "Lỗi Server" }); }
});

app.post('/api/users/cart', async (req, res) => {
  try {
    const { userId, postId, quantity } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "Không tìm thấy người dùng" });
    if (!user.cart) user.cart = [];

    const itemIndex = user.cart.findIndex(item => item.product && item.product.toString() === postId);
    if (itemIndex > -1) {
      user.cart[itemIndex].quantity += quantity;
    } else {
      user.cart.push({ product: postId, quantity });
    }
    await user.save();

    // Server-side cart event tracking
    try {
      recordServerEvent({
        userId: user._id,
        type: 'cart_add',
        productId: postId,
        source: 'cart',
        meta: { quantity }
      });
    } catch (e) {}

    res.status(200).json(user.cart);
  } catch (error) { res.status(500).json({ message: "Lỗi Server" }); }
});







// Mount /api/messages router (A3: bắt buộc JWT protectStrict, xóa clear-all)
app.use('/api/messages', createMessagesRouter({ io, sendNotification }));

// Socket.IO connection & presence được quản lý tập trung tại backend/socket/index.js (initSocket)

const STANDARD_CATEGORIES = [
  {
    name: 'Thú cưng & Đồ dùng',
    icon: '🐾',
    image: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=200&auto=format&fit=crop',
    description: 'Chó, mèo, rùa cảnh, thức ăn hạt, pate, phụ kiện chăm sóc'
  },
  {
    name: 'Điện thoại & Phụ kiện',
    icon: '📱',
    image: 'https://images.unsplash.com/photo-1512054502232-10a0a035d672?w=300&auto=format&fit=crop',
    description: 'Smartphone, máy tính bảng, ốp lưng, tai nghe, sạc cáp'
  },
  {
    name: 'Điện tử & Công nghệ',
    icon: '💻',
    image: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=200&auto=format&fit=crop',
    description: 'Laptop, máy tính bàn, máy ảnh, loa, màn hình'
  },
  {
    name: 'Xe cộ & Phụ tùng',
    icon: '🚲',
    image: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=200&auto=format&fit=crop',
    description: 'Xe đạp địa hình, xe đạp điện, xe máy, phụ tùng xe'
  },
  {
    name: 'Thời trang & Phụ kiện',
    icon: '👕',
    image: 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=200&auto=format&fit=crop',
    description: 'Quần áo nam nữ, giày dép, túi xách, đồng hồ'
  },
  {
    name: 'Đồ gia dụng & Nội thất',
    icon: '🛋️',
    image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=200&auto=format&fit=crop',
    description: 'Bàn ghế, tủ quần áo, thiết bị nhà bếp, đồ sinh hoạt'
  },
  {
    name: 'Đồ chơi, Mẹ & Bé',
    icon: '🧸',
    image: 'https://images.unsplash.com/photo-1558060370-d644479cb6f7?w=200&auto=format&fit=crop',
    description: 'Labubu, mô hình sưu tầm, xe đẩy, đồ chơi phát triển'
  },
  {
    name: 'Thể thao & Dã ngoại',
    icon: '⚽',
    image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=300&auto=format&fit=crop',
    description: 'Dụng cụ thể hình, cắm trại, nhạc cụ'
  },
  { name: 'Bất Động Sản', icon: '🏠', description: 'Nhà, căn hộ, đất và biệt thự' },
  { name: 'Sách & Văn phòng phẩm', icon: '📚', description: 'Sách, bút và dụng cụ học tập' },
  { name: 'Thực phẩm & Đồ uống', icon: '🍬', description: 'Thực phẩm, bánh kẹo và đồ uống' },
  { name: 'Linh tinh', icon: '📦', description: 'Các mặt hàng khác chưa thuộc danh mục chuyên biệt' },
  { name: 'Sức khỏe & Làm đẹp', icon: '💆', description: 'Chăm sóc sức khỏe, mỹ phẩm và làm đẹp' }
].map(category => ({ ...category, _id: `category:${category.name}` }));

app.get('/api/categories', async (req, res) => {
  try {
    const categories = await Category.find().lean();
    if (!categories || categories.length === 0) {
      Category.insertMany(STANDARD_CATEGORIES.map(c => ({
        name: c.name,
        image: c.image,
        description: c.description
      }))).catch(() => {});
      return res.status(200).json(STANDARD_CATEGORIES);
    }
    // Keep the existing display order and include categories added in Atlas.
    const standardNames = new Set(STANDARD_CATEGORIES.map(category => category.name));
    const enriched = STANDARD_CATEGORIES.map(sc => {
      const match = categories.find(c => c.name === sc.name);
      if (match) {
        return {
          ...match,
          icon: sc.icon
        };
      }
      return sc;
    });
    res.status(200).json([...enriched, ...categories.filter(category => !standardNames.has(category.name))]);
  } catch (error) {
    res.status(200).json(STANDARD_CATEGORIES);
  }
});



app.post('/api/haipay/deposit', async (req, res) => {
  try {
    const { amount, userId } = req.body;
    let date = new Date();
    let createDate = formatVnpayDate(date);
    let txnRef = `NAP_${userId}_${createDate}`;

    let vnp_Params = {
      'vnp_Version': '2.1.0', 'vnp_Command': 'pay', 'vnp_TmnCode': vnp_TmnCode,
      'vnp_Locale': 'vn', 'vnp_CurrCode': 'VND', 'vnp_TxnRef': txnRef,
      'vnp_OrderInfo': 'Nap tien vao vi HaiPay cho User ' + userId,
      'vnp_OrderType': 'topup', 'vnp_Amount': amount * 100,
      'vnp_ReturnUrl': vnp_ReturnUrl,
      'vnp_IpAddr': req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '127.0.0.1',
      'vnp_CreateDate': createDate,
      'vnp_ExpireDate': formatVnpayDate(new Date(date.getTime() + 15 * 60 * 1000))
    };

    vnp_Params = sortObject(vnp_Params);
    let signData = querystring.stringify(vnp_Params, { encode: false });
    let hmac = crypto.createHmac("sha512", vnp_HashSecret);
    let signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");
    vnp_Params['vnp_SecureHash'] = signed;

    let paymentUrl = vnp_Url + '?' + querystring.stringify(vnp_Params, { encode: false });
    res.status(200).json({ paymentUrl });
  } catch (error) { res.status(500).json({ error: 'Lỗi nạp tiền!' }); }
});

app.post('/api/haipay/verify', async (req, res) => {
  try {
    const { txnRef, responseCode, amount, vnp_Params, secureHash } = req.body;

    if (!verifyVnpayChecksumStrict(vnp_Params, secureHash) ||
        vnp_Params.vnp_TmnCode !== vnp_TmnCode || vnp_Params.vnp_TxnRef !== txnRef ||
        vnp_Params.vnp_ResponseCode !== responseCode || vnp_Params.vnp_Amount !== String(amount) ||
        vnp_Params.vnp_TransactionStatus !== '00') {
      return res.status(400).json({ message: 'Kết quả VNPAY không hợp lệ.' });
    }

    if (responseCode === '00') {
      const parts = txnRef.split('_');
      const userId = parts[1];
      const actualAmount = parseInt(amount || req.body.amount) / 100;

      // Idempotency Check: Prevent duplicate credit via replay attack
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
    res.status(200).json({ paymentUrl: paymentUrl });
  } catch (error) {
    console.error('VNPAY create_payment_url Error:', error);
    res.status(500).json({ error: 'Lỗi tạo link VNPay' });
  }
});

app.post('/api/vnpay/verify', async (req, res) => {
  try {
    const { orderId, responseCode, vnp_Params, secureHash } = req.body;
    if (!orderId) return res.status(400).json({ message: 'Thiếu mã đơn hàng!' });

    if (!verifyVnpayChecksumStrict(vnp_Params, secureHash) ||
        vnp_Params.vnp_TmnCode !== vnp_TmnCode || vnp_Params.vnp_TxnRef !== orderId ||
        vnp_Params.vnp_ResponseCode !== responseCode) {
      return res.status(400).json({ message: 'Kết quả VNPAY không hợp lệ.' });
    }

    // 1. Check if orderId matches PaymentSession (Multi-Vendor Checkout parentOrderId)
    const session = await PaymentSession.findOne({ parentOrderId: orderId });
    if (session) {
      if (session.method !== 'VNPAY' || String(session.amount * 100) !== vnp_Params.vnp_Amount) {
        return res.status(400).json({ message: 'Số tiền hoặc phương thức thanh toán không khớp đơn hàng.' });
      }
      if (responseCode === '00' && vnp_Params.vnp_TransactionStatus === '00') {
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
        for (const oid of session.orderIds || []) {
          trackServerEvent('payment_failed', { userId: session.buyer, props: { orderId: oid, method: 'VNPAY' } });
          trackServerEvent('order_cancelled', { userId: session.buyer, props: { orderId: oid, by: 'system' } });
        }
        return res.status(400).json({ message: 'Giao dịch thất bại hoặc đã bị khách hủy!' });
      }
    }

    // 2. Legacy fallback for single order
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

    if (String(order.totalPrice * 100) !== vnp_Params.vnp_Amount || order.paymentMethod !== 'VNPAY') {
      return res.status(400).json({ message: 'Số tiền hoặc phương thức thanh toán không khớp đơn hàng.' });
    }
    if (responseCode === '00' && vnp_Params.vnp_TransactionStatus === '00') {
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
    console.error("Lỗi Verify VNPay:", error);
    res.status(500).json({ error: 'Lỗi hệ thống khi xác nhận thanh toán: ' + error.message });
  }
});

app.get('/api/vnpay/vnpay_ipn', async (req, res) => {
  try {
    const vnp_Params = { ...req.query };
    const orderId = vnp_Params.vnp_TxnRef;
    const rspCode = vnp_Params.vnp_ResponseCode;

    if (!verifyVnpayChecksumStrict(vnp_Params, vnp_Params.vnp_SecureHash) || vnp_Params.vnp_TmnCode !== vnp_TmnCode) {
      return res.status(200).json({ RspCode: '97', Message: 'Fail Checksum' });
    }

    if (rspCode === '00' && vnp_Params.vnp_TransactionStatus === '00') {
        if (orderId && orderId.startsWith('NAP_')) {
          const parts = orderId.split('_');
          const userId = parts[1];
          const amount = parseInt(vnp_Params['vnp_Amount']) / 100;

          // Idempotency Check: Prevent duplicate credit via webhook retry/replay attack
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
                console.error("Lỗi ghi nhận Transaction IPN:", dupErr);
              }
            }
          }
        } else if (orderId) {
          // Check if parentOrderId matches PaymentSession
          const session = await PaymentSession.findOne({ parentOrderId: orderId });
          if (session) {
            if (session.method !== 'VNPAY' || String(session.amount * 100) !== vnp_Params.vnp_Amount) {
              return res.status(200).json({ RspCode: '04', Message: 'Invalid amount or method' });
            }
            await settlePaymentSession(orderId, {
              gatewayPayload: vnp_Params,
              paymentMethod: 'VNPAY'
            });
          } else if (mongoose.isValidObjectId(orderId)) {
            const order = await Order.findById(orderId);
            if (order && order.paymentStatus !== 'escrow') {
              if (order.paymentMethod !== 'VNPAY' || String(order.totalPrice * 100) !== vnp_Params.vnp_Amount) {
                return res.status(200).json({ RspCode: '04', Message: 'Invalid amount or method' });
              }
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
  } catch (error) {
    res.status(200).json({ RspCode: '99', Message: 'Unknown error' });
  }
});


const bcrypt = require('bcryptjs');
const OtpToken = require('./models/OtpToken');
const { sendOtpEmail } = require('./utils/otpService');

app.post('/api/users/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Vui lòng cung cấp email!' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const user = await mongoose.model('User').findOne({ email: cleanEmail });

    if (!user) return res.status(404).json({ message: 'Email này chưa đăng ký tài khoản!' });

    // Generate cryptographically secure 6-digit numeric OTP
    const generatedOtp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(generatedOtp, 10);

    // Invalidate existing reset OTP tokens for this email
    await OtpToken.deleteMany({ identifier: cleanEmail, purpose: 'RESET_PASSWORD' });

    // Store hashed OTP in MongoDB with 5-minute TTL
    await OtpToken.create({
      identifier: cleanEmail,
      otpHash,
      purpose: 'RESET_PASSWORD',
      attempts: 0
    });

    // Dispatch OTP securely via server-side mailer (never returned in HTTP response)
    await sendOtpEmail({ email: cleanEmail, otp: generatedOtp, purpose: 'RESET_PASSWORD' });

    res.json({ success: true, message: 'Mã xác thực OTP đã được gửi đến email của bạn!' });
  } catch (err) {
    console.error('Lỗi khi gửi OTP đặt lại mật khẩu:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi gửi OTP!' });
  }
});

app.post('/api/users/reset-password-otp', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: 'Vui lòng cung cấp đầy đủ email, mã OTP và mật khẩu mới!' });
    }
    const cleanEmail = email.trim().toLowerCase();

    // Find active token in MongoDB
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

    // Securely hash new password before persistence
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    // Consume token immediately after successful reset
    await OtpToken.deleteOne({ _id: tokenRecord._id });

    res.json({ success: true, message: 'Đổi mật khẩu thành công!' });
  } catch (err) {
    console.error('Lỗi khi đặt lại mật khẩu bằng OTP:', err);
    res.status(500).json({ message: 'Lỗi hệ thống khi đặt lại mật khẩu!' });
  }
});

// --- API CHATBOT AI (LM STUDIO & MONGODB) ---
async function supportCustomer(req, res, next) {
  try {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return res.status(401).json({ message: 'Vui lòng đăng nhập để liên hệ tư vấn.' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
    const user = await User.findById(decoded.id || decoded._id).select('_id');
    if (!user) return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ.' });
    req.supportCustomerId = user._id;
    next();
  } catch { res.status(401).json({ message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' }); }
}

app.get('/api/support/conversation', supportCustomer, async (req, res) => {
  try {
    const conversation = await SupportConversation.findOne({ customer: req.supportCustomerId }).lean();
    res.json(conversation || { status: 'none', messages: [] });
  } catch { res.status(500).json({ message: 'Không tải được hội thoại hỗ trợ.' }); }
});

app.post('/api/support/start', supportCustomer, async (req, res) => {
  try {
    const conversation = await SupportConversation.findOneAndUpdate(
      { customer: req.supportCustomerId },
      { $setOnInsert: { customer: req.supportCustomerId, status: 'pending', unreadCount: 1, messages: [] } },
      { new: true, upsert: true, runValidators: true }
    );
    res.json(conversation);
  } catch { res.status(500).json({ message: 'Không kết nối được tư vấn viên.' }); }
});

app.post('/api/support/messages', supportCustomer, async (req, res) => {
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
  if (!content || content.length > 2000) return res.status(400).json({ message: 'Tin nhắn phải có từ 1 đến 2000 ký tự.' });
  try {
    const conversation = await SupportConversation.findOneAndUpdate(
      { customer: req.supportCustomerId },
      { $setOnInsert: { customer: req.supportCustomerId, status: 'pending' },
        $push: { messages: { sender: 'customer', content } }, $inc: { unreadCount: 1 } },
      { new: true, upsert: true, runValidators: true }
    );
    res.status(201).json(conversation);
  } catch { res.status(500).json({ message: 'Không gửi được yêu cầu hỗ trợ.' }); }
});
const { processChatbot, processImageSearch } = require('./services/chatbotService');

app.post('/api/chatbot/ask', async (req, res) => {
  try {
    const { message, history, image, userId, anonymousId } = req.body;
    if (image) {
      return res.status(400).json({ error: 'Vui lòng dùng mục Tìm kiếm bằng hình ảnh trên header.', redirectTo: '/image-search' });
    }
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Vui lòng cung cấp tin nhắn' });
    }

    // Load UserInterestProfile to personalize ambiguous searches
    let profile = null;
    try {
      const UserInterestProfile = require('./models/UserInterestProfile');
      const orQueries = [];
      if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        orQueries.push({ userId: new mongoose.Types.ObjectId(userId) });
      }
      if (anonymousId && typeof anonymousId === 'string') {
        orQueries.push({ anonymousId: anonymousId.trim() });
      }
      if (orQueries.length > 0) {
        profile = await UserInterestProfile.findOne({ $or: orQueries }).lean();
      }
    } catch (e) {}

    const result = await processChatbot(message, history, null, profile);
    res.json(result);
  } catch (error) {
    console.error("Lỗi Chatbot:", error);
    res.status(500).json({
      error: 'Không thể xử lý yêu cầu. Hãy kiểm tra Qwen3-VL, BGE-M3 và LM Studio ở cổng 1235.'
    });
  }
});

app.post('/api/image-search/search', async (req, res) => {
  try {
    const { image, message } = req.body;
    if (typeof image !== 'string' || !/^data:image\/(?:jpeg|png|webp);base64,/i.test(image) || image.length > 7_000_000) {
      return res.status(400).json({ error: 'Vui lòng chọn ảnh JPG, PNG hoặc WebP không quá 5 MB' });
    }
    res.json(await processImageSearch(image, message));
  } catch (error) {
    console.error('Lỗi tìm kiếm bằng hình ảnh:', error);
    res.status(500).json({ error: 'Không thể tìm kiếm bằng hình ảnh. Hãy kiểm tra LM Studio rồi thử lại.' });
  }
});
const PORT = process.env.PORT || 4000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Hệ thống HaiHand đã sẵn sàng tại port ${PORT}`));
