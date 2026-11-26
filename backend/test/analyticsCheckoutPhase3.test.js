const mongoose = require('mongoose');

jest.mock('../models/User');
jest.mock('../models/Order');
jest.mock('../models/PaymentSession');
jest.mock('../models/Transaction');
jest.mock('../models/Notification', () => ({ create: jest.fn().mockResolvedValue({}) }));
jest.mock('../models/Product', () => ({ Product: {}, Post: { find: jest.fn() } }));
jest.mock('../utils/notificationService', () => ({ sendNotification: jest.fn().mockResolvedValue({}) }));
jest.mock('../services/shipping', () => ({
  calculateShippingFee: jest.fn().mockResolvedValue({ fee: 30000 })
}));
jest.mock('../routes/address', () => ({ addAddressToUser: jest.fn() }));
jest.mock('../services/behaviorAnalysisService', () => ({ recordServerEvent: jest.fn() }));
jest.mock('../analytics/track', () => ({
  trackServerEvent: jest.fn()
}));

const User = require('../models/User');
const Order = require('../models/Order');
const { Post } = require('../models/Product');
const { trackServerEvent } = require('../analytics/track');
const { processCheckout } = require('../controllers/checkoutController');

const BUYER_ID = new mongoose.Types.ObjectId().toString();
const SELLER_1 = new mongoose.Types.ObjectId().toString();
const SELLER_2 = new mongoose.Types.ObjectId().toString();
const PROD_1 = new mongoose.Types.ObjectId().toString();
const PROD_2 = new mongoose.Types.ObjectId().toString();

describe('PHASE 3 - Server-side Conversion Hooks (checkoutController)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Tạo đơn multi-vendor phát đúng 1 order_placed cho mỗi đơn con và không hỏng khi analytics lỗi', async () => {
    const buyerDoc = {
      _id: new mongoose.Types.ObjectId(BUYER_ID),
      name: 'Buyer Test',
      phone: '0901234567',
      address: '123 Lê Lợi, Q1, TP.HCM',
      cart: [],
      save: jest.fn().mockResolvedValue(true)
    };
    User.findById.mockResolvedValue(buyerDoc);

    const post1 = {
      _id: new mongoose.Types.ObjectId(PROD_1),
      title: 'Áo thun',
      price: 100000,
      stockQuantity: 10,
      sellerId: new mongoose.Types.ObjectId(SELLER_1),
      author: new mongoose.Types.ObjectId(SELLER_1),
      status: 'active',
      save: jest.fn().mockResolvedValue(true)
    };
    const post2 = {
      _id: new mongoose.Types.ObjectId(PROD_2),
      title: 'Quần jean',
      price: 200000,
      stockQuantity: 5,
      sellerId: new mongoose.Types.ObjectId(SELLER_2),
      author: new mongoose.Types.ObjectId(SELLER_2),
      status: 'active',
      save: jest.fn().mockResolvedValue(true)
    };
    Post.find.mockResolvedValue([post1, post2]);

    Order.mockImplementation((data) => ({
      _id: new mongoose.Types.ObjectId(),
      ...data,
      save: jest.fn().mockResolvedValue(true)
    }));

    // Giả lập trackServerEvent trả về rejected promise (lỗi ghi DB)
    trackServerEvent.mockRejectedValue(new Error('Analytics DB down'));

    const req = {
      user: { _id: buyerDoc._id },
      headers: { 'x-hh-sid': 'sess_1', 'x-hh-aid': 'anon_1' },
      body: {
        paymentMethod: 'COD',
        shippingAddress: {
          fullName: 'Buyer Test',
          phone: '0901234567',
          provinceId: 202,
          provinceName: 'TP.HCM',
          districtId: 1442,
          districtName: 'Quận 1',
          wardCode: '20101',
          wardName: 'Bến Nghé',
          street: '123 Lê Lợi'
        },
        items: [
          { productId: PROD_1, quantity: 1 },
          { productId: PROD_2, quantity: 2 }
        ]
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await processCheckout(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(trackServerEvent).toHaveBeenCalledTimes(2);
    expect(trackServerEvent).toHaveBeenNthCalledWith(
      1,
      'order_placed',
      expect.objectContaining({
        sessionId: 'sess_1',
        anonymousId: 'anon_1',
        props: expect.objectContaining({ paymentMethod: 'COD', itemCount: 1 })
      })
    );
    expect(trackServerEvent).toHaveBeenNthCalledWith(
      2,
      'order_placed',
      expect.objectContaining({
        props: expect.objectContaining({ paymentMethod: 'COD', itemCount: 2 })
      })
    );
  });
});
