require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const moment = require('moment');
const querystring = require('qs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "http://localhost:3000", 
  methods: ["GET", "POST", "PUT", "DELETE"] },
  credentials: true
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../admin/views'));

// 🚀 IMPORT ĐỒ NGHỀ CLOUDINARY
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// 🚀 CẤU HÌNH TÀI KHOẢN
cloudinary.config({
  cloud_name: 'dbznseukv',
  api_key: '184464981981638',
  api_secret: '-UKbuZxsQKgmKL3-p47oQDQJDrc'
});

// 🚀 CẤU HÌNH KHO CHỨA
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'HaiHand_Images',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    transformation: [{ width: 800, height: 800, crop: 'fill' }]
  }
});

const upload = multer({ storage: storage });

const DB_URL = process.env.MONGODB_URI;
 mongoose.connect(DB_URL)
  .then(() => console.log('✅ Đã kết nối MongoDB Atlas thành công!'))
  .catch(err => {
    console.error('❌ Lỗi kết nối DB:', err.message);
    process.exit(1); // Cho sập luôn để mình biết là nó không đọc được link
  });

// ==========================================
// 2. ĐỊNH NGHĨA DATABASE
// ==========================================
const Category = mongoose.models.Category || mongoose.model('Category', new mongoose.Schema({
  name: { type: String, required: true },
  image: { type: String, required: true },
  description: { type: String, default: '' }
}));

// 🚀 Đã thêm `mongoose.models.Post ||` để chống lỗi MissingSchema
const Post = mongoose.models.Post || mongoose.model('Post', new mongoose.Schema({
  title: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, default: 1 },
  category: { type: String, required: true },
  location: { type: String, required: true },
  description: { type: String, required: true },
  images: [{ type: String }],
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  details: { type: Map, of: String },
  status: { type: String, default: 'PENDING' }
}, { timestamps: true }));

const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  avatar: { type: String, default: '' },
  bio: { type: String, default: '' },
  cccd: { type: String, default: '' },
  gender: { type: String, default: '' },
  favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
  username: { type: String, sparse: true },
  role: { type: String, default: 'Khách hàng' },
  isVerified: { type: Boolean, default: false },
  cart: [{
      product: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
      quantity: { type: Number, default: 1 }
  }],
  walletBalance: { type: Number, default: 0 },   
  pendingBalance: { type: Number, default: 0 },  
  bankInfo: {
    name: { type: String, default: '' },         
    accountNumber: { type: String, default: '' }, 
    accountName: { type: String, default: '' }    
  }
}, { timestamps: true }));

const Order = mongoose.models.Order || mongoose.model('Order', new mongoose.Schema({
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
  totalPrice: { type: Number, required: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  status: { type: String, default: 'Chờ xác nhận' } ,
  isReviewed: { type: Boolean, default: false }
}, { timestamps: true }));

const Message = mongoose.models.Message || mongoose.model('Message', new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  content: String,
  images: [String],
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  isRead: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
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

const Notification = mongoose.models.Notification || mongoose.model('Notification', new mongoose.Schema({
    title: String,
    message: String,
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    isRead: { type: Boolean, default: false }
}, { timestamps: true }));

const UserNotification = mongoose.models.UserNotification || mongoose.model('UserNotification', new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    title: String,
    message: String,
    link: String,
    isRead: { type: Boolean, default: false }
}, { timestamps: true }));

const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['Nạp tiền', 'Rút tiền', 'Giải ngân', 'Hoàn tiền'], required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['Thành công', 'Đang xử lý', 'Thất bại'], default: 'Thành công' },
    description: String,
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

// ==========================================
// 3. API DÀNH CHO ADMIN (EJS)
// ==========================================
const session = require('express-session');
app.use(session({
  secret: 'khoa-bi-mat-haihand',
  resave: false,
  saveUninitialized: false
}));

const requireAdmin = (req, res, next) => {
  if (req.session.adminId) next(); 
  else res.redirect('/login'); 
};

app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const admin = await User.findOne({ username, password, role: 'Admin' });
  if (admin) {
    req.session.adminId = admin._id; 
    res.redirect('/dashboard');
  } else {
    res.render('login', { error: 'Tài khoản không tồn tại hoặc bạn không phải Admin!' });
  }
});

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

app.get('/logout', (req, res) => {
  req.session.destroy(); 
  res.redirect('/login');
});

app.get('/', (req, res) => res.redirect('/dashboard'));

app.get('/dashboard', requireAdmin, async (req, res) => {
  try {
    const postCount = await Post.countDocuments();
    const userCount = await User.countDocuments();
    const pendingCount = await Post.countDocuments({ status: 'PENDING' });
    
    // 🚀 Lấy doanh thu thực tế từ bảng Revenue
    const revenues = await Revenue.find().sort({ createdAt: -1 });
    const totalRevenue = revenues.reduce((sum, item) => sum + item.commissionAmount, 0);

    // Lấy 5 giao dịch thu phí gần nhất để hiện lên bảng Dashboard
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
        recentRevenues, // 🚀 Gửi dữ liệu này sang EJS
        active: 'dashboard' 
    });
  } catch (error) { 
    res.render('dashboard', { stats: { postCount: 0, userCount: 0, pendingCount: 0, revenue: 0 }, recentPending: [], recentUsers: [], recentRevenues: [] }); 
  }
});

app.get('/admin/withdrawals', async (req, res) => {
    try {
        // Tạm thời truyền mảng rỗng nếu bác chưa có bảng Transaction, hoặc lấy dữ liệu thật
        // const withdrawals = await Transaction.find({ type: 'withdraw', status: 'pending' }).populate('user');
        
        // Đoạn này là quan trọng nhất: Gọi file withdrawals.ejs ra để hiển thị
        res.render('withdrawals', { 
            withdrawals: [], // Chỗ này sau bác thay bằng biến lấy từ database nhé
            active: 'withdrawals'
        });
    } catch (error) {
        console.error("Lỗi khi tải trang quản lý rút tiền:", error);
        res.status(500).send("Đã xảy ra lỗi trên server");
    }
});

app.get('/admin/chat', requireAdmin, (req, res) => {
    res.render('admin-chat', { active: 'chat' });
});

app.get('/users', requireAdmin, async (req, res) => {
  try {
    const searchQuery = req.query.q || '';
    let query = {};
    if (searchQuery) query = { $or: [{ name: { $regex: searchQuery, $options: 'i' } }, { email: { $regex: searchQuery, $options: 'i' } }] };
    const users = await User.find(query).sort({ createdAt: -1 });
    res.render('users', { users, searchQuery });
  } catch (error) { res.render('users', { users: [], searchQuery: '' }); }
});

