const express = require('express');
const request = require('supertest');

jest.mock('../middleware/auth', () => ({ protect: (req, res, next) => next() }));
jest.mock('../services/shipping', () => ({ quotePackage: jest.fn() }));

const shipping = require('../services/shipping');
const app = express();
app.use(express.json());
app.use('/api/shipping', require('../routes/shipping'));

const body = { sellerId: 'seller', items: [{ productId: 'product', quantity: 1 }], toAddress: {} };

afterEach(() => jest.clearAllMocks());

test.each(['SELLER_NO_PICKUP_ADDRESS', 'PROVIDER_ERROR'])('uses checkout fallback for %s', async (code) => {
  shipping.quotePackage.mockRejectedValue({ code, message: code });
  const response = await request(app).post('/api/shipping/calculate').send(body);
  expect(response.status).toBe(200);
  expect(response.body.fee).toBe(25000);
});

test('keeps invalid quotes as errors', async () => {
  shipping.quotePackage.mockRejectedValue({ code: 'OWNER_MISMATCH', status: 400, message: 'Wrong seller' });
  const response = await request(app).post('/api/shipping/calculate').send(body);
  expect(response.status).toBe(400);
  expect(response.body.code).toBe('OWNER_MISMATCH');
});
