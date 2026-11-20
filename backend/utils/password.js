const bcrypt = require('bcryptjs');

function isHash(value) {
  return /^\$2[aby]\$\d{2}\$/.test(value || '');
}

async function verifyPassword(input, stored) {
  if (!stored) return false;
  return isHash(stored) ? bcrypt.compare(input, stored) : input === stored;
}

function hashPassword(input) {
  return bcrypt.hash(input, 10);
}

module.exports = { isHash, verifyPassword, hashPassword };
