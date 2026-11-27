const mongoose = require('mongoose');

const retentionDays = Math.max(1, Number(process.env.ANALYTICS_RETENTION_DAYS) || 180);
const expireAfterSeconds = retentionDays * 86400;

const analyticsEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    name: { type: String, required: true, index: true },
    ts: { type: Date, required: true, index: true },
    receivedAt: { type: Date, default: Date.now },
    anonymousId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
    props: { type: mongoose.Schema.Types.Mixed, default: {} },
    context: {
      path: { type: String, default: '' },
      device: { type: String, enum: ['mobile', 'tablet', 'desktop', 'other'], default: 'desktop' },
      browser: { type: String, default: '' },
      os: { type: String, default: '' },
      locale: { type: String, default: '' },
      viewport: { type: String, default: '' },
      area: { type: String, default: '' }
    },
    synthetic: { type: Boolean, default: false, index: true }
  },
  {
    collection: 'analytics_events',
    versionKey: false
  }
);

// Compound indexes for analytics queries
analyticsEventSchema.index({ name: 1, ts: -1 });
analyticsEventSchema.index({ userId: 1, ts: -1 });
analyticsEventSchema.index({ sessionId: 1, ts: 1 });
analyticsEventSchema.index({ 'props.productId': 1, ts: -1 });

// TTL index on receivedAt (default 180 days)
analyticsEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds });

const AnalyticsEvent =
  mongoose.models.AnalyticsEvent || mongoose.model('AnalyticsEvent', analyticsEventSchema);

module.exports = AnalyticsEvent;
