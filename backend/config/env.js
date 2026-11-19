const fs = require('fs');
const path = require('path');

/**
 * Helper: đọc giá trị biến môi trường từ một danh sách tên (hỗ trợ cả alias legacy)
 */
function pickEnv(envObj, names) {
  const list = Array.isArray(names) ? names : [names];
  for (const name of list) {
    const val = envObj[name];
    if (typeof val === 'string' && val.trim().length > 0) {
      return val.trim();
    }
  }
  return '';
}

/**
 * Gán mặc định an toàn CHO RIÊNG môi trường Jest test (`NODE_ENV === 'test'`)
 * khi chạy unit/integration test cục bộ mà người chạy test không nạp `.env`.
 * Tuyệt đối KHÔNG áp dụng cho `development` hoặc `production`.
 */
function ensureTestEnvDefaults(envObj = process.env) {
  if (envObj.NODE_ENV !== 'test') return;
  if (!pickEnv(envObj, ['MONGO_URI', 'MONGODB_URI'])) {
    envObj.MONGO_URI = 'mongodb://127.0.0.1:27017/haihand_test';
  }
  if (!pickEnv(envObj, ['JWT_SECRET'])) {
    envObj.JWT_SECRET = 'test_only_jwt_secret_do_not_use_in_prod';
  }
  if (!pickEnv(envObj, ['SESSION_SECRET'])) {
    envObj.SESSION_SECRET = 'test_only_session_secret_do_not_use_in_prod';
  }
  if (!pickEnv(envObj, ['CLOUDINARY_CLOUD_NAME'])) {
    envObj.CLOUDINARY_CLOUD_NAME = 'test_cloud';
  }
  if (!pickEnv(envObj, ['CLOUDINARY_API_KEY'])) {
    envObj.CLOUDINARY_API_KEY = 'test_api_key';
  }
  if (!pickEnv(envObj, ['CLOUDINARY_API_SECRET'])) {
    envObj.CLOUDINARY_API_SECRET = 'test_api_secret';
  }
  if (!pickEnv(envObj, ['VNPAY_TMN_CODE', 'VNP_TMNCODE'])) {
    envObj.VNPAY_TMN_CODE = 'TESTTMN1';
  }
  if (!pickEnv(envObj, ['VNPAY_HASH_SECRET', 'VNP_HASHSECRET'])) {
    envObj.VNPAY_HASH_SECRET = 'test_only_vnpay_hash_secret_key_0000';
  }
  if (!pickEnv(envObj, ['GHN_WEBHOOK_TOKEN', 'GHN_WEBHOOK_SECRET'])) {
    envObj.GHN_WEBHOOK_TOKEN = 'test_only_ghn_webhook_token';
  }
  if (!pickEnv(envObj, ['CORS_ORIGINS'])) {
    envObj.CORS_ORIGINS = 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:4001,http://127.0.0.1:4001';
  }
  if (
    !pickEnv(envObj, [
      'FIREBASE_PROJECT_ID',
      'FIREBASE_SERVICE_ACCOUNT_JSON',
      'FIREBASE_SERVICE_ACCOUNT_PATH'
    ])
  ) {
    envObj.FIREBASE_PROJECT_ID = 'haihand-test-project';
  }
}

/**
 * Kiểm tra và trả về cấu hình môi trường đã chuẩn hóa.
 * Thiếu bất kỳ biến bắt buộc nào -> throw Error ngay lúc khởi động (Fail-Fast).
 */
