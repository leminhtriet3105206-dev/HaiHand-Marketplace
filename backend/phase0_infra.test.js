const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

const { validateEnv } = require('./config/env');
const User = require('./models/User');
const Order = require('./models/Order');
const {
  protect,
  requireOwnerOrAdmin,
  requireAdminJWT,
  sanitizeUser,
  publicUser
} = require('./middleware/auth');
const {
  assertString,
  assertObjectId,
  assertPositiveInt,
  assertMoney,
  mongoSanitizeMiddleware
} = require('./middleware/validate');
const { createCorsMiddleware } = require('./middleware/security');
const { createUploadMiddleware } = require('./middleware/upload');
const errorHandler = require('./middleware/errorHandler');
const { transitionOrder } = require('./utils/orderStateMachine');
const { signUserToken, signRefreshToken } = require('./utils/b2c');

const uid = () => new mongoose.Types.ObjectId();

describe('PHASE 0 - 0.2 Env Validator (backend/config/env.js)', () => {
  test('Throw lỗi rõ ràng khi thiếu biến môi trường bắt buộc (Fail-Fast)', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' }, { allowTestDefaults: false })).toThrow(
      /\[ENV_CONFIG_ERROR\].*MONGO_URI.*JWT_SECRET.*SESSION_SECRET/
    );
  });

  test('Pass và parse CORS_ORIGINS thành mảng khi đầy đủ biến môi trường', () => {
    const cfg = validateEnv(
      {
        NODE_ENV: 'production',
        MONGO_URI: 'mongodb://localhost:27017/haihand',
        JWT_SECRET: 's1',
        SESSION_SECRET: 's2',
        CLOUDINARY_CLOUD_NAME: 'c1',
        CLOUDINARY_API_KEY: 'c2',
        CLOUDINARY_API_SECRET: 'c3',
        VNPAY_TMN_CODE: 'v1',
        VNPAY_HASH_SECRET: 'v2',
        GHN_WEBHOOK_TOKEN: 'g1',
        CORS_ORIGINS: 'http://localhost:3000, https://haihand.vn',
        FIREBASE_PROJECT_ID: 'haihand-prod'
      },
      { allowTestDefaults: false }
    );
    expect(cfg.CORS_ORIGINS).toEqual(['http://localhost:3000', 'https://haihand.vn']);
    expect(cfg.VNPAY_TMN_CODE).toBe('v1');
  });
});

