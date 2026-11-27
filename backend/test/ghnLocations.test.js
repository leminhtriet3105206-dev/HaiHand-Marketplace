const ghn = require('../services/shipping/ghnProvider');

test('GHN address lists use GET and expose fields needed by web and mobile', async () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.GHN_TOKEN;
  const originalShopId = process.env.GHN_SHOP_ID;
  process.env.GHN_TOKEN = 'test-token';
  process.env.GHN_SHOP_ID = '123';
  const data = [
    [{ ProvinceID: 202, ProvinceName: 'Hồ Chí Minh' }],
    [{ DistrictID: 1442, DistrictName: 'Quận 1' }],
    [{ WardCode: '90795', WardName: 'Phường Bến Nghé' }]
  ];
  global.fetch = jest.fn().mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ code: 200, data: data.shift() }) }));
  try {
    expect((await ghn.getProvinces())[0]).toMatchObject({ ProvinceID: 202, ProvinceName: 'Hồ Chí Minh' });
    expect((await ghn.getDistricts(202))[0]).toMatchObject({ DistrictID: 1442, DistrictName: 'Quận 1' });
    expect((await ghn.getWards(1442))[0]).toMatchObject({ WardCode: '90795', WardName: 'Phường Bến Nghé' });
    expect(global.fetch.mock.calls.map(([url, options]) => [url, options.method, options.headers.ShopId])).toEqual([
      [expect.stringContaining('/master-data/province'), 'GET', '123'],
      [expect.stringContaining('/master-data/district?province_id=202'), 'GET', '123'],
      [expect.stringContaining('/master-data/ward?district_id=1442'), 'GET', '123']
    ]);
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GHN_TOKEN; else process.env.GHN_TOKEN = originalToken;
    if (originalShopId === undefined) delete process.env.GHN_SHOP_ID; else process.env.GHN_SHOP_ID = originalShopId;
  }
});
