const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const { JWT_SECRET } = require('../utils/b2c');

function extractSocketToken(socket) {
  const authToken = socket.handshake?.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.replace(/^Bearer\s+/i, '').trim();
  }
  const headerAuth = socket.handshake?.headers?.authorization;
  if (typeof headerAuth === 'string' && headerAuth.startsWith('Bearer ')) {
    return headerAuth.split(' ')[1].trim();
  }
  return '';
}

/**
 * Khởi tạo Socket.IO tập trung (duy nhất 1 khối connection trên toàn hệ thống):
 * - Xác thực JWT khi handshake (`socket.handshake.auth.token`)
 * - Join room cá nhân `user:<userId>` (và `user_<userId>` cho notificationService)
 * - Quản lý trạng thái online đa tab qua `Map<userId, Set<socketId>>`
 * - Bỏ hoàn toàn `addUser` và `sendMessage` client->server để chống giả mạo & trùng lặp
 */
function initSocket(io) {
  const onlineMap = new Map(); // Map<userId, Set<socketId>>

  const getOnlineUserIds = () => Array.from(onlineMap.keys());
  const isUserOnline = (userId) => onlineMap.has(String(userId));
  const getUserSockets = (userId) => {
    const set = onlineMap.get(String(userId));
    if (!set) return [];
    return Array.from(set).map((socketId) => ({ userId: String(userId), socketId }));
  };

  io.use(async (socket, next) => {
    try {
      const token = extractSocketToken(socket);
      if (!token || token === 'undefined' || token === 'null') {
        return next(new Error('UNAUTHORIZED: Thiếu token xác thực'));
      }

      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (err) {
        return next(new Error('UNAUTHORIZED: Token không hợp lệ hoặc đã hết hạn'));
      }

      if (decoded.type === 'refresh') {
        return next(new Error('UNAUTHORIZED: Không thể dùng refresh token'));
      }

      const userId = decoded.id || decoded._id;
      if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
        return next(new Error('UNAUTHORIZED: Token không hợp lệ'));
      }

      const user = await User.findById(userId).select('-password');
      if (!user) {
        return next(new Error('UNAUTHORIZED: Không tìm thấy người dùng'));
      }
      if (user.isDeleted) {
        return next(new Error('FORBIDDEN: Tài khoản đã bị xóa'));
      }
      const isLocked = user.isBanned || (user.status === 'locked' && (!user.lockedUntil || new Date(user.lockedUntil) > new Date()));
      if (isLocked) {
        return next(new Error('FORBIDDEN: Tài khoản đã bị khóa'));
      }

      socket.data.userId = user._id.toString();
      socket.data.user = user;
      return next();
    } catch (err) {
      return next(new Error('UNAUTHORIZED: Lỗi xác thực Socket'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    if (!userId) {
      socket.disconnect(true);
      return;
    }

    socket.join(`user:${userId}`);
    socket.join(`user_${userId}`);

    if (socket.data.user?.role === 'Admin') {
      socket.join('admin_system_room');
    }

    let socketSet = onlineMap.get(userId);
    const wasOffline = !socketSet || socketSet.size === 0;
    if (!socketSet) {
      socketSet = new Set();
      onlineMap.set(userId, socketSet);
    }
    socketSet.add(socket.id);

    // Gửi danh sách user online hiện tại (KHÔNG bao gồm socketId) cho client vừa kết nối
    socket.emit('presence:sync', { onlineUserIds: getOnlineUserIds() });

    if (wasOffline) {
      io.emit('presence:update', { userId, online: true });
    }
    // Tương thích ngược tạm thời cho các màn hình chưa chuyển sang presence:update (không lộ socketId)
    io.emit('getUsers', getOnlineUserIds().map((id) => ({ userId: id })));

    socket.on('join_admin_room', () => {
      if (socket.data.user?.role === 'Admin') {
        socket.join('admin_system_room');
      }
    });

    socket.on('typing:start', ({ toUserId } = {}) => {
      if (toUserId && mongoose.Types.ObjectId.isValid(String(toUserId)) && String(toUserId) !== userId) {
        io.to(`user:${toUserId}`).emit('typing:update', { userId, isTyping: true });
      }
    });

    socket.on('typing:stop', ({ toUserId } = {}) => {
      if (toUserId && mongoose.Types.ObjectId.isValid(String(toUserId)) && String(toUserId) !== userId) {
        io.to(`user:${toUserId}`).emit('typing:update', { userId, isTyping: false });
      }
    });

    socket.on('disconnect', async () => {
      const currentSet = onlineMap.get(userId);
      if (currentSet) {
        currentSet.delete(socket.id);
        if (currentSet.size === 0) {
          onlineMap.delete(userId);
          const lastActive = new Date();
          try {
            await User.findByIdAndUpdate(userId, { lastActive });
          } catch (e) { }
          io.emit('presence:update', { userId, online: false, lastActive });
          io.emit('getUsers', getOnlineUserIds().map((id) => ({ userId: id })));
        }
      }
    });
  });

  return {
    getOnlineUserIds,
    isUserOnline,
    getUserSockets
  };
}

module.exports = {
  initSocket,
  extractSocketToken
};
