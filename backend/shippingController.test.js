/**
 * Integration & Unit Tests for GHN Shipment Order Creation Controller & Prepare Order Route
 * File: shippingController.test.js
 */

const request = require('supertest');
const express = require('express');

// 1. Mock dependencies trước khi require controller / router
jest.mock('axios');
jest.mock('./models/Order');
jest.mock('./models/User');
jest.mock('./utils/notificationService', () => ({
  sendNotification: jest.fn().mockResolvedValue(true),
  sendAdminNotification: jest.fn().mockResolvedValue(true)
}));

const axios = require('axios');
const Order = require('./models/Order');
const User = require('./models/User');
const { createShipmentGHN } = require('./controllers/shippingController');
const createSellerRouter = require('./routes/seller');
const shippingService = require('./services/shipping');
const { signUserToken } = require('./utils/b2c');

const SELLER_A = {
  _id: '66a123456789abcdef000111',
  name: 'Shop Thời Trang A',
  phone: '0901112222',
  role: 'Khách hàng',
  status: 'active',
  isBanned: false,
  isSeller: true,
  sellerStatus: 'approved',
  shopInfo: {
    shopName: 'Shop Thời Trang A',
    phone: '0901112222',
    address: '72 Thành Thái, Phường 14, Quận 10, TP.HCM',
    pickupAddress: {
      fullName: 'Kho Shop A',
      phone: '0901112222',
      street: '72 Thành Thái',
      wardCode: '21014',
      wardName: 'Phường 14',
      districtId: 1452,
      districtName: 'Quận 10',
      provinceName: 'Hồ Chí Minh'
    }
  }
};

const SELLER_B = {
  _id: '66a123456789abcdef000222',
  name: 'Shop Khác B',
  role: 'Khách hàng',
  status: 'active',
  isBanned: false,
  isSeller: true,
  sellerStatus: 'approved',
  shopInfo: {
    shopName: 'Shop Khác B',
    pickupAddress: {
      street: '100 Lê Lợi',
      wardCode: '20308',
      districtId: 1442
    }
  }
};

// Khởi tạo app Express giả lập cho Supertest (inject req.user qua header x-test-user cho /ship và mount seller router cho /prepare)
const app = express();
app.use(express.json());
app.use('/api/seller/orders/:orderId/ship', (req, _res, next) => {
  const userHeader = req.headers['x-test-user'];
  if (userHeader === 'seller_b') {
    req.user = SELLER_B;
  } else if (userHeader === 'seller_no_pickup') {
    req.user = {
      _id: SELLER_A._id,
      name: 'Shop Chưa Có Kho',
      isSeller: true,
      sellerStatus: 'approved',
      shopInfo: { shopName: 'Shop Chưa Có Kho' }
    };
  } else {
    req.user = SELLER_A;
  }
  next();
}, createShipmentGHN);

const uploadStub = {
  array: () => (_req, _res, next) => next(),
  fields: () => (_req, _res, next) => next(),
  single: () => (_req, _res, next) => next()
};
app.use(
  createSellerRouter({
    upload: uploadStub,
    sendNotification: jest.fn().mockResolvedValue(true),
    sendAdminNotification: jest.fn().mockResolvedValue(true),
    io: null
  })
);

