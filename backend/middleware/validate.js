const mongoose = require('mongoose');

class ValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = statusCode;
  }
}

/**
 * Đảm bảo giá trị là chuỗi hợp lệ; từ chối tuyệt đối Object/Array để chặn NoSQL Injection (ví dụ `{$ne: ""}`)
 */
function assertString(value, fieldName = 'Giá trị', { trim = true, allowEmpty = false, maxLength = 2000 } = {}) {
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} phải là chuỗi ký tự hợp lệ`, 400);
  }
  const normalized = trim ? value.trim() : value;
  if (!allowEmpty && normalized.length === 0) {
    throw new ValidationError(`${fieldName} không được để trống`, 400);
  }
  if (maxLength && normalized.length > maxLength) {
    throw new ValidationError(`${fieldName} không được vượt quá ${maxLength} ký tự`, 400);
  }
  return normalized;
}

/**
 * Đảm bảo giá trị là MongoDB ObjectId hợp lệ (chuỗi 24 hex hoặc instance ObjectId)
 */
function assertObjectId(value, fieldName = 'ID') {
  if (!value || (typeof value !== 'string' && !(value instanceof mongoose.Types.ObjectId))) {
    throw new ValidationError(`${fieldName} không hợp lệ`, 400);
  }
  const str = value.toString().trim();
  if (!/^[a-fA-F0-9]{24}$/.test(str) || !mongoose.Types.ObjectId.isValid(str)) {
    throw new ValidationError(`${fieldName} không đúng định dạng ObjectId`, 400);
  }
  return str;
}

/**
 * Đảm bảo giá trị là số nguyên dương (>= min, mặc định >= 1)
 */
function assertPositiveInt(value, fieldName = 'Số lượng', { min = 1, max = 1_000_000 } = {}) {
  if (typeof value === 'object' || typeof value === 'boolean' || value === null || value === undefined || value === '') {
    throw new ValidationError(`${fieldName} phải là số nguyên dương`, 400);
  }
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num) || String(value).includes('.')) {
    throw new ValidationError(`${fieldName} phải là số nguyên`, 400);
  }
  if (num < min) {
    throw new ValidationError(`${fieldName} phải lớn hơn hoặc bằng ${min}`, 400);
  }
  if (max !== undefined && num > max) {
    throw new ValidationError(`${fieldName} không được vượt quá ${max}`, 400);
  }
  return num;
}

/**
 * Đảm bảo số tiền VNĐ là số nguyên hợp lệ (>= min, mặc định >= 1000)
 */
function assertMoney(value, fieldName = 'Số tiền', { min = 1000, max = 10_000_000_000 } = {}) {
  if (typeof value === 'object' || typeof value === 'boolean' || value === null || value === undefined || value === '') {
    throw new ValidationError(`${fieldName} không hợp lệ`, 400);
  }
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < min || num > max) {
    throw new ValidationError(`${fieldName} phải là số nguyên từ ${min.toLocaleString('vi-VN')} đ trở lên`, 400);
  }
  return num;
}

/**
 * Escape ký tự đặc biệt trong RegExp để chống ReDoS / Regex Injection khi tìm kiếm
 */
function escapeRegex(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Sanitize đệ quy một object/array tại chỗ (in-place): loại bỏ mọi key bắt đầu bằng `$` hoặc chứa dấu `.`
 * Tương thích hoàn toàn với Express 5 (nơi `req.query` là getter read-only không thể gán đè `req.query = ...`).
 */
function sanitizeMongoObjectInPlace(target) {
  if (!target || typeof target !== 'object') return target;
  if (Array.isArray(target)) {
    for (let i = 0; i < target.length; i += 1) {
      sanitizeMongoObjectInPlace(target[i]);
    }
    return target;
  }
  for (const key of Object.keys(target)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete target[key];
    } else {
      sanitizeMongoObjectInPlace(target[key]);
    }
  }
  return target;
}

/**
 * Express middleware chặn NoSQL operator injection (`$ne`, `$gt`, `$where`, dấu chấm...) trên `req.body`, `req.query`, `req.params`
 */
function mongoSanitizeMiddleware(req, res, next) {
  try {
    if (req.body && typeof req.body === 'object') sanitizeMongoObjectInPlace(req.body);
    if (req.params && typeof req.params === 'object') sanitizeMongoObjectInPlace(req.params);
    if (req.query && typeof req.query === 'object') sanitizeMongoObjectInPlace(req.query);
  } catch (e) {
    // Nếu req.query là getter đóng băng trên một số route thì bỏ qua lỗi mutate
  }
  return next();
}

module.exports = {
  ValidationError,
  assertString,
  assertObjectId,
  assertPositiveInt,
  assertMoney,
  escapeRegex,
  sanitizeMongoObjectInPlace,
  mongoSanitizeMiddleware
};
