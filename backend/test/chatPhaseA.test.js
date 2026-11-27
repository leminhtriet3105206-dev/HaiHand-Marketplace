const http = require('http');
const path = require('path');
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const Message = require('../models/Message');
const User = require('../models/User');
const Order = require('../models/Order');
const { Post } = require('../models/Product');
const Notification = require('../models/Notification');
const { signUserToken } = require('../utils/b2c');
const { initSocket } = require('../socket');
const createMessagesRouter = require('../routes/messages');

let ioClientModule = null;
try {
  ioClientModule = require(path.resolve(__dirname, '../../frontend/node_modules/socket.io-client'));
} catch (e) {
  ioClientModule = null;
}

const oid = () => new mongoose.Types.ObjectId();

describe('PHASE A - Hệ thống Chat & Bảo mật Tin nhắn', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('A0: Message schema hỗ trợ đủ field mới, timestamps createdAt/updatedAt và giới hạn tối đa 4 ảnh', () => {
    const senderId = oid();
    const receiverId = oid();
    const sellerId = oid();
    const orderId = oid();

    const validMsg = new Message({
      sender: senderId,
      receiver: receiverId,
      content: 'Xin chào shop',
      images: ['a.jpg', 'b.jpg'],
      order: orderId,
      sellerId
    });
    expect(validMsg.validateSync()).toBeUndefined();
    expect(validMsg.sellerId.toString()).toBe(sellerId.toString());
    expect(validMsg.order.toString()).toBe(orderId.toString());
    expect(validMsg.isRead).toBe(false);
    expect(Message.schema.options.timestamps).toBe(true);

    const tooManyImages = new Message({
      sender: senderId,
      receiver: receiverId,
      images: ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg']
    });
    const err = tooManyImages.validateSync();
    expect(err).toBeDefined();
    expect(err.errors.images).toBeDefined();
  });

  test('A1 & A2: Socket.IO từ chối client không có token và phát đúng 1 sự kiện message:new cho token hợp lệ', async () => {
    const userA = {
      _id: oid(),
      name: 'User A',
      role: 'Khách hàng',
      status: 'active',
      isBanned: false,
      isDeleted: false,
      isSeller: false,
      sellerStatus: 'none'
    };
    const userB = {
      _id: oid(),
      name: 'Shop B',
      role: 'Khách hàng',
      status: 'active',
      isBanned: false,
      isDeleted: false,
      isSeller: true,
      sellerStatus: 'approved'
    };

    jest.spyOn(User, 'findById').mockImplementation((id) => ({
      select: jest.fn().mockResolvedValue(String(id) === String(userA._id) ? userA : String(id) === String(userB._id) ? userB : null)
    }));
    jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue(true);

    const app = express();
    app.use(express.json());
    const httpServer = http.createServer(app);
    const io = new Server(httpServer);
    initSocket(io);

    jest.spyOn(Message, 'findOne').mockImplementation(() => ({
      sort: () => ({ select: () => ({ lean: async () => null }) })
    }));
    const savedId = oid();
    jest.spyOn(Message, 'create').mockResolvedValue({ _id: savedId });
    jest.spyOn(Message, 'findById').mockImplementation(() => ({
      populate: () => ({
        populate: () => ({
          lean: async () => ({
            _id: savedId,
            sender: userA._id,
            receiver: userB._id,
            content: 'Chào shop ạ',
            images: [],
            sellerId: userB._id,
            isRead: false,
            createdAt: new Date().toISOString()
          })
        })
      })
    }));
    jest.spyOn(Notification, 'findOne').mockImplementation(() => ({
      sort: async () => null
    }));
    jest.spyOn(Notification, 'create').mockResolvedValue({ _id: oid() });

    app.use('/api/messages', createMessagesRouter({ io }));

    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const port = httpServer.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      if (ioClientModule) {
        const ioClient = ioClientModule.io || ioClientModule.default || ioClientModule;

        // 1. Kết nối không token -> bị từ chối
        await new Promise((resolve, reject) => {
          const badClient = ioClient(baseUrl, { transports: ['websocket'], reconnection: false });
          badClient.on('connect', () => {
            badClient.disconnect();
            reject(new Error('Socket không token không được phép kết nối'));
          });
          badClient.on('connect_error', (err) => {
            expect(err.message).toMatch(/UNAUTHORIZED/);
            badClient.disconnect();
            resolve();
          });
        });

        // 2. Kết nối có token của User B -> gửi REST từ User A -> User B nhận ĐÚNG 1 message:new
        const tokenA = signUserToken(userA);
        const tokenB = signUserToken(userB);

        const clientB = ioClient(baseUrl, {
          transports: ['websocket'],
          reconnection: false,
          auth: { token: tokenB }
        });

        await new Promise((resolve, reject) => {
          clientB.on('connect', resolve);
          clientB.on('connect_error', reject);
        });

        const received = [];
        clientB.on('message:new', (msg) => received.push(msg));

        const res = await request(app)
          .post('/api/messages')
          .set('Authorization', `Bearer ${tokenA}`)
          .send({ receiverId: userB._id.toString(), content: 'Chào shop ạ' });

        expect(res.status).toBe(201);
        await new Promise((r) => setTimeout(r, 150));

        expect(received).toHaveLength(1);
        expect(received[0].content).toBe('Chào shop ạ');
        clientB.disconnect();
      }
    } finally {
      io.close();
      await new Promise((resolve) => httpServer.close(resolve));
    }
  });

  test('A3: Từ chối request không JWT (401), bỏ qua senderId giả mạo, chặn tự nhắn và xóa clear-all', async () => {
    const userA = {
      _id: oid(),
      name: 'User A',
      role: 'Khách hàng',
      status: 'active',
      isBanned: false,
      isDeleted: false,
      isSeller: false,
      sellerStatus: 'none'
    };
    const userB = {
      _id: oid(),
      name: 'Shop B',
      role: 'Khách hàng',
      status: 'active',
      isBanned: false,
      isDeleted: false,
      isSeller: true,
      sellerStatus: 'approved'
    };
    const userC = oid();

    jest.spyOn(User, 'findById').mockImplementation((id) => ({
      select: jest.fn().mockResolvedValue(
        String(id) === String(userA._id)
          ? userA
          : String(id) === String(userB._id)
            ? userB
            : null
      )
    }));

    const app = express();
    app.use(express.json());
    const emitMock = jest.fn();
    const fakeIo = { to: jest.fn(() => ({ emit: emitMock })) };
    app.use('/api/messages', createMessagesRouter({ io: fakeIo }));

    // 1. Thiếu JWT -> 401
    const unauth1 = await request(app).get('/api/messages/conversations');
    expect(unauth1.status).toBe(401);
    const unauth2 = await request(app).get(`/api/messages/unread-count/${userA._id}`);
    expect(unauth2.status).toBe(401);
    const unauth3 = await request(app).post('/api/messages').send({ receiverId: userB._id, content: 'Hi' });
    expect(unauth3.status).toBe(401);

    const tokenA = signUserToken(userA);

    // 2. clear-all đã bị xóa (không thực hiện deleteMany, không trả trang HTML)
    const delSpy = jest.spyOn(Message, 'deleteMany');
    const clearRes = await request(app).get('/api/messages/clear-all').set('Authorization', `Bearer ${tokenA}`);
    expect(clearRes.status).not.toBe(200);
    expect(delSpy).not.toHaveBeenCalled();

    // 3. Tự nhắn cho chính mình -> 400
    const selfRes = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ receiverId: userA._id.toString(), content: 'Self' });
    expect(selfRes.status).toBe(400);

    // 4. Giả mạo senderId = userC trong body -> server vẫn lưu sender = userA
    jest.spyOn(Message, 'findOne').mockImplementation(() => ({
      sort: () => ({ select: () => ({ lean: async () => null }) })
    }));
    const createSpy = jest.spyOn(Message, 'create').mockImplementation(async (doc) => ({
      _id: oid(),
      ...doc
    }));
    jest.spyOn(Message, 'findById').mockImplementation((id) => ({
      populate: () => ({
        populate: () => ({
          lean: async () => ({
            _id: id,
            sender: userA._id,
            receiver: userB._id,
            content: 'Hello',
            sellerId: userB._id,
            createdAt: new Date().toISOString()
          })
        })
      })
    }));
    jest.spyOn(Notification, 'findOne').mockImplementation(() => ({ sort: async () => null }));
    jest.spyOn(Notification, 'create').mockResolvedValue({ _id: oid() });

    const spoofRes = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        senderId: userC.toString(),
        receiverId: userB._id.toString(),
        content: 'Hello'
      });

    expect(spoofRes.status).toBe(201);
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sender: userA._id,
        receiver: userB._id,
        sellerId: userB._id
      })
    );
  });

  test('A3 & A7: Gộp thông báo MESSAGE chưa đọc trong 10 phút và gán link theo vai trò (seller vs buyer)', async () => {
    const buyer = {
      _id: oid(),
      name: 'Người Mua',
      role: 'Khách hàng',
      status: 'active',
      isBanned: false,
      isDeleted: false,
      isSeller: false,
      sellerStatus: 'none'
    };
    const seller = {
      _id: oid(),
      name: 'Shop Uy Tín',
      role: 'Khách hàng',
      status: 'active',
      isBanned: false,
      isDeleted: false,
      isSeller: true,
      sellerStatus: 'approved'
    };

    jest.spyOn(User, 'findById').mockImplementation((id) => ({
      select: jest.fn().mockResolvedValue(
        String(id) === String(buyer._id)
          ? buyer
          : String(id) === String(seller._id)
            ? seller
            : null
      )
    }));
    jest.spyOn(Message, 'findOne').mockImplementation(() => ({
      sort: () => ({ select: () => ({ lean: async () => null }) })
    }));
    jest.spyOn(Message, 'create').mockImplementation(async (doc) => ({ _id: oid(), ...doc }));
    jest.spyOn(Message, 'findById').mockImplementation((id) => ({
      populate: () => ({
        populate: () => ({
          lean: async () => ({
            _id: id,
            sender: buyer._id,
            receiver: seller._id,
            content: 'Tin ngắn',
            sellerId: seller._id,
            createdAt: new Date().toISOString()
          })
        })
      })
    }));

    const existingNotif = {
      _id: oid(),
      userId: seller._id,
      type: 'MESSAGE',
      isRead: false,
      senderId: buyer._id,
      message: 'Cũ',
      link: '/chat',
      save: jest.fn().mockResolvedValue(true)
    };
    jest.spyOn(Notification, 'findOne').mockImplementation(() => ({
      sort: async () => existingNotif
    }));
    const notifCreateSpy = jest.spyOn(Notification, 'create');

    const app = express();
    app.use(express.json());
    const emitMock = jest.fn();
    const fakeIo = { to: jest.fn(() => ({ emit: emitMock })) };
    app.use('/api/messages', createMessagesRouter({ io: fakeIo }));

    const tokenBuyer = signUserToken(buyer);
    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${tokenBuyer}`)
      .send({ receiverId: seller._id.toString(), content: 'Tin ngắn' });

    expect(res.status).toBe(201);
    expect(notifCreateSpy).not.toHaveBeenCalled();
    expect(existingNotif.save).toHaveBeenCalled();
    expect(existingNotif.link).toBe(`/seller-channel/messages?with=${buyer._id}`);
    expect(existingNotif.message).toBe('Tin ngắn');
    expect(existingNotif.targetRole).toBe('seller');
  });

  test('A3 & A5: PUT /api/messages/read/:otherId cập nhật isRead và phát messages:read + inbox:update', async () => {
    const userA = {
      _id: oid(),
      name: 'User A',
      role: 'Khách hàng',
      status: 'active',
      isBanned: false,
      isDeleted: false
    };
    const otherId = oid();

    jest.spyOn(User, 'findById').mockImplementation(() => ({
      select: jest.fn().mockResolvedValue(userA)
    }));
    const msgUpdateSpy = jest.spyOn(Message, 'updateMany').mockResolvedValue({ modifiedCount: 3 });
    const notifUpdateSpy = jest.spyOn(Notification, 'updateMany').mockResolvedValue({ modifiedCount: 1 });

    const emitMock = jest.fn();
    const fakeIo = { to: jest.fn(() => ({ emit: emitMock })) };

    const app = express();
    app.use(express.json());
    app.use('/api/messages', createMessagesRouter({ io: fakeIo }));

    const tokenA = signUserToken(userA);
    const res = await request(app)
      .put(`/api/messages/read/${otherId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.modifiedCount).toBe(3);
    expect(msgUpdateSpy).toHaveBeenCalled();
    expect(notifUpdateSpy).toHaveBeenCalled();
    expect(fakeIo.to).toHaveBeenCalledWith(`user:${otherId}`);
    expect(emitMock).toHaveBeenCalledWith(
      'messages:read',
      expect.objectContaining({ byUserId: userA._id.toString() })
    );
    expect(fakeIo.to).toHaveBeenCalledWith(`user:${userA._id}`);
    expect(emitMock).toHaveBeenCalledWith(
      'inbox:update',
      expect.objectContaining({ otherUserId: otherId.toString(), action: 'read' })
    );
  });

  test('A3: GET /conversations lọc ẩn email/phone và trả 500 khi lỗi DB', async () => {
    const userA = {
      _id: oid(),
      name: 'User A',
      role: 'Khách hàng',
      status: 'active',
      isBanned: false,
      isDeleted: false
    };
    const userB = {
      _id: oid(),
      name: 'User B',
      avatar: 'b.png',
      isVerified: true,
      badge: 'Uy tín',
      lastActive: new Date(),
      shopInfo: { shopName: 'Shop B', avatar: 'sb.png' }
    };

    jest.spyOn(User, 'findById').mockImplementation(() => ({
      select: jest.fn().mockResolvedValue(userA)
    }));

    const msgId = oid();
    jest.spyOn(Message, 'aggregate').mockResolvedValue([
      {
        _id: userB._id,
        lastMessage: {
          _id: msgId,
          sender: userB._id,
          receiver: userA._id,
          content: 'Alo bạn ơi',
          sellerId: userB._id,
          createdAt: new Date().toISOString()
        },
        lastActivityAt: new Date(),
        unreadCount: 2
      }
    ]);
    jest.spyOn(User, 'find').mockImplementation(() => ({
      select: () => ({ lean: async () => [userB] })
    }));

    const app = express();
    app.use(express.json());
    app.use('/api/messages', createMessagesRouter({}));

    const tokenA = signUserToken(userA);
    const res = await request(app)
      .get('/api/messages/conversations')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].otherUser.email).toBeUndefined();
    expect(res.body[0].otherUser.phone).toBeUndefined();
    expect(res.body[0].unreadCount).toBe(2);

    // Lỗi DB -> trả 500 thay vì 200 []
    jest.spyOn(Message, 'aggregate').mockRejectedValue(new Error('DB down'));
    const errRes = await request(app)
      .get('/api/messages/conversations')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(errRes.status).toBe(500);
  });
});
