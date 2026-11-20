const mongoose = require('mongoose');
const BannerBackend = require('./models/Banner');
const path = require('path');

describe('Hero Banner Model & Collection Synchronization', () => {
  test('backend/models/Banner points to shared collection "banners" with expected defaults', () => {
    expect(BannerBackend.collection.collectionName).toBe('banners');

    const doc = new BannerBackend({
      imageUrl: 'http://localhost:4001/uploads/promo-123.gif',
      targetUrl: '/products',
      order: 1,
    });

    const validationError = doc.validateSync();
    expect(validationError).toBeUndefined();
    expect(doc.title).toBe('');
    expect(doc.imageUrl).toBe('http://localhost:4001/uploads/promo-123.gif');
    expect(doc.targetUrl).toBe('/products');
    expect(doc.openInNewTab).toBe(false);
    expect(doc.isActive).toBe(true);
    expect(doc.order).toBe(1);
  });

  test('Banner requires imageUrl', () => {
    const doc = new BannerBackend({
      title: 'Banner thiếu ảnh',
      targetUrl: '/register-seller',
    });

    const validationError = doc.validateSync();
    expect(validationError).toBeDefined();
    expect(validationError.errors.imageUrl).toBeDefined();
  });

  test('admin/models/Banner shares identical collection and schema structure', () => {
    const adminBannerPath = path.resolve(__dirname, '../admin/models/Banner.js');
    const BannerAdmin = require(adminBannerPath);
    expect(BannerAdmin.collection.collectionName).toBe('banners');
    expect(BannerAdmin.schema.path('imageUrl')).toBeDefined();
    expect(BannerAdmin.schema.path('targetUrl')).toBeDefined();
    expect(BannerAdmin.schema.path('openInNewTab')).toBeDefined();
    expect(BannerAdmin.schema.path('order')).toBeDefined();
    expect(BannerAdmin.schema.path('isActive')).toBeDefined();
  });
});

