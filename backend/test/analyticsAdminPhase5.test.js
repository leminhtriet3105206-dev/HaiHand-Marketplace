const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

const { createAnalyticsRouter, maskEmail, parseDateRange } = require('../../admin/routes/analytics');

function makeCursor(docs) {
  let result = [...docs];
  const cursor = {
    sort(sortObj) {
      const [[field, dir]] = Object.entries(sortObj);
      result.sort((a, b) => {
        if (a[field] === b[field]) return 0;
        return (a[field] > b[field] ? 1 : -1) * (dir >= 0 ? 1 : -1);
      });
      return cursor;
    },
    limit(n) {
      result = result.slice(0, n);
      return cursor;
    },
    toArray: async () => result,
  };
  return cursor;
}

describe('Admin Product Analytics Routes (Phase 5)', () => {
  let app;
  let sessionUser = null;
  const buyerId = new mongoose.Types.ObjectId().toString();
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);

  const mockCollections = {
    analytics_runs: [{ job: 'all', finishedAt: new Date(), error: null }],
    analytics_daily: [
      {
        date: today,
        dimension: 'overall',
        key: 'all',
        dau: 50,
        loggedInDau: 20,
        anonymousDau: 30,
        mau: 200,
        sessions: 80,
        pageViews: 240,
        avgDurationSec: 95,
        bounceRate: 42.5,
        hasSynthetic: true,
      },
      { date: today, dimension: 'device', key: 'mobile', sessions: 50, users: 35, hasSynthetic: true },
      { date: today, dimension: 'source', key: 'facebook', sessions: 30, users: 25, hasSynthetic: true },
    ],
    analytics_funnel: [
      {
        date: today,
        segment: 'all',
        totalSessions: 80,
        steps: [
          { key: 'product_view', label: 'Xem sản phẩm', sessions: 60 },
          { key: 'add_to_cart', label: 'Thêm vào giỏ', sessions: 12 },
          { key: 'checkout_start', label: 'Bắt đầu thanh toán', sessions: 6 },
          { key: 'order_placed', label: 'Đặt hàng', sessions: 4 },
          { key: 'payment_success', label: 'Thanh toán thành công', sessions: 4 },
        ],
        cartSessions: 12,
        abandonedCartSessions: 8,
        hasSynthetic: true,
      },
    ],
    analytics_segments: [
      {
        userId: buyerId,
        rfm_label: 'Có nguy cơ rời bỏ',
        frequency: 4,
        monetary: 1500000,
        recencyDays: 45,
        lastOrderAt: new Date(),
        hasSynthetic: true,
      },
    ],
    analytics_cluster_profiles: [],
    analytics_products_summary: [
      {
        periodDays: 30,
        productId: new mongoose.Types.ObjectId().toString(),
        title: 'Áo khoác Vintage',
        category: 'Thời trang',
        price: 250000,
        views: 120,
        cartRate: 0.1,
        conversion: 0.01,
        favorites: 15,
        flagHighViewLowBuy: true,
        flagPotential: false,
        hasSynthetic: true,
      },
    ],
    analytics_search: [
      {
        date: today,
        query: 'iphone 20 pro',
        count: 10,
        clicks: 0,
        zeroResults: 10,
        conversions: 0,
        hasSynthetic: true,
      },
    ],
    analytics_cohorts: [
      {
        cohortWeek: today,
        cohortSize: 40,
        eventRetention: { '0': 100, '1': 35 },
        orderRetention: { '0': 10, '1': 5 },
        hasSynthetic: true,
      },
    ],
    analytics_heatmap: [{ weekday: 6, hour: 20, period: '30d', sessions: 25 }],
  };

  let getCollection;

  beforeAll(() => {
    getCollection = (name) => {
      const docs = mockCollections[name] || [];
      return {
        find(query = {}) {
          const filtered = docs.filter((doc) => {
            for (const [k, v] of Object.entries(query)) {
              if (v && typeof v === 'object' && ('$gte' in v || '$lte' in v)) {
                if ('$gte' in v && doc[k] < v.$gte) return false;
                if ('$lte' in v && doc[k] > v.$lte) return false;
              } else if (doc[k] !== v) {
                return false;
              }
            }
            return true;
          });
          return makeCursor(filtered);
        },
        async findOne(query = {}) {
          return docs.find((doc) => Object.entries(query).every(([k, v]) => doc[k] === v)) || null;
        },
      };
    };

    const User = {
      find: () => ({
        select: () => ({
          lean: async () => [{ _id: buyerId, name: 'Nguyen Van A', email: 'nguyenvana@gmail.com' }],
        }),
      }),
    };

    app = express();
    app.use((req, res, next) => {
      req.session = { user: sessionUser };
      next();
    });

    const checkLogin = (req, res, next) => {
      const isApi = req.originalUrl.startsWith('/admin/analytics/api/');
      const user = req.session?.user;
      if (!user) {
        return isApi ? res.status(401).json({ success: false }) : res.redirect('/login');
      }
      if (user.role !== 'Admin') {
        return isApi ? res.status(403).json({ success: false }) : res.redirect('/login');
      }
      next();
    };

    app.use(createAnalyticsRouter({ checkLogin, User, getCollection }));
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  test('maskEmail and parseDateRange helpers work safely', () => {
    expect(maskEmail('nguyenvana@gmail.com')).toBe('n***@gmail.com');
    const r = parseDateRange('2024-01-01', '2026-01-01');
    expect(r.days).toBeLessThanOrEqual(365);
  });

  test('requires admin login for analytics API', async () => {
    sessionUser = null;
    const res1 = await request(app).get('/admin/analytics/api/overview');
    expect(res1.status).toBe(401);

    sessionUser = { _id: '1', role: 'User' };
    const res2 = await request(app).get('/admin/analytics/api/overview');
    expect(res2.status).toBe(403);
  });

  test('returns all 6 analytics sections for authenticated Admin with masked emails', async () => {
    sessionUser = { _id: '1', role: 'Admin' };

    const overview = await request(app).get('/admin/analytics/api/overview');
    expect(overview.status).toBe(200);
    expect(overview.body.success).toBe(true);
    expect(overview.body.hasSynthetic).toBe(true);
    expect(overview.body.kpis.totalSessions).toBe(80);
    expect(JSON.stringify(overview.body)).not.toContain('userId');

    const funnel = await request(app).get('/admin/analytics/api/funnel');
    expect(funnel.status).toBe(200);
    expect(funnel.body.steps).toHaveLength(5);
    expect(funnel.body.biggestDropStep).toBe('Thêm vào giỏ');

    const customers = await request(app).get('/admin/analytics/api/customers');
    expect(customers.status).toBe(200);
    expect(customers.body.atRiskCustomers[0].emailMasked).toBe('n***@gmail.com');
    expect(JSON.stringify(customers.body)).not.toContain('nguyenvana@gmail.com');

    const products = await request(app).get('/admin/analytics/api/products');
    expect(products.status).toBe(200);
    expect(products.body.highViewLowBuy).toHaveLength(1);

    const search = await request(app).get('/admin/analytics/api/search');
    expect(search.status).toBe(200);
    expect(search.body.zeroResultQueries[0].query).toBe('iphone 20 pro');

    const retention = await request(app).get('/admin/analytics/api/retention');
    expect(retention.status).toBe(200);
    expect(retention.body.cohorts).toHaveLength(1);

    const invalid = await request(app).get('/admin/analytics/api/invalid_sec');
    expect(invalid.status).toBe(400);
  });
});
