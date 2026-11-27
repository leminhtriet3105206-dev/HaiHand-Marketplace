const mongoose = require('mongoose');
const spec = require('../../analytics/event_spec.json');

const EMAIL_REGEX = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const PHONE_REGEX = /\b(?:\+?84|0)\d{8,10}\b/g;

function maskPii(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(EMAIL_REGEX, '[email]')
    .replace(PHONE_REGEX, '[phone]')
    .trim();
}

function extractDomain(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  const trimmed = raw.trim();
  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    return parsed.hostname.slice(0, 200);
  } catch {
    return trimmed.replace(/^https?:\/\//i, '').split('/')[0].slice(0, 200);
  }
}

function sanitizePropValue(rule, value) {
  if (value === undefined || value === null) return undefined;

  switch (rule.type) {
    case 'string': {
      let s = String(value);
      if (rule.maskPii) s = maskPii(s);
      if (rule.domainOnly) s = extractDomain(s);
      s = s.trim();
      if (!s) return undefined;
      if (rule.enum && !rule.enum.includes(s)) return undefined;
      return rule.maxLength ? s.slice(0, rule.maxLength) : s;
    }
    case 'number': {
      const n = Number(value);
      if (!Number.isFinite(n)) return undefined;
      if (typeof rule.min === 'number' && n < rule.min) return undefined;
      return n;
    }
    case 'objectId': {
      const idStr = String(value).trim();
      if (!mongoose.Types.ObjectId.isValid(idStr)) return undefined;
      return idStr;
    }
    case 'objectIdArray': {
      if (!Array.isArray(value)) return undefined;
      const maxItems = rule.maxItems || 20;
      const clean = [];
      for (const item of value) {
        if (clean.length >= maxItems) break;
        const idStr = String(item || '').trim();
        if (mongoose.Types.ObjectId.isValid(idStr)) {
          clean.push(idStr);
        }
      }
      return clean;
    }
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
      const maxKeys = rule.maxKeys || 10;
      const out = {};
      let count = 0;
      for (const [k, v] of Object.entries(value)) {
        if (count >= maxKeys) break;
        const key = String(k).slice(0, 40);
        if (typeof v === 'string') {
          out[key] = maskPii(v).slice(0, 100);
          count += 1;
        } else if (typeof v === 'number' && Number.isFinite(v)) {
          out[key] = v;
          count += 1;
        } else if (typeof v === 'boolean') {
          out[key] = v;
          count += 1;
        }
      }
      return out;
    }
    default:
      return undefined;
  }
}

function getEventDefinition(name) {
  if (!name || typeof name !== 'string') return null;
  return spec.events[name] || null;
}

function isAllowedEvent(name, source = 'client') {
  const def = getEventDefinition(name);
  if (!def) return false;
  if (source && def.source !== source) return false;
  return true;
}

function sanitizeEventProps(name, rawProps = {}) {
  const def = getEventDefinition(name);
  if (!def) return {};
  if (!rawProps || typeof rawProps !== 'object' || Array.isArray(rawProps)) return {};

  const allowedProps = def.props || {};
  const clean = {};
  for (const [key, rule] of Object.entries(allowedProps)) {
    if (Object.prototype.hasOwnProperty.call(rawProps, key)) {
      const sanitized = sanitizePropValue(rule, rawProps[key]);
      if (sanitized !== undefined) {
        clean[key] = sanitized;
      }
    }
  }
  return clean;
}

const CLIENT_EVENT_NAMES = Object.keys(spec.events).filter(
  (k) => spec.events[k].source === 'client'
);
const SERVER_EVENT_NAMES = Object.keys(spec.events).filter(
  (k) => spec.events[k].source === 'server'
);

module.exports = {
  EVENT_SPEC: spec,
  CLIENT_EVENT_NAMES,
  SERVER_EVENT_NAMES,
  maskPii,
  getEventDefinition,
  isAllowedEvent,
  sanitizeEventProps
};