app.get('/users/delete/:id', requireAdmin, async (req, res) => {
  try { await User.findByIdAndDelete(req.params.id); res.redirect('/users'); } catch(e) { res.redirect('/users'); }
});

app.get('/posts', requireAdmin, async (req, res) => {
  try {
    const searchQuery = req.query.q || '';
    let query = {};
    if (searchQuery) query = { title: { $regex: searchQuery, $options: 'i' } };
    const posts = await Post.find(query).populate('author', 'name email').sort({ createdAt: -1 });
    res.render('posts', { posts, searchQuery });
  } catch (error) { res.render('posts', { posts: [], searchQuery: '' }); }
});

app.get('/api/admin/orders', async (req, res) => {
    const orders = await Order.find().populate('buyer'); // Lấy hết, không lọc status
    res.json(orders);
});

app.get('/posts/delete/:id', requireAdmin, async (req, res) => {
  try { await Post.findByIdAndUpdate(req.params.id, { status: 'DELETED' }); res.redirect('/posts'); } catch(e) { res.redirect('/posts'); }
});

// 🚀 API: ADMIN DUYỆT BÀI ĐĂNG & BÁO CHO CHỦ BÀI VIẾT
app.get('/posts/approve/:id', requireAdmin, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).send("Không tìm thấy bài viết");

        // Đổi trạng thái sang đã duyệt
        post.status = 'APPROVED';
        await post.save();

        // 🔔 BẮN THÔNG BÁO CHO CHỦ BÀI ĐĂNG
        await UserNotification.create({
            user: post.author,
            title: '✅ Tin đăng đã được duyệt!',
            message: `Tin đăng "${post.title}" của bạn đã chính thức hiển thị trên chợ. Chúc bạn mau chốt đơn nhé!`,
            link: `/post/${post._id}` // Bấm vào thông báo nhảy thẳng ra bài viết
        });

        res.redirect('/posts');
    } catch (error) {
        res.status(500).send("Lỗi server khi duyệt bài");
    }
});

app.get('/orders', requireAdmin, async (req, res) => {
  try {
    // Phải lấy thêm trường 'phone' và 'address' để file EJS không bị lỗi undefined
    const orders = await Order.find()
        .populate('buyer', 'name email')
        .sort({ createdAt: -1 });
    res.render('orders', { orders });
  } catch (error) { 
      res.render('orders', { orders: [] }); 
  }
});

app.post('/orders/update-status/:id', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    await Order.findByIdAndUpdate(req.params.id, { status });
    res.redirect('/orders');
  } catch (error) { res.redirect('/orders'); }
});

app.get('/categories', requireAdmin, async (req, res) => {
  try {
    const categories = await Category.find();
    res.render('categories', { categories });
  } catch (error) {
    res.render('categories', { categories: [] });
  }
});

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

app.get('/categories/edit/:id', requireAdmin, async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.redirect('/categories');
    res.render('edit-category', { category });
  } catch (error) { res.redirect('/categories'); }
});

app.post('/categories/edit/:id', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const updateData = { name: req.body.name, description: req.body.description };
    if (req.file) updateData.image = req.file.path; 
    await Category.findByIdAndUpdate(req.params.id, updateData);
    res.redirect('/categories');
  } catch (error) { res.redirect('/categories'); }
});

// 🚀 API: ADMIN CẬP NHẬT TRẠNG THÁI ĐƠN HÀNG (CÓ RÀO CHẮN BẢO MẬT)
app.post('/orders/update-status/:id', requireAdmin, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).send("Không tìm thấy đơn hàng");
        
        // 🚀 RÀO CHẮN BACKEND: Khóa cứng nếu đơn đã chốt sổ hoặc đã hủy
        if (order.status === 'Đã thanh toán cho người bán' || order.status === 'Đã hủy') {
            return res.status(400).send(`
                <div style="text-align:center; padding: 50px; font-family: sans-serif;">
                    <h2 style="color: red;">⛔ LỖI BẢO MẬT HỆ THỐNG</h2>
                    <p>Không thể thay đổi trạng thái của đơn hàng đã được CHỐT SỔ hoặc ĐÃ HỦY!</p>
                    <a href="/orders" style="padding: 10px 20px; background: #333; color: white; text-decoration: none; border-radius: 5px;">Quay lại</a>
                </div>
            `);
        }

        // Cập nhật trạng thái mới
        order.status = req.body.status;
        await order.save();
        
        // Cập nhật xong tự động quay về trang quản lý đơn
        res.redirect('/orders');
    } catch (error) {
        res.status(500).send("Lỗi server khi cập nhật trạng thái");
    }
});

// 🚀 API: ADMIN GIẢI NGÂN & BÁO TIỀN VỀ VÍ CHO NGƯỜI BÁN
app.post('/api/admin/release-funds/:orderId', requireAdmin, async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId);
        if (!order) return res.status(404).json({ message: "Không tìm thấy đơn hàng" });

        // Chặn bảo mật kép
        if (order.status !== 'Hoàn thành') {
            return res.status(400).json({ message: "Chỉ giải ngân khi đơn hàng đã Hoàn thành!" });
        }

        // Tính tiền chiết khấu (Sàn lấy 5%, Người bán nhận 95%)
        const platformFee = order.totalPrice * 0.05;
        const sellerReceive = order.totalPrice - platformFee;

        // 1. Cộng tiền vào ví cho người bán
        const seller = await User.findById(order.seller);
        seller.walletBalance = (seller.walletBalance || 0) + sellerReceive;
        await seller.save();

        // 2. Ghi nhận doanh thu cho Sàn
        const newRevenue = new Revenue({
            orderId: order._id,
            commissionAmount: platformFee,
            description: `Thu chiết khấu 5% từ đơn hàng #${order._id.toString().slice(-6).toUpperCase()}`
        });
        await newRevenue.save();

        // 3. Chốt sổ đơn hàng
        order.status = 'Đã thanh toán cho người bán';
        await order.save();

        // 🔔 BẮN THÔNG BÁO CHO NGƯỜI BÁN TIỀN ĐÃ VỀ
        await UserNotification.create({
            user: order.seller,
            title: '💰 Tiền đã về ví HaiPay!',
            message: `Tuyệt vời! Bạn vừa được giải ngân ${sellerReceive.toLocaleString('vi-VN')}đ từ đơn hàng #${order._id.toString().slice(-6).toUpperCase()} (Đã trừ 5% phí sàn).`,
            link: '/haipay' // Bấm vào nhảy ra xem số dư ví
        });

        res.json({ message: "Giải ngân và bắn thông báo thành công!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Lỗi hệ thống khi giải ngân" });
    }
});

