/**
 * Automated Test Suite for [P1-5]:
 * Bảo toàn đầy đủ các trường phân loại hàng (variants: [{ name, price, stock, sku, options }])
 * khi Seller tạo hoặc cập nhật sản phẩm qua POST/PUT /api/seller/products.
 */

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');

const { Post } = require('./models/Product');
const User = require('./models/User');
const Settings = require('./models/Settings');
const { signUserToken } = require('./utils/b2c');
const createSellerRouter = require('./routes/seller');

describe('[P1-5] Product Variants Schema & Persistence ({ name, price, stock, sku })', () => {
  const sellerId = new mongoose.Types.ObjectId();
  const mockSeller = {
    _id: sellerId,
    name: 'Shop Thời Trang B2C',
    email: 'fashion@haihand.vn',
    role: 'Khách hàng',
    isSeller: true,
    sellerStatus: 'approved',
    status: 'active',
    isBanned: false,
    shopInfo: { shopName: 'Shop Thời Trang B2C' }
  };

  let savedDocs = [];
  let app;
  let token;

  beforeEach(() => {
    savedDocs = [];
    jest.restoreAllMocks();

    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_haihand_2026';
    token = signUserToken(mockSeller);

    jest.spyOn(Settings, 'findOne').mockResolvedValue({ autoApprovePosts: true });
    jest.spyOn(Settings, 'getGlobal').mockResolvedValue({ autoApprovePosts: true });

    jest.spyOn(User, 'findById').mockImplementation((id) => {
      const doc = String(id) === String(sellerId) ? mockSeller : null;
      return {
        select: jest.fn().mockResolvedValue(doc),
        then: (resolve) => Promise.resolve(doc).then(resolve)
      };
    });

    jest.spyOn(Post.prototype, 'save').mockImplementation(async function () {
      await this.validate();
      const idx = savedDocs.findIndex((d) => String(d._id) === String(this._id));
      if (idx >= 0) {
        savedDocs[idx] = this;
      } else {
        savedDocs.push(this);
      }
      return this;
    });

    jest.spyOn(Post, 'findById').mockImplementation(async (id) => {
      return savedDocs.find((d) => String(d._id) === String(id)) || null;
    });

    const upload = multer({ storage: multer.memoryStorage() });
    app = express();
    app.use(express.json());
    app.use(
      createSellerRouter({
        upload,
        sendNotification: jest.fn().mockResolvedValue(true),
        sendAdminNotification: jest.fn().mockResolvedValue(true),
        io: null
      })
    );
  });

  test('1. POST /api/seller/products lưu giữ đầy đủ name, price, stock, sku trong variants[]', async () => {
    const res = await request(app)
      .post('/api/seller/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Áo Polo Nam HaiHand',
        price: 150000,
        stockQuantity: 10,
        category: 'Thời trang & Phụ kiện',
        variants: JSON.stringify([
          { name: 'Đỏ - L', price: 150000, stock: 5, sku: 'RED-L' },
          { name: 'Đen - XL', price: 165000, stock: 5, sku: 'BLK-XL' }
        ])
      });

    expect(res.status).toBe(201);
    expect(res.body.product).toBeDefined();
    expect(res.body.product.variants).toHaveLength(2);

    const v0 = res.body.product.variants[0];
    expect(v0.name).toBe('Đỏ - L');
    expect(v0.price).toBe(150000);
    expect(v0.stock).toBe(5);
    expect(v0.sku).toBe('RED-L');

    // Đọc lại từ kho dữ liệu đã lưu để chắc chắn Mongoose schema không cắt mất field
    const stored = await Post.findById(res.body.product._id);
    const plain = stored.toObject();
    expect(plain.variants[0]).toEqual(
      expect.objectContaining({
        name: 'Đỏ - L',
        price: 150000,
        stock: 5,
        sku: 'RED-L'
      })
    );
    expect(plain.variants[1]).toEqual(
      expect.objectContaining({
        name: 'Đen - XL',
        price: 165000,
        stock: 5,
        sku: 'BLK-XL'
      })
    );
  });

  test('2. PUT /api/seller/products/:id cập nhật variants giữ đủ name, price, stock, sku và tương thích ngược options[]', async () => {
    const createRes = await request(app)
      .post('/api/seller/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Giày Chạy Bộ HaiHand',
        price: 450000,
        stockQuantity: 8,
        category: 'Thể thao & Dã ngoại',
        variants: JSON.stringify([{ name: 'Trắng - 41', price: 450000, stock: 4, sku: 'WHT-41' }])
      });

    const productId = createRes.body.product._id;

    const updateRes = await request(app)
      .put(`/api/seller/products/${productId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        variants: JSON.stringify([
          { name: 'Trắng - 42', price: 470000, stock: 6, sku: 'WHT-42', options: ['Trắng', '42'] }
        ])
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.product.variants).toHaveLength(1);
    expect(updateRes.body.product.variants[0]).toEqual(
      expect.objectContaining({
        name: 'Trắng - 42',
        price: 470000,
        stock: 6,
        sku: 'WHT-42',
        options: ['Trắng', '42']
      })
    );
  });
});

