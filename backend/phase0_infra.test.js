const express = require('express');
const request = require('supertest');
const { createCorsMiddleware } = require('./middleware/security');

describe('CORS security middleware (Origin: null & allowlist)', () => {
  let app;

  beforeAll(() => {
    app = express();
    const corsMiddleware = createCorsMiddleware(['https://haihand-marketplace.vercel.app']);
    app.use(corsMiddleware);
    app.options(/.*/, corsMiddleware);

    app.post('/login', (req, res) => {
      res.status(200).json({ ok: true });
    });

    app.get('/api/health', (req, res) => {
      res.status(200).json({ ok: true });
    });

    app.use((err, req, res, next) => {
      res.status(err.statusCode || 500).json({
        error: err.message,
        code: err.code || 'INTERNAL_ERROR'
      });
    });
  });

  test('allows POST /login with Origin: null and Sec-Fetch-Site: same-origin without exposing ACAO: null', async () => {
    const res = await request(app)
      .post('/login')
      .set('Origin', 'null')
      .set('Sec-Fetch-Site', 'same-origin');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('allows POST /login with Origin: null and Sec-Fetch-Site: none', async () => {
    const res = await request(app)
      .post('/login')
      .set('Origin', 'null')
      .set('Sec-Fetch-Site', 'none');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('rejects Origin: null with Sec-Fetch-Site: cross-site (403 CORS_NOT_ALLOWED)', async () => {
    const res = await request(app)
      .post('/login')
      .set('Origin', 'null')
      .set('Sec-Fetch-Site', 'cross-site');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CORS_NOT_ALLOWED');
  });

  test('rejects untrusted Origin: https://evil.com with 403 CORS_NOT_ALLOWED', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'https://evil.com');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CORS_NOT_ALLOWED');
  });

  test('allows same-host Origin matching request Host header', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Host', 'haihand-marketplace.onrender.com')
      .set('Origin', 'https://haihand-marketplace.onrender.com');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://haihand-marketplace.onrender.com');
  });
});