// 🚀 API: ADMIN HOÀN TIỀN CHO ĐƠN BỊ HỦY SAU KHI ĐÃ THANH TOÁN TRƯỚC
app.post('/api/admin/refund-order/:orderId', requireAdmin, async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId);
        if (!order) return res.status(404).json({ message: "Không tìm thấy đơn hàng" });

        // Phải đúng trạng thái mới cho hoàn
        if (order.status !== 'Đã hủy (Chờ hoàn tiền)') {
            return res.status(400).json({ message: "Đơn hàng này không ở trạng thái chờ hoàn tiền!" });
        }

        // 1. Hoàn tiền vào ví HaiPay cho người mua
        const buyer = await User.findById(order.buyer);
        if (buyer) {
            buyer.walletBalance = (buyer.walletBalance || 0) + order.totalPrice;
            await buyer.save();

            // Ghi nhận biến động số dư (Transaction) để khách tra cứu
            await Transaction.create({
                user: buyer._id,
                type: 'Hoàn tiền',
                amount: order.totalPrice,
                status: 'Thành công',
                description: `Hoàn tiền từ đơn hàng đã hủy #${order._id.toString().slice(-6).toUpperCase()}`
            });

            // 2. Bắn thông báo cho người mua yên tâm
            await UserNotification.create({
                user: buyer._id,
                title: '💸 Đã nhận được tiền hoàn!',
                message: `Hệ thống đã hoàn lại ${order.totalPrice.toLocaleString('vi-VN')}đ vào ví HaiPay của bạn từ đơn hàng bị hủy #${order._id.toString().slice(-6).toUpperCase()}.`,
                link: '/haipay'
            });
        }

        // 3. Chốt sổ trạng thái đơn hàng thành "Đã hủy" (Khóa vĩnh viễn)
        order.status = 'Đã hủy';
        await order.save();

        res.json({ message: "✅ Hoàn tiền thành công và đã cộng vào ví HaiPay của người mua!" });
    } catch (error) {
        console.error("Lỗi hoàn tiền:", error);
        res.status(500).json({ message: "Lỗi hệ thống khi hoàn tiền" });
    }
});

// 🚀 API: TRANG THỐNG KÊ DOANH THU CHO ADMIN
app.get('/admin/revenue', requireAdmin, async (req, res) => {
  try {
    // Lấy toàn bộ lịch sử chiết khấu, kèm thông tin đơn hàng để đối soát
    const revenueList = await Revenue.find()
      .populate({
        path: 'orderId',
        populate: { path: 'buyer', select: 'name' }
      })
      .sort({ createdAt: -1 });

    // Tính tổng doanh thu mọi thời đại
    const totalRevenue = revenueList.reduce((sum, item) => sum + item.commissionAmount, 0);

    res.render('revenue', { revenueList, totalRevenue });
  } catch (error) {
    res.redirect('/dashboard');
  }
});

app.delete('/api/posts/:id', async (req, res) => {
    try {
        const deletedPost = await Post.findByIdAndDelete(req.params.id);
        if (!deletedPost) return res.status(404).json({ message: "Không tìm thấy bài đăng để xóa" });
        res.status(200).json({ message: "Đã trảm thành công!" });
    } catch (error) {
        res.status(500).json({ message: "Lỗi Server khi xóa bài" });
    }
});

app.get('/api/admin/notifications', async (req, res) => {
    try {
        const notifs = await Notification.find().sort({ createdAt: -1 }).limit(20);
        const unreadCount = await Notification.countDocuments({ isRead: false });
        res.json({ notifications: notifs, unreadCount });
    } catch (error) { res.status(500).json({ error: "Lỗi" }); }
});

// 🚀 3. API ĐÁNH DẤU ĐÃ ĐỌC THÔNG BÁO
app.post('/api/admin/notifications/read', async (req, res) => {
    await Notification.updateMany({ isRead: false }, { isRead: true });
    res.json({ success: true });
});

// 🚀 ROUTE: TRANG QUẢN LÝ BÁO CÁO DÀNH CHO ADMIN
app.get('/admin/reports', requireAdmin, async (req, res) => {
    try {
        // Lấy danh sách báo cáo và nạp thêm thông tin người gửi + bài viết bị báo cáo
        const reports = await Report.find()
            .populate('reporter', 'name')
            .populate('post', 'title')
            .sort({ createdAt: -1 });

        // Render ra file reports.ejs (Nhớ tạo file này trong thư mục views nha)
        res.render('reports', { 
            reports, 
            active: 'reports', // Để sidebar highlight đúng mục
            user: req.session.user 
        });
    } catch (error) {
        res.status(500).send("Lỗi tải trang báo cáo");
    }
});

app.get('/api/admin/contact', async (req, res) => {
    try {
        // Tìm 1 tài khoản có role là Admin
        const admin = await User.findOne({ role: 'Admin' }).select('_id name avatar email');
        if (!admin) return res.status(404).json({ message: "Chưa có Admin nào trong hệ thống!" });
        res.status(200).json(admin);
    } catch (error) {
        res.status(500).json({ message: "Lỗi lấy thông tin Admin" });
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

// 2. Tạo một thông báo ảo để Test xem chuông có reo không
app.get('/api/admin/test-notif', async (req, res) => {
    try {
        await Notification.create({
            title: '🔔 Thông báo Test Hệ thống',
            message: 'Tuyệt vời! Hệ thống chuông báo của Admin đang hoạt động rất trơn tru!',
        });
        res.json({ message: "Đã bắn thông báo test!" });
    } catch (error) { res.status(500).json({ error: "Lỗi" }); }
});

// API Duyệt lệnh rút tiền
app.put('/api/admin/withdraw/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        // Cập nhật trạng thái thành 'success'
        await Transaction.findByIdAndUpdate(id, { status: 'success' });
        res.json({ message: 'Đã duyệt lệnh rút tiền thành công!' });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi khi duyệt lệnh' });
    }
});

// ==========================================
// 4. API DÀNH CHO FRONTEND (REACT)
// ==========================================

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
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    if (user.password !== oldPassword) return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng!' });
    user.password = newPassword;
    await user.save();
    res.status(200).json({ message: 'Đổi mật khẩu thành công!' });
  } catch (err) { res.status(500).json({ message: 'Lỗi server khi đổi mật khẩu' }); }
});

app.post('/api/users/forgot-password', async (req, res) => {
  try {
    const { email, phone, newPassword } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'Email này chưa đăng ký tài khoản!' });
    if (!user.phone) return res.status(400).json({ message: 'Chưa cập nhật SĐT, liên hệ Admin.' });
    if (user.phone !== phone) return res.status(400).json({ message: 'SĐT không chính xác!' });
    user.password = newPassword;
    await user.save();
    res.status(200).json({ message: 'Lấy lại mật khẩu thành công!' });
  } catch (err) { res.status(500).json({ message: 'Lỗi server' }); }
});

