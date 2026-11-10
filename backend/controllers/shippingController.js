let axios;
try {
  axios = require('axios');
} catch (e) {
  axios = {
    post: async (url, data, config = {}) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: config.headers || {},
        body: JSON.stringify(data)
      });
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(resData.message || `HTTP ${res.status}`);
        err.response = { status: res.status, data: resData };
        throw err;
      }
      return { data: resData, status: res.status };
    }
  };
}
const Order = require('../models/Order');
const { orderSellerId } = require('../utils/b2c');
const { handleGHNWebhook } = require('./webhookController');

/**
 * Controller: Tạo đơn giao hàng GHN (Giao Hàng Nhanh)
 * Endpoint: POST /api/seller/orders/:orderId/ship
 */
const createShipmentGHN = async (req, res) => {
  try {
    const orderId = req.params.orderId || req.params.id;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu mã đơn hàng (orderId)!'
      });
    }

    // 1. Lấy thông tin đơn hàng từ DB
    const order = await Order.findById(orderId).populate('buyer buyerId seller sellerId items orderItems.productId');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: `Không tìm thấy đơn hàng #${orderId}`
      });
    }

    // 2. Kiểm tra quyền sở hữu: chỉ Seller sở hữu đơn (hoặc Admin) mới được tạo vận đơn
    const orderSeller = order.sellerId?._id || order.seller?._id || order.sellerId || order.seller || orderSellerId(order);
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Vui lòng đăng nhập tài khoản Seller để tạo vận đơn!'
      });
    }
    if (req.user.role !== 'Admin') {
      const isOwner = orderSeller && (
        req.user._id?.equals
          ? req.user._id.equals(orderSeller)
          : String(req.user._id) === String(orderSeller)
      );
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: 'Bạn không có quyền tạo vận đơn cho đơn hàng của Shop khác!'
        });
      }
    }

    // 3. Kiểm tra trạng thái thanh toán: đơn trả trước (khác COD) bắt buộc phải ở trạng thái 'escrow'
    const isNonCod = order.paymentMethod ? order.paymentMethod !== 'COD' : (order.paymentStatus === 'unpaid');
    if (isNonCod && order.paymentStatus !== 'escrow') {
      return res.status(400).json({
        success: false,
        message: 'Đơn hàng chưa được thanh toán ký quỹ (escrow), không thể tạo vận đơn giao hàng!'
      });
    }

    // 4. Idempotency: nếu đơn đã có trackingCode hoặc đã được tạo GHN trước đó
    if (order.trackingCode || (order.shipment && order.shipment.trackingCode)) {
      const existingCode = order.trackingCode || order.shipment.trackingCode;
      return res.status(200).json({
        success: true,
        message: `Đơn hàng này đã có mã vận đơn GHN (${existingCode})`,
        order_code: existingCode,
        trackingCode: existingCode,
        order
      });
    }

    // 5. Kiểm tra địa chỉ lấy hàng (pickupAddress) của Shop gửi hàng
    const sellerDoc =
      (order.sellerId && order.sellerId.shopInfo ? order.sellerId : null) ||
      (order.seller && order.seller.shopInfo ? order.seller : null) ||
      (req.user && req.user.shopInfo ? req.user : null);
    const pickupAddr = sellerDoc?.shopInfo?.pickupAddress || order.pickupAddress || null;
    const fromDistrictId = parseInt(pickupAddr?.districtId, 10);
    const fromWardCode = String(pickupAddr?.wardCode || '').trim();
    const fromAddressStr = String(pickupAddr?.street || pickupAddr?.fullAddress || sellerDoc?.shopInfo?.address || '').trim();

    if (!pickupAddr || !Number.isInteger(fromDistrictId) || fromDistrictId <= 0 || !fromWardCode || !fromAddressStr) {
      return res.status(400).json({
        success: false,
        message: 'Shop chưa cấu hình địa chỉ lấy hàng (pickupAddress) đầy đủ. Vui lòng vào Cài đặt Shop cập nhật địa chỉ kho!'
      });
    }

    const from_name = String(pickupAddr.fullName || sellerDoc?.shopInfo?.shopName || sellerDoc?.name || 'Shop HaiHand').trim();
    const from_phone = String(pickupAddr.phone || sellerDoc?.shopInfo?.phone || sellerDoc?.phone || '').trim();
    const from_address = fromAddressStr;
    const from_district_id = fromDistrictId;
    const from_ward_code = fromWardCode;
    const from_ward_name = String(pickupAddr.wardName || '').trim();
    const from_district_name = String(pickupAddr.districtName || '').trim();
    const from_province_name = String(pickupAddr.provinceName || '').trim();

    // 6. Kiểm tra thông tin người nhận (không dùng số điện thoại giả hay Quận/Phường giả)
    const shippingAddr = order.shippingAddress || {};

    const to_name = String(
      shippingAddr.fullName ||
      order.buyer?.name ||
      order.buyerId?.name ||
      'Khách hàng HaiHand'
    ).trim();

    const rawPhone = String(
      shippingAddr.phone ||
      order.phone ||
      order.buyer?.phone ||
      order.buyerId?.phone ||
      ''
    ).replace(/\D/g, '');

    const to_address = String(
      shippingAddr.street ||
      shippingAddr.address ||
      order.address ||
      order.buyer?.address ||
      order.buyerId?.address ||
      ''
    ).trim();

    if (!rawPhone) {
      return res.status(400).json({
        success: false,
        message: 'Đơn hàng thiếu số điện thoại người nhận để tạo vận đơn GHN!'
      });
    }

    const to_phone = rawPhone.startsWith('84') && rawPhone.length === 11
      ? '0' + rawPhone.slice(2)
      : rawPhone;

    if (!/^0(3|5|7|8|9)\d{8}$/.test(to_phone)) {
      return res.status(400).json({
        success: false,
        message: 'Số điện thoại người nhận không hợp lệ (cần 10 số di động Việt Nam)!'
      });
    }

    if (!to_address) {
      return res.status(400).json({
        success: false,
        message: 'Đơn hàng thiếu địa chỉ nhận hàng để tạo vận đơn GHN!'
      });
    }

    const parsedDistrictId = parseInt(shippingAddr.districtId ?? order.toDistrictId, 10);
    const rawWardCode = String(shippingAddr.wardCode ?? order.toWardCode ?? '').trim();

    if (!Number.isInteger(parsedDistrictId) || parsedDistrictId <= 0 || !rawWardCode) {
      return res.status(400).json({
        success: false,
        message: 'Đơn hàng thiếu mã Quận/Huyện (districtId) hoặc Phường/Xã (wardCode) của người nhận!'
      });
    }

    const to_district_id = parsedDistrictId;
    const to_ward_code = rawWardCode;
    const to_ward_name = String(shippingAddr.wardName || '').trim();
    const to_district_name = String(shippingAddr.districtName || '').trim();
    const to_province_name = String(shippingAddr.provinceName || '').trim();

    // 7. Chuẩn bị danh sách sản phẩm và tính tổng khối lượng
    const rawItems = (order.orderItems && order.orderItems.length > 0)
      ? order.orderItems
      : (order.items && order.items.length > 0)
        ? order.items
        : [];

    let totalWeight = 0;
    const items = rawItems.map((item) => {
      const name = String(item.name || item.title || 'Sản phẩm HaiHand').trim();
      const parsedQty = parseInt(item.quantity, 10);
      const quantity = Number.isInteger(parsedQty) && parsedQty > 0 ? parsedQty : 1;

      const parsedItemWeight = parseInt(item.weight, 10);
      const itemWeight = Number.isInteger(parsedItemWeight) && parsedItemWeight > 0 ? parsedItemWeight : 200;

      totalWeight += itemWeight * quantity;

      return {
        name: name.slice(0, 100),
        quantity,
        weight: itemWeight
      };
    });

    if (items.length === 0) {
      items.push({
        name: 'Gói hàng thương mại điện tử HaiHand',
        quantity: 1,
        weight: 200
      });
      totalWeight = 200;
    }

    const weight = parseInt(totalWeight, 10) || 200;
    const length = parseInt(order.length, 10) || 15;
    const width = parseInt(order.width, 10) || 15;
    const height = parseInt(order.height, 10) || 15;

    // Phí vận chuyển đã nằm trong order.totalPrice -> payment_type_id = 1 (Shop/Sàn trả cước cho GHN)
    // Nếu đơn COD -> thu hộ toàn bộ order.totalPrice; nếu đã thanh toán escrow -> cod_amount = 0
    const payment_type_id = 1;
    const cod_amount = order.paymentMethod === 'COD'
      ? Math.round(Number(order.totalPrice) || 0)
      : 0;

    // 8. Chuẩn bị Payload gửi sang GHN '/v2/shipping-order/create'
    const payload = {
      payment_type_id,
      cod_amount,
      note: 'Đơn hàng từ HaiHand',
      required_note: 'KHONGCHOXEMHANG',
      client_order_code: String(order._id),
      from_name,
      from_phone,
      from_address,
      from_district_id,
      from_ward_code,
      from_ward_name,
      from_district_name,
      from_province_name,
      to_name,
      to_phone,
      to_address,
      to_ward_code,
      to_district_id,
      to_ward_name,
      to_district_name,
      to_province_name,
      weight,
      length,
      width,
      height,
      service_type_id: 2,
      items
    };

    const ghnToken = (process.env.GHN_TOKEN || '').trim();
    const ghnShopId = (process.env.GHN_SHOP_ID || '').trim();

    if (!ghnToken || !ghnShopId) {
      return res.status(500).json({
        success: false,
        message: 'Hệ thống chưa được cấu hình GHN_TOKEN hoặc GHN_SHOP_ID trong biến môi trường!'
      });
    }

    const ghnBaseUrl = (process.env.GHN_API_URL || 'https://dev-online-gateway.ghn.vn/shiip/public-api').replace(/\/+$/, '');
    const ghnEndpoint = `${ghnBaseUrl}/v2/shipping-order/create`;

    const response = await axios.post(ghnEndpoint, payload, {
      headers: {
        'Content-Type': 'application/json',
        Token: ghnToken,
        ShopId: String(ghnShopId)
      },
      timeout: 15000
    });

    const ghnData = response.data;
    const order_code = ghnData?.data?.order_code || ghnData?.order_code;

    if (!order_code) {
      return res.status(502).json({
        success: false,
        message: 'GHN không trả về mã đơn hàng hợp lệ.',
        details: ghnData
      });
    }

    // 9. Cập nhật Order vào Database
    order.trackingCode = order_code;
    order.shippingCode = order_code;
    order.status = 'Processing';
    order.shippingCarrier = 'Giao Hàng Nhanh (GHN)';
    order.shippingStatus = order.shippingStatus || 'ready_to_pick';

    if (!order.shipment) {
      order.shipment = {};
    }
    order.shipment.provider = 'ghn';
    order.shipment.trackingCode = order_code;
    order.shipment.fee = ghnData?.data?.total_fee || 0;
    if (ghnData?.data?.expected_delivery_time) {
      order.shipment.expectedDeliveryTime = new Date(ghnData.data.expected_delivery_time);
    }
    order.shipment.createdAt = new Date();
    order.shipment.raw = ghnData.data;

    await order.save();

    // 10. Gửi thông báo đến người mua
    try {
      const notificationService = require('../utils/notificationService');
      const buyerId = order.buyerId?._id || order.buyer?._id || order.buyerId || order.buyer;
      if (buyerId && notificationService?.sendNotification) {
        await notificationService.sendNotification(
          buyerId,
          '📦 Đơn hàng đã giao cho GHN',
          `Đơn hàng #${order._id.toString().slice(-6).toUpperCase()} đã được tạo vận đơn GHN thành công (Mã vận đơn: ${order_code}).`,
          'ORDER',
          '/profile?tab=orders_buy'
        );
      }
    } catch (notifErr) {
      console.warn('Không thể gửi thông báo sau khi tạo đơn GHN:', notifErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Tạo đơn giao hàng GHN thành công!',
      order_code,
      trackingCode: order_code,
      order
    });
  } catch (error) {
    console.log('GHN API Error:', error.response?.data || error.message);

    const errorData = error.response?.data;
    const exactMessage =
      errorData?.message && errorData?.code_message_value && errorData.message !== errorData.code_message_value
        ? `${errorData.message} (${errorData.code_message_value})`
        : (errorData?.message || errorData?.code_message_value || error.message || 'Failed to create GHN order');

    return res.status(error.response?.status || 400).json({
      success: false,
      message: exactMessage,
      error: errorData || error.message
    });
  }
};

module.exports = {
  createShipmentGHN,
  handleShipGHN: createShipmentGHN,
  handleGHNWebhook
};