describe('PHASE 0 - 0.3 Shared Middlewares (auth, validate, upload, CORS, errorHandler)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test('auth.js: kiểm tra isDeleted, tokenVersion (tv), requireOwnerOrAdmin, requireAdminJWT, và từ chối refreshToken', async () => {
    const app = express();
    app.use(express.json());
    app.get('/api/me', protect, (req, res) => res.json({ id: String(req.user._id) }));
    app.put('/api/users/:id', protect, requireOwnerOrAdmin('id'), (req, res) => res.json({ updated: true }));
    app.get('/api/admin/only', requireAdminJWT, (req, res) => res.json({ admin: true }));

    const userId = uid();
    const otherId = uid();
    let dbUser = {
      _id: userId,
      role: 'Khách hàng',
      status: 'active',
      isBanned: false,
      isDeleted: false,
      tokenVersion: 2
    };

    jest.spyOn(User, 'findById').mockImplementation(() => ({
      select: jest.fn().mockImplementation(async () => dbUser)
    }));

    // 1. Token có tv = 2 khớp DB -> 200
    const validToken = signUserToken(dbUser);
    const rOk = await request(app).get('/api/me').set('Authorization', `Bearer ${validToken}`);
    expect(rOk.status).toBe(200);

    // 2. Refresh token không được dùng gọi API trực tiếp -> 401
    const refreshTok = signRefreshToken(dbUser);
    const rRefresh = await request(app).get('/api/me').set('Authorization', `Bearer ${refreshTok}`);
    expect(rRefresh.status).toBe(401);

    // 3. Khi user đổi mật khẩu làm tokenVersion tăng lên 3 -> token cũ (tv=2) bị thu hồi (401)
    dbUser = { ...dbUser, tokenVersion: 3 };
    const rRevoked = await request(app).get('/api/me').set('Authorization', `Bearer ${validToken}`);
    expect(rRevoked.status).toBe(401);

    // 4. Khi user bị đánh dấu isDeleted: true -> 403
    dbUser = { ...dbUser, tokenVersion: 2, isDeleted: true };
    const rDeleted = await request(app).get('/api/me').set('Authorization', `Bearer ${validToken}`);
    expect(rDeleted.status).toBe(403);

    // 5. requireOwnerOrAdmin: sửa đúng id của mình -> 200; sửa id người khác -> 403
    dbUser = { ...dbUser, isDeleted: false, tokenVersion: 2 };
    const rSelf = await request(app).put(`/api/users/${userId}`).set('Authorization', `Bearer ${validToken}`);
    expect(rSelf.status).toBe(200);
    const rOther = await request(app).put(`/api/users/${otherId}`).set('Authorization', `Bearer ${validToken}`);
    expect(rOther.status).toBe(403);

    // 6. requireAdminJWT: user thường -> 403; Admin -> 200
    const rNonAdmin = await request(app).get('/api/admin/only').set('Authorization', `Bearer ${validToken}`);
    expect(rNonAdmin.status).toBe(403);

    dbUser = { ...dbUser, role: 'Admin' };
    const adminToken = signUserToken(dbUser);
    const rAdmin = await request(app).get('/api/admin/only').set('Authorization', `Bearer ${adminToken}`);
    expect(rAdmin.status).toBe(200);
  });

  test('validate.js: chặn NoSQL injection object/array và kiểm tra kiểu dữ liệu chặt chẽ', () => {
    expect(() => assertString({ $ne: '' }, 'Password')).toThrow(/chuỗi ký tự/);
    expect(() => assertString(['a'], 'Email')).toThrow(/chuỗi ký tự/);
    expect(assertString('  hello@haihand.vn  ', 'Email')).toBe('hello@haihand.vn');

    expect(() => assertObjectId('12345', 'OrderId')).toThrow(/ObjectId/);
    const validId = String(uid());
    expect(assertObjectId(validId)).toBe(validId);

    expect(() => assertPositiveInt(-1)).toThrow();
    expect(() => assertPositiveInt(1.5)).toThrow();
    expect(() => assertPositiveInt('2.5')).toThrow();
    expect(assertPositiveInt('3')).toBe(3);

    expect(() => assertMoney(500)).toThrow();
    expect(assertMoney(150000)).toBe(150000);
  });

  test('mongoSanitizeMiddleware: xóa bỏ các key bắt đầu bằng $ hoặc chứa dấu chấm (.)', async () => {
    const app = express();
    app.use(express.json());
    app.use(mongoSanitizeMiddleware);
    app.post('/login', (req, res) => res.json({ body: req.body }));

    const res = await request(app)
      .post('/login')
      .send({ email: 'a@b.c', password: { $ne: '' }, 'profile.role': 'Admin' });

    expect(res.status).toBe(200);
    expect(res.body.body.password).toEqual({});
    expect(res.body.body['profile.role']).toBeUndefined();
  });

  test('CORS & errorHandler: chỉ cho phép origin trong danh sách và ẩn chi tiết lỗi 500', async () => {
    const app = express();
    app.use(createCorsMiddleware(['http://localhost:3000']));
    app.get('/ok', (req, res) => res.json({ ok: true }));
    app.get('/boom', () => {
      throw new Error('Secret DB internal stack trace at 127.0.0.1:27017');
    });
    app.use(errorHandler);

    const allowedRes = await request(app).get('/ok').set('Origin', 'http://localhost:3000');
    expect(allowedRes.status).toBe(200);
    expect(allowedRes.headers['access-control-allow-origin']).toBe('http://localhost:3000');

    const blockedRes = await request(app).get('/ok').set('Origin', 'https://evil-attacker.com');
    expect(blockedRes.status).toBe(403);
    expect(blockedRes.headers['access-control-allow-origin']).toBeUndefined();

    const errRes = await request(app).get('/boom');
    expect(errRes.status).toBe(500);
    expect(errRes.body.message).toBe('Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.');
    expect(JSON.stringify(errRes.body)).not.toMatch(/27017|stack/i);
  });

  test('upload.js: từ chối file không phải ảnh (ví dụ .exe / text/html)', async () => {
    const app = express();
    const up = createUploadMiddleware();
    app.post('/upload', up.single('image'), (req, res) => res.json({ ok: true }));
    app.use(errorHandler);

    const badRes = await request(app)
      .post('/upload')
      .attach('image', Buffer.from('<script>alert(1)</script>'), {
        filename: 'exploit.html',
        contentType: 'text/html'
      });
    expect(badRes.status).toBe(400);

    const goodRes = await request(app)
      .post('/upload')
      .attach('image', Buffer.from([0xff, 0xd8, 0xff, 0xe0]), {
        filename: 'photo.jpg',
        contentType: 'image/jpeg'
      });
    expect(goodRes.status).toBe(200);
  });

  test('sanitizeUser & publicUser: loại bỏ hoàn toàn các trường nhạy cảm', () => {
    const rawUser = {
      _id: uid(),
      name: 'Nguyễn Văn A',
      email: 'a@haihand.vn',
      phone: '0901234567',
      password: '$2a$10$hashedpassword',
      walletPin: '$2a$10$hashedpin',
      cccd: '079123456789',
      taxId: '123456789',
      bankInfo: { name: 'VCB', accountNumber: '999999', accountName: 'NGUYEN VAN A' },
      walletBalance: 5000000,
      pendingBalance: 200000,
      tokenVersion: 4,
      shopInfo: { shopName: 'Shop A', phone: '0901234567', taxCode: '999' }
    };

    const sanitized = sanitizeUser(rawUser);
    expect(sanitized.password).toBeUndefined();
    expect(sanitized.walletPin).toBeUndefined();
    expect(sanitized.cccd).toBeUndefined();
    expect(sanitized.taxId).toBeUndefined();
    expect(sanitized.bankInfo).toBeUndefined();
    expect(sanitized.tokenVersion).toBeUndefined();

    const pub = publicUser(rawUser);
    expect(pub.email).toBeUndefined();
    expect(pub.phone).toBeUndefined();
    expect(pub.walletBalance).toBeUndefined();
    expect(pub.pendingBalance).toBeUndefined();
    expect(pub.cccd).toBeUndefined();
    expect(pub.bankInfo).toBeUndefined();
    expect(pub.shopInfo.phone).toBeUndefined();
    expect(pub.shopInfo.taxCode).toBeUndefined();
    expect(pub.name).toBe('Nguyễn Văn A');
  });
});