app.post('/api/users/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email, password });
  user ? res.status(200).json(user) : res.status(401).json({ message: 'Sai email hoặc mật khẩu' });
});

app.post('/api/users/register', async (req, res) => {
  try {
    const { name, phone, address, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Điền đủ Họ tên, Email, Mật khẩu!' });
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: 'Email này đã được sử dụng!' });

    const newUser = new User({ name, email, password, phone, address });
    await newUser.save();
    res.status(201).json({ message: 'Đăng ký thành công', user: newUser });
  } catch (error) { res.status(500).json({ message: 'Lỗi server khi đăng ký' }); }
});

app.put('/api/users/profile/:id', upload.single('avatar'), async (req, res) => {
  try {
    const updateData = { ...req.body };
    // 🚀 Đã sửa lỗi: Lấy trực tiếp đường dẫn Cloudinary thay vì lưu localhost
    if (req.file) updateData.avatar = req.file.path; 
    const updatedUser = await User.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.status(200).json(updatedUser);
  } catch (err) { res.status(500).json({ message: 'Lỗi cập nhật' }); }
});

app.get('/api/posts', async (req, res) => {
    try {
        // 🚀 BƯỚC 1: Lấy thêm minPrice, maxPrice và sort từ yêu cầu
        const { page = 1, limit = 8, category, search, location, sort, minPrice, maxPrice } = req.query;
        let query = { status: 'APPROVED' }; 

        if (category && category !== 'Tất cả') query.category = category;
        if (search) query.title = { $regex: search, $options: 'i' };
        
        // Regex tìm kiếm địa điểm linh hoạt
        if (location && location !== 'Toàn quốc') {
            query.location = { $regex: location, $options: 'i' };
        }

        // 🚀 BƯỚC 2: LOGIC LỌC GIÁ (Đây là chỗ bác đang thiếu)
        if (minPrice || maxPrice) {
            query.price = {};
            if (minPrice) query.price.$gte = Number(minPrice); // Lớn hơn hoặc bằng
            if (maxPrice) query.price.$lte = Number(maxPrice); // Nhỏ hơn hoặc bằng
        }

        // 🚀 BƯỚC 3: XỬ LÝ SẮP XẾP (SORT)
        let sortOption = { createdAt: -1 }; // Mặc định tin mới nhất
        if (sort === 'price-asc') sortOption = { price: 1 };  // Giá tăng dần
        if (sort === 'price-desc') sortOption = { price: -1 }; // Giá giảm dần

        const posts = await Post.find(query)
            .populate('author', 'name avatar')
            .sort(sortOption) // Áp dụng sắp xếp vào đây
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();

        res.status(200).json(posts);
    } catch (error) { 
        console.error("Lỗi lọc bài đăng:", error);
        res.status(500).json({ message: "Lỗi Server!" }); 
    }
});

app.get('/api/posts/:id', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).populate('author', 'name avatar phone email createdAt');
    res.status(200).json(post);
  } catch (error) { res.status(500).json({ message: 'Lỗi' }); }
});

app.put('/api/posts/:id', upload.array('images', 5), async (req, res) => {
    try {
        const { title, price, category, location, description, quantity } = req.body;
        let updateData = { title, price, category, location, description, quantity };

        if (req.files && req.files.length > 0) {
            updateData.images = req.files.map(file => file.path || file.filename);
        }

        const updatedPost = await Post.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.status(200).json(updatedPost);
    } catch (error) { res.status(500).json({ message: "Lỗi Server: " + error.message }); }
});

app.post('/api/users/:userId/checkout', async (req, res) => {
  try {
    const { items, totalPrice, phone, address, paymentMethod } = req.body;
    const userId = req.params.userId;

    const user = await User.findById(userId);
    const cartItems = user.cart; 

    // 🚀 MỚI: KIỂM TRA THANH TOÁN BẰNG HAIPAY (Xác minh CCCD & Số dư)
    if (paymentMethod === 'HAIPAY') {
        if (!user.cccd || user.cccd.trim() === '') {
            return res.status(400).json({ error: 'Bạn cần cập nhật CCCD (KYC) trong Hồ sơ để dùng ví HaiPay!' });
        }
        if (user.walletBalance < totalPrice) {
            return res.status(400).json({ error: 'Số dư ví HaiPay không đủ. Vui lòng nạp thêm!' });
        }
    }

    const firstPost = await Post.findById(items[0]);
    const sellerId = firstPost ? firstPost.author : null;

    // 🚀 MỚI: Xác định trạng thái đơn hàng tùy phương thức
    let finalStatus = 'Chờ xác nhận';
    if (paymentMethod === 'VNPAY') finalStatus = 'Chờ thanh toán VNPay';
    if (paymentMethod === 'HAIPAY') finalStatus = 'Đã thanh toán (Admin giữ tiền)';

    const newOrder = new Order({ 
        buyer: userId, 
        seller: sellerId,
        items, 
        totalPrice, 
        phone, 
        address, 
        status: finalStatus 
    });

    // 🚀 MỚI: XỬ LÝ TRỪ TIỀN VÀ TRỪ KHO NẾU LÀ HAIPAY
    if (paymentMethod === 'HAIPAY') {
        user.walletBalance -= totalPrice; // Trừ thẳng tiền trong ví
        
        for (let cartItem of cartItems) {
            const post = await Post.findById(cartItem.product);
            if (post) {
                post.quantity = Math.max(0, post.quantity - cartItem.quantity); 
                if (post.quantity === 0) post.status = 'SOLD';
                await post.save();
            }
        }
        user.cart = [];
        await user.save();
        await newOrder.save();
        // Trả về số dư mới để Frontend cập nhật Header
        return res.status(200).json({ message: 'Thanh toán bằng HaiPay thành công!', order: newOrder, newBalance: user.walletBalance });
    }

    await newOrder.save();

    if (paymentMethod === 'COD') {
        for (let cartItem of cartItems) {
            const post = await Post.findById(cartItem.product);
            if (post) {
                post.quantity = Math.max(0, post.quantity - cartItem.quantity); 
                if (post.quantity === 0) post.status = 'SOLD';
                await post.save();
            }
        }
        user.cart = [];
        await user.save();
    }
    res.status(200).json({ message: 'Đặt hàng thành công!', order: newOrder });
  } catch (error) { res.status(500).json({ error: 'Lỗi khi đặt hàng' }); }
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

        return res.status(200).json({ user, posts, reviews, followersCount, followingCount, avgRating });
    } catch (error) {
        console.error("Lỗi sập Profile:", error.message);
        // 🛡️ ÉP TRẢ VỀ DATA RỖNG ĐỂ UI CHỈ HIỆN TRỐNG CHỨ KHÔNG QUĂNG LỖI 500 ĐỎ LÒM
        return res.status(200).json({ user: {}, posts: [], reviews: [], followersCount: 0, followingCount: 0, avgRating: 5 });
    }
});

