const crypto = require('crypto');
const mongoose = require('mongoose');
const AnalyticsEvent = require('../models/AnalyticsEvent');
const { isAllowedEvent, sanitizeEventProps } = require('./eventSpec');

/**
 * Ghi nhận sự kiện chuyển đổi phía server (fire-and-forget, không làm chậm/lỗi luồng chính).
 * Chỉ chấp nhận các event có source === 'server' (hoặc bất kỳ event hợp lệ trong event_spec).
 */
function trackServerEvent(name, { userId = null, sessionId = '', anonymousId = '', props = {}, context = {} } = {}) {
  try {
    if (!isAllowedEvent(name, 'server')) {
      return Promise.resolve(null);
    }

    const cleanProps = sanitizeEventProps(name, props);
    const cleanUserId =
      userId && mongoose.Types.ObjectId.isValid(String(userId))
        ? new mongoose.Types.ObjectId(String(userId))
        : null;

    const cleanSessionId =
      typeof sessionId === 'string' && sessionId.trim()
        ? sessionId.trim().slice(0, 64)
        : 'unknown';

    const cleanAnonymousId =
      typeof anonymousId === 'string' && anonymousId.trim()
        ? anonymousId.trim().slice(0, 64)
        : (cleanUserId ? `uid_${cleanUserId.toString()}` : 'server_unknown');

    const now = new Date();
    const doc = {
      eventId: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'),
      name,
      ts: now,
      receivedAt: now,
      anonymousId: cleanAnonymousId,
      sessionId: cleanSessionId,
      userId: cleanUserId,
      props: cleanProps,
      context: {
        path: typeof context.path === 'string' ? context.path.slice(0, 300) : '',
        device: 'other',
        browser: '',
        os: '',
        locale: '',
        viewport: '',
        area: typeof context.area === 'string' ? context.area.slice(0, 50) : 'server'
      },
      synthetic: false
    };

    return AnalyticsEvent.create(doc).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

module.exports = {
  trackServerEvent
};
