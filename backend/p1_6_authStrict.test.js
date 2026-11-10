const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

const User = require('./models/User');
const Order = require('./models/Order');
const createSellerRouter = require('./routes/seller');
const { signUserToken } = require('./utils/b2c');

describe('[P1-6] Strict Bearer JWT authentication on seller & sensitive routes', () => {
  let app;
  let sellerId;
  let sellerDoc;

  beforeEach(() => {
    sellerId = new mongoose.Types.ObjectId();
    sellerDoc = {
      _id: sellerId,
      name: 'Shop Auth Test',
      email: 'seller@haihand.vn',
      role: 'Người bán',
      isSeller: true,
      sellerStatus: 'approved',
      status: 'active',
      isBanned: false,
      shopInfo: { shopName: 'Shop Auth Test' },
      save: jest.fn().mockResolvedValue(true)
    };

    jest.spyOn(User, 'findById').mockImplementation((id) => ({
      select: jest.fn().mockImplementation(async () => {
        if (String(id) === String(sellerId)) return sellerDoc;
        return null;
      })
    }));

    const chainQuery = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockResolvedValue([])
    };
    jest.spyOn(Order, 'find').mockReturnValue(chainQuery);

    app = express();
    app.use(express.json());
    const uploadStub = {
      array: () => (req, res, next) => next(),
      fields: () => (req, res, next) => next(),
      single: () => (req, res, next) => next()
    };
    app.use(
      createSellerRouter({
        upload: uploadStub,
        sendNotification: jest.fn(),
        sendAdminNotification: jest.fn(),
        io: null
      })
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('1. Rejects GET /api/seller/orders and PUT /api/seller/shop with 401 when only headers.userid is sent without Bearer token', async () => {
    const resOrders = await request(app)
      .get('/api/seller/orders')
      .set('userid', sellerId.toString());

    expect(resOrders.status).toBe(401);

    const resShop = await request(app)
      .put('/api/seller/shop')
      .set('userid', sellerId.toString())
      .send({ shopName: 'Hacked Shop Name', userId: sellerId.toString() });

    expect(resShop.status).toBe(401);
    expect(sellerDoc.save).not.toHaveBeenCalled();
  });

  test('2. Rejects GET /api/seller/orders with 401 when Bearer token is invalid even if headers.userid is valid', async () => {
    const res = await request(app)
      .get('/api/seller/orders')
      .set('Authorization', 'Bearer invalid.forged.token')
      .set('userid', sellerId.toString());

    expect(res.status).toBe(401);
  });

  test('3. Allows GET /api/seller/orders (200) when valid Seller Bearer JWT is provided', async () => {
    const validToken = signUserToken(sellerDoc);

    const res = await request(app)
      .get('/api/seller/orders')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
