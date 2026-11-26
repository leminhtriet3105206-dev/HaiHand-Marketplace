const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const UAParser = require('ua-parser-js');
const UserEvent = require('../models/UserEvent');
const AnalyticsEvent = require('../models/AnalyticsEvent');
const { Product, Post } = require('../models/Product');
const { resolveUserIdentity, requireVerifiedUser } = require('../middleware/trackAuth');
const { optionalJwtAuth } = require('../middleware/auth');
const { isAllowedEvent, sanitizeEventProps } = require('../analytics/eventSpec');
const {
  updateProfileIncremental,
  updateCoViewMatrix,
  mergeUserIdentity
} = require('../services/behaviorAnalysisService');
const { invalidateUserRecoCache } = require('../services/recommendationService');
const {
  ALLOWED_EVENT_TYPES,
  ALLOWED_SOURCES,
  SENSITIVE_FIELDS,
  RATE_LIMIT,
  MAX_BATCH_SIZE
} = require('../config/behaviorConfig');

// In-memory sliding rate limiter per IP or anonymousId
const rateLimitMap = new Map();

function isRateLimited(key) {
  const now = Date.now();
  let record = rateLimitMap.get(key);

  if (!record || now - record.resetTime > RATE_LIMIT.WINDOW_MS) {
    record = { count: 1, resetTime: now };
    rateLimitMap.set(key, record);
    return false;
  }

  record.count += 1;
  return record.count > RATE_LIMIT.MAX_REQUESTS;
}

// Clean up memory map periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now - record.resetTime > RATE_LIMIT.WINDOW_MS) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

// Bot & Crawler Detection Pattern
const BOT_REGEX = /(bot|crawl|spider|slurp|facebookexternalhit|whatsapp|headless|postman|curl|wget|python-requests)/i;

/**
 * Sanitize and whitelist metadata to prevent sensitive data leakage
 */
function sanitizeMeta(metaObj) {
  if (!metaObj || typeof metaObj !== 'object' || Array.isArray(metaObj)) {
    return {};
  }
  const clean = {};
  for (const [k, v] of Object.entries(metaObj)) {
    if (SENSITIVE_FIELDS.includes(k.toLowerCase())) continue;
    // Only accept primitive safe types
    if (typeof v === 'string') clean[k] = v.slice(0, 200);
    else if (typeof v === 'number' || typeof v === 'boolean') clean[k] = v;
  }
  return clean;
}

// Product Analytics rate limiter: 120 requests/minute/IP (Phase 1.3)
const analyticsIpRateMap = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of analyticsIpRateMap.entries()) {
    if (now - v.resetTime > 60 * 1000) analyticsIpRateMap.delete(k);
  }
}, 5 * 60 * 1000).unref();

function analyticsRateLimiter(req, res, next) {
  const ip = String(req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || 'unknown')
    .split(',')[0]
    .trim();
  const now = Date.now();
  let rec = analyticsIpRateMap.get(ip);
  if (!rec || now - rec.resetTime > 60 * 1000) {
    rec = { count: 1, resetTime: now };
    analyticsIpRateMap.set(ip, rec);
    return next();
  }
  rec.count += 1;
  if (rec.count > 120) {
    return res.status(429).json({ message: 'Quá nhiều yêu cầu phân tích, vui lòng thử lại sau.' });
  }
  return next();
}

function parseUaContext(userAgent, itemContext = {}, props = {}) {
  const parser = new UAParser(userAgent || '');
  const res = parser.getResult();
  const rawType = res.device?.type;
  let device = 'desktop';
  if (rawType === 'mobile' || rawType === 'wearable') device = 'mobile';
  else if (rawType === 'tablet') device = 'tablet';

  return {
    path: typeof (itemContext.path || props.path) === 'string'
      ? String(itemContext.path || props.path).slice(0, 300)
      : '',
    device,
    browser: String(res.browser?.name || '').slice(0, 64),
    os: String(res.os?.name || '').slice(0, 64),
    locale: typeof itemContext.locale === 'string' ? itemContext.locale.slice(0, 20) : '',
    viewport: typeof itemContext.viewport === 'string' ? itemContext.viewport.slice(0, 30) : '',
    area: typeof itemContext.area === 'string' ? itemContext.area.slice(0, 30) : ''
  };
}