describe('POST /api/seller/orders/:orderId/ship & /prepare - Fulfillment không bị kẹt', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      JWT_SECRET: originalEnv.JWT_SECRET || 'haihand_test_jwt_secret_key_2026',
      GHN_TOKEN: 'mock_ghn_token_123',
      GHN_SHOP_ID: 'mock_shop_id_456',
      GHN_API_URL: 'https://online-gateway.ghn.vn/shiip/public-api'
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('Case 1 (Success): Seller sở hữu đơn tạo vận đơn GHN thành công với địa chỉ kho pickupAddress thật', async () => {
    const mockOrder = {
      _id: '66a123456789abcdef012345',
      seller: SELLER_A._id,
      sellerId: SELLER_A,
      paymentMethod: 'HAIPAY',
      paymentStatus: 'escrow',
      totalPrice: 350000,
      trackingCode: '',
      shippingCode: '',
      status: 'Pending',
      shippingAddress: {
        fullName: 'Nguyễn Văn A',
        phone: '0987654321',
        street: '123 Đường Nguyễn Huệ, Phường Bến Nghé, Quận 1',
        wardCode: '20308',
        wardName: 'Phường Bến Nghé',
        districtId: 1442,
        districtName: 'Quận 1',
        provinceName: 'Hồ Chí Minh'
      },
      orderItems: [
        { name: 'Áo thun HaiHand', quantity: 2, weight: 250 },
        { name: 'Nón lưỡi trai', quantity: 1, weight: 150 }
      ],
      shipment: {},
      save: jest.fn().mockResolvedValue(true)
    };

    Order.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockOrder)
    });

    axios.post.mockResolvedValue({
      data: {
        code: 200,
        message: 'Success',
        data: {
          order_code: 'GHN_TEST_998877',
          total_fee: 28000,
          expected_delivery_time: '2026-11-01T10:00:00.000Z'
        }
      }
    });

    const res = await request(app).post('/api/seller/orders/66a123456789abcdef012345/ship');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.order_code).toBe('GHN_TEST_998877');
    expect(res.body.trackingCode).toBe('GHN_TEST_998877');

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [callUrl, callPayload, callConfig] = axios.post.mock.calls[0];
    expect(callUrl).toBe('https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/create');
    expect(callConfig.headers.Token).toBe('mock_ghn_token_123');
    expect(callConfig.headers.ShopId).toBe('mock_shop_id_456');

    expect(callPayload.payment_type_id).toBe(1);
    expect(callPayload.cod_amount).toBe(0);
    expect(callPayload.required_note).toBe('KHONGCHOXEMHANG');
    expect(callPayload.from_address).toBe('72 Thành Thái');
    expect(callPayload.from_district_id).toBe(1452);
    expect(callPayload.from_ward_code).toBe('21014');
    expect(callPayload.to_name).toBe('Nguyễn Văn A');
    expect(callPayload.to_phone).toBe('0987654321');
    expect(callPayload.to_ward_code).toBe('20308');
    expect(callPayload.to_district_id).toBe(1442);
    expect(callPayload.weight).toBe(650);

    expect(mockOrder.status).toBe('Processing');
    expect(mockOrder.trackingCode).toBe('GHN_TEST_998877');
    expect(mockOrder.save).toHaveBeenCalledTimes(1);
  });

  test('Case 2 (Security - 403): Seller B gọi /ship cho đơn của Seller A bị từ chối với 403', async () => {
    const mockOrderOfSellerA = {
      _id: 'order_of_seller_a',
      seller: SELLER_A._id,
      sellerId: SELLER_A,
      paymentMethod: 'HAIPAY',
      paymentStatus: 'escrow',
      status: 'Pending',
      save: jest.fn()
    };

    Order.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockOrderOfSellerA)
    });

    const res = await request(app)
      .post('/api/seller/orders/order_of_seller_a/ship')
      .set('x-test-user', 'seller_b');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('Case 3 (Auto COD - 200): Đơn VNPay chưa thanh toán (unpaid) tự động chuyển sang thu hộ COD và tạo đơn GHN', async () => {
    const mockUnpaidVnpayOrder = {
      _id: 'order_unpaid_vnpay',
      seller: SELLER_A._id,
      sellerId: SELLER_A,
      paymentMethod: 'VNPAY',
      paymentStatus: 'unpaid',
      totalPrice: 250000,
      status: 'Pending',
      shippingAddress: {
        fullName: 'Khách VNPay',
        phone: '0987654321',
        street: '10 Lê Lợi',
        wardCode: '20101',
        districtId: 1442
      },
      orderItems: [{ name: 'Sản phẩm test', quantity: 1, weight: 300 }],
      save: jest.fn().mockResolvedValue(true)
    };

    Order.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockUnpaidVnpayOrder)
    });

    axios.post.mockResolvedValue({
      data: {
        code: 200,
        data: { order_code: 'GHN_COD_CONVERTED' }
      }
    });

    const res = await request(app).post('/api/seller/orders/order_unpaid_vnpay/ship');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.trackingCode).toBe('GHN_COD_CONVERTED');
    expect(mockUnpaidVnpayOrder.paymentMethod).toBe('COD');

    const [, callPayload] = axios.post.mock.calls[0];
    expect(callPayload.cod_amount).toBe(250000);
    expect(mockUnpaidVnpayOrder.save).toHaveBeenCalledTimes(1);
  });

  test('Case 4 (Smart Fallback Quận 1): Đơn hàng thiếu pickupAddress, SĐT sai định dạng, thiếu districtId/wardCode vẫn gửi payload Quận 1 hợp lệ', async () => {
    const mockLegacyOrder = {
      _id: 'order_legacy_missing_fields',
      seller: SELLER_A._id,
      sellerId: { _id: SELLER_A._id, name: 'Shop Cũ', shopInfo: {} },
      paymentMethod: 'COD',
      paymentStatus: 'unpaid',
      totalPrice: 150000,
      phone: '12345', // SĐT sai -> fallback 0912345678
      address: '123 Lê Lợi, Quận 1',
      shippingAddress: {}, // thiếu districtId, wardCode -> fallback 1442 / '20101'
      orderItems: [{ name: 'Áo cũ', quantity: 1, weight: 200 }],
      save: jest.fn().mockResolvedValue(true)
    };

    Order.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockLegacyOrder)
    });

    axios.post.mockResolvedValue({
      data: {
        code: 200,
        data: { order_code: 'GHN_FALLBACK_Q1' }
      }
    });

    const res = await request(app)
      .post('/api/seller/orders/order_legacy_missing_fields/ship')
      .set('x-test-user', 'seller_no_pickup');

    expect(res.status).toBe(200);
    expect(res.body.trackingCode).toBe('GHN_FALLBACK_Q1');

    const [, callPayload] = axios.post.mock.calls[0];
    expect(callPayload.from_district_id).toBe(1442);
    expect(callPayload.from_ward_code).toBe('20101');
    expect(callPayload.from_phone).toBe('0328911406');
    expect(callPayload.to_district_id).toBe(1442);
    expect(callPayload.to_ward_code).toBe('20101');
    expect(callPayload.to_phone).toBe('0912345678');
  });

  test('Case 5 (Retry Prod <-> Dev trên 401): Cổng Prod trả 401 -> tự động retry sang cổng Dev thành công', async () => {
    const mockOrder = {
      _id: 'order_retry_dev',
      seller: SELLER_A._id,
      sellerId: SELLER_A,
      paymentMethod: 'COD',
      totalPrice: 120000,
      shippingAddress: {
        fullName: 'Phạm Văn D',
        phone: '0912345678',
        street: '789 CMT8',
        wardCode: '20308',
        districtId: 1442
      },
      orderItems: [{ name: 'Balo laptop', quantity: 1, weight: 800 }],
      save: jest.fn().mockResolvedValue(true)
    };

    Order.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockOrder)
    });

    const ghn401Error = new Error('HTTP 401');
    ghn401Error.response = {
      status: 401,
      data: { code: 401, message: 'Token is invalid or expired' }
    };

    axios.post
      .mockRejectedValueOnce(ghn401Error)
      .mockResolvedValueOnce({
        data: { code: 200, data: { order_code: 'GHN_DEV_RETRY_OK' } }
      });

    const res = await request(app).post('/api/seller/orders/order_retry_dev/ship');

    expect(res.status).toBe(200);
    expect(res.body.trackingCode).toBe('GHN_DEV_RETRY_OK');
    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(axios.post.mock.calls[0][0]).toBe('https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/create');
    expect(axios.post.mock.calls[1][0]).toBe('https://dev-online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/create');
  });

  test('Case 6 (Fallback Nội Bộ khi GHN chết cả 2 cổng): Trả về 200 OK kèm mã GHN... và cập nhật Processing', async () => {
    const mockOrder = {
      _id: 'order_ghn_both_fail',
      seller: SELLER_A._id,
      sellerId: SELLER_A,
      paymentMethod: 'COD',
      totalPrice: 120000,
      shippingFee: 25000,
      shippingAddress: {
        fullName: 'Phạm Văn D',
        phone: '0912345678',
        street: '789 CMT8',
        wardCode: '20308',
        districtId: 1442
      },
      orderItems: [{ name: 'Balo laptop', quantity: 1, weight: 800 }],
      save: jest.fn().mockResolvedValue(true)
    };

    Order.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockOrder)
    });

    const ghn401Error = new Error('Token is invalid or expired');
    ghn401Error.response = {
      status: 401,
      data: { code: 401, message: 'Token is invalid or expired', code_message_value: 'Token không hợp lệ hoặc đã hết hạn' }
    };
    axios.post.mockRejectedValue(ghn401Error);

    const res = await request(app).post('/api/seller/orders/order_ghn_both_fail/ship');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.fallback).toBe(true);
    expect(res.body.trackingCode).toMatch(/^GHN\d{8}$/);
    expect(mockOrder.status).toBe('Processing');
    expect(mockOrder.shippingCode).toMatch(/^GHN\d{8}$/);
    expect(mockOrder.save).toHaveBeenCalledTimes(1);
  });

  test('Case 7 (Prepare Order - /api/seller/orders/:id/prepare): Đơn online unpaid + thiếu pickupAddress vẫn chuẩn bị hàng thành công qua fallback HH...', async () => {
    const sellerToken = signUserToken(SELLER_A);
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(SELLER_A)
    });

    const mockPrepareOrder = {
      _id: 'order_prepare_fallback',
      seller: SELLER_A._id,
      sellerId: SELLER_A._id,
      buyer: '66a123456789abcdef000999',
      paymentMethod: 'VNPAY',
      paymentStatus: 'unpaid',
      totalPrice: 300000,
      shippingFee: 25000,
      status: 'Pending',
      save: jest.fn().mockResolvedValue(true)
    };

    Order.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockPrepareOrder)
    });

    jest.spyOn(shippingService, 'createShipmentForOrder').mockRejectedValueOnce(
      new Error('Shop chưa thiết lập địa chỉ lấy hàng')
    );

    const res = await request(app)
      .post('/api/seller/orders/order_prepare_fallback/prepare')
      .set('Authorization', `Bearer ${sellerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.trackingCode).toMatch(/^HH\d{8}$/);
    expect(mockPrepareOrder.paymentMethod).toBe('COD');
    expect(mockPrepareOrder.status).toBe('Processing');
    expect(mockPrepareOrder.trackingCode).toMatch(/^HH\d{8}$/);
    expect(mockPrepareOrder.shippingCode).toMatch(/^HH\d{8}$/);
    expect(mockPrepareOrder.shippingCarrier).toBe('HaiHand Express');
    expect(mockPrepareOrder.shippingStatus).toBe('ready_to_pick');
    expect(mockPrepareOrder.save).toHaveBeenCalledTimes(1);
  });
});
