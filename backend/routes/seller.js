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
const shippingService = require('../services/shipping');
const { pickAddressFields, formatAddress, isCompleteAddress } = require('../models/schemas/Address');
const { trackServerEvent } = require('../analytics/track');

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

      trackServerEvent('seller_applied', {
        userId: user._id,
        sessionId: req.headers['x-hh-sid'],
        anonymousId: req.headers['x-hh-aid']
      });

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
      const Message = require('../models/Message');
      const Settings = require('../models/Settings');

      const [products, orders, setting, unreadMessages, inboundBuyers, repliedBuyers] = await Promise.all([
        Post.find({ $or: [{ sellerId }, { author: sellerId }] }),
        Order.find({ $or: [{ sellerId }, { seller: sellerId }] }),
        Settings.findOne().lean().catch(() => null),
        Message.countDocuments({ receiver: sellerId, sellerId, isRead: false }).catch(() => 0),
        Message.distinct('sender', { sellerId, receiver: sellerId, sender: { $ne: sellerId } }).catch(() => []),
        Message.distinct('receiver', { sellerId, sender: sellerId, receiver: { $ne: sellerId } }).catch(() => [])
      ]);

      const rawRate = setting?.platformFeePercentage ?? setting?.commissionRate ?? 5;
      const commissionRate = Number.isFinite(Number(rawRate)) ? Number(rawRate) : 5;
      const sellerShare = Math.max(0, 1 - commissionRate / 100);

      const pending = orders.filter((o) => canonicalStatus(o.status) === 'Pending').length;
      const processing = orders.filter((o) => ['Processing', 'Shipped', 'Delivered'].includes(canonicalStatus(o.status))).length;
      const completed = orders.filter((o) => canonicalStatus(o.status) === 'Completed');
      const revenue = completed.reduce((sum, o) => sum + (o.totalPrice || 0) * sellerShare, 0);
      const totalSales = completed.reduce((sum, o) => sum + (o.totalPrice || 0), 0);

      const repliedSet = new Set(repliedBuyers.map((id) => String(id)));
      const repliedCount = inboundBuyers.filter((id) => repliedSet.has(String(id))).length;
      const responseRate = inboundBuyers.length > 0
        ? Math.round((repliedCount / inboundBuyers.length) * 100)
        : 100;

      res.json({
        shop: req.user.shopInfo || {},
        commissionRate,
        stats: {
          productCount: products.length,
          activeProducts: products.filter((p) => p.status === 'active' || p.status === 'APPROVED').length,
          pendingOrders: pending,
          openOrders: processing,
          completedOrders: completed.length,
          totalSales,
          revenue,
          commissionRate,
          unreadMessages,
          responseRate,
          walletBalance: req.user.walletBalance || 0,
          pendingBalance: req.user.pendingBalance || 0
        }
      });
    } catch (error) {
      res.status(500).json({ message: 'Lỗi dashboard Seller' });
    }
  });

  // Legacy analytics handler removed – replaced by Phase 6 analytics at bottom of file

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

      trackServerEvent('product_created', {
        userId: req.user._id,
        sessionId: req.headers['x-hh-sid'],
        anonymousId: req.headers['x-hh-aid'],
        props: {
          productId: product._id,
          sellerId: req.user._id
        }
      });

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

      // If transitioning to Shipped or Processing and order does not have a carrier shipment yet,
      // invoke shipping service (GHN or configured carrier) to register shipment with carrier API
      if ((next === 'Shipped' || next === 'Processing') && (!order.shippingCode || !order.shipment?.trackingCode)) {
        try {
          const shipmentResult = await shippingService.createShipmentForOrder(order);
          if (shipmentResult) {
            order.shipment = shipmentResult;
            order.shippingCode = shipmentResult.trackingCode || shippingCode || order.shippingCode;
            order.shippingCarrier = shipmentResult.carrier || shippingCarrier || order.shippingCarrier;
          }
        } catch (shipErr) {
          console.warn('⚠️ [Shipping] Error creating carrier shipment during status update:', shipErr.message);
          if (shippingCode) order.shippingCode = shippingCode;
          if (shippingCarrier) order.shippingCarrier = shippingCarrier;
        }
      }

      order.status = next;
      if (shippingCode && !order.shippingCode) order.shippingCode = shippingCode;
      if (shippingCarrier && !order.shippingCarrier) order.shippingCarrier = shippingCarrier;
      if (next === 'Delivered') order.deliveredAt = new Date();
      if (next === 'Completed') order.completedAt = new Date();
      if (next === 'Cancelled') {
        order.cancelledAt = new Date();
        order.cancelReason = req.body.cancelReason || '';
        trackServerEvent('order_cancelled', {
          userId: orderBuyerId(order),
          props: { orderId: order._id, by: 'seller' }
        });
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

      // Check payment status for non-COD orders
      if (order.paymentMethod !== 'COD' && order.paymentStatus !== 'escrow') {
        return res.status(400).json({
          message: 'Đơn hàng chưa được thanh toán thành công, không thể tạo vận đơn giao hàng!'
        });
      }

      // Call shipping service to create shipment (GHN or Mock)
      const shipmentResult = await shippingService.createShipmentForOrder(order);

      order.shipment = shipmentResult;
      order.shippingCode = shipmentResult.trackingCode || '';
      order.shippingCarrier = shipmentResult.carrier || 'Giao Hàng Nhanh';
      order.status = 'Processing'; // Đang chuẩn bị hàng
      await order.save();

      const buyerId = orderBuyerId(order);
      if (sendNotification && buyerId) {
        await sendNotification(
          buyerId,
          '📦 Shop đang chuẩn bị hàng',
          `Đơn hàng #${order._id.toString().slice(-6).toUpperCase()} đã được Shop chuẩn bị với mã vận đơn ${order.shippingCode} (${order.shippingCarrier}).`,
          'ORDER',
          '/profile?tab=orders_buy'
        );
      }

      return res.status(200).json({
        success: true,
        message: '🎉 Chuẩn bị hàng thành công! Đã tạo mã vận đơn từ hãng vận chuyển.',
        trackingCode: order.shippingCode,
        carrier: order.shippingCarrier,
        order
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

  /**
   * B3: GET /api/seller/buyers/:buyerId/summary
   * Trả thông tin tóm tắt người mua có quan hệ (hội thoại hoặc đơn hàng) với shop.
   */
  router.get('/api/seller/buyers/:buyerId/summary', protect, isSeller, async (req, res) => {
    try {
      const mongoose = require('mongoose');
      const Message = require('../models/Message');
      const sellerId = req.user._id;
      const { buyerId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(String(buyerId))) {
        return res.status(400).json({ message: 'ID người mua không hợp lệ.' });
      }

      const [hasChat, orders] = await Promise.all([
        Message.exists({
          $or: [
            { sender: sellerId, receiver: buyerId },
            { sender: buyerId, receiver: sellerId }
          ]
        }),
        Order.find({
          $and: [
            { $or: [{ sellerId }, { seller: sellerId }] },
            { $or: [{ buyerId }, { buyer: buyerId }] }
          ]
        })
          .sort({ createdAt: -1 })
          .select('_id status totalPrice createdAt items shippingAddress recipientName recipientPhone')
          .lean()
      ]);

      if (!hasChat && orders.length === 0) {
        return res.status(403).json({
          message: 'Người mua này chưa có hội thoại hoặc đơn hàng với Shop.'
        });
      }

      const buyerUser = await User.findById(buyerId)
        .select('_id name avatar createdAt isVerified lastActive')
        .lean();
      if (!buyerUser) {
        return res.status(404).json({ message: 'Không tìm thấy thông tin người mua.' });
      }

      const validOrders = orders.filter((o) => canonicalStatus(o.status) !== 'Cancelled');
      const totalSpent = validOrders.reduce((sum, o) => sum + Number(o.totalPrice || 0), 0);
      const activeOrder = orders.find((o) =>
        ['Pending', 'Processing', 'Shipped'].includes(canonicalStatus(o.status))
      );

      const recentOrders = orders.slice(0, 5).map((o) => ({
        _id: o._id,
        shortId: String(o._id).slice(-8).toUpperCase(),
        status: o.status,
        canonicalStatus: canonicalStatus(o.status),
        totalPrice: Number(o.totalPrice || 0),
        createdAt: o.createdAt,
        itemsCount: Array.isArray(o.items) ? o.items.length : 0
      }));

      return res.json({
        buyer: {
          _id: buyerUser._id,
          name: buyerUser.name,
          avatar: buyerUser.avatar || '',
          createdAt: buyerUser.createdAt,
          isVerified: Boolean(buyerUser.isVerified),
          lastActive: buyerUser.lastActive || null,
          ...(activeOrder
            ? {
                activeOrderRecipientName: activeOrder.recipientName || activeOrder.shippingAddress?.fullName || '',
                activeOrderPhone: activeOrder.recipientPhone || activeOrder.shippingAddress?.phone || ''
              }
            : {})
        },
        stats: {
          totalOrders: orders.length,
          totalSpent
        },
        recentOrders
      });
    } catch (error) {
      console.error('Lỗi tải thông tin người mua:', error);
      return res.status(500).json({ message: 'Lỗi máy chủ khi tải thông tin người mua' });
    }
  });

  /**
   * B4: Mẫu trả lời nhanh của Shop (tối đa 20 mẫu, title <= 40, content <= 500)
   */
  const DEFAULT_QUICK_REPLIES = [
    { title: 'Còn hàng', content: 'Chào bạn, shop còn hàng ạ' },
    { title: 'Bảo hành', content: 'Sản phẩm này shop bảo hành 7 ngày' },
    { title: 'Thời gian giao', content: 'Shop giao hàng trong 1–2 ngày làm việc' },
    { title: 'Cảm ơn', content: 'Cảm ơn bạn đã quan tâm!' }
  ];

  router.get('/api/seller/quick-replies', protect, isSeller, async (req, res) => {
    try {
      const seller = await User.findById(req.user._id).select('shopInfo.quickReplies').lean();
      return res.json({
        quickReplies: seller?.shopInfo?.quickReplies || [],
        defaults: DEFAULT_QUICK_REPLIES
      });
    } catch (error) {
      return res.status(500).json({ message: 'Lỗi tải mẫu trả lời nhanh' });
    }
  });

  router.post('/api/seller/quick-replies', protect, isSeller, async (req, res) => {
    try {
      const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
      const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
      if (!title || title.length > 40) {
        return res.status(400).json({ message: 'Tiêu đề mẫu phải từ 1 đến 40 ký tự.' });
      }
      if (!content || content.length > 500) {
        return res.status(400).json({ message: 'Nội dung mẫu phải từ 1 đến 500 ký tự.' });
      }

      const seller = await User.findById(req.user._id);
      if (!seller) return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
      if (!seller.shopInfo) seller.shopInfo = {};
      if (!Array.isArray(seller.shopInfo.quickReplies)) seller.shopInfo.quickReplies = [];

      if (seller.shopInfo.quickReplies.length >= 20) {
        return res.status(400).json({ message: 'Chỉ được lưu tối đa 20 mẫu trả lời nhanh.' });
      }
      const dup = seller.shopInfo.quickReplies.some(
        (r) => String(r.title).toLowerCase() === title.toLowerCase()
      );
      if (dup) {
        return res.status(400).json({ message: 'Tiêu đề mẫu đã tồn tại.' });
      }

      seller.shopInfo.quickReplies.push({ title, content });
      await seller.save();
      return res.status(201).json({ quickReplies: seller.shopInfo.quickReplies });
    } catch (error) {
      return res.status(500).json({ message: 'Lỗi thêm mẫu trả lời nhanh' });
    }
  });

  router.put('/api/seller/quick-replies/:replyId', protect, isSeller, async (req, res) => {
    try {
      const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
      const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
      if (!title || title.length > 40) {
        return res.status(400).json({ message: 'Tiêu đề mẫu phải từ 1 đến 40 ký tự.' });
      }
      if (!content || content.length > 500) {
        return res.status(400).json({ message: 'Nội dung mẫu phải từ 1 đến 500 ký tự.' });
      }

      const seller = await User.findById(req.user._id);
      const list = seller?.shopInfo?.quickReplies || [];
      const item = list.id(req.params.replyId);
      if (!item) {
        return res.status(404).json({ message: 'Không tìm thấy mẫu trả lời nhanh.' });
      }

      const dup = list.some(
        (r) => String(r._id) !== String(req.params.replyId) && String(r.title).toLowerCase() === title.toLowerCase()
      );
      if (dup) {
        return res.status(400).json({ message: 'Tiêu đề mẫu đã tồn tại.' });
      }

      item.title = title;
      item.content = content;
      await seller.save();
      return res.json({ quickReplies: seller.shopInfo.quickReplies });
    } catch (error) {
      return res.status(500).json({ message: 'Lỗi cập nhật mẫu trả lời nhanh' });
    }
  });

  router.delete('/api/seller/quick-replies/:replyId', protect, isSeller, async (req, res) => {
    try {
      const seller = await User.findById(req.user._id);
      const list = seller?.shopInfo?.quickReplies;
      if (!list || !list.id(req.params.replyId)) {
        return res.status(404).json({ message: 'Không tìm thấy mẫu trả lời nhanh.' });
      }
      list.pull(req.params.replyId);
      await seller.save();
      return res.json({ quickReplies: seller.shopInfo.quickReplies });
    } catch (error) {
      return res.status(500).json({ message: 'Lỗi xóa mẫu trả lời nhanh' });
    }
  });

  // --- PHASE 6: SELLER PRODUCT ANALYTICS ---
  router.get('/api/seller/analytics', protect, isSeller, async (req, res) => {
    try {
      const mongoose = require('mongoose');
      const rawRange = parseInt(req.query.range, 10);
      const rangeDays = [7, 30, 90].includes(rawRange) ? rawRange : 30;

      const sellerIdStr = String(req.user._id);
      const now = new Date();
      const toVn = (d) => new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 10);
      const toDateStr = toVn(now);
      const fromDate = new Date(now.getTime() - (rangeDays - 1) * 86400000);
      const fromDateStr = toVn(fromDate);

      const sellerPosts = await Post.find({
        $or: [{ sellerId: req.user._id }, { author: req.user._id }],
      })
        .select('_id title name category price')
        .lean();

      const sellerProductIds = sellerPosts.map((p) => String(p._id));

      const db = mongoose.connection;
      const [dailyDocs, summaryDocs, viewEvents, clickEvents] = await Promise.all([
        db
          .collection('analytics_products')
          .find({
            sellerId: sellerIdStr,
            date: { $gte: fromDateStr, $lte: toDateStr },
          })
          .sort({ date: 1 })
          .toArray(),
        db
          .collection('analytics_products_summary')
          .find({
            sellerId: sellerIdStr,
            periodDays: rangeDays,
          })
          .sort({ views: -1 })
          .limit(30)
          .toArray(),
        sellerProductIds.length
          ? db
              .collection('analytics_events')
              .find(
                {
                  name: 'product_view',
                  ts: { $gte: fromDate },
                  'props.productId': { $in: sellerProductIds },
                },
                { projection: { ts: 1 } }
              )
              .limit(5000)
              .toArray()
          : Promise.resolve([]),
        sellerProductIds.length
          ? db
              .collection('analytics_events')
              .find(
                {
                  name: 'search_result_click',
                  ts: { $gte: fromDate },
                  'props.productId': { $in: sellerProductIds },
                },
                { projection: { 'props.query': 1 } }
              )
              .limit(2000)
              .toArray()
          : Promise.resolve([]),
      ]);

      const dailyMap = new Map();
      for (const d of dailyDocs) {
        const cur = dailyMap.get(d.date) || { date: d.date, views: 0, addToCart: 0, orders: 0 };
        cur.views += d.views || 0;
        cur.addToCart += d.addToCart || 0;
        cur.orders += d.orders || 0;
        dailyMap.set(d.date, cur);
      }
      const dailySeries = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

      const totalViews = dailySeries.reduce((s, d) => s + d.views, 0);
      const totalAddToCart = dailySeries.reduce((s, d) => s + d.addToCart, 0);
      const totalOrders = dailySeries.reduce((s, d) => s + d.orders, 0);
      const conversionRate = totalViews > 0 ? Number(((totalOrders / totalViews) * 100).toFixed(2)) : 0;

      // Peak viewing hours (0..23 VN time)
      const hourCounts = Array.from({ length: 24 }, (_, hour) => ({ hour, views: 0 }));
      for (const ev of viewEvents) {
        if (!ev.ts) continue;
        const vnHour = new Date(new Date(ev.ts).getTime() + 7 * 3600000).getUTCHours();
        if (vnHour >= 0 && vnHour < 24) {
          hourCounts[vnHour].views += 1;
        }
      }

      // Keywords leading to seller's products
      const kwMap = {};
      for (const ev of clickEvents) {
        const q = String(ev.props?.query || '').trim().toLowerCase();
        if (q) kwMap[q] = (kwMap[q] || 0) + 1;
      }
      const searchKeywords = Object.entries(kwMap)
        .map(([query, clicks]) => ({ query, clicks }))
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 10);

      // Action suggestions
      const suggestions = [];
      for (const p of summaryDocs) {
        if (p.flagHighViewLowBuy || ((p.views || 0) >= 20 && (p.cartRate || 0) < 0.05)) {
          suggestions.push(
            `Sản phẩm "${p.title || p.productId}" có nhiều lượt xem (${p.views}) nhưng ít người thêm vào giỏ: xem lại giá hoặc ảnh mô tả.`
          );
          if (suggestions.length >= 2) break;
        }
      }
      if (suggestions.length === 0 && summaryDocs.some((p) => p.flagPotential)) {
        const pot = summaryDocs.find((p) => p.flagPotential);
        suggestions.push(
          `Sản phẩm "${pot.title || pot.productId}" có tỷ lệ chuyển đổi tốt (${((pot.conversion || 0) * 100).toFixed(1)}%): nên chia sẻ thêm để tăng lượt xem.`
        );
      }

      return res.json({
        success: true,
        range: rangeDays,
        kpis: {
          totalViews,
          totalAddToCart,
          totalOrders,
          conversionRate,
        },
        dailySeries,
        peakHours: hourCounts,
        topProducts: summaryDocs.map((p) => ({
          productId: p.productId,
          title: p.title,
          category: p.category,
          price: p.price,
          views: p.views || 0,
          addToCart: p.addToCart || 0,
          orders: p.orders || 0,
          cartRate: p.cartRate || 0,
          conversion: p.conversion || 0,
          flagHighViewLowBuy: Boolean(p.flagHighViewLowBuy),
          flagPotential: Boolean(p.flagPotential),
        })),
        searchKeywords,
        suggestions,
      });
    } catch (error) {
      console.error('Seller analytics error:', error);
      return res.status(500).json({ message: 'Lỗi tải dữ liệu phân tích shop' });
    }
  });

  return router;
};
