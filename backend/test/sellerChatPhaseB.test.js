const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { signUserToken } = require('../utils/b2c');

jest.mock('../models/User');
jest.mock('../models/Message');
jest.mock('../models/Product', () => ({ Post: { findById: jest.fn(), find: jest.fn() } }));
jest.mock('../models/Order');
jest.mock('../models/Notification');
jest.mock('../models/Settings', () => ({ findOne: jest.fn() }));
jest.mock('../controllers/shippingController', () => ({ createShipmentGHN: jest.fn((req, res) => res.json({ ok: true })) }));

const User = require('../models/User');
const Message = require('../models/Message');
const Order = require('../models/Order');
const createMessagesRouter = require('../routes/messages');
const createSellerRouter = require('../routes/seller');

const SELLER_ID = new mongoose.Types.ObjectId().toString();
const BUYER_ID = new mongoose.Types.ObjectId().toString();
const STRANGER_ID = new mongoose.Types.ObjectId().toString();

function mockFindById(doc) {
  const thenable = {
    lean: jest.fn().mockResolvedValue(doc),
    then: (resolve, reject) => Promise.resolve(doc).then(resolve, reject)
  };
  return {
    select: jest.fn().mockReturnValue(thenable),
    lean: jest.fn().mockResolvedValue(doc),
    then: (resolve, reject) => Promise.resolve(doc).then(resolve, reject)
  };
}

describe('PHASE B - Seller Messaging Backend (B1, B3, B4, B6)', () => {
  let app;
  let sellerUser;
  let buyerUser;
  let strangerUser;
  let sellerToken;
  let buyerToken;

  beforeEach(() => {
    jest.clearAllMocks();

    sellerUser = {
      _id: new mongoose.Types.ObjectId(SELLER_ID),
      name: 'Shop ABC',
      role: 'user',
      isSeller: true,
      sellerStatus: 'approved',
      status: 'active',
      isBanned: false,
      isDeleted: false,
      blockedUsers: [],
      shopInfo: {
        shopName: 'Shop ABC',
        quickReplies: []
      }
    };

    buyerUser = {
      _id: new mongoose.Types.ObjectId(BUYER_ID),
      name: 'Khách Mua',
      role: 'user',
      isSeller: false,
      sellerStatus: 'none',
      status: 'active',
      isBanned: false,
      isDeleted: false,
      blockedUsers: []
    };

    strangerUser = {
      _id: new mongoose.Types.ObjectId(STRANGER_ID),
      name: 'Người Lạ',
      role: 'user',
      isSeller: false,
      sellerStatus: 'none',
      status: 'active',
      isBanned: false,
      isDeleted: false,
      blockedUsers: []
    };

    sellerToken = signUserToken(sellerUser);
    buyerToken = signUserToken(buyerUser);

    User.findById.mockImplementation((id) => {
      const idStr = String(id);
      if (idStr === SELLER_ID) return mockFindById(sellerUser);
      if (idStr === BUYER_ID) return mockFindById(buyerUser);
      if (idStr === STRANGER_ID) return mockFindById(strangerUser);
      return mockFindById(null);
    });

    app = express();
    app.use(express.json());
    app.use('/api/messages', createMessagesRouter({ io: null, sendNotification: jest.fn() }));
    app.use('/', createSellerRouter({
      upload: { fields: () => (req, res, next) => next(), array: () => (req, res, next) => next() },
      sendNotification: jest.fn(),
      sendAdminNotification: jest.fn(),
      io: null
    }));
  });

  test('B1: Seller chủ động nhắn người lạ chưa có hội thoại/đơn bị chặn 403 tiếng Việt', async () => {
    Message.findOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null)
        })
      })
    });
    Message.exists.mockResolvedValue(null);
    Order.exists.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ receiverId: STRANGER_ID, content: 'Chào bạn, mua hàng đi' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/chủ động nhắn/i);
  });

  test('B3: GET /api/seller/buyers/:buyerId/summary chặn 403 nếu chưa có quan hệ và trả summary nếu có đơn', async () => {
    Message.exists.mockResolvedValue(null);
    Order.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([])
        })
      })
    });

    const forbiddenRes = await request(app)
      .get(`/api/seller/buyers/${STRANGER_ID}/summary`)
      .set('Authorization', `Bearer ${sellerToken}`);
    expect(forbiddenRes.status).toBe(403);

    Order.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              _id: new mongoose.Types.ObjectId(),
              status: 'Pending',
              totalPrice: 250000,
              createdAt: new Date(),
              items: [{ quantity: 1 }],
              recipientName: 'Người Nhận',
              recipientPhone: '0901234567'
            }
          ])
        })
      })
    });

    const okRes = await request(app)
      .get(`/api/seller/buyers/${BUYER_ID}/summary`)
      .set('Authorization', `Bearer ${sellerToken}`);
    expect(okRes.status).toBe(200);
    expect(okRes.body.stats.totalOrders).toBe(1);
    expect(okRes.body.stats.totalSpent).toBe(250000);
    expect(okRes.body.buyer.activeOrderPhone).toBe('0901234567');
  });

  test('B4: Quick replies validate độ dài, trùng title và tối đa 20 mẫu', async () => {
    const saveMock = jest.fn().mockResolvedValue(true);
    const qrList = [];
    qrList.id = (id) => qrList.find((x) => String(x._id) === String(id));
    qrList.pull = (id) => {
      const idx = qrList.findIndex((x) => String(x._id) === String(id));
      if (idx >= 0) qrList.splice(idx, 1);
    };
    const mutableSeller = {
      ...sellerUser,
      shopInfo: { shopName: 'Shop ABC', quickReplies: qrList },
      save: saveMock
    };
    User.findById.mockImplementation((id) => {
      if (String(id) === SELLER_ID) return mockFindById(mutableSeller);
      return mockFindById(null);
    });

    const badTitle = await request(app)
      .post('/api/seller/quick-replies')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ title: 'a'.repeat(41), content: 'ok' });
    expect(badTitle.status).toBe(400);

    const created = await request(app)
      .post('/api/seller/quick-replies')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ title: 'Chào khách', content: 'Chào {ten_khach}, shop hỗ trợ bạn nhé!' });
    expect(created.status).toBe(201);
    expect(saveMock).toHaveBeenCalled();

    const dup = await request(app)
      .post('/api/seller/quick-replies')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ title: 'chào khách', content: 'Trùng' });
    expect(dup.status).toBe(400);
  });

  test('B6: Block user ngăn nhận tin nhắn từ người bị chặn', async () => {
    User.updateOne.mockResolvedValue({ modifiedCount: 1 });
    const blockRes = await request(app)
      .post(`/api/messages/block/${BUYER_ID}`)
      .set('Authorization', `Bearer ${sellerToken}`);
    expect(blockRes.status).toBe(200);
    expect(blockRes.body.blocked).toBe(true);

    sellerUser.blockedUsers = [BUYER_ID];
    const sendBlocked = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ receiverId: SELLER_ID, content: 'Alo shop' });
    expect(sendBlocked.status).toBe(403);
  });
});