function isProductAnalyticsPayload(body) {
  if (!body || typeof body !== 'object') return false;
  if (!Array.isArray(body.events)) return false;
  if (body.events.length === 0) return Boolean(body.anonymousId && body.sessionId);
  return body.events.some((ev) => ev && typeof ev === 'object' && typeof ev.name === 'string');
}

async function handleProductAnalyticsTrack(req, res) {
  try {
    const rawEvents = req.body?.events;
    if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
      return res.status(400).json({ message: 'Danh sách sự kiện không hợp lệ' });
    }
    if (rawEvents.length > 20) {
      return res.status(413).json({ message: 'Tối đa 20 sự kiện mỗi lần gửi' });
    }

    // Bỏ qua tài khoản Admin (Phase 1.3)
    if (req.user && req.user.role === 'Admin') {
      return res.status(204).end();
    }

    const anonymousId = String(req.body?.anonymousId || '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 64);
    const sessionId = String(req.body?.sessionId || '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 64);

    if (!anonymousId || !sessionId) {
      return res.status(400).json({ message: 'Thiếu anonymousId hoặc sessionId' });
    }

    const nowMs = Date.now();
    const maxSkewMs = 24 * 60 * 60 * 1000;
    const userAgent = req.headers['user-agent'] || '';
    const userId = req.user?._id ? new mongoose.Types.ObjectId(req.user._id) : null;

    const docs = [];
    for (const item of rawEvents) {
      if (!item || typeof item !== 'object') continue;
      const name = String(item.name || '').trim();
      if (!isAllowedEvent(name, 'client')) continue;

      const eventId = String(item.eventId || '').trim().slice(0, 100);
      if (!eventId) continue;

      let ts = item.ts ? new Date(item.ts) : new Date(nowMs);
      if (Number.isNaN(ts.getTime()) || Math.abs(ts.getTime() - nowMs) > maxSkewMs) {
        ts = new Date(nowMs);
      }

      const cleanProps = sanitizeEventProps(name, item.props || {});
      const context = parseUaContext(userAgent, item.context || {}, cleanProps);

      docs.push({
        eventId,
        name,
        ts,
        receivedAt: new Date(nowMs),
        anonymousId,
        sessionId,
        userId,
        props: cleanProps,
        context,
        synthetic: false
      });
    }

    if (docs.length > 0) {
      try {
        await AnalyticsEvent.insertMany(docs, { ordered: false });
      } catch (insertErr) {
        // Nuốt lỗi trùng eventId (code 11000) hoặc lỗi ghi không làm gián đoạn client
      }
    }

    return res.status(204).end();
  } catch {
    return res.status(204).end();
  }
}

/**
 * POST /api/track
 * Hỗ trợ cả Product Analytics (events[].name) và Recommendation Engine legacy (type/events[].type)
 */
router.post(
  '/track',
  express.json({ limit: '64kb' }),
  (req, res, next) => {
    if (isProductAnalyticsPayload(req.body)) {
      return analyticsRateLimiter(req, res, () =>
        optionalJwtAuth(req, res, () => handleProductAnalyticsTrack(req, res))
      );
    }
    return next();
  },
  resolveUserIdentity,
  async (req, res) => {
  try {
    // 1. Detect and silently ignore automated crawlers/bots
    const userAgent = req.headers['user-agent'] || '';
    if (BOT_REGEX.test(userAgent)) {
      return res.status(200).json({ success: true, count: 0, ignored: 'bot' });
    }

    // 2. Rate limit by verified userId, anonymousId or client IP
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const rateKey = req.userId || req.anonymousId || clientIp;
    if (isRateLimited(rateKey)) {
      return res.status(429).json({ message: 'Quá nhiều yêu cầu tracking, vui lòng thử lại sau.' });
    }

    // 3. Normalize events input (accept either an array or single event object)
    let rawEvents = req.body.events;
    if (!rawEvents && req.body.type) {
      rawEvents = [req.body];
    }

    if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
      return res.status(400).json({ message: 'Danh sách sự kiện không hợp lệ' });
    }

    // Cap batch size to MAX_BATCH_SIZE (20)
    const cappedEvents = rawEvents.slice(0, MAX_BATCH_SIZE);
    const validEventsToSave = [];

    // Pre-load products being viewed to filter out self-views by the product owner
    const viewProductIds = [];
    for (const item of cappedEvents) {
      if (item.type === 'product_view' && item.productId && mongoose.Types.ObjectId.isValid(item.productId)) {
        viewProductIds.push(new mongoose.Types.ObjectId(item.productId));
      }
    }

    const productOwnerMap = new Map();
    if (viewProductIds.length > 0) {
      const prods = await Post.find({ _id: { $in: viewProductIds } }).select('author sellerId category price').lean();
      for (const p of prods) {
        const owner = (p.sellerId || p.author || '').toString();
        productOwnerMap.set(p._id.toString(), {
          owner,
          category: p.category,
          price: p.price
        });
      }
    }

    for (const item of cappedEvents) {
      if (!item || typeof item !== 'object') continue;

      // Validate event type
      const type = String(item.type || '').trim();
      if (!ALLOWED_EVENT_TYPES.includes(type)) continue;

      // Extract & validate anonymousId
      const anonId = String(item.anonymousId || req.anonymousId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
      if (!anonId) continue;

      // Extract & validate productId
      let pId = null;
      if (item.productId && mongoose.Types.ObjectId.isValid(item.productId)) {
        pId = new mongoose.Types.ObjectId(item.productId);
      }

      // Check self-view: ignore view if user views their own shop's product
      if (type === 'product_view' && pId && req.userId) {
        const prodInfo = productOwnerMap.get(pId.toString());
        if (prodInfo && prodInfo.owner === req.userId) {
          // Skip logging view from product owner
          continue;
        }
      }

      // Enrich category and price from DB if not passed
      let category = typeof item.category === 'string' ? item.category.trim().slice(0, 100) : '';
      let price = typeof item.price === 'number' && !isNaN(item.price) ? item.price : null;
      if (pId && productOwnerMap.has(pId.toString())) {
        const dbInfo = productOwnerMap.get(pId.toString());
        if (!category && dbInfo.category) category = dbInfo.category;
        if (price === null && typeof dbInfo.price === 'number') price = dbInfo.price;
      }

      const source = ALLOWED_SOURCES.includes(item.source) ? item.source : 'other';
      const sessionId = typeof item.sessionId === 'string' ? item.sessionId.trim().slice(0, 64) : '';
      const query = typeof item.query === 'string' ? item.query.trim().slice(0, 200) : '';

      validEventsToSave.push({
        userId: req.userId ? new mongoose.Types.ObjectId(req.userId) : null,
        anonymousId: anonId,
        sessionId,
        type,
        productId: pId,
        category,
        price,
        query,
        source,
        meta: sanitizeMeta(item.meta),
        createdAt: new Date()
      });
    }

    if (validEventsToSave.length === 0) {
      return res.status(200).json({ success: true, count: 0 });
    }

    // Insert events into DB
    const savedDocs = await UserEvent.insertMany(validEventsToSave, { ordered: false });

    // Invalidate recommendation cache so subsequent fetch gets freshly updated results
    invalidateUserRecoCache({ userId: req.userId, anonymousId: req.anonymousId });

    // Non-blocking asynchronous update of Profile and Co-view
    setImmediate(async () => {
      try {
        await updateProfileIncremental(savedDocs);
        await updateCoViewMatrix(savedDocs);
      } catch (bgErr) {
        console.warn('[Track] Async background enrichment warning:', bgErr.message);
      }
    });

    return res.status(200).json({
      success: true,
      count: savedDocs.length
    });
  } catch (error) {
    console.error('[Track] Error logging user events:', error);
    // Never crash or return 500 to tracker clients
    return res.status(200).json({ success: false, error: 'Tracking silent fail', count: 0 });
  }
});

/**
 * POST /api/track/merge
 * Merge anonymous events and profile into the authenticated user profile
 */
router.post('/track/merge', requireVerifiedUser, async (req, res) => {
  try {
    const { anonymousId } = req.body;
    if (!anonymousId || typeof anonymousId !== 'string') {
      return res.status(400).json({ message: 'Thiếu anonymousId cần gộp' });
    }

    const cleanAnon = anonymousId.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    const result = await mergeUserIdentity(cleanAnon, req.userId);

    return res.status(200).json({
      success: true,
      message: 'Gộp danh tính thành công',
      ...result
    });
  } catch (error) {
    console.error('[Track] Error merging user identity:', error);
    return res.status(500).json({ message: 'Lỗi gộp danh tính: ' + error.message });
  }
});

/**
 * GET /api/track/status
 * Health check endpoint for tracking service
 */
router.get('/track/status', (req, res) => {
  res.json({
    status: 'active',
    ttlDays: 90,
    maxBatch: MAX_BATCH_SIZE
  });
});

module.exports = router;

