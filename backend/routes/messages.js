const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');

const Message = require('../models/Message');
const User = require('../models/User');
const Order = require('../models/Order');
const { Post } = require('../models/Product');
const Notification = require('../models/Notification');
const { protectStrict } = require('../middleware/auth');
const { createUploadMiddleware } = require('../middleware/upload');

const MAX_CONTENT_LENGTH = 2000;
const MAX_IMAGES_PER_MESSAGE = 4;
const MESSAGE_NOTIF_GROUP_WINDOW_MS = 10 * 60 * 1000;

function toObjectId(id) {
  return new mongoose.Types.ObjectId(String(id));
}

function buildPreviewText(content, imagesCount) {
  const clean = String(content || '').trim();
  if (clean) {
    if (clean.length <= 60) return clean;
    return `${clean.slice(0, 57).trimEnd()}...`;
  }
  if (imagesCount > 0) {
    return imagesCount > 1 ? `Đã gửi ${imagesCount} hình ảnh` : 'Đã gửi 1 hình ảnh';
  }
  return 'Đã gửi thông tin sản phẩm';
}

function normalizeFilePath(file) {
  if (!file) return '';
  if (file.secure_url) return file.secure_url;
  if (file.path && String(file.path).startsWith('http')) return file.path;
  if (file.filename) return `uploads/${file.filename}`;
  return file.path || '';
}

function isUserLockedOrUnavailable(user) {
  if (!user || user.isDeleted || user.isBanned) return true;
  if (user.status === 'locked' && (!user.lockedUntil || new Date(user.lockedUntil) > new Date())) {
    return true;
  }
  return false;
}

/**
 * Xác định `sellerId` cho hội thoại (B1):
 * 1. Có `post` -> author / sellerId của bài đăng
 * 2. Có `order` -> sellerId / seller của đơn hàng
 * 3. Kế thừa `sellerId` từ tin nhắn gần nhất giữa 2 người
 * 4. Người nhận là seller đã duyệt -> receiver._id
 * 5. Người gửi là seller đã duyệt -> sender._id
 * 6. Còn lại -> null
 */
async function resolveConversationSellerId({ senderUser, receiverUser, postDoc, orderDoc }) {
  if (postDoc) {
    const owner = postDoc.sellerId || postDoc.author;
    if (owner) return owner._id || owner;
  }
  if (orderDoc) {
    const seller = orderDoc.sellerId || orderDoc.seller;
    if (seller) return seller._id || seller;
  }

  const lastMsg = await Message.findOne({
    $or: [
      { sender: senderUser._id, receiver: receiverUser._id },
      { sender: receiverUser._id, receiver: senderUser._id }
    ]
  })
    .sort({ createdAt: -1, timestamp: -1, _id: -1 })
    .select('sellerId')
    .lean();

  if (lastMsg && lastMsg.sellerId) {
    return lastMsg.sellerId;
  }

  if (receiverUser.isSeller === true && receiverUser.sellerStatus === 'approved') {
    return receiverUser._id;
  }
  if (senderUser.isSeller === true && senderUser.sellerStatus === 'approved') {
    return senderUser._id;
  }
  return null;
}

/**
 * Gửi hoặc gộp thông báo tin nhắn mới (A7):
 * - Nếu người nhận là `sellerId` của hội thoại -> link `/seller-channel/messages?with=<senderId>`
 * - Ngược lại -> link `/chat?with=<senderId>`
 * - Nếu đã có thông báo `MESSAGE` chưa đọc từ cùng người gửi trong 10 phút -> cập nhật nội dung thay vì tạo mới.
 */