describe('PHASE 0 - 0.4 Order State Machine (backend/utils/orderStateMachine.js)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test('Chặn đơn VNPAY/HAIPAY chưa thanh toán (unpaid) chuyển sang Processing; cho phép khi đã escrow', async () => {
    const unpaidVnpayOrder = {
      _id: uid(),
      status: 'Pending',
      paymentMethod: 'VNPAY',
      paymentStatus: 'unpaid',
      statusHistory: [],
      save: jest.fn().mockResolvedValue(true)
    };
    jest.spyOn(Order, 'findOneAndUpdate').mockResolvedValue(null);

    const blocked = await transitionOrder(unpaidVnpayOrder, 'Processing', 'seller', { notify: false });
    expect(blocked.success).toBe(false);
    expect(blocked.statusCode).toBe(400);
    expect(unpaidVnpayOrder.status).toBe('Pending');

    const escrowOrder = {
      _id: uid(),
      status: 'Pending',
      paymentMethod: 'VNPAY',
      paymentStatus: 'escrow',
      statusHistory: []
    };
    jest.spyOn(Order, 'findOneAndUpdate').mockImplementation(async (filter, update) => ({
      ...escrowOrder,
      ...update.$set,
      statusHistory: [update.$push.statusHistory]
    }));

    const allowed = await transitionOrder(escrowOrder, 'Processing', 'seller', {
      reason: 'Shop xác nhận chuẩn bị hàng',
      notify: false
    });
    expect(allowed.success).toBe(true);
    expect(allowed.order.status).toBe('Processing');
    expect(allowed.order.statusHistory).toHaveLength(1);
    expect(allowed.order.statusHistory[0]).toMatchObject({
      from: 'Pending',
      to: 'Processing',
      actor: 'seller'
    });
  });

  test('Chặn chuyển trạng thái nhảy cóc hoặc ngược chiều (Pending -> Delivered, Delivered -> Pending)', async () => {
    const o1 = { _id: uid(), status: 'Pending', paymentMethod: 'COD', paymentStatus: 'unpaid' };
    const r1 = await transitionOrder(o1, 'Delivered', 'admin', { notify: false });
    expect(r1.success).toBe(false);
    expect(r1.statusCode).toBe(400);

    const o2 = { _id: uid(), status: 'Delivered', paymentMethod: 'COD', paymentStatus: 'unpaid' };
    const r2 = await transitionOrder(o2, 'Pending', 'admin', { notify: false });
    expect(r2.success).toBe(false);
    expect(r2.statusCode).toBe(400);
  });
});
