const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { signUserToken } = require('../utils/b2c');

jest.mock('../models/AnalyticsEvent');
jest.mock('../models/User');
jest.mock('../models/UserEvent', () => ({ insertMany: jest.fn().mockResolvedValue([]) }));
jest.mock('../models/Product', () => ({
  Product: {},
  Post: { find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }) }
}));
jest.mock('../services/behaviorAnalysisService', () => ({
  updateProfileIncremental: jest.fn(),
  updateCoViewMatrix: jest.fn(),
  mergeUserIdentity: jest.fn()
}));
jest.mock('../services/recommendationService', () => ({
  invalidateUserRecoCache: jest.fn()
}));

const AnalyticsEvent = require('../models/AnalyticsEvent');
const User = require('../models/User');
const trackRouter = require('../routes/track');
const { trackServerEvent } = require('../analytics/track');

const NORMAL_USER_ID = new mongoose.Types.ObjectId().toString();
const ADMIN_USER_ID = new mongoose.Types.ObjectId().toString();
const VALID_PRODUCT_ID = new mongoose.Types.ObjectId().toString();

function mockFindById(doc) {
  const thenable = {
    lean: jest.fn().mockResolvedValue(doc),
    then: (resolve, reject) => Promise.resolve(doc).then(resolve, reject)
  };
  return {
    select: jest.fn().mockReturnValue(thenable),
    then: (resolve, reject) => Promise.resolve(doc).then(resolve, reject)
  };
}