async function upsertMessageNotification({ io, sendNotification, receiverId, senderUser, content, imagesCount, sellerId }) {
  try {
    const senderIdStr = senderUser._id.toString();
    const isReceiverShop = Boolean(sellerId && String(sellerId) === String(receiverId));
    const targetLink = isReceiverShop
      ? `/seller-channel/messages?with=${senderIdStr}`
      : `/chat?with=${senderIdStr}`;
    const targetRole = isReceiverShop ? 'seller' : 'buyer';
    const preview = buildPreviewText(content, imagesCount);
    const title = `Tin nhắn từ ${senderUser.name || 'Người dùng'}`;
    const tenMinutesAgo = new Date(Date.now() - MESSAGE_NOTIF_GROUP_WINDOW_MS);

    const existing = await Notification.findOne({
      userId: receiverId,
      type: 'MESSAGE',
      isRead: false,
      senderId: senderUser._id,
      createdAt: { $gte: tenMinutesAgo }
    }).sort({ createdAt: -1 });

    if (existing) {
      existing.title = title;
      existing.message = preview;
      existing.link = targetLink;
      existing.targetUrl = targetLink;
      existing.targetRole = targetRole;
      existing.recipientRole = targetRole;
      if (isReceiverShop) existing.shopId = receiverId;
      await existing.save();

      if (io) {
        io.to(`user_${receiverId}`).emit('new_notification', existing);
      }
      return existing;
    }

    if (typeof sendNotification === 'function') {
      return await sendNotification(receiverId, title, preview, 'MESSAGE', targetLink, {
        senderId: senderUser._id,
        targetRole,
        recipientRole: targetRole,
        ...(isReceiverShop ? { shopId: receiverId } : {})
      });
    }

    const notif = await Notification.create({
      userId: receiverId,
      user: receiverId,
      senderId: senderUser._id,
      shopId: isReceiverShop ? receiverId : undefined,
      targetRole,
      recipientRole: targetRole,
      title,
      message: preview,
      type: 'MESSAGE',
      link: targetLink,
      targetUrl: targetLink,
      isRead: false
    });
    if (io) {
      io.to(`user_${receiverId}`).emit('new_notification', notif);
    }
    return notif;
  } catch (err) {
    console.warn('Cảnh báo gửi thông báo tin nhắn:', err.message);
    return null;
  }
}

