const crypto = require('crypto');
const moment = require('moment');
const querystring = require('qs');

const { ensureTestEnvDefaults } = require('../config/env');

if (process.env.NODE_ENV === 'test') {
  ensureTestEnvDefaults(process.env);
}

function getVnpTmnCode() {
  return process.env.VNPAY_TMN_CODE || process.env.VNP_TMNCODE || '';
}

function getVnpHashSecret() {
  return process.env.VNPAY_HASH_SECRET || process.env.VNP_HASHSECRET || '';
}

function getVnpUrl() {
  return process.env.VNPAY_URL || process.env.VNP_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
}

function getVnpReturnUrl() {
  return process.env.VNPAY_RETURN_URL || process.env.VNP_RETURNURL || 'http://localhost:3000/haipay/return';
}

const vnp_TmnCode = getVnpTmnCode();
const vnp_HashSecret = getVnpHashSecret();
const vnp_Url = getVnpUrl();
const vnp_ReturnUrl = getVnpReturnUrl();

function sortObject(obj) {
  const sorted = {};
  const keys = [];
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) keys.push(encodeURIComponent(key));
  }
  keys.sort();
  for (const k of keys) {
    sorted[k] = encodeURIComponent(obj[k]).replace(/%20/g, '+');
  }
  return sorted;
}

function signParams(params) {
  const secret = getVnpHashSecret();
  if (!secret) {
    throw new Error('Missing VNPAY_HASH_SECRET in environment variables');
  }
  const signData = querystring.stringify(sortObject(params), { encode: false });
  return crypto.createHmac('sha512', secret).update(Buffer.from(signData, 'utf-8')).digest('hex');
}

const { timingSafeStringEqual } = require('./password');

/**
 * Strict verification (C5):
 * - Xóa hoàn toàn bản legacy trả true khi không có chữ ký.
 * - Thiếu hoặc sai `vnp_SecureHash` -> trả về `false`.
 * - So sánh hằng-thời-gian (`timingSafeStringEqual`) để chống timing attack.
 */
function verifyVnpayChecksumStrict(params, secureHash) {
  const hashToVerify = secureHash || (params && params.vnp_SecureHash);
  if (!hashToVerify || typeof hashToVerify !== 'string' || !params || typeof params !== 'object') {
    return false;
  }
  const p = { ...params };
  delete p.vnp_SecureHash;
  delete p.vnp_SecureHashType;
  let expected;
  try {
    expected = signParams(p);
  } catch (e) {
    return false;
  }
  return timingSafeStringEqual(hashToVerify.toLowerCase(), expected.toLowerCase());
}

const verifyVnpayChecksum = verifyVnpayChecksumStrict;

function buildVnpayPaymentUrl({ orderId, amount, ipAddr = '127.0.0.1', orderInfo, returnUrl, orderType = 'other' }) {
  const tmn = getVnpTmnCode();
  if (!tmn) {
    throw new Error('Missing VNPAY_TMN_CODE in environment variables');
  }
  const params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: tmn,
    vnp_Locale: 'vn',
    vnp_CurrCode: 'VND',
    vnp_TxnRef: orderId.toString(),
    vnp_OrderInfo: orderInfo || ('Thanh toan don hang HaiHand ' + orderId),
    vnp_OrderType: orderType,
    vnp_Amount: Math.round(Number(amount) * 100),
    vnp_ReturnUrl: returnUrl || getVnpReturnUrl(),
    vnp_IpAddr: ipAddr,
    vnp_CreateDate: moment(new Date()).format('YYYYMMDDHHmmss')
  };
  const sorted = sortObject(params);
  sorted.vnp_SecureHash = signParams(params);
  return getVnpUrl() + '?' + querystring.stringify(sorted, { encode: false });
}

function normalizeIp(req) {
  let ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
  ip = ip.toString().split(',')[0].trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') ip = '127.0.0.1';
  return ip;
}

module.exports = {
  vnp_TmnCode,
  vnp_HashSecret,
  vnp_Url,
  vnp_ReturnUrl,
  getVnpTmnCode,
  getVnpHashSecret,
  getVnpUrl,
  getVnpReturnUrl,
  sortObject,
  signParams,
  verifyVnpayChecksum,
  verifyVnpayChecksumStrict,
  buildVnpayPaymentUrl,
  normalizeIp
};
