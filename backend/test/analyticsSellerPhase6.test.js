const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../middleware/auth', () => ({
  protect: (req, res, next) => {
    if (!req.headers['x-test-user']) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    req.user = JSON.parse(req.headers['x-test-user']);
    next();
  },
  isSeller: (req, res, next) => {
    if (!req.user?.isSeller) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  },
  isAdmin: (req, res, next) => next(),
}));

jest.mock('../models/Product', () => ({
  Post: {
    find: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'prod-1', title: 'Áo Vintage', category: 'Thời trang', price: 200000 },
        ]),
      }),
    }),
  },
}));

jest.mock('../models/User', () => ({}));
jest.mock('../models/Order', () => ({}));
jest.mock('../services/imageEmbeddingService', () => ({ indexProductImage: jest.fn() }));
jest.mock('../services/shipping', () => ({}));
jest.mock('../analytics/track', () => ({ trackServerEvent: jest.fn() }));

const createSellerRouter = require('../routes/seller');

describe('Seller Analytics API (Phase 6)', () => {
  let app;
  const sellerId = 'seller-123';
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);

  beforeAll(() => {
    jest.spyOn(mongoose.connection, 'collection').mockImplementation((name) => {
      if (name === 'analytics_products') {
        return {
          find: () => ({
            sort: () => ({
              toArray: async () => [
                { sellerId, date: today, views: 50, addToCart: 5, orders: 1 },
              ],
            }),
          }),
        };
      }
      if (name === 'analytics_products_summary') {
        return {
          find: () => ({
            sort: () => ({
              limit: () => ({
                toArray: async () => [
                  {
                    sellerId,
                    periodDays: 30,
                    productId: 'prod-1',
                    title: 'Áo Vintage',
                    category: 'Thời trang',
                    price: 200000,
                    views: 50,
                    addToCart: 1,
                    orders: 0,
                    cartRate: 0.02,
                    conversion: 0,
                    flagHighViewLowBuy: true,
                    flagPotential: false,
                  },
                ],
              }),
            }),
          }),
        };
      }
      if (name === 'analytics_events') {
        return {
          find: (query) => ({
            limit: () => ({
              toArray: async () => {
                if (query.name === 'product_view') {
                  return [{ ts: new Date() }];
                }
                if (query.name === 'search_result_click') {
                  return [{ props: { query: 'ao vintage' } }];
                }
                return [];
              },
            }),
          }),
        };
      }
      return {
        find: () => ({ toArray: async () => [] }),
      };
    });

    app = express();
    app.use(express.json());
    app.use(
      createSellerRouter({
        upload: {
          single: () => (req, res, next) => next(),
          array: () => (req, res, next) => next(),
          fields: () => (req, res, next) => next(),
        },
        sendNotification: jest.fn(),
        sendAdminNotification: jest.fn(),
        io: null,
      })
    );
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  test('blocks unauthenticated and non-seller users', async () => {
    const r1 = await request(app).get('/api/seller/analytics');
    expect(r1.status).toBe(401);

    const r2 = await request(app)
      .get('/api/seller/analytics')
      .set('x-test-user', JSON.stringify({ _id: 'u1', isSeller: false }));
    expect(r2.status).toBe(403);
  });

  test('returns seller analytics KPIs, suggestions, and no buyer PII', async () => {
    const res = await request(app)
      .get('/api/seller/analytics?range=30')
      .set('x-test-user', JSON.stringify({ _id: sellerId, isSeller: true }));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.kpis.totalViews).toBe(50);
    expect(res.body.topProducts).toHaveLength(1);
    expect(res.body.searchKeywords[0].query).toBe('ao vintage');
    expect(res.body.suggestions[0]).toContain('Áo Vintage');
    expect(JSON.stringify(res.body)).not.toContain('anonymousId');
    expect(JSON.stringify(res.body)).not.toContain('email');
  });
});
