const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const request = require('supertest');
const createAdminPortalRouter = require('../routes/adminPortal');
const { isHash, verifyPassword, hashPassword } = require('../utils/password');
const { sanitizeUser } = require('../utils/b2c');

function makeChain(result) {
  const chain = {
    select: () => chain,
    populate: () => chain,
    sort: () => chain,
    limit: () => chain,
    lean: async () => result,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  };
  return chain;
}

describe('Merged Purple Admin Portal (backend/routes/adminPortal.js)', () => {
  let app;
  let adminUserDoc;

  beforeAll(async () => {
    const hashed = await hashPassword('Admin@123');
    adminUserDoc = {
      _id: '507f1f77bcf86cd799439011',
      username: 'admin',
      name: 'Super Admin',
      email: 'admin@haihand.vn',
      role: 'Admin',
      status: 'active',
      isBanned: false,
      password: hashed,
      save: jest.fn().mockResolvedValue(true)
    };

    app = express();
    app.set('trust proxy', 1);
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '../views'));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    const isCookieSecure = process.env.COOKIE_SECURE === 'true';
    app.use(
      session({
        secret: 'test-session-secret',
        resave: false,
        saveUninitialized: false,
        proxy: true,
        cookie: {
          httpOnly: true,
          sameSite: 'lax',
          secure: isCookieSecure
        }
      })
    );
    app.use((req, res, next) => {
      if (!req.headers.cookie || !req.headers.cookie.includes('XSRF_TOKEN=')) {
        res.cookie('XSRF_TOKEN', crypto.randomBytes(16).toString('hex'), {
          httpOnly: false,
          sameSite: 'lax',
          secure: isCookieSecure
        });
      }
      next();
    });

    const User = {
      findOne: jest.fn(async (query) => {
        if (query && query.username === 'admin') return adminUserDoc;
        return null;
      }),
      countDocuments: jest.fn().mockResolvedValue(5),
      find: jest.fn(() => makeChain([]))
    };
    const Product = {
      countDocuments: jest.fn().mockResolvedValue(12),
      find: jest.fn(() => makeChain([]))
    };
    const Order = {
      countDocuments: jest.fn().mockResolvedValue(3),
      aggregate: jest.fn().mockResolvedValue([{ total: 1000000 }]),
      find: jest.fn(() => makeChain([]))
    };
    const Revenue = {
      find: jest.fn(() => makeChain([])),
      aggregate: jest.fn().mockResolvedValue([{ total: 50000 }])
    };
    const GlobalSetting = {
      findOne: jest.fn(() => makeChain({ platformFeePercentage: 5 })),
      getGlobal: jest.fn().mockResolvedValue({ autoApprovePosts: false, save: jest.fn() })
    };
    const emptyModel = {
      find: jest.fn(() => makeChain([])),
      aggregate: jest.fn().mockResolvedValue([]),
      countDocuments: jest.fn().mockResolvedValue(0)
    };

    app.use(
      createAdminPortalRouter({
        User,
        Product,
        Post: Product,
        Order,
        Revenue,
        Transaction: emptyModel,
        Report: emptyModel,
        Notification: emptyModel,
        Message: emptyModel,
        SupportConversation: emptyModel,
        Category: emptyModel,
        GlobalSetting,
        UserEvent: emptyModel,
        UserNotification: { create: jest.fn() },
        upload: { single: () => (req, res, next) => next() },
        sanitizeUser,
        verifyPassword,
        hashPassword,
        isHash,
        trackServerEvent: jest.fn()
      })
    );
  });

  test('GET /login renders HaiHand Admin login page and sets XSRF_TOKEN', async () => {
    const res = await request(app).get('/login');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Hai');
    expect(res.text).toContain('Admin');
    expect(res.text).toMatch(/đăng nhập quản trị/i);
    const cookies = res.headers['set-cookie'] || [];
    expect(cookies.some((c) => c.startsWith('XSRF_TOKEN='))).toBe(true);
  });

  test('GET / redirects to /login when unauthenticated', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  test('POST /login sets connect.sid and GET / renders AdminLayout dashboard', async () => {
    const agent = request.agent(app);
    const loginRes = await agent
      .post('/login')
      .type('form')
      .send({ username: 'admin', password: 'Admin@123' });

    expect(loginRes.status).toBe(302);
    expect(loginRes.headers.location).toBe('/');
    const setCookies = loginRes.headers['set-cookie'] || [];
    expect(setCookies.some((c) => c.startsWith('connect.sid='))).toBe(true);

    const dashRes = await agent.get('/');
    expect(dashRes.status).toBe(200);
    expect(dashRes.text).toContain('admin-outlet');
    expect(dashRes.text).toContain('Hai');
  });
});
