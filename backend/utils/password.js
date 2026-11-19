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

module.exports = {
  BCRYPT_COST,
  BCRYPT_PREFIX_REGEX,
  hashPassword,
  verifyPassword,
  timingSafeStringEqual
};
