const express = require('express');
const { protect, isSeller, isAdmin, requireAdminJWT } = require('../middleware/auth');
const User = require('../models/User');
const Order = require('../models/Order');
const Settings = require('../models/Settings');
const { Post } = require('../models/Product');
const {
  PENDING_PRODUCT_STATUSES,
  fetchPlatformFeePercent,
  calculateOrderSplit,
  sanitizeUser,
  canonicalStatus,
  productOwnerId,
  orderSellerId,
  orderBuyerId
} = require('../utils/b2c');
const shippingService = require('../services/shipping');
const { cancelOrderWithRefundAndRestock } = require('../controllers/checkoutController');
const { transitionOrder } = require('../utils/orderStateMachine');
const { pickAddressFields, formatAddress, isCompleteAddress } = require('../models/schemas/Address');

module.exports = function createSellerRouter({ upload, sendNotification, sendAdminNotification, io }) {
  const router = express.Router();

  const parseVariants = (raw) => {
    if (!raw) return [];
    let list = raw;
    if (!Array.isArray(list)) {
      try {
        const parsed = JSON.parse(raw);
        list = Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        return [];
      }
    }
    return list
      .filter((v) => v && typeof v === 'object')
      .map((v) => ({
        name: v.name != null ? String(v.name).trim() : '',
        ...(v.price !== undefined && v.price !== null && v.price !== '' ? { price: Number(v.price) || 0 } : {}),
        stock: v.stock !== undefined && v.stock !== null && v.stock !== '' ? Math.max(0, Number(v.stock) || 0) : 0,
        sku: v.sku != null ? String(v.sku).trim() : '',
        options: Array.isArray(v.options) ? v.options.map((opt) => String(opt)) : []
      }));
  };

  router.post('/api/users/apply-seller', protect, async (req, res) => {
    try {
      let setting = null;
      try {
        const isSettingsConnected = Settings.db && Settings.db.readyState === 1;
        const isSettingsMocked =
          typeof Settings.findOne === 'function' && Boolean(Settings.findOne._isMockFunction);
        if (isSettingsConnected || isSettingsMocked) {
          setting = await Settings.findOne();
        }
      } catch (sErr) {}

      if (setting && setting.allowNewSellerRegistration === false) {
        return res.status(403).json({
          message: 'Hiện tại sàn đang tạm ngưng nhận đăng ký mở Shop mới. Vui lòng quay lại sau!'
        });
      }

      const user = await User.findById(req.user._id);
      if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
      if (user.sellerStatus === 'approved' && user.isSeller) {
        return res.status(400).json({ message: 'Tài khoản đã là Seller được duyệt.' });
      }
      if (user.sellerStatus === 'pending') {
        return res.status(400).json({ message: 'Hồ sơ đang chờ Admin duyệt.' });
      }

      const shop = req.body.shopInfo || req.body;
      user.shopInfo = {
        shopName: shop.shopName || user.name,
        description: shop.description || '',
        address: shop.address || user.address || '',
        avatar: shop.avatar || user.avatar || '',
        banner: shop.banner || '',
        phone: shop.phone || user.phone || '',
        taxCode: shop.taxCode || user.taxId || ''
      };
      user.sellerStatus = 'pending';
      user.sellerAppliedAt = new Date();
      user.sellerRejectionReason = '';
      user.isSeller = false;
      await user.save();

      // Trigger 2: When a user applies for Seller status, create a notification for Admins
      try {
        if (typeof sendAdminNotification === 'function') {
          await sendAdminNotification(
            'Yêu cầu mở Shop',
            'Có yêu cầu mở Shop B2C mới!',
            '/admin/seller-applications',
            'SELLER'
          );
        } else {
          const Notification = require('../models/Notification');
          const notif = await Notification.create({
            title: 'Yêu cầu mở Shop',
            message: 'Có yêu cầu mở Shop B2C mới!',
            type: 'SELLER',
            link: '/admin/seller-applications',
            targetUrl: '/admin/seller-applications',
            targetRole: 'admin',
            recipientRole: 'admin',
            isRead: false
          });
          if (io) io.to('admin_system_room').emit('new_admin_notification', notif);
        }
      } catch (e) {
        console.error('Lỗi gửi thông báo seller:', e);
      }

      res.status(200).json({
        message: 'Đã gửi đăng ký mở Shop. Vui lòng chờ Admin duyệt.',
        user: sanitizeUser(user)
      });
    } catch (error) {
      res.status(500).json({ message: 'Lỗi gửi đăng ký Seller: ' + error.message });
    }
  });

  router.get('/api/admin/seller-applications', requireAdminJWT, async (req, res) => {
    try {
      const status = req.query.status || 'pending';
      const query = status === 'all'
        ? { sellerStatus: { $in: ['pending', 'approved', 'rejected'] } }
        : { sellerStatus: status };
      const applications = await User.find(query)
        .select('-password')
        .sort({ sellerAppliedAt: -1, updatedAt: -1 });
      res.json({ applications });
    } catch (error) {
      res.status(500).json({ message: 'Lỗi tải hồ sơ Seller' });
    }
  });

  router.put('/api/admin/approve-seller/:id', requireAdminJWT, async (req, res) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
      user.isSeller = true;
      user.sellerStatus = 'approved';
      user.sellerApprovedAt = new Date();
      user.sellerRejectionReason = '';
      if (!user.shopInfo || !user.shopInfo.shopName) {
        user.shopInfo = {
          ...(user.shopInfo || {}),
          shopName: user.name,
          avatar: (user.shopInfo && user.shopInfo.avatar) || user.avatar || ''
        };
      }
      await user.save();

      if (sendNotification) {
        await sendNotification(
          user._id,
          '🎉 Shop đã được duyệt!',
          'Admin đã duyệt đăng ký bán hàng. Bạn có thể vào Kênh Người Bán để đăng sản phẩm.',
          'SYSTEM',
          '/seller-channel'
        );
      }

      res.json({ message: 'Đã duyệt Seller', user: sanitizeUser(user) });
    } catch (error) {
      res.status(500).json({ message: 'Lỗi duyệt Seller' });
    }
  });

  router.put('/api/admin/reject-seller/:id', requireAdminJWT, async (req, res) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
      user.isSeller = false;
      user.sellerStatus = 'rejected';
      user.sellerRejectionReason = req.body.reason || 'Hồ sơ chưa đủ điều kiện';
      await user.save();

      if (sendNotification) {
        await sendNotification(
          user._id,
          'Hồ sơ mở Shop bị từ chối',
          user.sellerRejectionReason,
          'SYSTEM',
          '/seller-register'
        );
      }

      res.json({ message: 'Đã từ chối hồ sơ Seller', user: sanitizeUser(user) });
    } catch (error) {
      res.status(500).json({ message: 'Lỗi từ chối Seller' });
    }
  });

  router.get('/api/seller/dashboard', protect, isSeller, async (req, res) => {
    try {
      const sellerId = req.user._id;
      const products = await Post.find({ $or: [{ sellerId }, { author: sellerId }] });
      const orders = await Order.find({ $or: [{ sellerId }, { seller: sellerId }] });

      const feePercent = await fetchPlatformFeePercent();
      const pending = orders.filter((o) => canonicalStatus(o.status) === 'Pending').length;
      const processing = orders.filter((o) => ['Processing', 'Shipped', 'Delivered'].includes(canonicalStatus(o.status))).length;
      const completed = orders.filter((o) => canonicalStatus(o.status) === 'Completed');
      const settledCodOrCompleted = orders.filter(
        (o) =>
          canonicalStatus(o.status) === 'Completed' ||
          (o.paymentMethod === 'COD' && (o.settled === true || canonicalStatus(o.status) === 'Delivered'))
      );
      const revenue = settledCodOrCompleted.reduce((sum, o) => sum + calculateOrderSplit(o, feePercent).sellerReceive, 0);
      const releasedRevenue = settledCodOrCompleted
        .filter((o) => o.paymentStatus === 'released' || o.settled === true || o.paymentMethod === 'COD')
        .reduce((sum, o) => sum + calculateOrderSplit(o, feePercent).sellerReceive, 0);
      const escrowRevenue = orders
        .filter((o) => o.paymentStatus === 'escrow' && canonicalStatus(o.status) !== 'Cancelled')
        .reduce((sum, o) => sum + calculateOrderSplit(o, feePercent).sellerReceive, 0);
      const totalSales = completed.reduce((sum, o) => sum + (o.totalPrice || 0), 0);

      res.json({
        shop: req.user.shopInfo || {},
        stats: {
          productCount: products.length,
          activeProducts: products.filter((p) => p.status === 'active' || p.status === 'APPROVED').length,
          pendingProducts: products.filter((p) => PENDING_PRODUCT_STATUSES.includes(p.status)).length,
          pendingOrders: pending,
          openOrders: processing,
          completedOrders: completed.length,
          totalSales,
          revenue,
          releasedRevenue,
          escrowRevenue,
          platformFeePercentage: feePercent,
          walletBalance: req.user.walletBalance || 0,
          pendingBalance: req.user.pendingBalance || 0
        }
      });
    } catch (error) {
      res.status(500).json({ message: 'Lỗi dashboard Seller' });
    }
  });

  router.get('/api/seller/shop', protect, isSeller, async (req, res) => {
    res.json({ shopInfo: req.user.shopInfo || {}, user: sanitizeUser(req.user) });
  });

  router.put('/api/seller/shop', protect, isSeller, upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'banner', maxCount: 1 }
  ]), async (req, res) => {
    try {
      const user = await User.findById(req.user._id);
      const current = user.shopInfo || {};
      const next = {
        shopName: req.body.shopName != null ? req.body.shopName : current.shopName,
        description: req.body.description != null ? req.body.description : current.description,
        address: req.body.address != null ? req.body.address : current.address,
        phone: req.body.phone != null ? req.body.phone : current.phone,
        taxCode: req.body.taxCode != null ? req.body.taxCode : current.taxCode,
        avatar: current.avatar,
        banner: current.banner,
        pickupAddress: current.pickupAddress
      };
      if (req.body.pickupAddress) {
        let pa = req.body.pickupAddress;
        if (typeof pa === 'string') {
          try { pa = JSON.parse(pa); } catch (e) {}
        }
        if (typeof pa === 'object' && pa) {
          const cleanPa = pickAddressFields(pa);
          next.pickupAddress = cleanPa;
          if (isCompleteAddress(cleanPa) && (!req.body.address || req.body.address === current.address)) {
            next.address = formatAddress(cleanPa);
          }
        }
      }
      if (req.files?.avatar?.[0]) next.avatar = req.files.avatar[0].path;
      if (req.files?.banner?.[0]) next.banner = req.files.banner[0].path;
      user.shopInfo = next;
      await user.save();
      res.json({ message: 'Đã lưu thông tin Shop', shopInfo: user.shopInfo, user: sanitizeUser(user) });
    } catch (error) {
      res.status(500).json({ message: 'Lỗi cập nhật Shop' });
    }
  });

  router.get('/api/seller/products', protect, isSeller, async (req, res) => {
    try {
      const products = await Post.find({
        $or: [{ sellerId: req.user._id }, { author: req.user._id }]
      }).sort({ createdAt: -1 });
      res.json(products);
    } catch (error) {
      res.status(500).json({ message: 'Lỗi tải sản phẩm' });
    }
  });

  const parsePositiveIntOrZero = (raw, fieldName, { min = 0 } = {}) => {
    if (raw === undefined || raw === null || raw === '') return null;
    if (typeof raw === 'object' || typeof raw === 'boolean' || String(raw).includes('.')) {
      throw new Error(`${fieldName} phải là số nguyên >= ${min}`);
    }
    const num = Number(raw);
    if (!Number.isFinite(num) || !Number.isInteger(num) || num < min) {
      throw new Error(`${fieldName} phải là số nguyên >= ${min}`);
    }
    return num;
  };

  router.post('/api/seller/products', protect, isSeller, upload.array('images', 8), async (req, res) => {
    try {
      const { name, title, sku, price, originalPrice, stockQuantity, quantity, category, location, description, condition, variants, details } = req.body || {};
      const displayName = typeof (name || title) === 'string' ? (name || title).trim() : '';
      if (!displayName || price === undefined || price === null || price === '' || !category || typeof category !== 'string') {
        return res.status(400).json({ message: 'Vui lòng nhập tên, giá và danh mục.' });
      }

      let numPrice;
      let numOriginalPrice = 0;
      let stock = 0;
      try {
        numPrice = parsePositiveIntOrZero(price, 'Giá sản phẩm', { min: 1000 });
        if (originalPrice !== undefined && originalPrice !== null && originalPrice !== '') {
          numOriginalPrice = parsePositiveIntOrZero(originalPrice, 'Giá gốc', { min: 0 });
        }
        const rawStock = stockQuantity !== undefined && stockQuantity !== null && stockQuantity !== ''
          ? stockQuantity
          : (quantity !== undefined && quantity !== null && quantity !== '' ? quantity : 0);
        stock = parsePositiveIntOrZero(rawStock, 'Số lượng tồn kho', { min: 0 });
      } catch (valErr) {
        return res.status(400).json({ message: valErr.message });
      }

      const imagePaths = (req.files || []).map((file) => file.path || file.secure_url || file.filename);
      let parsedDetails = {};
      if (details) {
        try { parsedDetails = typeof details === 'string' ? JSON.parse(details) : details; } catch (e) { parsedDetails = {}; }
      }

      // Check Auto-Approve setting from GlobalSetting
      let isAutoApprove = false;
      try {
        const Settings = require('../models/Settings');
        const setting = await Settings.findOne();
        isAutoApprove = setting && setting.autoApprovePosts === true;
      } catch (e) {}

      const moderationStatus = isAutoApprove ? 'approved' : 'pending';
      const postStatus = stock <= 0 ? 'out_of_stock' : (isAutoApprove ? 'active' : 'pending');

      const product = new Post({
        name: displayName,
        title: displayName,
        sku: typeof sku === 'string' ? sku.trim() : '',
        price: numPrice,
        originalPrice: numOriginalPrice,
        stockQuantity: stock,
        quantity: stock,
        category: category.trim(),
        location: (typeof location === 'string' && location.trim()) || (req.user.shopInfo && req.user.shopInfo.address) || 'Toàn quốc',
        description: typeof description === 'string' ? description : '',
        condition: (typeof condition === 'string' && condition.trim()) || parsedDetails.condition || 'Mới',
        images: imagePaths,
        sellerId: req.user._id,
        author: req.user._id,
        variants: parseVariants(variants),
        details: parsedDetails,
        status: postStatus,
        moderationStatus
      });
      await product.save();

      // Trigger 1: When a user/seller creates a new Product/Post (and auto-approve is false), automatically create a notification for Admins
      if (!isAutoApprove && postStatus === 'pending') {
        try {
          if (typeof sendAdminNotification === 'function') {
            await sendAdminNotification(
              'Tin đăng mới',
              'Có tin đăng mới chờ duyệt!',
              '/posts',
              'PRODUCT'
            );
          } else {
            const Notification = require('../models/Notification');
            const notif = await Notification.create({
              title: 'Tin đăng mới',
              message: 'Có tin đăng mới chờ duyệt!',
              type: 'PRODUCT',
              link: '/posts',
              targetUrl: '/posts',
              targetRole: 'admin',
              recipientRole: 'admin',
              isRead: false
            });
            if (io) io.to('admin_system_room').emit('new_admin_notification', notif);
          }
        } catch (e) {
          console.error('Lỗi gửi thông báo sản phẩm seller mới:', e);
        }
      }

      res.status(201).json({ message: 'Đã tạo sản phẩm', product });
    } catch (error) {
      res.status(500).json({ message: error.message || 'Lỗi tạo sản phẩm' });
    }
  });

  router.put('/api/seller/products/:id', protect, isSeller, upload.array('images', 8), async (req, res) => {
    try {
      const product = await Post.findById(req.params.id);
      if (!product) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
      if (productOwnerId(product) !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Không phải sản phẩm của Shop bạn' });
      }

      if (product.moderationStatus === 'locked' || product.status === 'DELETED') {
        return res.status(403).json({
          message: 'Sản phẩm này đã bị Quản trị viên khóa/ẩn do vi phạm. Bạn không thể chỉnh sửa hoặc bật lại!'
        });
      }

      const body = req.body || {};
      let contentChanged = false;

      if (body.price !== undefined) {
        try {
          const nextPrice = parsePositiveIntOrZero(body.price, 'Giá sản phẩm', { min: 1000 });
          if (nextPrice !== product.price) contentChanged = true;
          product.price = nextPrice;
        } catch (e) {
          return res.status(400).json({ message: e.message });
        }
      }

      if (body.originalPrice !== undefined && body.originalPrice !== '') {
        try {
          product.originalPrice = parsePositiveIntOrZero(body.originalPrice, 'Giá gốc', { min: 0 });
        } catch (e) {
          return res.status(400).json({ message: e.message });
        }
      }

      if (body.stockQuantity !== undefined || body.quantity !== undefined) {
        const rawStock = body.stockQuantity !== undefined ? body.stockQuantity : body.quantity;
        try {
          const nextStock = parsePositiveIntOrZero(rawStock, 'Số lượng tồn kho', { min: 0 });
          product.stockQuantity = nextStock;
          product.quantity = nextStock;
        } catch (e) {
          return res.status(400).json({ message: e.message });
        }
      }

      const nextName = body.name !== undefined ? body.name : body.title;
      if (nextName !== undefined && typeof nextName === 'string' && nextName.trim()) {
        if (nextName.trim() !== product.name) contentChanged = true;
        product.name = nextName.trim();
        product.title = nextName.trim();
      }

      if (body.description !== undefined && typeof body.description === 'string') {
        if (body.description !== product.description) contentChanged = true;
        product.description = body.description;
      }

      const stringFields = ['sku', 'category', 'location', 'condition'];
      stringFields.forEach((key) => {
        if (body[key] !== undefined && typeof body[key] === 'string') {
          product[key] = body[key].trim();
        }
      });

      if (body.variants !== undefined) {
        product.variants = parseVariants(body.variants);
      }
      if (body.details !== undefined) {
        try {
          product.details = typeof body.details === 'string' ? JSON.parse(body.details) : body.details;
        } catch (e) {}
      }
      if (req.files && req.files.length > 0) {
        product.images = req.files.map((file) => file.path || file.secure_url || file.filename);
        contentChanged = true;
      }

      // H3: Bỏ `status` khỏi danh sách field cho sửa trực tiếp; nếu sửa giá/ảnh/mô tả của sản phẩm đã duyệt và autoApprovePosts !== true -> quay lại pending
      let isAutoApprove = false;
      try {
        const Settings = require('../models/Settings');
        const settings = await Settings.findOne();
        isAutoApprove = settings && settings.autoApprovePosts === true;
      } catch (e) {}

      if (contentChanged && !isAutoApprove) {
        product.moderationStatus = 'pending';
        product.status = Number(product.stockQuantity) <= 0 ? 'out_of_stock' : 'pending';
      } else if (Number(product.stockQuantity) <= 0) {
        product.status = 'out_of_stock';
      } else if (product.status === 'out_of_stock' && Number(product.stockQuantity) > 0) {
        product.status = product.moderationStatus === 'approved' ? 'active' : 'pending';
      }

      await product.save();
      res.json({ message: 'Đã cập nhật sản phẩm', product });
    } catch (error) {
      res.status(500).json({ message: 'Lỗi cập nhật sản phẩm' });
    }
  });

  /**
   * PATCH / PUT /api/seller/products/:id/visibility
   * Nút ẩn/hiện riêng cho Seller (H3): chỉ cho phép khi sản phẩm đã `approved` và không bị Admin `locked`.
   */
  const toggleSellerProductVisibility = async (req, res) => {
    try {
      const product = await Post.findById(req.params.id);
      if (!product) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
      if (productOwnerId(product) !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Không phải sản phẩm của Shop bạn' });
      }
      if (product.moderationStatus === 'locked' || product.status === 'DELETED') {
        return res.status(403).json({
          message: 'Sản phẩm đã bị Admin khóa/ẩn. Bạn không thể tự bật lại!'
        });
      }
      if (product.moderationStatus && product.moderationStatus !== 'approved' && product.status !== 'active' && product.status !== 'inactive') {
        return res.status(400).json({
          message: 'Chỉ có thể bật/tắt hiển thị cho sản phẩm đã được Admin duyệt (approved)!'
        });
      }

      const desiredVisible = req.body?.visible !== undefined
        ? Boolean(req.body.visible)
        : product.status === 'inactive';

      if (desiredVisible) {
        product.status = Number(product.stockQuantity) <= 0 ? 'out_of_stock' : 'active';
      } else {
        product.status = 'inactive';
      }
      await product.save();
      res.json({ message: desiredVisible ? 'Đã hiển thị sản phẩm' : 'Đã ẩn sản phẩm', product });
    } catch (error) {
      res.status(500).json({ message: 'Lỗi thay đổi trạng thái hiển thị sản phẩm' });
    }
  };

  router.patch('/api/seller/products/:id/visibility', protect, isSeller, toggleSellerProductVisibility);
  router.put('/api/seller/products/:id/visibility', protect, isSeller, toggleSellerProductVisibility);

  router.delete('/api/seller/products/:id', protect, isSeller, async (req, res) => {
    try {
      const product = await Post.findById(req.params.id);
      if (!product) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
      if (productOwnerId(product) !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Không phải sản phẩm của Shop bạn' });
      }
      product.status = 'inactive';
      await product.save();
      res.json({ message: 'Đã ẩn sản phẩm', product });
    } catch (error) {
      res.status(500).json({ message: 'Lỗi xóa sản phẩm' });
    }
  });

  router.get('/api/seller/orders', protect, isSeller, async (req, res) => {
    try {
      const orders = await Order.find({
        $or: [{ sellerId: req.user._id }, { seller: req.user._id }]
      })
        .populate('buyer buyerId', 'name email phone address avatar')
        .populate('items', 'title name price images image stockQuantity')
        .sort({ createdAt: -1 });

      res.json(orders.map((order) => {
        const o = order.toObject();
        o.canonicalStatus = canonicalStatus(o.status);
        o.buyerId = orderBuyerId(o);
        o.sellerId = orderSellerId(o);
        return o;
      }));
    } catch (error) {
      res.status(500).json({ message: 'Lỗi tải đơn hàng Seller' });
    }
  });

  router.put('/api/seller/orders/:id/status', protect, isSeller, async (req, res) => {
    try {
      const order = await Order.findById(req.params.id).populate('buyer buyerId seller sellerId');
      if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

      // Ownership verification using .equals() or string equality
      const orderSeller = order.sellerId?._id || order.seller?._id || order.sellerId || order.seller || orderSellerId(order);
      if (!orderSeller) {
        return res.status(403).json({ message: 'Đơn này không thuộc Shop bạn' });
      }

      const isOwner = req.user._id.equals
        ? req.user._id.equals(orderSeller)
        : req.user._id.toString() === orderSeller.toString();

      if (!isOwner) {
        return res.status(403).json({ message: 'Đơn này không thuộc Shop bạn' });
      }

      const current = canonicalStatus(order.status);
      const next = req.body.status;
      const shippingCode = req.body.shippingCode;
      const shippingCarrier = req.body.shippingCarrier;

      // Seller chỉ được phép chuyển từ Pending -> Processing/Cancelled, và Processing -> Shipped/Cancelled.
      // Trạng thái Delivered chỉ do Webhook GHN hoặc Admin cập nhật.
      // Trạng thái Completed chỉ do Buyer bấm "Đã nhận được hàng" hoặc Admin giải ngân.
      const allowed = {
        Pending: ['Processing', 'Cancelled'],
        Processing: ['Shipped', 'Cancelled']
      };

      if (!allowed[current] || !allowed[current].includes(next)) {
        return res.status(400).json({
          message: `Người bán không thể tự chuyển trạng thái đơn hàng từ "${current}" sang "${next}"`
        });
      }

      if (next === 'Cancelled' && ['Shipped', 'Delivered', 'Completed'].includes(current)) {
        return res.status(400).json({ message: 'Không thể hủy đơn đang giao / đã hoàn tất' });
      }

      if (next === 'Cancelled') {
        const cancelResult = await transitionOrder(order, 'Cancelled', 'seller', {
          actorId: req.user._id,
          reason: req.body.cancelReason || 'Người bán hủy đơn'
        });
        if (!cancelResult.success) {
          return res.status(cancelResult.statusCode || 400).json({ message: cancelResult.message });
        }

        const buyerId = orderBuyerId(order);
        if (sendNotification && buyerId) {
          await sendNotification(
            buyerId,
            'Đơn hàng đã bị hủy',
            `Đơn #${order._id.toString().slice(-6).toUpperCase()} đã bị hủy bởi người bán.${cancelResult.refundedAmount > 0 ? ' Tiền đã được hoàn vào ví HaiPay của bạn.' : ''}`,
            'ORDER',
            '/profile?tab=orders_buy'
          );
        }

        return res.json({ message: 'Đã cập nhật đơn hàng', order: cancelResult.order });
      }

      // If transitioning to Shipped or Processing and order does not have a carrier shipment yet,
      // invoke shipping service (GHN or configured carrier) to register shipment with carrier API
      const extraSet = {};
      if ((next === 'Shipped' || next === 'Processing') && (!order.shippingCode || !order.shipment?.trackingCode)) {
        try {
          const shipmentResult = await shippingService.createShipmentForOrder(order);
          if (shipmentResult) {
            extraSet.shipment = shipmentResult;
            extraSet.shippingCode = shipmentResult.trackingCode || shippingCode || order.shippingCode;
            extraSet.shippingCarrier = shipmentResult.carrier || shippingCarrier || order.shippingCarrier;
          }
        } catch (shipErr) {
          console.warn('⚠️ [Shipping] Error creating carrier shipment during status update:', shipErr.message);
          if (shippingCode) extraSet.shippingCode = shippingCode;
          if (shippingCarrier) extraSet.shippingCarrier = shippingCarrier;
        }
      }

      if (shippingCode && !order.shippingCode && !extraSet.shippingCode) extraSet.shippingCode = shippingCode;
      if (shippingCarrier && !order.shippingCarrier && !extraSet.shippingCarrier) extraSet.shippingCarrier = shippingCarrier;

      const transitionResult = await transitionOrder(order, next, 'seller', {
        actorId: req.user._id,
        reason: `Người bán cập nhật trạng thái sang ${next}`,
        extraSet,
        notify: false
      });

      if (!transitionResult.success) {
        return res.status(transitionResult.statusCode || 400).json({ message: transitionResult.message });
      }

      const buyerId = orderBuyerId(order);
      if (sendNotification && buyerId) {
        await sendNotification(
          buyerId,
          'Cập nhật đơn hàng',
          `Đơn #${order._id.toString().slice(-6).toUpperCase()} đã chuyển sang ${next}.`,
          'ORDER',
          '/profile?tab=orders_buy'
        );
      }

      res.json({ message: 'Đã cập nhật đơn hàng', order: transitionResult.order });
    } catch (error) {
      res.status(500).json({ message: 'Lỗi cập nhật đơn hàng: ' + error.message });
    }
  });

  /**
   * POST /api/seller/orders/:id/prepare
   * Seller clicks "Chuẩn bị hàng" -> creates carrier shipment, registers package with carrier,
   * obtains trackingCode and updates order status to 'Processing'.
   */
  router.post('/api/seller/orders/:id/prepare', protect, isSeller, async (req, res) => {
    try {
      const order = await Order.findById(req.params.id).populate('buyer buyerId seller sellerId');
      if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

      // Ownership verification using .equals() or string equality
      const orderSeller = order.sellerId?._id || order.seller?._id || order.sellerId || order.seller || orderSellerId(order);
      if (!orderSeller) {
        return res.status(403).json({ message: 'Đơn này không thuộc Shop bạn' });
      }

      const isOwner = req.user._id.equals
        ? req.user._id.equals(orderSeller)
        : req.user._id.toString() === orderSeller.toString();

      if (!isOwner) {
        return res.status(403).json({ message: 'Đơn này không thuộc Shop bạn' });
      }

      const current = canonicalStatus(order.status);
      if (current !== 'Pending') {
        return res.status(400).json({
          message: `Đơn hàng đang ở trạng thái "${current}", chỉ có thể chuẩn bị đơn khi đang "Chờ xác nhận" (Pending).`
        });
      }

      // Chuẩn hóa kiểm tra thanh toán: nếu đơn Online/VNPAY chưa thanh toán xong nhưng Seller vẫn chuẩn bị hàng
      // thì tự động chuyển sang thu hộ COD thay vì chặn cứng bằng lỗi 400
      const methodUpper = String(order.paymentMethod || 'COD').trim().toUpperCase();
      const isCodOrder = methodUpper === 'COD' || methodUpper.includes('COD') || methodUpper.includes('TIỀN MẶT');
      const isPaidOrder = ['escrow', 'paid', 'released'].includes(String(order.paymentStatus || '').toLowerCase()) ||
                          String(order.status || '').includes('Đã thanh toán');
      if (!isCodOrder && !isPaidOrder) {
        order.paymentMethod = 'COD';
      }

      // Gọi shippingService trong try/catch, fallback vận đơn nội bộ nếu thiếu pickupAddress/lỗi GHN
      let shipmentResult;
      try {
        shipmentResult = await shippingService.createShipmentForOrder(order);
      } catch (shipErr) {
        console.warn('⚠️ [PrepareOrder] Fallback vận đơn nội bộ:', shipErr.message);
        const fallbackCode = `HH${Date.now().toString().slice(-8)}`;
        shipmentResult = {
          provider: 'mock',
          carrier: 'HaiHand Express',
          trackingCode: fallbackCode,
          fee: order.shippingFee || 25000,
          createdAt: new Date()
        };
      }

      const extraSet = {
        shipment: shipmentResult,
        trackingCode: shipmentResult.trackingCode || '',
        shippingCode: shipmentResult.trackingCode || '',
        shippingCarrier: shipmentResult.carrier || 'Giao Hàng Nhanh',
        shippingStatus: order.shippingStatus || 'ready_to_pick'
      };
      if (order.paymentMethod) {
        extraSet.paymentMethod = order.paymentMethod;
      }

      const transitionResult = await transitionOrder(order, 'Processing', 'seller', {
        actorId: req.user._id,
        reason: 'Người bán chuẩn bị hàng & tạo vận đơn',
        extraSet,
        notify: false,
        allowUnpaidToCodFallback: true
      });

      if (!transitionResult.success) {
        return res.status(transitionResult.statusCode || 400).json({
          message: transitionResult.message
        });
      }

      const buyerId = orderBuyerId(order);
      if (sendNotification && buyerId) {
        await sendNotification(
          buyerId,
          '📦 Shop đang chuẩn bị hàng',
          `Đơn hàng #${order._id.toString().slice(-6).toUpperCase()} đã được Shop chuẩn bị với mã vận đơn ${extraSet.shippingCode} (${extraSet.shippingCarrier}).`,
          'ORDER',
          '/profile?tab=orders_buy'
        );
      }

      return res.status(200).json({
        success: true,
        message: '🎉 Chuẩn bị hàng thành công! Đã tạo mã vận đơn từ hãng vận chuyển.',
        trackingCode: extraSet.shippingCode,
        carrier: extraSet.shippingCarrier,
        order: transitionResult.order
      });
    } catch (error) {
      console.error('Prepare order error:', error);
      return res.status(error.status || 500).json({
        message: error.message || 'Lỗi khi tạo vận đơn giao hàng'
      });
    }
  });

  /**
   * POST /api/seller/orders/:orderId/ship
   * Tạo đơn giao hàng qua GHN (Giao Hàng Nhanh)
   */
  const shippingController = require('../controllers/shippingController');
  router.post('/api/seller/orders/:orderId/ship', protect, isSeller, shippingController.createShipmentGHN);

  return router;
};