module.exports = function createMessagesRouter({ io, upload, sendNotification } = {}) {
  const router = express.Router();
  const messageUpload = upload || createUploadMiddleware({ maxFiles: MAX_IMAGES_PER_MESSAGE, maxFileSize: 5 * 1024 * 1024 });

  const messageRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
    keyGenerator: (req) => (req.user?._id ? String(req.user._id) : req.ip || 'anon'),
    handler: (req, res) => {
      return res.status(429).json({
        message: 'Bạn đang gửi tin nhắn quá nhanh (tối đa 30 tin/phút). Vui lòng đợi một lát!'
      });
    }
  });

  // Helper dùng chung cho GET /conversations và alias DEPRECATED
  async function handleListConversations(req, res) {
    try {
      const meIdStr = req.user._id.toString();
      const meObjId = toObjectId(meIdStr);
      const asScope = ['all', 'seller', 'buyer'].includes(req.query.as) ? req.query.as : 'all';
      const onlyUnread = req.query.unread === '1' || req.query.unread === 'true';
      const onlyUnanswered = req.query.unanswered === '1' || req.query.unanswered === 'true';
      const onlyHasOrder = req.query.hasOrder === '1' || req.query.hasOrder === 'true';
      const searchQ = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
      const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limitNum = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 30));

      const pipeline = [
        {
          $match: {
            $or: [{ sender: meObjId }, { receiver: meObjId }]
          }
        },
        {
          $addFields: {
            sortTime: { $ifNull: ['$createdAt', '$timestamp'] },
            otherUserId: {
              $cond: [{ $eq: ['$sender', meObjId] }, '$receiver', '$sender']
            }
          }
        },
        { $sort: { sortTime: -1, _id: -1 } },
        {
          $group: {
            _id: '$otherUserId',
            lastMessage: { $first: '$$ROOT' },
            lastActivityAt: { $first: '$sortTime' },
            unreadCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$receiver', meObjId] },
                      { $eq: ['$isRead', false] }
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ];

      if (asScope === 'seller') {
        pipeline.push({ $match: { 'lastMessage.sellerId': meObjId } });
      } else if (asScope === 'buyer') {
        pipeline.push({ $match: { 'lastMessage.sellerId': { $ne: meObjId } } });
      }

      if (onlyUnread) {
        pipeline.push({ $match: { unreadCount: { $gt: 0 } } });
      }

      if (onlyUnanswered) {
        pipeline.push({ $match: { 'lastMessage.sender': { $ne: meObjId } } });
      }

      pipeline.push({ $sort: { lastActivityAt: -1 } });

      const grouped = await Message.aggregate(pipeline);
      if (!grouped || grouped.length === 0) {
        res.set('X-Total-Count', '0');
        if (req.query.paginated === '1') {
          return res.status(200).json({ conversations: [], total: 0, page: pageNum, totalPages: 0 });
        }
        return res.status(200).json([]);
      }

      const otherUserIds = grouped.map((g) => g._id).filter(Boolean);
      const postIds = grouped.map((g) => g.lastMessage?.post).filter(Boolean);
      const orderIds = grouped.map((g) => g.lastMessage?.order).filter(Boolean);

      const [otherUsers, posts, orders, shopOrders] = await Promise.all([
        User.find({ _id: { $in: otherUserIds } })
          .select('name avatar isVerified badge lastActive shopInfo.shopName shopInfo.avatar')
          .lean(),
        postIds.length > 0
          ? Post.find({ _id: { $in: postIds } })
              .select('title name price images image author sellerId condition')
              .lean()
          : Promise.resolve([]),
        orderIds.length > 0
          ? Order.find({ _id: { $in: orderIds } })
              .select('_id status totalPrice')
              .lean()
          : Promise.resolve([]),
        onlyHasOrder
          ? Order.find({
              $or: [
                { sellerId: meObjId, buyerId: { $in: otherUserIds } },
                { seller: meObjId, buyer: { $in: otherUserIds } },
                { sellerId: meObjId, buyer: { $in: otherUserIds } },
                { seller: meObjId, buyerId: { $in: otherUserIds } }
              ]
            })
              .select('buyer buyerId')
              .lean()
          : Promise.resolve([])
      ]);

      const userMap = new Map(otherUsers.map((u) => [String(u._id), { ...u, verified: !!u.isVerified }]));
      const postMap = new Map(posts.map((p) => [String(p._id), p]));
      const orderMap = new Map(orders.map((o) => [String(o._id), o]));
      const buyerIdsWithOrder = new Set();
      shopOrders.forEach((o) => {
        if (o.buyer) buyerIdsWithOrder.add(String(o.buyer));
        if (o.buyerId) buyerIdsWithOrder.add(String(o.buyerId));
      });

      let enriched = grouped
        .map((g) => {
          const otherIdStr = String(g._id);
          const otherUser = userMap.get(otherIdStr);
          if (!otherUser) return null;

          const lm = { ...g.lastMessage };
          if (lm.post && postMap.has(String(lm.post))) {
            lm.post = postMap.get(String(lm.post));
          } else if (lm.post && typeof lm.post !== 'object') {
            lm.post = null;
          }
          if (lm.order && orderMap.has(String(lm.order))) {
            lm.order = orderMap.get(String(lm.order));
          } else if (lm.order && typeof lm.order !== 'object') {
            lm.order = null;
          }
          if (!lm.createdAt && lm.timestamp) {
            lm.createdAt = lm.timestamp;
          }

          return {
            otherUser,
            lastMessage: lm,
            sellerId: lm.sellerId ? String(lm.sellerId) : null,
            timestamp: g.lastActivityAt || lm.createdAt || lm.timestamp,
            unreadCount: g.unreadCount || 0
          };
        })
        .filter(Boolean);

      if (onlyHasOrder) {
        enriched = enriched.filter((c) => buyerIdsWithOrder.has(String(c.otherUser._id)));
      }

      if (searchQ) {
        enriched = enriched.filter((c) => {
          const nameMatch = String(c.otherUser.name || '').toLowerCase().includes(searchQ);
          const shopMatch = String(c.otherUser.shopInfo?.shopName || '').toLowerCase().includes(searchQ);
          const postTitle = String(c.lastMessage?.post?.title || c.lastMessage?.post?.name || '').toLowerCase();
          return nameMatch || shopMatch || postTitle.includes(searchQ);
        });
      }

      const total = enriched.length;
      const start = (pageNum - 1) * limitNum;
      const paged = enriched.slice(start, start + limitNum);

      res.set('X-Total-Count', String(total));
      if (req.query.paginated === '1') {
        return res.status(200).json({
          conversations: paged,
          total,
          page: pageNum,
          totalPages: Math.ceil(total / limitNum)
        });
      }
      return res.status(200).json(paged);
    } catch (error) {
      console.error('Lỗi tải danh sách hội thoại:', error);
      return res.status(500).json({ message: 'Lỗi máy chủ khi tải danh sách hội thoại' });
    }
  }

  // Helper dùng chung cho GET /unread-count và alias DEPRECATED
  async function handleUnreadCount(req, res) {
    try {
      const meObjId = toObjectId(req.user._id);
      const asScope = ['all', 'seller', 'buyer'].includes(req.query.as) ? req.query.as : 'all';
      const filter = { receiver: meObjId, isRead: false };

      if (asScope === 'seller') {
        filter.sellerId = meObjId;
      } else if (asScope === 'buyer') {
        filter.sellerId = { $ne: meObjId };
      }

      const count = await Message.countDocuments(filter);
      return res.status(200).json({ count });
    } catch (error) {
      console.error('Lỗi đếm tin nhắn chưa đọc:', error);
      return res.status(500).json({ message: 'Lỗi đếm tin nhắn chưa đọc' });
    }
  }

  // Helper dùng chung cho GET /thread/:otherId và alias DEPRECATED
  async function handleGetThread(req, res, otherId) {
    try {
      if (!otherId || !mongoose.Types.ObjectId.isValid(String(otherId))) {
        return res.status(400).json({ message: 'ID người nhận không hợp lệ' });
      }
      const meId = req.user._id;
      const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
      const before = req.query.before;

      const filter = {
        $or: [
          { sender: meId, receiver: otherId },
          { sender: otherId, receiver: meId }
        ]
      };

      if (before) {
        if (mongoose.Types.ObjectId.isValid(String(before))) {
          filter._id = { $lt: toObjectId(before) };
        } else {
          const beforeDate = new Date(before);
          if (!Number.isNaN(beforeDate.getTime())) {
            filter.$and = [
              {
                $or: [
                  { createdAt: { $lt: beforeDate } },
                  { createdAt: { $exists: false }, timestamp: { $lt: beforeDate } }
                ]
              }
            ];
          }
        }
      }

      const docs = await Message.find(filter)
        .sort({ createdAt: -1, timestamp: -1, _id: -1 })
        .limit(limitNum + 1)
        .populate('post', 'title name price images image author sellerId condition')
        .populate('order', '_id status totalPrice')
        .lean();

      const hasMore = docs.length > limitNum;
      const sliced = hasMore ? docs.slice(0, limitNum) : docs;
      const messages = sliced.reverse().map((m) => ({
        ...m,
        createdAt: m.createdAt || m.timestamp
      }));

      res.set('X-Has-More', hasMore ? 'true' : 'false');
      if (req.query.paginated === '1') {
        return res.status(200).json({ messages, hasMore });
      }
      return res.status(200).json(messages);
    } catch (error) {
      console.error('Lỗi tải nội dung cuộc trò chuyện:', error);
      return res.status(500).json({ message: 'Lỗi máy chủ khi tải tin nhắn' });
    }
  }

  // Helper dùng chung cho PUT /read/:otherId và alias DEPRECATED
  async function handleMarkRead(req, res, otherId) {
    try {
      if (!otherId || !mongoose.Types.ObjectId.isValid(String(otherId))) {
        return res.status(400).json({ message: 'ID người gửi không hợp lệ' });
      }
      const meIdStr = req.user._id.toString();
      const now = new Date();

      const result = await Message.updateMany(
        { sender: otherId, receiver: req.user._id, isRead: false },
        { $set: { isRead: true, readAt: now } }
      );

      await Notification.updateMany(
        {
          userId: req.user._id,
          type: 'MESSAGE',
          isRead: false,
          $or: [{ senderId: otherId }, { senderId: { $exists: false } }]
        },
        { $set: { isRead: true } }
      );

      if (io) {
        io.to(`user:${otherId}`).emit('messages:read', {
          byUserId: meIdStr,
          otherId: String(otherId),
          readAt: now.toISOString()
        });
        io.to(`user:${meIdStr}`).emit('inbox:update', {
          otherUserId: String(otherId),
          action: 'read'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Đã đánh dấu đã đọc',
        modifiedCount: result.modifiedCount || 0
      });
    } catch (error) {
      console.error('Lỗi đánh dấu đã đọc:', error);
      return res.status(500).json({ message: 'Lỗi đánh dấu đã đọc' });
    }
  }

  // --- CÁC ROUTE CHÍNH (JWT BẮT BUỘC) ---

  router.get('/conversations', protectStrict, handleListConversations);
  router.get('/unread-count', protectStrict, handleUnreadCount);
  router.get('/thread/:otherId', protectStrict, (req, res) => handleGetThread(req, res, req.params.otherId));
  router.put('/read/:otherId', protectStrict, (req, res) => handleMarkRead(req, res, req.params.otherId));

  router.post(
    '/',
    protectStrict,
    messageRateLimiter,
    (req, res, next) => {
      const uploader = messageUpload.fields([
        { name: 'images', maxCount: MAX_IMAGES_PER_MESSAGE },
        { name: 'image', maxCount: MAX_IMAGES_PER_MESSAGE }
      ]);
      uploader(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'Ảnh tải lên vượt quá giới hạn 5MB.' });
        }
        if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({ message: `Chỉ được đính kèm tối đa ${MAX_IMAGES_PER_MESSAGE} ảnh.` });
        }
        return res.status(err.statusCode || 400).json({ message: err.message || 'Lỗi tải ảnh đính kèm.' });
      });
    },
    async (req, res) => {
      try {
        const senderUser = req.user;
        const senderIdStr = senderUser._id.toString();
        const { receiverId, postId, orderId } = req.body || {};
        const rawContent = req.body?.content !== undefined ? req.body.content : req.body?.text;

        if (rawContent !== undefined && rawContent !== null && typeof rawContent !== 'string') {
          return res.status(400).json({ message: 'Nội dung tin nhắn không hợp lệ.' });
        }
        const content = typeof rawContent === 'string' ? rawContent.trim() : '';
        if (content.length > MAX_CONTENT_LENGTH) {
          return res.status(400).json({ message: `Tin nhắn không được vượt quá ${MAX_CONTENT_LENGTH} ký tự.` });
        }

        if (!receiverId || !mongoose.Types.ObjectId.isValid(String(receiverId))) {
          return res.status(400).json({ message: 'ID người nhận không hợp lệ.' });
        }
        if (String(receiverId) === senderIdStr) {
          return res.status(400).json({ message: 'Không thể tự nhắn tin cho chính mình.' });
        }

        const receiverUser = await User.findById(receiverId).select('-password');
        if (!receiverUser || isUserLockedOrUnavailable(receiverUser)) {
          return res.status(404).json({ message: 'Người nhận không tồn tại hoặc tài khoản đang bị khóa.' });
        }

        const uploadedFiles = [
          ...((req.files && req.files.images) || []),
          ...((req.files && req.files.image) || [])
        ];
        if (uploadedFiles.length > MAX_IMAGES_PER_MESSAGE) {
          return res.status(400).json({ message: `Chỉ được gửi tối đa ${MAX_IMAGES_PER_MESSAGE} ảnh mỗi tin.` });
        }
        const images = uploadedFiles.map(normalizeFilePath).filter(Boolean);

        let postDoc = null;
        if (postId) {
          if (!mongoose.Types.ObjectId.isValid(String(postId))) {
            return res.status(400).json({ message: 'ID sản phẩm không hợp lệ.' });
          }
          postDoc = await Post.findById(postId).select('_id title name price images image author sellerId').lean();
          if (!postDoc) {
            return res.status(404).json({ message: 'Không tìm thấy sản phẩm được gắn kèm.' });
          }
        }

        let orderDoc = null;
        if (orderId) {
          if (!mongoose.Types.ObjectId.isValid(String(orderId))) {
            return res.status(400).json({ message: 'ID đơn hàng không hợp lệ.' });
          }
          orderDoc = await Order.findById(orderId).select('_id buyer buyerId seller sellerId status totalPrice').lean();
          if (!orderDoc) {
            return res.status(404).json({ message: 'Không tìm thấy đơn hàng được gắn kèm.' });
          }
          const bId = String(orderDoc.buyerId || orderDoc.buyer || '');
          const sId = String(orderDoc.sellerId || orderDoc.seller || '');
          const pairMatches =
            (bId === senderIdStr && sId === String(receiverId)) ||
            (sId === senderIdStr && bId === String(receiverId));
          if (!pairMatches) {
            return res.status(403).json({ message: 'Bạn không có quyền gắn đơn hàng này vào cuộc trò chuyện.' });
          }
        }

        if (!content && images.length === 0 && !postDoc && !orderDoc) {
          return res.status(400).json({ message: 'Vui lòng nhập nội dung hoặc đính kèm ảnh/sản phẩm.' });
        }

        const sellerId = await resolveConversationSellerId({
          senderUser,
          receiverUser,
          postDoc,
          orderDoc
        });

        // B1: Quy tắc chống spam cho người bán khi chủ động nhắn người mua
        if (sellerId && String(sellerId) === senderIdStr) {
          const [hasPriorChat, hasSharedOrder] = await Promise.all([
            Message.exists({
              $or: [
                { sender: senderUser._id, receiver: receiverUser._id },
                { sender: receiverUser._id, receiver: senderUser._id }
              ]
            }),
            orderDoc
              ? Promise.resolve(true)
              : Order.exists({
                  $or: [
                    { sellerId: senderUser._id, buyerId: receiverUser._id },
                    { seller: senderUser._id, buyer: receiverUser._id },
                    { sellerId: senderUser._id, buyer: receiverUser._id },
                    { seller: senderUser._id, buyerId: receiverUser._id }
                  ]
                })
          ]);

          if (!hasPriorChat && !hasSharedOrder) {
            return res.status(403).json({
              message: 'Người bán chỉ được chủ động nhắn cho khách hàng đã từng liên hệ hoặc có đơn hàng với Shop.'
            });
          }
        }

        const newMessage = await Message.create({
          sender: senderUser._id,
          receiver: receiverUser._id,
          content,
          images,
          post: postDoc ? postDoc._id : null,
          order: orderDoc ? orderDoc._id : null,
          sellerId: sellerId || null,
          isRead: false
        });

        const populatedMsg = await Message.findById(newMessage._id)
          .populate('post', 'title name price images image author sellerId condition')
          .populate('order', '_id status totalPrice')
          .lean();

        const payload = {
          ...populatedMsg,
          createdAt: populatedMsg.createdAt || new Date().toISOString()
        };

        if (io) {
          io.to(`user:${receiverId}`).emit('message:new', payload);
          io.to(`user:${receiverId}`).emit('inbox:update', {
            otherUserId: senderIdStr,
            message: payload
          });
          io.to(`user:${senderIdStr}`).emit('message:new', payload);
          io.to(`user:${senderIdStr}`).emit('inbox:update', {
            otherUserId: String(receiverId),
            message: payload
          });
        }

        await upsertMessageNotification({
          io,
          sendNotification,
          receiverId: receiverUser._id,
          senderUser,
          content,
          imagesCount: images.length,
          sellerId
        });

        return res.status(201).json(payload);
      } catch (err) {
        console.error('Lỗi gửi tin nhắn:', err);
        return res.status(500).json({ message: 'Lỗi máy chủ khi lưu tin nhắn' });
      }
    }
  );

  // --- ALIAS TƯƠNG THÍCH NGƯỢC (DEPRECATED - BỎ QUA USERID TRÊN URL/BODY, CHỈ DÙNG JWT) ---

  // DEPRECATED: Dùng GET /api/messages/conversations thay thế
  router.get('/conversations/:userId', protectStrict, handleListConversations);

  // DEPRECATED: Dùng GET /api/messages/unread-count thay thế
  router.get('/unread-count/:userId', protectStrict, handleUnreadCount);

  // DEPRECATED: Dùng PUT /api/messages/read/:otherId thay thế
  router.put('/mark-read', protectStrict, (req, res) => {
    return handleMarkRead(req, res, req.body?.otherId);
  });

  // DEPRECATED: Dùng GET /api/messages/thread/:otherId thay thế
  router.get('/:user1/:user2', protectStrict, (req, res) => {
    const meStr = req.user._id.toString();
    const otherId = String(req.params.user1) === meStr ? req.params.user2 : req.params.user1;
    return handleGetThread(req, res, otherId);
  });

  return router;
};
