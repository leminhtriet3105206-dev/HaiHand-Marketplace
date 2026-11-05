const express = require('express');
const { protect, isSeller, isAdmin } = require('../middleware/auth');
const User = require('../models/User');
const Order = require('../models/Order');
const { Post } = require('../models/Product');
const { indexProductImage } = require('../services/imageEmbeddingService');
const {
  sanitizeUser,
  canonicalStatus,
  productOwnerId,
  orderSellerId,
  orderBuyerId
} = require('../utils/b2c');

module.exports = function createSellerRouter({ upload, sendNotification, sendAdminNotification, io }) {
  const router = express.Router();

  const parseVariants = (raw) => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  };

  router.post('/api/users/apply-seller', protect, async (req, res) => {
    try {
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
            isRead: false
          });
          if (io) io.emit('new_admin_notification', notif);
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

  router.get('/api/admin/seller-applications', isAdmin, async (req, res) => {
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

  router.put('/api/admin/approve-seller/:id', isAdmin, async (req, res) => {
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

  router.put('/api/admin/reject-seller/:id', isAdmin, async (req, res) => {
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

      const pending = orders.filter((o) => canonicalStatus(o.status) === 'Pending').length;
      const processing = orders.filter((o) => ['Processing', 'Shipped', 'Delivered'].includes(canonicalStatus(o.status))).length;
      const completed = orders.filter((o) => canonicalStatus(o.status) === 'Completed');
      const revenue = completed.reduce((sum, o) => sum + (o.totalPrice || 0) * 0.95, 0);
      const totalSales = completed.reduce((sum, o) => sum + (o.totalPrice || 0), 0);

      res.json({
        shop: req.user.shopInfo || {},
        stats: {
          productCount: products.length,
          activeProducts: products.filter((p) => p.status === 'active' || p.status === 'APPROVED').length,
          pendingOrders: pending,
          openOrders: processing,
          completedOrders: completed.length,
          totalSales,
          revenue,
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
        banner: current.banner
      };
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

  router.post('/api/seller/products', protect, isSeller, upload.array('images', 8), async (req, res) => {
    try {
      const { name, title, sku, price, originalPrice, stockQuantity, quantity, category, location, description, condition, status, variants, details } = req.body;
      const displayName = (name || title || '').trim();
      if (!displayName || !price || !category) {
        return res.status(400).json({ message: 'Vui lòng nhập tên, giá và danh mục.' });
      }

      const imagePaths = (req.files || []).map((file) => file.path || file.secure_url || file.filename);
      let parsedDetails = {};
      if (details) {
        try { parsedDetails = typeof details === 'string' ? JSON.parse(details) : details; } catch (e) { parsedDetails = {}; }
      }

      const stock = Number(stockQuantity != null ? stockQuantity : quantity) || 0;

      // Check Auto-Approve setting from GlobalSetting
      let isAutoApprove = false;
      try {
        const Settings = require('../models/Settings');
        const setting = await Settings.findOne();
        isAutoApprove = setting && setting.autoApprovePosts === true;
      } catch (e) {}

      const postStatus = stock <= 0 ? 'out_of_stock' : (status === 'inactive' ? 'inactive' : (isAutoApprove ? 'active' : 'pending'));

      const product = new Post({
        name: displayName,
        title: displayName,
        sku: sku || '',
        price: Number(price),
        originalPrice: Number(originalPrice) || 0,
        stockQuantity: stock,
        quantity: stock,
        category,
        location: location || (req.user.shopInfo && req.user.shopInfo.address) || 'Toàn quốc',
        description: description || '',
        condition: condition || parsedDetails.condition || 'Mới',
        images: imagePaths,
        sellerId: req.user._id,
        author: req.user._id,
        variants: parseVariants(variants),
        details: parsedDetails,
        status: postStatus
      });
      await product.save();

      try {
        await indexProductImage(product);
      } catch (error) {
        console.warn(`Không tạo được image embedding cho ${product._id}: ${error.message}`);
      }

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
              isRead: false
            });
            if (io) io.emit('new_admin_notification', notif);
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

      const fields = ['name', 'title', 'sku', 'price', 'originalPrice', 'stockQuantity', 'quantity', 'category', 'location', 'description', 'condition', 'status'];
      fields.forEach((key) => {
        if (req.body[key] !== undefined) product[key] = req.body[key];
      });
      if (req.body.name && !req.body.title) product.title = req.body.name;
      if (req.body.title && !req.body.name) product.name = req.body.title;
      if (req.body.stockQuantity != null) product.quantity = Number(req.body.stockQuantity);
      if (req.body.quantity != null && req.body.stockQuantity == null) product.stockQuantity = Number(req.body.quantity);
      if (req.body.variants) product.variants = parseVariants(req.body.variants);
      if (req.body.details) {
        try {
          product.details = typeof req.body.details === 'string' ? JSON.parse(req.body.details) : req.body.details;
        } catch (e) { }
      }
      if (req.files && req.files.length > 0) {
        product.images = req.files.map((file) => file.path || file.filename);
      }
      if (Number(product.stockQuantity) <= 0) product.status = 'out_of_stock';
      await product.save();
      res.json({ message: 'Đã cập nhật sản phẩm', product });
    } catch (error) {
      res.status(500).json({ message: 'Lỗi cập nhật sản phẩm' });
    }
  });

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
      if (orderSellerId(order).toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Đơn này không thuộc Shop bạn' });
      }

      const current = canonicalStatus(order.status);
      const next = req.body.status;
      const shippingCode = req.body.shippingCode;
      const shippingCarrier = req.body.shippingCarrier;

      const allowed = {
        Pending: ['Processing', 'Cancelled'],
        Processing: ['Shipped', 'Cancelled'],
        Shipped: ['Delivered'],
        Delivered: ['Completed']
      };

      if (!allowed[current] || !allowed[current].includes(next)) {
        return res.status(400).json({ message: `Không thể chuyển từ ${current} sang ${next}` });
      }

      if (next === 'Cancelled' && ['Shipped', 'Delivered', 'Completed'].includes(current)) {
        return res.status(400).json({ message: 'Không thể hủy đơn đang giao / đã hoàn tất' });
      }

      order.status = next;
      if (shippingCode) order.shippingCode = shippingCode;
      if (shippingCarrier) order.shippingCarrier = shippingCarrier;
      if (next === 'Delivered') order.deliveredAt = new Date();
      if (next === 'Completed') order.completedAt = new Date();
      if (next === 'Cancelled') {
        order.cancelledAt = new Date();
        order.cancelReason = req.body.cancelReason || '';
      }
      await order.save();

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

      res.json({ message: 'Đã cập nhật đơn hàng', order });
    } catch (error) {
      res.status(500).json({ message: 'Lỗi cập nhật đơn hàng' });
    }
  });

  return router;
};
