/**
 * Middleware & helpers kiểm tra, làm sạch dữ liệu đầu vào (chống NoSQL injection & ReDoS).
 */

function stripDangerousKeys(value) {
  if (Array.isArray(value)) {
    return value.map(stripDangerousKeys);
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const clean = {};
    for (const key of Object.keys(value)) {
      if (key.startsWith('$') || key.includes('.')) {
        continue;
      }
      clean[key] = stripDangerousKeys(value[key]);
    }
    return clean;
  }
  return value;
}

function mongoSanitizeMiddleware(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = stripDangerousKeys(req.body);
  }
  if (req.params && typeof req.params === 'object') {
    req.params = stripDangerousKeys(req.params);
  }
  if (req.query && typeof req.query === 'object') {
    for (const key of Object.keys(req.query)) {
      if (key.startsWith('$') || key.includes('.')) {
        delete req.query[key];
      } else if (req.query[key] && typeof req.query[key] === 'object') {
        req.query[key] = stripDangerousKeys(req.query[key]);
      }
    }
  }
  next();
}

function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  mongoSanitizeMiddleware,
  escapeRegex,
  stripDangerousKeys
};