describe('PHASE 1 - Product Analytics Event Spec, Model & /api/track', () => {
  let app;
  let normalToken;
  let adminToken;

  beforeEach(() => {
    jest.clearAllMocks();

    const normalUser = {
      _id: new mongoose.Types.ObjectId(NORMAL_USER_ID),
      role: 'Khách hàng',
      isDeleted: false,
      isBanned: false
    };
    const adminUser = {
      _id: new mongoose.Types.ObjectId(ADMIN_USER_ID),
      role: 'Admin',
      isDeleted: false,
      isBanned: false
    };

    normalToken = signUserToken(normalUser);
    adminToken = signUserToken(adminUser);

    User.findById.mockImplementation((id) => {
      if (String(id) === NORMAL_USER_ID) return mockFindById(normalUser);
      if (String(id) === ADMIN_USER_ID) return mockFindById(adminUser);
      return mockFindById(null);
    });

    AnalyticsEvent.insertMany.mockResolvedValue([]);
    AnalyticsEvent.create.mockResolvedValue({});

    app = express();
    app.use('/api', trackRouter);
  });

  test('1. Lưu sự kiện hợp lệ kèm context thiết bị từ UA và trả về 204', async () => {
    const res = await request(app)
      .post('/api/track')
      .set('Authorization', `Bearer ${normalToken}`)
      .set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1')
      .send({
        anonymousId: 'anon_123',
        sessionId: 'sess_123',
        events: [
          {
            eventId: 'evt_1',
            name: 'product_view',
            ts: new Date().toISOString(),
            props: {
              productId: VALID_PRODUCT_ID,
              price: 150000,
              fromList: 'home',
              position: 2,
              extraHackField: 'should_be_stripped'
            }
          }
        ]
      });

    expect(res.status).toBe(204);
    expect(AnalyticsEvent.insertMany).toHaveBeenCalledTimes(1);
    const savedDocs = AnalyticsEvent.insertMany.mock.calls[0][0];
    expect(savedDocs).toHaveLength(1);
    expect(savedDocs[0].name).toBe('product_view');
    expect(String(savedDocs[0].userId)).toBe(NORMAL_USER_ID);
    expect(savedDocs[0].props.productId).toBe(VALID_PRODUCT_ID);
    expect(savedDocs[0].props.extraHackField).toBeUndefined();
    expect(savedDocs[0].context.device).toBe('mobile');
  });

  test('2. Loại bỏ event lạ và event chỉ dành cho server (order_placed)', async () => {
    const res = await request(app)
      .post('/api/track')
      .send({
        anonymousId: 'anon_123',
        sessionId: 'sess_123',
        events: [
          { eventId: 'evt_unknown', name: 'hack_event', ts: new Date().toISOString(), props: {} },
          { eventId: 'evt_srv', name: 'order_placed', ts: new Date().toISOString(), props: { value: 999 } }
        ]
      });

    expect(res.status).toBe(204);
    expect(AnalyticsEvent.insertMany).not.toHaveBeenCalled();
  });

  test('3. Nuốt lỗi trùng eventId (11000) và vẫn trả 204', async () => {
    AnalyticsEvent.insertMany.mockRejectedValue(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));

    const res = await request(app)
      .post('/api/track')
      .send({
        anonymousId: 'anon_123',
        sessionId: 'sess_123',
        events: [{ eventId: 'dup_1', name: 'page_view', ts: new Date().toISOString(), props: { path: '/' } }]
      });

    expect(res.status).toBe(204);
  });

  test('4. Từ chối lô > 20 sự kiện với mã 413', async () => {
    const events = Array.from({ length: 21 }, (_, i) => ({
      eventId: `evt_${i}`,
      name: 'page_view',
      ts: new Date().toISOString(),
      props: { path: '/' }
    }));

    const res = await request(app)
      .post('/api/track')
      .send({ anonymousId: 'anon_123', sessionId: 'sess_123', events });

    expect(res.status).toBe(413);
    expect(AnalyticsEvent.insertMany).not.toHaveBeenCalled();
  });

  test('5. Che email và SĐT trong search.props.query trước khi lưu', async () => {
    const res = await request(app)
      .post('/api/track')
      .send({
        anonymousId: 'anon_123',
        sessionId: 'sess_123',
        events: [
          {
            eventId: 'evt_search',
            name: 'search',
            ts: new Date().toISOString(),
            props: { query: 'tìm iphone liên hệ abc@gmail.com hoặc 0901234567', resultCount: 3 }
          }
        ]
      });

    expect(res.status).toBe(204);
    const saved = AnalyticsEvent.insertMany.mock.calls[0][0][0];
    expect(saved.props.query).not.toContain('abc@gmail.com');
    expect(saved.props.query).not.toContain('0901234567');
    expect(saved.props.query).toContain('[email]');
    expect(saved.props.query).toContain('[phone]');
  });

  test('6. Bỏ qua tài khoản Admin (trả 204 nhưng không ghi DB)', async () => {
    const res = await request(app)
      .post('/api/track')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        anonymousId: 'anon_admin',
        sessionId: 'sess_admin',
        events: [{ eventId: 'evt_a', name: 'page_view', ts: new Date().toISOString(), props: { path: '/' } }]
      });

    expect(res.status).toBe(204);
    expect(AnalyticsEvent.insertMany).not.toHaveBeenCalled();
  });

  test('7. Header userid bị bỏ qua hoàn toàn (không gán userId khi thiếu JWT)', async () => {
    const res = await request(app)
      .post('/api/track')
      .set('userid', NORMAL_USER_ID)
      .send({
        anonymousId: 'anon_spoof',
        sessionId: 'sess_spoof',
        events: [{ eventId: 'evt_s', name: 'page_view', ts: new Date().toISOString(), props: { path: '/' } }]
      });

    expect(res.status).toBe(204);
    const saved = AnalyticsEvent.insertMany.mock.calls[0][0][0];
    expect(saved.userId).toBeNull();
  });

  test('8. Kẹp ts lệch > 24h về giờ server', async () => {
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    await request(app)
      .post('/api/track')
      .send({
        anonymousId: 'anon_ts',
        sessionId: 'sess_ts',
        events: [{ eventId: 'evt_ts', name: 'page_view', ts: oldDate, props: { path: '/' } }]
      });

    const saved = AnalyticsEvent.insertMany.mock.calls[0][0][0];
    expect(Math.abs(Date.now() - new Date(saved.ts).getTime())).toBeLessThan(60 * 1000);
  });

  test('9. trackServerEvent lưu sự kiện server và nuốt lỗi DB', async () => {
    await trackServerEvent('order_placed', {
      userId: NORMAL_USER_ID,
      sessionId: 'sess_srv',
      anonymousId: 'anon_srv',
      props: { orderId: VALID_PRODUCT_ID, value: 300000, itemCount: 2, paymentMethod: 'COD' }
    });
    expect(AnalyticsEvent.create).toHaveBeenCalledTimes(1);

    AnalyticsEvent.create.mockRejectedValueOnce(new Error('Mongo down'));
    await expect(
      trackServerEvent('order_placed', { userId: NORMAL_USER_ID, props: { orderId: VALID_PRODUCT_ID } })
    ).resolves.toBeNull();
  });
});