function validateEnv(envObj = process.env, { allowTestDefaults = true } = {}) {
  if (allowTestDefaults && envObj.NODE_ENV === 'test') {
    ensureTestEnvDefaults(envObj);
  }

  const missing = [];

  const mongoUri = pickEnv(envObj, ['MONGO_URI', 'MONGODB_URI']);
  if (!mongoUri) missing.push('MONGO_URI');

  const jwtSecret = pickEnv(envObj, ['JWT_SECRET']);
  if (!jwtSecret) missing.push('JWT_SECRET');

  const sessionSecret = pickEnv(envObj, ['SESSION_SECRET']);
  if (!sessionSecret) missing.push('SESSION_SECRET');

  const cloudinaryCloudName = pickEnv(envObj, ['CLOUDINARY_CLOUD_NAME']);
  if (!cloudinaryCloudName) missing.push('CLOUDINARY_CLOUD_NAME');

  const cloudinaryApiKey = pickEnv(envObj, ['CLOUDINARY_API_KEY']);
  if (!cloudinaryApiKey) missing.push('CLOUDINARY_API_KEY');

  const cloudinaryApiSecret = pickEnv(envObj, ['CLOUDINARY_API_SECRET']);
  if (!cloudinaryApiSecret) missing.push('CLOUDINARY_API_SECRET');

  const vnpayTmnCode = pickEnv(envObj, ['VNPAY_TMN_CODE', 'VNP_TMNCODE']);
  if (!vnpayTmnCode) missing.push('VNPAY_TMN_CODE');

  const vnpayHashSecret = pickEnv(envObj, ['VNPAY_HASH_SECRET', 'VNP_HASHSECRET']);
  if (!vnpayHashSecret) missing.push('VNPAY_HASH_SECRET');

  const ghnWebhookToken = pickEnv(envObj, ['GHN_WEBHOOK_TOKEN', 'GHN_WEBHOOK_SECRET']);
  if (!ghnWebhookToken) missing.push('GHN_WEBHOOK_TOKEN');

  const corsOriginsRaw = pickEnv(envObj, ['CORS_ORIGINS']);
  if (!corsOriginsRaw) missing.push('CORS_ORIGINS');

  // Firebase config: chấp nhận FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_SERVICE_ACCOUNT_PATH, hoặc FIREBASE_PROJECT_ID
  const firebaseProjectId = pickEnv(envObj, ['FIREBASE_PROJECT_ID']);
  const firebaseClientEmail = pickEnv(envObj, ['FIREBASE_CLIENT_EMAIL']);
  const firebasePrivateKey = pickEnv(envObj, ['FIREBASE_PRIVATE_KEY']);
  const firebaseServiceAccountJson = pickEnv(envObj, ['FIREBASE_SERVICE_ACCOUNT_JSON']);
  const firebaseServiceAccountPath = pickEnv(envObj, ['FIREBASE_SERVICE_ACCOUNT_PATH']);

  if (!firebaseProjectId && !firebaseServiceAccountJson && !firebaseServiceAccountPath) {
    missing.push('FIREBASE_PROJECT_ID (hoặc FIREBASE_SERVICE_ACCOUNT_JSON / FIREBASE_SERVICE_ACCOUNT_PATH)');
  }

  if (missing.length > 0) {
    throw new Error(
      `[ENV_CONFIG_ERROR] Thiếu biến môi trường bắt buộc: ${missing.join(', ')}. Vui lòng kiểm tra file .env (xem .env.example).`
    );
  }

  const corsOrigins = corsOriginsRaw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (corsOrigins.length === 0) {
    throw new Error('[ENV_CONFIG_ERROR] Biến môi trường CORS_ORIGINS phải chứa ít nhất 1 origin hợp lệ.');
  }

  return {
    NODE_ENV: envObj.NODE_ENV || 'development',
    PORT: Number(envObj.PORT) || 4000,
    MONGO_URI: mongoUri,
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: pickEnv(envObj, ['JWT_EXPIRES_IN']) || '2h',
    JWT_REFRESH_EXPIRES_IN: pickEnv(envObj, ['JWT_REFRESH_EXPIRES_IN']) || '7d',
    SESSION_SECRET: sessionSecret,
    CLOUDINARY_CLOUD_NAME: cloudinaryCloudName,
    CLOUDINARY_API_KEY: cloudinaryApiKey,
    CLOUDINARY_API_SECRET: cloudinaryApiSecret,
    VNPAY_TMN_CODE: vnpayTmnCode,
    VNPAY_HASH_SECRET: vnpayHashSecret,
    VNPAY_URL: pickEnv(envObj, ['VNPAY_URL', 'VNP_URL']) || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    VNPAY_RETURN_URL: pickEnv(envObj, ['VNPAY_RETURN_URL', 'VNP_RETURNURL']) || 'http://localhost:3000/payment-result',
    GHN_WEBHOOK_TOKEN: ghnWebhookToken,
    GHN_WEBHOOK_IP_ALLOWLIST: pickEnv(envObj, ['GHN_WEBHOOK_IP_ALLOWLIST'])
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean),
    CORS_ORIGINS: corsOrigins,
    FIREBASE: {
      projectId: firebaseProjectId,
      clientEmail: firebaseClientEmail,
      privateKey: firebasePrivateKey ? firebasePrivateKey.replace(/\\n/g, '\n') : '',
      serviceAccountJson: firebaseServiceAccountJson,
      serviceAccountPath: firebaseServiceAccountPath ? path.resolve(firebaseServiceAccountPath) : ''
    },
    AUTO_COMPLETE_DAYS: Math.max(1, Number(envObj.AUTO_COMPLETE_DAYS) || 7),
    COD_SETTLEMENT_MODE: pickEnv(envObj, ['COD_SETTLEMENT_MODE']) || 'wallet_credit'
  };
}

let cachedEnv = null;

function loadEnv(options = {}) {
  cachedEnv = validateEnv(process.env, options);
  return cachedEnv;
}

function getEnv() {
  if (!cachedEnv) {
    cachedEnv = validateEnv(process.env, { allowTestDefaults: true });
  }
  return cachedEnv;
}

module.exports = {
  validateEnv,
  loadEnv,
  getEnv,
  ensureTestEnvDefaults
};