app.post('/api/reviews', async (req, res) => {
  try {
    const { seller, buyer, rating, comment, orderId } = req.body;
    
    // Check xem đã đánh giá chưa
    const order = await Order.findById(orderId);
    if (order.isReviewed) return res.status(400).json({ message: "Đơn hàng này đã được đánh giá rồi!" });

    // Lưu đánh giá mới
    const newReview = new Review({ seller, buyer, rating, comment, orderId });
    await newReview.save();

    // Cập nhật trạng thái đơn hàng là đã đánh giá
    order.isReviewed = true;
    await order.save();

    res.status(200).json({ message: "Đánh giá thành công!" });
  } catch (error) { res.status(500).json({ error: "Lỗi gửi đánh giá" }); }
});

app.get('/api/users/follow-status', async (req, res) => {
    try {
        const { followerId, followingId } = req.query;

        // Check ID có hợp lệ chuẩn MongoDB không
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
        // 🛡️ ÉP TRẢ VỀ 200 (THÀNH CÔNG) VÀ FALSE ĐỂ REACT KHÔNG BỊ SẬP BẢNG ĐỎ
        return res.status(200).json({ isFollowing: false });
    }
});

// 🚀 API LẤY THÔNG BÁO CỦA USER
app.get('/api/users/:userId/notifications', async (req, res) => {
    try {
        const notifs = await UserNotification.find({ user: req.params.userId }).sort({ createdAt: -1 }).limit(30);
        const unreadCount = await UserNotification.countDocuments({ user: req.params.userId, isRead: false });
        res.json({ notifications: notifs, unreadCount });
    } catch (error) { res.status(500).json({ error: "Lỗi" }); }
});

// 🚀 API ĐÁNH DẤU ĐÃ ĐỌC THÔNG BÁO
app.post('/api/users/:userId/notifications/read', async (req, res) => {
    await UserNotification.updateMany({ user: req.params.userId, isRead: false }, { isRead: true });
    res.json({ success: true });
});

// 🚀 API: LẤY LỊCH SỬ GIAO DỊCH CỦA USER
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

        // Bắn thông báo cho user yên tâm
        await UserNotification.create({
            user: user._id, title: '🏦 Đã tạo lệnh rút tiền!',
            message: `Lệnh rút ${amount.toLocaleString('vi-VN')}đ về tài khoản ${bankName} đang được xử lý. Tiền sẽ về trong 2-4 tiếng nữa nhé.`,
            link: '/haipay'
        });

        // 🚀 THÊM ĐOẠN NÀY: Bắn chuông réo Admin vào giải ngân
        await Notification.create({
            title: '💸 Yêu cầu rút tiền mới!',
            message: `Khách hàng ${user.name} vừa yêu cầu rút ${amount.toLocaleString('vi-VN')}đ. Bác mau vào kiểm tra và chuyển khoản nhé!`,
        });

        res.status(200).json({ message: 'Tạo lệnh rút tiền thành công!', user });
    } catch (error) { 
        res.status(500).json({ message: 'Lỗi hệ thống khi rút tiền' }); 
    }
});

// 🚀 ROUTE: ADMIN XÓA BÀI VIẾT VI PHẠM
app.post('/admin/posts/delete/:id', requireAdmin, async (req, res) => {
    try {
        const postId = req.params.id;

        // 1. Xóa bài viết khỏi Database
        const deletedPost = await Post.findByIdAndDelete(postId);
        
        if (!deletedPost) {
            return res.status(404).send("Không tìm thấy bài viết để xóa!");
        }

        // 2. Tự động xóa luôn các Báo cáo liên quan đến bài viết này cho sạch DB
        await mongoose.models.Report.deleteMany({ post: postId });

        // 3. (Tùy chọn) Bắn thông báo cho người đăng bài biết bài đã bị xóa do vi phạm
        if (deletedPost.author) {
            await UserNotification.create({
                user: deletedPost.author,
                title: '🚫 Bài viết đã bị xóa!',
                message: `Bài viết "${deletedPost.title}" của bạn đã bị Admin xóa do vi phạm tiêu chuẩn cộng đồng.`,
                link: '/profile'
            });
        }

        // Quay lại trang báo cáo sau khi xóa thành công
        res.redirect('/admin/reports');
    } catch (error) {
        console.error("Lỗi xóa bài Admin:", error);
        res.status(500).send("Lỗi hệ thống khi xóa bài viết");
    }
});

app.get('/admin/orders', async (req, res) => {
    try {
        // 🚀 SỬA TẠI ĐÂY: Lấy tất cả đơn hàng, sắp xếp mới nhất lên đầu (sort -1)
        const orders = await Order.find()
            .populate('buyer', 'name email phone') // Lấy thông tin người mua
            .sort({ createdAt: -1 }); 

        res.render('orders', { orders }); // Trả về file orders.ejs
    } catch (error) {
        res.status(500).send("Lỗi tải danh sách đơn hàng");
    }
});

app.post('/api/reports', async (req, res) => {
    try {
        const { reporterId, postId, reason } = req.body;
        await Report.create({ reporter: reporterId, post: postId, reason });
        
        // Bắn thông báo cho Admin (Nếu bác muốn)
        await Notification.create({
            title: '🚩 Có báo cáo mới!',
            message: `Một bài đăng vừa bị người dùng báo cáo vi phạm. Hãy kiểm tra ngay!`,
            link: '/admin/reports'
        });

        res.json({ message: "Đã gửi báo cáo thành công!" });
    } catch (e) { res.status(500).json({ error: "Lỗi" }); }
});

app.post('/admin/reports/ignore/:id', requireAdmin, async (req, res) => {
    try {
        // Chỉ cần xóa cái đơn Báo cáo đó đi là xong, bài viết vẫn giữ nguyên
        await mongoose.models.Report.findByIdAndDelete(req.params.id);
        res.redirect('/admin/reports');
    } catch (error) {
        res.status(500).send("Lỗi khi bỏ qua báo cáo");
    }
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
            // Bắn thông báo cho người được theo dõi
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

        // 🛡️ Lọc bỏ những dòng rác (trường hợp user kia đã xóa tài khoản)
        list = list.filter(item => item.follower && item.following);

        res.status(200).json(list);
    } catch (e) {
        console.error("Lỗi get follow list:", e.message);
        // 🛡️ Bị lỗi cũng trả về mảng rỗng, cấm sập server!
        res.status(200).json([]); 
    }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy user' });
    res.status(200).json(user);
  } catch (err) { res.status(500).json({ message: 'Lỗi server' }); }
});

