const { buildVnpayPaymentUrl, formatVnpayDate, verifyVnpayChecksumStrict } = require('../utils/vnpay');

test('VNPAY URL uses Vietnam time, expiry and a verifiable signature', () => {
  expect(formatVnpayDate(new Date('2026-11-19T17:00:00Z'))).toBe('20261120000000');

  const url = new URL(buildVnpayPaymentUrl({ orderId: 'TEST-ORDER', amount: 50000 }));
  const params = Object.fromEntries(url.searchParams);
  const created = params.vnp_CreateDate;
  const expired = params.vnp_ExpireDate;
  expect(created).toMatch(/^\d{14}$/);
  expect(expired).toMatch(/^\d{14}$/);
  const toUtc = (value) => Date.UTC(+value.slice(0, 4), +value.slice(4, 6) - 1, +value.slice(6, 8), +value.slice(8, 10) - 7, +value.slice(10, 12), +value.slice(12, 14));
  expect(toUtc(expired) - toUtc(created)).toBe(15 * 60 * 1000);
  expect(verifyVnpayChecksumStrict(params, params.vnp_SecureHash)).toBe(true);
  expect(verifyVnpayChecksumStrict({ ...params, vnp_Amount: '1' }, params.vnp_SecureHash)).toBe(false);
  expect(verifyVnpayChecksumStrict(params, undefined)).toBe(false);
});
