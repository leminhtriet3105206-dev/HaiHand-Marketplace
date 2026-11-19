/**
 * Automated Test Suite for [P0-1]:
 * Seller đăng sản phẩm khi autoApprovePosts = false phải lưu ở trạng thái 'pending' (chờ duyệt),
 * không lộ ra catalog công khai trước khi duyệt, chuyển thành 'active' sau khi Admin duyệt,
 * và về 'out_of_stock' khi stock = 0.
 */

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');

const { Product, Post } = require('./models/Product');
const User = require('./models/User');
const Order = require('./models/Order');
const Settings = require('./models/Settings');
const { CATALOG_VISIBLE, PENDING_PRODUCT_STATUSES, signUserToken } = require('./utils/b2c');
const createSellerRouter = require('./routes/seller');

describe('[P0-1] Seller Product Creation & Pending Approval Lifecycle', () => {
  const sellerId = new mongoose.Types.ObjectId();
  const mockSeller = {
    _id: sellerId,
    name: 'Shop Công Nghệ HaiHand',
    email: 'seller@haihand.vn',
    role: 'Khách hàng',
    isSeller: true,
    sellerStatus: 'approved',
    status: 'active',
    isBanned: false,
    shopInfo: { shopName: 'Shop Công Nghệ HaiHand' }
  };

  let savedDocs = [];
  let app;
  let token;

  beforeEach(() => {
    savedDocs = [];
    jest.restoreAllMocks();

    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_haihand_2026';
    token = signUserToken(mockSeller);

    jest.spyOn(User, 'findById').mockImplementation((id) => {
      const doc = String(id) === String(sellerId) ? mockSeller : null;
      return {
        select: jest.fn().mockResolvedValue(doc),
        then: (resolve) => Promise.resolve(doc).then(resolve)
      };
    });

    jest.spyOn(Order, 'find').mockResolvedValue([]);

    jest.spyOn(Post.prototype, 'save').mockImplementation(async function () {
      await this.validate();
      const existingIdx = savedDocs.findIndex((d) => String(d._id) === String(this._id));
      if (existingIdx >= 0) {
        savedDocs[existingIdx] = this;
      } else {
        savedDocs.push(this);
      }
      return this;
    });

    jest.spyOn(Post, 'find').mockImplementation((query = {}) => {
      const filtered = savedDocs.filter((doc) => {
        if (query.status && query.status.$in) {
          return query.status.$in.includes(doc.status);
        }
        if (query.$or) {
          return query.$or.some((cond) => {
            if (cond.sellerId) return String(doc.sellerId) === String(cond.sellerId);
            if (cond.author) return String(doc.author) === String(cond.author);
            return false;
          });
        }
        return true;
      });
      return {
        sort: jest.fn().mockResolvedValue(filtered)
      };
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

    // Public catalog route simulation matching server.js GET /api/posts
    app.get('/api/posts', async (req, res) => {
      const visible = savedDocs.filter((d) => CATALOG_VISIBLE.includes(d.status));
      res.status(200).json(visible);
    });

    // Admin approve route simulation matching server.js & admin/app.js
    app.post('/api/admin/posts/approve/:id', async (req, res) => {
      const post = await Post.findById(req.params.id);
      if (!post) return res.status(404).json({ success: false });
      post.status = 'active';
      await post.save();
      return res.status(200).json({ success: true, status: post.status, product: post });
    });
  });

  test('1. Khi autoApprovePosts = false, Seller đăng sản phẩm trả về 201 với status = "pending" (không bị biến thành "inactive")', async () => {
    jest.spyOn(Settings, 'findOne').mockResolvedValue({ autoApprovePosts: false });
    jest.spyOn(Settings, 'getGlobal').mockResolvedValue({ autoApprovePosts: false });

    const createRes = await request(app)
      .post('/api/seller/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Tai nghe Sony WH-1000XM5',
        price: 5500000,
        stockQuantity: 5,
        category: 'Đồ điện tử & Công nghệ',
        description: 'Hàng chính hãng fullbox'
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.product).toBeDefined();
    expect(createRes.body.product.status).toBe('pending');
    expect(PENDING_PRODUCT_STATUSES).toContain(createRes.body.product.status);

    // Không hiển thị trên catalog công khai trước khi Admin duyệt
    const publicCatalogRes = await request(app).get('/api/posts');
    expect(publicCatalogRes.status).toBe(200);
    expect(publicCatalogRes.body).toHaveLength(0);

    // Nhưng vẫn hiển thị trong danh sách sản phẩm của Seller
    const sellerProductsRes = await request(app)
      .get('/api/seller/products')
      .set('Authorization', `Bearer ${token}`);
    expect(sellerProductsRes.status).toBe(200);
    expect(sellerProductsRes.body).toHaveLength(1);
    expect(sellerProductsRes.body[0].status).toBe('pending');

    // Khi Admin duyệt bài -> status chuyển sang 'active' và hiện trên catalog
    const productId = createRes.body.product._id;
    const approveRes = await request(app).post(`/api/admin/posts/approve/${productId}`);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe('active');

    const publicAfterApprove = await request(app).get('/api/posts');
    expect(publicAfterApprove.body).toHaveLength(1);
    expect(publicAfterApprove.body[0].status).toBe('active');
  });

  test('2. Khi stockQuantity = 0, sản phẩm tự động chuyển sang "out_of_stock"', async () => {
    jest.spyOn(Settings, 'findOne').mockResolvedValue({ autoApprovePosts: false });
    jest.spyOn(Settings, 'getGlobal').mockResolvedValue({ autoApprovePosts: false });

    const createRes = await request(app)
      .post('/api/seller/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Bàn phím cơ Keychron K2',
        price: 1500000,
        stockQuantity: 0,
        category: 'Đồ điện tử & Công nghệ'
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.product.status).toBe('out_of_stock');
  });

  test('3. Các giá trị legacy PENDING / Pending / Chờ duyệt được chuẩn hóa về "pending" thay vì "inactive"', async () => {
    for (const legacyStatus of ['PENDING', 'Pending', 'Chờ duyệt']) {
      const p = new Product({
        name: `Sản phẩm ${legacyStatus}`,
        price: 200000,
        stockQuantity: 3,
        category: 'Khác',
        status: legacyStatus
      });
      await p.validate();
      expect(p.status).toBe('pending');
    }
  });
});