// ==========================================
// 🚀 API QUẢN LÝ ĐƠN HÀNG (C2C) MỚI THÊM
// ==========================================

// 1. Lấy danh sách đơn bán cho Người bán
app.get('/api/orders/seller/:sellerId', async (req, res) => {
  try {
    const orders = await Order.find({ seller: req.params.sellerId })
                              .populate('buyer', 'name email phone address')
                              .populate('items', 'title price images image')
                              .sort({ createdAt: -1 });
    res.status(200).json(orders);
  } catch (error) { res.status(500).json({ error: 'Lỗi lấy đơn hàng của người bán' }); }
});

// 🚀 API: NGƯỜI BÁN XÁC NHẬN ĐƠN HÀNG
app.put('/api/orders/:orderId/confirm', async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId).populate('seller buyer');
        if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

        // Đổi trạng thái sang một mốc mới để Admin dễ nhận biết
        order.status = 'Người bán đã chuẩn bị hàng'; 
        await order.save();

        // 🔔 BẮN THÔNG BÁO CHO ADMIN
        await Notification.create({
            title: '📦 Người bán đã chốt đơn!',
            message: `Người bán ${order.seller?.name || 'Ẩn danh'} đã đóng gói xong đơn hàng #${order._id.toString().slice(-6).toUpperCase()}. Admin hãy xem chi tiết và điều phối giao hàng!`,
            orderId: order._id
        });

        res.status(200).json({ message: 'Đã xác nhận đơn hàng và báo cho Admin!' });
    } catch (error) { res.status(500).json({ message: 'Lỗi xác nhận đơn' }); }
});

// 🚀 API: HỦY ĐƠN HÀNG (TÍCH HỢP HOÀN TIỀN VÀ TRẢ LẠI KHO)
app.put('/api/orders/:orderId/cancel', async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId);
        if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

        // 1. Chặn không cho hủy nếu đơn đã đi quá xa
        if (order.status === 'Đã hủy') return res.status(400).json({ message: 'Đơn này đã bị hủy từ trước rồi!' });
        if (order.status === 'Đang giao hàng' || order.status === 'Đang giao' || order.status === 'Hoàn thành' || order.status === 'Đã thanh toán cho người bán') {
            return res.status(400).json({ message: 'Đơn hàng đang giao hoặc đã hoàn thành, không thể hủy!' });
        }

        // 2. 💸 HOÀN TIỀN VÀO VÍ HAIPAY (Nếu khách đã thanh toán trước)
        if (order.status === 'Đã thanh toán (Admin giữ tiền)') {
            await User.findByIdAndUpdate(order.buyer, {
                $inc: { walletBalance: order.totalPrice } // Cộng lại đúng số tiền khách đã trả vào ví
            });
        }

        // 3. 📦 TRẢ HÀNG LẠI VÀO KHO CHO NGƯỜI BÁN
        // Lưu ý: order.items đang lưu mảng ID của Post
        for (let postId of order.items) {
            const post = await Post.findById(postId);
            if (post) {
                post.quantity += 1; // Cộng lại 1 món vào kho
                if (post.status === 'SOLD') post.status = 'APPROVED'; // Nếu trước đó hết hàng, giờ mở bán lại
                await post.save();
            }
        }

        // 4. Đổi trạng thái đơn thành Đã hủy
        order.status = 'Đã hủy';
        await order.save();

        res.status(200).json({ message: '✅ Đã hủy đơn, hoàn tiền vào ví (nếu có) và trả hàng lại vào kho thành công!' });
    } catch (error) { 
        console.error("Lỗi hủy đơn:", error);
        res.status(500).json({ message: 'Lỗi hệ thống khi hủy đơn' }); 
    }
});

// 4. API: NGƯỜI MUA XÁC NHẬN ĐÃ NHẬN HÀNG
app.put('/api/orders/:orderId/receive', async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

    // 🚀 SỬA Ở ĐÂY: Chấp nhận cả 2 kiểu ghi
    if (order.status !== 'Đang giao hàng' && order.status !== 'Đang giao') {
        return res.status(400).json({ message: 'Đơn hàng chưa được giao, không thể xác nhận!' });
    }

    order.status = 'Hoàn thành';
    await order.save();
    res.status(200).json({ message: 'Cảm ơn bạn đã xác nhận nhận hàng!', order });
  } catch (error) { res.status(500).json({ error: 'Lỗi xác nhận' }); }
});

app.get('/api/users/:userId/orders', async (req, res) => {
  try {
    const orders = await Order.find({ buyer: req.params.userId }).populate('items').sort({ createdAt: -1 }); 
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
    
    if (index === -1) user.favorites.push(req.body.postId);
    else user.favorites.splice(index, 1);
    
    await user.save();
    res.status(200).json({ message: 'Ok' });
  } catch (error) { res.status(500).json({ error: 'Lỗi' }); }
});

app.get('/api/users/favorites/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).populate('favorites');
    res.status(200).json(user ? user.favorites : []);
  } catch (error) { res.status(200).json([]); }
});

app.post('/api/posts', upload.array('images', 5), async (req, res) => {
  try {
    const { title, price, category, location, description, author, quantity } = req.body; 
    
    let imagePaths = [];
    if (req.files && req.files.length > 0) imagePaths = req.files.map(file => file.path); 

    const newPost = new Post({
      title, price: Number(price), category, location, description,
      quantity: Number(quantity) || 1, images: imagePaths, author, status: 'PENDING'
    });

    await newPost.save();

    // 🚀 THÊM ĐOẠN NÀY: Bắn thông báo cho Admin
    await Notification.create({
        title: '📦 Có tin đăng mới chờ duyệt!',
        message: `Vừa có một tin đăng mới: "${title}". Bác vào mục Tin đăng kiểm tra và duyệt bài nhé!`,
        link: '/posts'
    });

    res.status(201).json({ message: 'Đăng tin thành công!', post: newPost });
  } catch (error) { res.status(500).json({ message: 'Lỗi server khi đăng tin' }); }
});

app.get('/api/posts/user/:userId', async (req, res) => {
  try {
    const posts = await Post.find({ author: req.params.userId }).sort({ createdAt: -1 }); 
    res.status(200).json(posts);
  } catch (error) { res.status(500).json({ message: 'Lỗi server khi lấy tin cá nhân' }); }
});

