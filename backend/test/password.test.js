const test = require('node:test');
const assert = require('node:assert/strict');
const { isHash, verifyPassword, hashPassword } = require('../utils/password');

test('new and OTP-reset passwords can be checked after hashing', async () => {
  const stored = await hashPassword('matkhau-an-toan');
  assert.equal(isHash(stored), true);
  assert.equal(await verifyPassword('matkhau-an-toan', stored), true);
  assert.equal(await verifyPassword('sai-mat-khau', stored), false);
});

test('legacy plaintext accounts remain able to sign in', async () => {
  assert.equal(await verifyPassword('old-password', 'old-password'), true);
  assert.equal(await verifyPassword('wrong', 'old-password'), false);
});
