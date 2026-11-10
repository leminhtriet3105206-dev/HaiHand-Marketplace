/**
 * Integration & Unit Tests for GHN Shipment Order Creation Controller ([P0-3])
 * File: shippingController.test.js
 */

const request = require('supertest');
const express = require('express');

// 1. Mock dependencies trước khi require controller
jest.mock('axios');
jest.mock('./models/Order');
jest.mock('./utils/notificationService', () => ({
  sendNotification: jest.fn().mockResolvedValue(true),
  sendAdminNotification: jest.fn().mockResolvedValue(true)
}));

const axios = require('axios');
const Order = require('./models/Order');
const { createShipmentGHN } = require('./controllers/shippingController');

const SELLER_A = {
  _id: 'seller_a_id_111',
  name: 'Shop Thời Trang A',
  phone: '0901112222',
  role: 'Khách hàng',
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
  _id: 'seller_b_id_222',
  name: 'Shop Khác B',
  role: 'Khách hàng',
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

// Khởi tạo app Express giả lập cho Supertest (inject req.user qua header x-test-user)
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
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
});
app.post('/api/seller/orders/:orderId/ship', createShipmentGHN);

describe('POST /api/seller/orders/:orderId/ship - Tạo đơn giao hàng GHN ([P0-3])', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      GHN_TOKEN: 'mock_ghn_token_123',
      GHN_SHOP_ID: 'mock_shop_id_456',
      GHN_API_URL: 'https://dev-online-gateway.ghn.vn/shiip/public-api'
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

    const mockGhnResponse = {
      data: {
        code: 200,
        message: 'Success',
        data: {
          order_code: 'GHN_TEST_998877',
          total_fee: 28000,
          expected_delivery_time: '2026-11-01T10:00:00.000Z'
        }
      }
    };
    axios.post.mockResolvedValue(mockGhnResponse);

    const res = await request(app).post('/api/seller/orders/66a123456789abcdef012345/ship');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.order_code).toBe('GHN_TEST_998877');
    expect(res.body.trackingCode).toBe('GHN_TEST_998877');

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [callUrl, callPayload, callConfig] = axios.post.mock.calls[0];
    expect(callUrl).toBe('https://dev-online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/create');
    expect(callConfig.headers.Token).toBe('mock_ghn_token_123');
    expect(callConfig.headers.ShopId).toBe('mock_shop_id_456');

    // Phí vận chuyển đã tính trong order.totalPrice -> payment_type_id = 1, đơn escrow -> cod_amount = 0
    expect(callPayload.payment_type_id).toBe(1);
    expect(callPayload.cod_amount).toBe(0);
    expect(callPayload.required_note).toBe('KHONGCHOXEMHANG');

    // Địa chỉ lấy hàng lấy từ seller.shopInfo.pickupAddress
    expect(callPayload.from_address).toBe('72 Thành Thái');
    expect(callPayload.from_district_id).toBe(1452);
    expect(callPayload.from_ward_code).toBe('21014');

    // Địa chỉ người nhận
    expect(callPayload.to_name).toBe('Nguyễn Văn A');
    expect(callPayload.to_phone).toBe('0987654321');
    expect(callPayload.to_address).toBe('123 Đường Nguyễn Huệ, Phường Bến Nghé, Quận 1');
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

  test('Case 3 (Payment Gate - 400): Đơn VNPay có paymentStatus = unpaid gọi /ship bị chặn với 400', async () => {
    const mockUnpaidVnpayOrder = {
      _id: 'order_unpaid_vnpay',
      seller: SELLER_A._id,
      sellerId: SELLER_A,
      paymentMethod: 'VNPAY',
      paymentStatus: 'unpaid',
      status: 'Pending',
      save: jest.fn()
    };

    Order.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockUnpaidVnpayOrder)
    });

    const res = await request(app).post('/api/seller/orders/order_unpaid_vnpay/ship');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/chưa được thanh toán/i);
    expect(axios.post).not.toHaveBeenCalled();
  });

  describe('Case 4 (Fail - Missing / Invalid Data): Không dùng dữ liệu giả khi thiếu SĐT, địa chỉ, quận/phường hoặc kho gửi', () => {
    test('Trả về 400 khi đơn hàng thiếu số điện thoại hoặc SĐT không hợp lệ', async () => {
      const mockOrderNoPhone = {
        _id: 'order_missing_phone_1',
        seller: SELLER_A._id,
        sellerId: SELLER_A,
        paymentMethod: 'COD',
        paymentStatus: 'unpaid',
        shippingAddress: {
          fullName: 'Trần Thị B',
          phone: '12345', // SĐT sai định dạng -> phải báo 400, không được thay bằng 0987654321
          street: '456 Lê Lợi, Quận 1',
          wardCode: '20308',
          districtId: 1442
        },
        orderItems: [{ name: 'Váy hoa', quantity: 1, weight: 200 }],
        save: jest.fn()
      };

      Order.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockOrderNoPhone)
      });

      const res = await request(app).post('/api/seller/orders/order_missing_phone_1/ship');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(axios.post).not.toHaveBeenCalled();
    });

    test('Trả về 400 khi đơn hàng thiếu địa chỉ nhận hàng (to_address)', async () => {
      const mockOrderNoAddress = {
        _id: 'order_missing_address_2',
        seller: SELLER_A._id,
        sellerId: SELLER_A,
        paymentMethod: 'COD',
        paymentStatus: 'unpaid',
        shippingAddress: {
          fullName: 'Lê Văn C',
          phone: '0901234567',
          street: '',
          wardCode: '20308',
          districtId: 1442
        },
        address: '',
        orderItems: [{ name: 'Giày sneaker', quantity: 1, weight: 500 }],
        save: jest.fn()
      };

      Order.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockOrderNoAddress)
      });

      const res = await request(app).post('/api/seller/orders/order_missing_address_2/ship');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/thiếu địa chỉ/i);
      expect(axios.post).not.toHaveBeenCalled();
    });

    test('Trả về 400 khi đơn hàng thiếu districtId hoặc wardCode người nhận', async () => {
      const mockOrderNoDistrict = {
        _id: 'order_missing_district',
        seller: SELLER_A._id,
        sellerId: SELLER_A,
        paymentMethod: 'COD',
        paymentStatus: 'unpaid',
        shippingAddress: {
          fullName: 'Lê Văn C',
          phone: '0901234567',
          street: '10 Nguyễn Trãi'
          // Thiếu districtId và wardCode
        },
        orderItems: [{ name: 'Giày sneaker', quantity: 1, weight: 500 }],
        save: jest.fn()
      };

      Order.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockOrderNoDistrict)
      });

      const res = await request(app).post('/api/seller/orders/order_missing_district/ship');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/districtId|wardCode|Quận\/Huyện/i);
      expect(axios.post).not.toHaveBeenCalled();
    });

    test('Trả về 400 khi Seller chưa cấu hình shopInfo.pickupAddress', async () => {
      const mockOrderNoPickup = {
        _id: 'order_no_pickup',
        seller: SELLER_A._id,
        sellerId: { _id: SELLER_A._id, shopInfo: {} },
        paymentMethod: 'COD',
        paymentStatus: 'unpaid',
        shippingAddress: {
          fullName: 'Lê Văn C',
          phone: '0901234567',
          street: '10 Nguyễn Trãi',
          wardCode: '20308',
          districtId: 1442
        },
        orderItems: [{ name: 'Giày sneaker', quantity: 1, weight: 500 }],
        save: jest.fn()
      };

      Order.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockOrderNoPickup)
      });

      const res = await request(app)
        .post('/api/seller/orders/order_no_pickup/ship')
        .set('x-test-user', 'seller_no_pickup');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/pickupAddress|địa chỉ lấy hàng/i);
      expect(axios.post).not.toHaveBeenCalled();
    });
  });

  test('Case 5 (Fail - GHN Error): Mock Axios văng lỗi (VD: Sai token) -> Trả về lỗi 500 kèm message', async () => {
    const mockOrder = {
      _id: 'order_ghn_error_3',
      seller: SELLER_A._id,
      sellerId: SELLER_A,
      paymentMethod: 'COD',
      paymentStatus: 'unpaid',
      shippingAddress: {
        fullName: 'Phạm Văn D',
        phone: '0912345678',
        street: '789 CMT8, Phường 5, Tân Bình',
        wardCode: '20308',
        districtId: 1442
      },
      orderItems: [{ name: 'Balo laptop', quantity: 1, weight: 800 }],
      save: jest.fn()
    };

    Order.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockOrder)
    });

    const ghnAuthError = new Error('Token không hợp lệ hoặc đã hết hạn');
    ghnAuthError.response = {
      status: 500,
      data: {
        code: 401,
        message: 'Token is invalid or expired',
        code_message_value: 'Token không hợp lệ hoặc đã hết hạn'
      }
    };
    axios.post.mockRejectedValue(ghnAuthError);

    const res = await request(app).post('/api/seller/orders/order_ghn_error_3/ship');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Token không hợp lệ|Token is invalid/i);
    expect(mockOrder.save).not.toHaveBeenCalled();
  });
});