app.get('/api/users/cart/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: "Không tìm thấy user" });

        let cartWithDetails = [];
        for (let item of user.cart) {
            const postDetail = await Post.findById(item.product);
            if (postDetail) cartWithDetails.push({ product: postDetail, quantity: item.quantity });
        }
        res.status(200).json(cartWithDetails);
    } catch (error) { res.status(500).json({ message: "Lỗi Server" }); }
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
        res.status(200).json(user.cart);
    } catch (error) { res.status(500).json({ message: "Lỗi Server" }); }
});

// 🚀 2. API: NGƯỜI BÁN XÁC NHẬN ĐƠN HÀNG
app.put('/api/orders/:orderId/confirm', async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

    // Chỉ cho xác nhận khi đang chờ
    if (order.status !== 'Chờ xác nhận' && order.status !== 'Đã thanh toán (Admin giữ tiền)') {
        return res.status(400).json({ message: 'Trạng thái đơn hàng không hợp lệ để xác nhận' });
    }

    order.status = 'Đang giao hàng';
    await order.save();
    res.status(200).json({ message: 'Đã chốt đơn, vui lòng chuẩn bị giao hàng!', order });
  } catch (error) { res.status(500).json({ error: 'Lỗi xác nhận đơn' }); }
});

// 🚀 3. API: HỦY ĐƠN HÀNG (Dùng chung cho cả Người Mua và Người Bán)
app.put('/api/orders/:orderId/cancel', async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

    // Cấm hủy khi hàng đã giao đi
    if (order.status === 'Đang giao hàng' || order.status === 'Hoàn thành') {
        return res.status(400).json({ message: 'Đơn hàng đang giao hoặc đã hoàn thành, không thể hủy!' });
    }

    // Nếu đã thanh toán VNPay thì chuyển sang trạng thái chờ Admin hoàn tiền
    if (order.status === 'Đã thanh toán (Admin giữ tiền)') {
        order.status = 'Đã hủy (Chờ hoàn tiền)';
    } else {
        order.status = 'Đã hủy';
    }
    await order.save();

    // 🚀 QUAN TRỌNG: Mở khóa lại sản phẩm để người khác có thể mua (Đổi từ SOLD về APPROVED)
    if (order.items && order.items.length > 0) {
        await Post.updateMany({ _id: { $in: order.items } }, { status: 'APPROVED' });
    }

    res.status(200).json({ message: 'Hủy đơn hàng thành công!', order });
  } catch (error) { res.status(500).json({ error: 'Lỗi hủy đơn' }); }
});

// ==========================================
// 5. API CHAT & SOCKET
// ==========================================

app.get('/api/messages/clear-all', async (req, res) => {
  try {
    await Message.deleteMany({}); 
    res.status(200).send("<h1 style='color:green; text-align:center; margin-top:50px;'>✅ ĐÃ DỌN SẠCH RÁC TIN NHẮN!</h1>");
  } catch(e) { res.status(500).send("Lỗi dọn rác!"); }
});

app.get('/api/messages/conversations/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const messages = await Message.find({ $or: [{ sender: userId }, { receiver: userId }] })
      .sort({ timestamp: -1 }).populate('sender receiver', 'name avatar');
      
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
          conversationsMap.set(otherUserId, { otherUser, lastMessage: msg.content, timestamp: msg.timestamp, unreadCount: 0 });
        }
        
        if (!isSenderMe && !msg.isRead) conversationsMap.get(otherUserId).unreadCount += 1;
      } catch (e) { } 
    });
    
    res.status(200).json(Array.from(conversationsMap.values()));
  } catch (error) { res.status(200).json([]); }
});

app.get('/api/messages/unread-count/:userId', async (req, res) => {
  try {
    const count = await Message.countDocuments({ receiver: req.params.userId, isRead: false });
    res.status(200).json({ count });
  } catch (err) { res.status(500).json({ message: 'Lỗi đếm tin' }); }
});

app.get('/api/messages/:user1/:user2', async (req, res) => {
  try {
    const { user1, user2 } = req.params;
    const messages = await Message.find({
      $or: [{ sender: user1, receiver: user2 }, { sender: user2, receiver: user1 }]
    }).populate('post', 'title price image').sort({ timestamp: 1 });
    res.status(200).json(messages);
  } catch (error) { res.status(500).json({ message: 'Lỗi' }); }
});

app.post('/api/messages', upload.single('image'), async (req, res) => {
  try {
    const newMessage = new Message({ 
      sender: req.body.senderId, 
      receiver: req.body.receiverId, 
      content: req.body.text || '', 
      post: req.body.postId || null
    });

    // 🚀 SỬA LỖI: Schema của bạn là mảng images: [String], nên phải bọc trong ngoặc vuông
    if (req.file) {
        newMessage.images = [req.file.path];
    }
    await newMessage.save();
    
    // Populate lấy thêm thuộc tính images của post để hiển thị cho chuẩn
    const populatedMsg = await Message.findById(newMessage._id).populate('post', 'title price images image');
    res.status(200).json(populatedMsg);
  } catch (err) { 
      console.error(err);
      res.status(500).json({ message: "Lỗi lưu tin nhắn" }); 
  }
});

app.put('/api/messages/mark-read', async (req, res) => {
  try {
    await Message.updateMany(
      { sender: req.body.otherId, receiver: req.body.userId, isRead: false },
      { $set: { isRead: true } }
    );
    res.status(200).json({ message: 'Đã đọc' });
  } catch (error) { res.status(500).json({ message: 'Lỗi' }); }
});

let onlineUsers = [];

io.on('connection', (socket) => {
  // 1. Khi có người dùng kết nối
  socket.on('addUser', (userId) => {
    // Xóa record cũ của user này (nếu có) để tránh trùng lặp
    onlineUsers = onlineUsers.filter(u => u.userId !== userId);
    // Lưu lại với socket.id mới nhất
    onlineUsers.push({ userId, socketId: socket.id });
    
    // 🚀 THÊM DÒNG NÀY: Phát sóng danh sách online mới nhất cho toàn bộ user
    io.emit('getUsers', onlineUsers);
  });
  
  // 2. Khi gửi tin nhắn (Khúc này của bác chuẩn rồi)
  socket.on('sendMessage', (msgData) => {
    const receiver = onlineUsers.find(u => u.userId === msgData.receiverId);
    if (receiver) {
      io.to(receiver.socketId).emit('getMessage', msgData);
      io.to(receiver.socketId).emit('updateInbox'); 
    }
  });

  // 3. Khi người dùng tắt web hoặc mất mạng
  socket.on('disconnect', () => { 
    onlineUsers = onlineUsers.filter(u => u.socketId !== socket.id); 
    
    // 🚀 THÊM DÒNG NÀY LUN: Báo cho mọi người biết có người vừa offline để tắt chấm xanh
    io.emit('getUsers', onlineUsers);
  });
});

