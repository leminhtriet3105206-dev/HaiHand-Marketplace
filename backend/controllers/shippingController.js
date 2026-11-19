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
const { orderSellerId, canonicalStatus } = require('../utils/b2c');
const { transitionOrder } = require('../utils/orderStateMachine');
const { handleGHNWebhook } = require('./webhookController');

const PROD_GHN_URL = 'https://online-gateway.ghn.vn/shiip/public-api';
const DEV_GHN_URL = 'https://dev-online-gateway.ghn.vn/shiip/public-api';

function normalizeVnPhone(rawPhone, fallbackPhone) {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  const local = digits.startsWith('84') && digits.length === 11
    ? '0' + digits.slice(2)
    : digits;
  return /^0(3|5|7|8|9)\d{8}$/.test(local) ? local : fallbackPhone;
}

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

    // 3. Kiểm tra trạng thái đơn hàng: chỉ cho phép tạo vận đơn khi đơn đang ở Pending hoặc Processing (H4)
    const currentCanon = canonicalStatus(order.status);
    if (!['Pending', 'Processing'].includes(currentCanon)) {
      return res.status(400).json({
        success: false,
        message: `Không thể tạo vận đơn cho đơn hàng đang ở trạng thái "${currentCanon}" (chỉ hỗ trợ Pending hoặc Processing).`
      });
    }

    // 3.1. Xử lý linh hoạt trạng thái thanh toán:
    // Nếu đơn VNPAY/Online chưa thanh toán xong (chưa escrow/paid) nhưng Seller vẫn bấm giao -> chuyển sang COD để GHN thu hộ
    const methodUpper = String(order.paymentMethod || 'COD').trim().toUpperCase();
    const isCodOrder = methodUpper === 'COD' || methodUpper.includes('COD') || methodUpper.includes('TIỀN MẶT');
    const isPaidOrder = ['escrow', 'paid', 'released'].includes(String(order.paymentStatus || '').toLowerCase()) ||
      String(order.status || '').includes('Đã thanh toán');
    if (!isCodOrder && !isPaidOrder) {
      if (process.env.STRICT_ESCROW_BEFORE_SHIP === 'true') {
        return res.status(400).json({
          success: false,
          message: `Đơn hàng ${order.paymentMethod} chưa được thanh toán vào ví ký quỹ (escrow), không thể tạo vận đơn!`
        });
      }
      order.paymentMethod = 'COD';
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

    // 5. Địa chỉ lấy hàng (pickupAddress) của Shop gửi hàng (có Fallback thông minh Quận 1, TP.HCM)
    const sellerDoc =
      (order.sellerId && order.sellerId.shopInfo ? order.sellerId : null) ||
      (order.seller && order.seller.shopInfo ? order.seller : null) ||
      (req.user && req.user.shopInfo ? req.user : null);
    const pickupAddr = sellerDoc?.shopInfo?.pickupAddress || order.pickupAddress || {};

    const parsedFromDistrictId = parseInt(pickupAddr?.districtId, 10);
    const from_district_id = Number.isInteger(parsedFromDistrictId) && parsedFromDistrictId > 0
      ? parsedFromDistrictId
      : 1442;
    const rawFromWardCode = String(pickupAddr?.wardCode || '').trim();
    const from_ward_code = rawFromWardCode || '20101';
    const rawFromAddress = String(
      pickupAddr?.street ||
      pickupAddr?.fullAddress ||
      sellerDoc?.shopInfo?.address ||
      ''
    ).trim();
    const from_address = rawFromAddress || '123 Lê Lợi, Phường Bến Nghé, Quận 1, Hồ Chí Minh';
    const from_name = String(
      pickupAddr?.fullName ||
      sellerDoc?.shopInfo?.shopName ||
      sellerDoc?.name ||
      'Shop HaiHand'
    ).trim();
    const from_phone = normalizeVnPhone(
      pickupAddr?.phone || sellerDoc?.shopInfo?.phone || sellerDoc?.phone,
      '0328911406'
    );
    const from_ward_name = String(pickupAddr?.wardName || 'Phường Bến Nghé').trim();
    const from_district_name = String(pickupAddr?.districtName || 'Quận 1').trim();
    const from_province_name = String(pickupAddr?.provinceName || 'Hồ Chí Minh').trim();

    // 6. Địa chỉ người nhận (shippingAddress) với Fallback thông minh Quận 1, TP.HCM cho đơn cũ thiếu mã hành chính
    const shippingAddr = order.shippingAddress || {};

    const to_name = String(
      shippingAddr.fullName ||
      order.buyer?.name ||
      order.buyerId?.name ||
      'Khách hàng HaiHand'
    ).trim();

    const to_phone = normalizeVnPhone(
      shippingAddr.phone ||
      order.phone ||
      order.buyer?.phone ||
      order.buyerId?.phone,
      '0912345678'
    );

    const to_address = String(
      shippingAddr.street ||
      shippingAddr.address ||
      order.address ||
      order.buyer?.address ||
      order.buyerId?.address ||
      '123 Phường Bến Nghé, Quận 1, Hồ Chí Minh'
    ).trim() || '123 Phường Bến Nghé, Quận 1, Hồ Chí Minh';

    const parsedToDistrictId = parseInt(shippingAddr.districtId ?? order.toDistrictId, 10);
    const to_district_id = Number.isInteger(parsedToDistrictId) && parsedToDistrictId > 0
      ? parsedToDistrictId
      : 1442;
    const rawToWardCode = String(shippingAddr.wardCode ?? order.toWardCode ?? '').trim();
    const to_ward_code = rawToWardCode || '20101';
    const to_ward_name = String(shippingAddr.wardName || 'Phường Bến Nghé').trim();
    const to_district_name = String(shippingAddr.districtName || 'Quận 1').trim();
    const to_province_name = String(shippingAddr.provinceName || 'Hồ Chí Minh').trim();

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
    // Nếu đơn COD (hoặc đơn online chuyển sang thu hộ COD) -> thu hộ toàn bộ order.totalPrice; nếu đã thanh toán escrow/paid -> cod_amount = 0
    const payment_type_id = 1;
    const isEffectiveCod = String(order.paymentMethod || 'COD').toUpperCase().includes('COD') || !isPaidOrder;
    const cod_amount = isEffectiveCod
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

    // 9. Gọi GHN API (tự động thử chuyển Prod <-> Dev nếu gặp lỗi 401; fallback mã vận đơn nội bộ nếu GHN không khả dụng)
    const ghnToken = (process.env.GHN_TOKEN || '').trim();
    const ghnShopId = (process.env.GHN_SHOP_ID || '').trim();
    const primaryBaseUrl = (process.env.GHN_API_URL || PROD_GHN_URL).replace(/\/+$/, '');
    const alternateBaseUrl = primaryBaseUrl.includes('dev-online-gateway.ghn.vn') ? PROD_GHN_URL : DEV_GHN_URL;

    let order_code = null;
    let ghnData = null;
    let usedFallback = false;

    const invokeGhnCreate = async (baseUrl) => {
      const ghnEndpoint = `${baseUrl}/v2/shipping-order/create`;
      return axios.post(ghnEndpoint, payload, {
        headers: {
          'Content-Type': 'application/json',
          Token: ghnToken,
          ShopId: String(ghnShopId)
        },
        timeout: 15000
      });
    };

    if (ghnToken && ghnShopId) {
      try {
        let response = await invokeGhnCreate(primaryBaseUrl);
        ghnData = response?.data;
        order_code = ghnData?.data?.order_code || ghnData?.order_code || null;
      } catch (primaryErr) {
        const is401 =
          primaryErr?.response?.status === 401 ||
          primaryErr?.response?.data?.code === 401;

        console.log('GHN API Error (Primary):', primaryErr?.response?.data || primaryErr?.message);

        if (is401) {
          try {
            console.warn(`⚠️ [GHN Ship] Lỗi 401 tại ${primaryBaseUrl}, tự động retry sang ${alternateBaseUrl}`);
            const retryRes = await invokeGhnCreate(alternateBaseUrl);
            ghnData = retryRes?.data;
            order_code = ghnData?.data?.order_code || ghnData?.order_code || null;
          } catch (retryErr) {
            console.log('GHN API Error (Retry):', retryErr?.response?.data || retryErr?.message);
          }
        }
      }
    } else {
      console.warn('⚠️ [GHN Ship] Thiếu GHN_TOKEN hoặc GHN_SHOP_ID trong env, dùng fallback mã vận đơn nội bộ.');
    }

    if (!order_code) {
      usedFallback = true;
      order_code = `GHN${Date.now().toString().slice(-8)}`;
      console.warn(`⚠️ [GHN Ship] Sử dụng mã vận đơn nội bộ fallback (${order_code}) cho đơn #${order._id}`);
    }

    // 10. Cập nhật Order vào Database (qua transitionOrder nếu đang ở Pending, hoặc cập nhật trực tiếp nếu đã ở Processing)
    const nextCarrier = usedFallback ? 'Giao Hàng Nhanh (GHN - Nội bộ)' : 'Giao Hàng Nhanh (GHN)';
    const nextShipment = {
      ...(order.shipment || {}),
      provider: usedFallback ? 'mock' : 'ghn',
      carrier: nextCarrier,
      trackingCode: order_code,
      fee: ghnData?.data?.total_fee || Number(order.shippingFee) || 25000,
      ...(ghnData?.data?.expected_delivery_time ? { expectedDeliveryTime: new Date(ghnData.data.expected_delivery_time) } : {}),
      createdAt: new Date(),
      ...(ghnData?.data ? { raw: ghnData.data } : {})
    };

    const currentCanonAfter = canonicalStatus(order.status);
    if (currentCanonAfter === 'Pending') {
      const tr = await transitionOrder(order, 'Processing', 'seller', {
        actorId: req.user._id,
        reason: 'Người bán tạo vận đơn GHN',
        extraSet: {
          trackingCode: order_code,
          shippingCode: order_code,
          shippingCarrier: nextCarrier,
          shippingStatus: order.shippingStatus || 'ready_to_pick',
          shipment: nextShipment,
          paymentMethod: order.paymentMethod
        },
        notify: false,
        allowUnpaidToCodFallback: true
      });
      if (!tr.success) {
        return res.status(tr.statusCode || 400).json({
          success: false,
          message: tr.message
        });
      }
    } else {
      order.trackingCode = order_code;
      order.shippingCode = order_code;
      order.status = 'Processing';
      order.shippingCarrier = nextCarrier;
      order.shippingStatus = order.shippingStatus || 'ready_to_pick';
      order.shipment = nextShipment;
      if (typeof order.save === 'function') {
        await order.save();
      }
    }

    // 11. Gửi thông báo đến người mua
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
      fallback: usedFallback,
      message: usedFallback
        ? `Tạo vận đơn thành công! (Mã vận đơn nội bộ: ${order_code})`
        : 'Tạo đơn giao hàng GHN thành công!',
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

    return res.status(error.response?.status || 500).json({
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
