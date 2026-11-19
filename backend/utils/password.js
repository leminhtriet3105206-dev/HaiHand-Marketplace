const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const BCRYPT_COST = 10;
const BCRYPT_PREFIX_REGEX = /^\$2[aby]\$\d{2}\$/;

/**
 * Băm mật khẩu bằng bcrypt với cost >= 10 (C3, C4)
 */
async function hashPassword(plainPassword, cost = BCRYPT_COST) {
  if (typeof plainPassword !== 'string' || plainPassword.length === 0) {
    throw new Error('Mật khẩu phải là chuỗi ký tự không rỗng');
  }
  const safeCost = Math.max(10, Number(cost) || BCRYPT_COST);
  return bcrypt.hash(plainPassword, safeCost);
}

/**
 * So sánh hằng-thời-gian (constant-time) hai chuỗi để chống timing attack
 */
function timingSafeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) {
    // So sánh giả với chính bufA để giữ thời gian đồng đều trước khi trả về false
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Kiểm tra mật khẩu (C3, C4):
 * - Hỗ trợ truyền vào `(userDoc, inputPassword)` hoặc `(storedPasswordString, inputPassword, userDoc)`.
 * - Nếu mật khẩu lưu trong DB đã có tiền tố `$2a$/$2b$/$2y$` -> dùng `bcrypt.compare`.
 * - Nếu mật khẩu lưu trong DB là chuỗi thô cũ (legacy plaintext) -> so sánh hằng-thời-gian (`timingSafeEqual`);
 *   nếu khớp thì **băm lại ngay bằng bcrypt (cost >= 10) và lưu vào DB** (lazy migration) để từ lần sau DB đã là bcrypt.
 */
async function verifyPassword(storedOrUser, input, optionalUserDoc = null) {
  if (typeof input !== 'string' || input.length === 0) {
    return false;
  }

  let userDoc = optionalUserDoc;
  let stored = storedOrUser;

  if (storedOrUser && typeof storedOrUser === 'object') {
    userDoc = storedOrUser;
    stored = storedOrUser.password;
  }

  if (typeof stored !== 'string' || stored.length === 0) {
    return false;
  }

  if (BCRYPT_PREFIX_REGEX.test(stored)) {
    return bcrypt.compare(input, stored);
  }

  // Legacy plaintext comparison (constant-time)
  const isMatch = timingSafeStringEqual(stored, input);
  if (!isMatch) {
    return false;
  }

  // Lazy migration: băm lại bằng bcrypt cost >= 10 và lưu ngay nếu có userDoc
  if (userDoc && typeof userDoc === 'object') {
    try {
      const upgradedHash = await hashPassword(input, BCRYPT_COST);
      userDoc.password = upgradedHash;
      if (typeof userDoc.save === 'function') {
        await userDoc.save();
      }
    } catch (upgradeErr) {
      console.warn('Lazy password migration warning:', upgradeErr.message);
    }
  }

  return true;
}

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCK_DURATION_MS = 15 * 60 * 1000; // 15 phút

/**
 * Kiểm tra mã PIN Ví HaiPay của User (H8):
 * - Băm / so sánh bằng `bcrypt.compare` (cost >= 10), hỗ trợ lazy migration nếu dữ liệu cũ lưu thô.
 * - Khóa 15 phút (`user.pinLockedUntil`) sau 5 lần nhập sai liên tiếp (`user.pinFailedAttempts`).
 */
async function verifyUserWalletPin(userDoc, inputPin) {
  if (!userDoc || typeof userDoc !== 'object') {
    return { ok: false, statusCode: 400, message: 'Không tìm thấy thông tin người dùng!' };
  }

  const now = new Date();
  if (userDoc.pinLockedUntil && new Date(userDoc.pinLockedUntil) > now) {
    const remainingMin = Math.max(1, Math.ceil((new Date(userDoc.pinLockedUntil).getTime() - now.getTime()) / 60000));
    return {
      ok: false,
      locked: true,
      statusCode: 423,
      message: `Mã PIN Ví HaiPay đang bị tạm khóa do nhập sai quá 5 lần. Vui lòng thử lại sau ${remainingMin} phút!`
    };
  }

  if (!userDoc.walletPin || typeof userDoc.walletPin !== 'string' || !userDoc.walletPin.trim()) {
    return {
      ok: false,
      noPin: true,
      statusCode: 400,
      message: 'Bạn chưa thiết lập mã PIN Ví HaiPay. Vui lòng thiết lập mã PIN 6 chữ số trong mục Ví HaiPay trước khi giao dịch!'
    };
  }

  if (typeof inputPin !== 'string' || !/^\d{6}$/.test(inputPin.trim())) {
    return {
      ok: false,
      statusCode: 400,
      message: 'Vui lòng nhập mã PIN Ví HaiPay hợp lệ (6 chữ số) để xác nhận giao dịch!'
    };
  }

  const cleanPin = inputPin.trim();
  const storedPin = userDoc.walletPin;
  let isMatch = false;

  if (BCRYPT_PREFIX_REGEX.test(storedPin)) {
    isMatch = await bcrypt.compare(cleanPin, storedPin);
  } else {
    isMatch = timingSafeStringEqual(storedPin, cleanPin);
    if (isMatch) {
      userDoc.walletPin = await hashPassword(cleanPin, BCRYPT_COST);
    }
  }

  if (!isMatch) {
    const attempts = (Number(userDoc.pinFailedAttempts) || 0) + 1;
    userDoc.pinFailedAttempts = attempts;
    let lockMsg = `Mã PIN Ví HaiPay không chính xác! (Còn ${Math.max(0, PIN_MAX_ATTEMPTS - attempts)} lần thử)`;
    let statusCode = 400;

    if (attempts >= PIN_MAX_ATTEMPTS) {
      userDoc.pinLockedUntil = new Date(Date.now() + PIN_LOCK_DURATION_MS);
      lockMsg = 'Bạn đã nhập sai mã PIN Ví HaiPay quá 5 lần. Mã PIN đã bị tạm khóa trong 15 phút!';
      statusCode = 423;
    }

    if (typeof userDoc.save === 'function') {
      try {
        await userDoc.save();
      } catch (saveErr) {
        console.warn('Save pinFailedAttempts warning:', saveErr.message);
      }
    }

    return {
      ok: false,
      locked: attempts >= PIN_MAX_ATTEMPTS,
      attempts,
      statusCode,
      message: lockMsg
    };
  }

  // Khớp mã PIN -> reset bộ đếm lỗi
  if ((userDoc.pinFailedAttempts && userDoc.pinFailedAttempts > 0) || userDoc.pinLockedUntil) {
    userDoc.pinFailedAttempts = 0;
    userDoc.pinLockedUntil = null;
    if (typeof userDoc.save === 'function') {
      try {
        await userDoc.save();
      } catch (saveErr) {}
    }
  } else if (!BCRYPT_PREFIX_REGEX.test(storedPin) && typeof userDoc.save === 'function') {
    try {
      await userDoc.save();
    } catch (saveErr) {}
  }

  return { ok: true, statusCode: 200 };
}

module.exports = {
  BCRYPT_COST,
  BCRYPT_PREFIX_REGEX,
  PIN_MAX_ATTEMPTS,
  PIN_LOCK_DURATION_MS,
  hashPassword,
  verifyPassword,
  verifyUserWalletPin,
  timingSafeStringEqual
};
