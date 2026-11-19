const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');

jest.mock('./utils/otpService', () => ({
  verifyOtp: jest.fn().mockResolvedValue({ valid: false, message: 'OTP sai' }),
  createAndSaveOtp: jest.fn().mockResolvedValue(true),
  sendOtpEmail: jest.fn().mockResolvedValue(true)
}));
jest.mock('./utils/notificationService', () => ({
  sendNotification: jest.fn().mockResolvedValue(true),
  sendAdminNotification: jest.fn().mockResolvedValue(true),
  init: jest.fn()
}));

const User = require('./models/User');
const Order = require('./models/Order');
const Transaction = require('./models/Transaction');
const { Post } = require('./models/Product');
const Settings = require('./models/Settings');
const otpService = require('./utils/otpService');
const { protect } = require('./middleware/auth');
const { calculateOrderSplit, signUserToken } = require('./utils/b2c');
const haipayRouter = require('./routes/haipay');
const webhookRouter = require('./routes/webhook');
const createSellerRouter = require('./routes/seller');

const uid = () => new mongoose.Types.ObjectId();

describe('Phase 1 - protect() middleware', () => {
  const app = express();
  app.use(express.json());
  app.get('/api/anything', protect, (req, res) => res.json({ ok: true, id: String(req.user._id) }));

  const userId = uid();
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  const mockUser = (extra = {}) =>
    jest.spyOn(User, 'findById').mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: userId, role: 'Khách hàng', status: 'active', isBanned: false, ...extra })
    });

  test('userid header / query / body không còn được chấp nhận (401)', async () => {
    mockUser();
    const r1 = await request(app).get('/api/anything').set('userid', String(userId));
    const r2 = await request(app).get(`/api/anything?userId=${userId}`);
    expect(r1.status).toBe(401);
    expect(r2.status).toBe(401);
  });

  test('Bearer JWT hợp lệ -> 200', async () => {
    mockUser();
    const token = signUserToken({ _id: userId, role: 'Khách hàng' });
    const res = await request(app).get('/api/anything').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('Tài khoản bị khóa -> 403', async () => {
    mockUser({ status: 'locked' });
    const token = signUserToken({ _id: userId, role: 'Khách hàng' });
    const res = await request(app).get('/api/anything').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('isBanned -> 403', async () => {
    mockUser({ isBanned: true });
    const token = signUserToken({ _id: userId, role: 'Khách hàng' });
    const res = await request(app).get('/api/anything').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('Phase 1 - POST /api/haipay/verify-firebase (chống Account Takeover)', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/haipay', haipayRouter);

  beforeEach(() => jest.restoreAllMocks());

  test('Chỉ gửi phoneNumber -> 401, không cấp token', async () => {
    const find = jest.spyOn(User, 'findOne');
    const res = await request(app).post('/api/haipay/verify-firebase').send({ phoneNumber: '0901234567' });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
    expect(find).not.toHaveBeenCalled();
  });

  test('OTP sai -> 401', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue({ email: 'a@b.c', password: 'x', save: jest.fn() });
    otpService.verifyOtp.mockResolvedValue({ valid: false, message: 'OTP sai' });
    const res = await request(app).post('/api/haipay/verify-firebase').send({ phoneNumber: '0901234567', otp: '000000' });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  test('Mật khẩu sai -> 401', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue({ email: 'a@b.c', password: 'real', save: jest.fn() });
    const res = await request(app).post('/api/haipay/verify-firebase').send({ phoneNumber: '0901234567', password: 'fake' });
    expect(res.status).toBe(401);
  });

  test('Mật khẩu đúng (legacy plaintext) -> 200 + token', async () => {
    const user = { _id: uid(), email: 'a@b.c', password: 'real', phone: '0901234567', save: jest.fn().mockResolvedValue(true), toObject() { return { ...this }; } };
    jest.spyOn(User, 'findOne').mockResolvedValue(user);
    const res = await request(app).post('/api/haipay/verify-firebase').send({ phoneNumber: '0901234567', password: 'real' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(user.password).not.toBe('real'); // đã tự hash lại
  });
});

describe('Phase 1/3 - GHN webhook', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/webhook', webhookRouter);
  const oldSecret = process.env.GHN_WEBHOOK_SECRET;
  const oldToken = process.env.GHN_WEBHOOK_TOKEN;

  beforeEach(() => {
    jest.restoreAllMocks();
    delete process.env.GHN_WEBHOOK_TOKEN;
    delete process.env.GHN_WEBHOOK_SECRET;
  });
  afterEach(() => {
    if (oldSecret === undefined) delete process.env.GHN_WEBHOOK_SECRET;
    else process.env.GHN_WEBHOOK_SECRET = oldSecret;
    if (oldToken === undefined) delete process.env.GHN_WEBHOOK_TOKEN;
    else process.env.GHN_WEBHOOK_TOKEN = oldToken;
  });

  test('Có GHN_WEBHOOK_SECRET: thiếu/sai secret -> 401; đúng -> 200', async () => {
    process.env.GHN_WEBHOOK_SECRET = 's3cret';
    const order = { _id: uid(), status: 'Shipped', trackingLogs: [], save: jest.fn().mockResolvedValue(true) };
    jest.spyOn(Order, 'findById').mockResolvedValue(order);
    const body = { ClientOrderCode: String(order._id), Status: 'delivering' };

    expect((await request(app).post('/api/webhook/ghn').send(body)).status).toBe(401);
    expect((await request(app).post('/api/webhook/ghn').set('x-ghn-secret', 'bad').send(body)).status).toBe(401);
    expect((await request(app).post('/api/webhook/ghn').set('x-ghn-secret', 's3cret').send(body)).status).toBe(200);
  });

  test('delivered -> Delivered + deliveredAt', async () => {
    delete process.env.GHN_WEBHOOK_SECRET;
    const order = { _id: uid(), status: 'Shipped', trackingLogs: [], buyer: uid(), seller: uid(), save: jest.fn().mockResolvedValue(true) };
    jest.spyOn(Order, 'findById').mockResolvedValue(order);
    const res = await request(app).post('/api/webhook/ghn').send({ ClientOrderCode: String(order._id), Status: 'delivered' });
    expect(res.status).toBe(200);
    expect(order.status).toBe('Delivered');
    expect(order.deliveredAt).toBeInstanceOf(Date);
  });

  test('return -> chỉ đổi shippingStatus, không hủy đơn', async () => {
    delete process.env.GHN_WEBHOOK_SECRET;
    const order = { _id: uid(), status: 'Shipped', trackingLogs: [], buyer: uid(), seller: uid(), save: jest.fn().mockResolvedValue(true) };
    jest.spyOn(Order, 'findById').mockResolvedValue(order);
    const res = await request(app).post('/api/webhook/ghn').send({ ClientOrderCode: String(order._id), Status: 'return' });
    expect(res.status).toBe(200);
    expect(order.shippingStatus).toBe('return');
    expect(order.status).toBe('Shipped');
  });

  test('cancel -> hoàn tiền Buyer, trừ pendingBalance Seller, hoàn kho + giảm soldCount', async () => {
    delete process.env.GHN_WEBHOOK_SECRET;
    const buyer = uid(), seller = uid(), product = uid();
    const order = {
      _id: uid(), buyer, buyerId: buyer, seller, sellerId: seller,
      status: 'Shipped', paymentStatus: 'escrow', totalPrice: 105000, itemsSubtotal: 100000, shippingFee: 5000,
      orderItems: [{ productId: product, quantity: 2 }], trackingLogs: [], save: jest.fn().mockResolvedValue(true)
    };
    jest.spyOn(Order, 'findById').mockResolvedValue(order);
    jest.spyOn(Settings, 'findOne').mockResolvedValue({ commissionRate: 5 });
    jest.spyOn(Order, 'findOneAndUpdate').mockResolvedValue({ ...order, status: 'Cancelled', paymentStatus: 'refunded' });
    const userInc = jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({});
    jest.spyOn(Transaction, 'create').mockResolvedValue({});
    const postInc = jest.spyOn(Post, 'findByIdAndUpdate').mockResolvedValue({ soldCount: 0, status: 'active', stockQuantity: 5 });

    const res = await request(app).post('/api/webhook/ghn').send({ ClientOrderCode: String(order._id), Status: 'cancel', Reason: 'Khách từ chối' });
    expect(res.status).toBe(200);
    expect(userInc).toHaveBeenCalledWith(buyer, { $inc: { walletBalance: 105000 } });
    expect(userInc).toHaveBeenCalledWith(seller, { $inc: { pendingBalance: -95000 } });
    expect(postInc.mock.calls[0][1].$inc).toEqual({ stockQuantity: 2, quantity: 2, soldCount: -2 });
  });
});

describe('Phase 2 - calculateOrderSplit tách phí ship', () => {
  test('Hoa hồng chỉ tính trên tiền hàng', () => {
    const r = calculateOrderSplit({ itemsSubtotal: 200000, shippingFee: 30000, totalPrice: 230000 }, 5);
    expect(r.commissionAmount).toBe(10000);
    expect(r.sellerReceive).toBe(190000);
    expect(r.sellerReceiveWithShipping).toBe(220000);
  });
  test('Không có itemsSubtotal -> suy ra từ total - ship', () => {
    const r = calculateOrderSplit({ totalPrice: 130000, shippingFee: 30000 }, 10);
    expect(r.commissionAmount).toBe(10000);
    expect(r.sellerReceive).toBe(90000);
  });
  test('Nhận số thuần', () => {
    const r = calculateOrderSplit(100000, 5);
    expect(r.sellerReceive).toBe(95000);
  });
});

describe('Phase 3 - Seller không được tự Delivered/Completed', () => {
  const sellerId = uid();
  const seller = { _id: sellerId, role: 'Khách hàng', status: 'active', isBanned: false, isSeller: true, sellerStatus: 'approved' };
  const app = express();
  app.use(express.json());
  const stub = { array: () => (q, s, n) => n(), fields: () => (q, s, n) => n(), single: () => (q, s, n) => n() };
  app.use(createSellerRouter({ upload: stub, sendNotification: jest.fn(), sendAdminNotification: jest.fn(), io: null }));

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(User, 'findById').mockReturnValue({ select: jest.fn().mockResolvedValue(seller) });
  });

  const put = (status, next) => {
    const order = { _id: uid(), seller: sellerId, sellerId, status, save: jest.fn() };
    jest.spyOn(Order, 'findById').mockReturnValue({ populate: jest.fn().mockResolvedValue(order) });
    return request(app)
      .put(`/api/seller/orders/${order._id}/status`)
      .set('Authorization', `Bearer ${signUserToken(seller)}`)
      .send({ status: next });
  };

  test.each([
    ['Shipped', 'Delivered'],
    ['Delivered', 'Completed'],
    ['Processing', 'Completed'],
    ['Pending', 'Delivered']
  ])('%s -> %s bị chặn (400)', async (from, to) => {
    expect((await put(from, to)).status).toBe(400);
  });
});