// Đoạn API lấy danh mục giữ nguyên
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await Category.find();
    res.status(200).json(categories);
  } catch (error) { 
    res.status(500).json({ message: 'Lỗi lấy danh mục' }); 
  }
});

// ==========================================
// 💵 TÍCH HỢP THANH TOÁN VNPAY SANDBOX
// ==========================================
const vnp_TmnCode = "PWPUZORX";
const vnp_HashSecret = "EI1KY7CCURZXJUIXCW7QUVXENCM1HQ0L";
const vnp_Url = "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
const vnp_ReturnUrl = "https://hai-hand-marketplace.vercel.app/payment-result";

function sortObject(obj) {
    let sorted = {}; let str = []; let key;
    for (key in obj){ if (obj.hasOwnProperty(key)) str.push(encodeURIComponent(key)); }
    str.sort();
    for (key = 0; key < str.length; key++) { sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, "+"); }
    return sorted;
}

app.post('/api/haipay/deposit', async (req, res) => {
    try {
        const { amount, userId } = req.body;
        let date = new Date();
        let createDate = moment(date).format('YYYYMMDDHHmmss');
        let txnRef = `NAP_${userId}_${createDate}`; 

        let vnp_Params = {
            'vnp_Version': '2.1.0', 'vnp_Command': 'pay', 'vnp_TmnCode': vnp_TmnCode,
            'vnp_Locale': 'vn', 'vnp_CurrCode': 'VND', 'vnp_TxnRef': txnRef, 
            'vnp_OrderInfo': 'Nap tien vao vi HaiPay cho User ' + userId,
            'vnp_OrderType': 'topup', 'vnp_Amount': amount * 100, 
            'vnp_ReturnUrl': 'http://localhost:3000/haipay-result', 
            'vnp_IpAddr': req.headers['x-forwarded-for'] || req.connection.remoteAddress,
            'vnp_CreateDate': createDate
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
        const { txnRef, responseCode } = req.body;
        if (responseCode === '00') {
            const parts = txnRef.split('_');
            const userId = parts[1];
            const amount = parseInt(req.body.amount) / 100; 

            const updatedUser = await User.findByIdAndUpdate(userId, { $inc: { walletBalance: amount } }, { new: true });
            res.status(200).json({ message: 'Nạp tiền thành công!', user: updatedUser });
        } else {
            res.status(400).json({ message: 'Giao dịch thất bại!' });
        }
    } catch (error) { res.status(500).json({ error: 'Lỗi xử lý ví!' }); }
});

app.post('/api/vnpay/create_payment_url', async (req, res) => {
    try {
        const { amount, orderId } = req.body;
        let date = new Date();
        let createDate = moment(date).format('YYYYMMDDHHmmss');
        let ipAddr = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;

        let vnp_Params = {
            'vnp_Version': '2.1.0', 'vnp_Command': 'pay', 'vnp_TmnCode': vnp_TmnCode,
            'vnp_Locale': 'vn', 'vnp_CurrCode': 'VND', 'vnp_TxnRef': orderId, 
            'vnp_OrderInfo': 'Thanh toan don hang HaiHand ' + orderId,
            'vnp_OrderType': 'other', 'vnp_Amount': amount * 100, 
            'vnp_ReturnUrl': vnp_ReturnUrl, 'vnp_IpAddr': ipAddr, 'vnp_CreateDate': createDate
        };

        vnp_Params = sortObject(vnp_Params);
        let signData = querystring.stringify(vnp_Params, { encode: false });
        let hmac = crypto.createHmac("sha512", vnp_HashSecret);
        let signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex"); 
        vnp_Params['vnp_SecureHash'] = signed;
        
        let paymentUrl = vnp_Url + '?' + querystring.stringify(vnp_Params, { encode: false });
        res.status(200).json({ paymentUrl: paymentUrl });
    } catch (error) { res.status(500).json({ error: 'Lỗi tạo link VNPay' }); }
});

// ==========================================
// 🚀 API: XÁC NHẬN THANH TOÁN VNPAY & BÁO CHO NGƯỜI BÁN
// ==========================================
app.post('/api/vnpay/verify', async (req, res) => {
    try {
        const { orderId, responseCode } = req.body;
        if (!orderId) return res.status(400).json({ message: 'Thiếu mã đơn hàng!' });

        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

        if (responseCode === '00') {
            // Chống React gọi 2 lần làm lỗi dữ liệu
            if (order.status === 'Đã thanh toán (Admin giữ tiền)') {
                return res.status(200).json({ message: 'Giao dịch đã được xử lý thành công trước đó!' });
            }

            order.status = 'Đã thanh toán (Admin giữ tiền)';
            await order.save();

            // 🚀 TRỪ KHO VÀ XÓA GIỎ HÀNG BẰNG findOneAndUpdate (Chống lỗi VersionError)
            const user = await User.findById(order.buyer);
            if (user && user.cart && user.cart.length > 0) {
                for (let cartItem of user.cart) {
                    const post = await Post.findById(cartItem.product);
                    if (post) {
                        post.quantity = Math.max(0, post.quantity - cartItem.quantity);
                        if (post.quantity === 0) post.status = 'SOLD';
                        await post.save();
                    }
                }
                
                // Xóa sạch giỏ hàng an toàn
                await User.findOneAndUpdate(
                    { _id: order.buyer }, 
                    { $set: { cart: [] } },
                    { __v: false } 
                );
            }

            // 🔔 BẮN THÔNG BÁO CHO NGƯỜI BÁN
            await UserNotification.create({
                user: order.seller,
                title: '🎉 Bạn có đơn hàng mới!',
                message: `Khách hàng vừa thanh toán thành công đơn hàng #${order._id.toString().slice(-6).toUpperCase()}. Hãy vào Quản lý đơn -> Đơn Bán để chuẩn bị giao hàng nhé!`,
                link: '/profile'
            });

            return res.status(200).json({ message: 'Giao dịch VNPay thành công!' });
        } else {
            // Nếu khách hủy thanh toán thì xóa cái đơn hàng nháp đó đi
            await Order.findByIdAndDelete(orderId);
            return res.status(400).json({ message: 'Giao dịch thất bại hoặc đã bị khách hủy!' });
        }
    } catch (error) { 
        console.error("Lỗi Verify VNPay:", error); 
        res.status(500).json({ error: 'Lỗi hệ thống khi xác nhận thanh toán!' }); 
    }
});

server.listen(4000, () => console.log(`🚀 Hệ thống HaiHand đã sẵn sàng tại port 4000`));