const Order = require('../models/Order');
const { cancelOrderWithRefundAndRestock } = require('./checkoutController');
const { transitionOrder } = require('../utils/orderStateMachine');
const { sendNotification } = require('../utils/notificationService');
const { orderBuyerId, orderSellerId, canonicalStatus } = require('../utils/b2c');
const { timingSafeStringEqual } = require('../utils/password');
const { normalizeIp } = require('../utils/vnpay');

/**
 * Controller: Xử lý Webhook cập nhật trạng thái vận đơn thời gian thực từ GHN (Giao Hàng Nhanh)
 * Endpoint: POST /api/webhook/ghn
 * Security (C10):
 * - Bắt buộc kiểm tra header/token bí mật (`GHN_WEBHOOK_TOKEN` hoặc `GHN_WEBHOOK_SECRET`, so sánh hằng-thời-gian)
 *   và/hoặc IP allowlist (`GHN_WEBHOOK_IP_ALLOWLIST`).
 * - Map trạng thái GHN -> trạng thái nội bộ qua `transitionOrder` (chỉ chuyển hợp lệ, ví dụ `Shipped -> Delivered`;
 *   nếu đơn đã `Cancelled` hoặc `Completed` thì bỏ qua việc đổi trạng thái).
 * - Khi GHN báo `cancel` / `returned` -> gọi `cancelOrderWithRefundAndRestock`.
 * - Response chỉ trả `{ ok: true, success: true, shippingStatus }`, TUYỆT ĐỐI KHÔNG trả `trackingLogs` hoặc chi tiết lỗi DB (M9).
 * - Log đầy đủ mọi sự kiện bị từ chối.
 */
const handleGHNWebhook = async (req, res) => {
  try {
    // 0. Kiểm tra IP Allowlist nếu được cấu hình qua env
    const ipAllowlist = (process.env.GHN_WEBHOOK_IP_ALLOWLIST || '')
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean);

    if (ipAllowlist.length > 0) {
      const callerIp = normalizeIp(req);
      if (!ipAllowlist.includes(callerIp)) {
        console.warn(`⚠️ [GHN Webhook Rejected] IP ${callerIp} không nằm trong GHN_WEBHOOK_IP_ALLOWLIST`);
        return res.status(401).json({
          ok: false,
          success: false,
          message: 'Từ chối truy cập: IP không hợp lệ'
        });
      }
    }

    // 0.1. Kiểm tra token bí mật GHN_WEBHOOK_TOKEN / GHN_WEBHOOK_SECRET bằng so sánh hằng-thời-gian
    const configuredSecret = (process.env.GHN_WEBHOOK_TOKEN || process.env.GHN_WEBHOOK_SECRET || '').trim();
    if (!configuredSecret && process.env.NODE_ENV !== 'test') {
      console.warn('⚠️ [GHN Webhook Rejected] Chưa cấu hình GHN_WEBHOOK_TOKEN trên máy chủ');
      return res.status(401).json({
        ok: false,
        success: false,
        message: 'Từ chối truy cập: Chưa cấu hình GHN_WEBHOOK_TOKEN'
      });
    }

    if (configuredSecret) {
      const rawBearer = req.headers?.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7).trim()
        : '';
      const providedSecret = String(
        req.headers?.['x-ghn-token'] ||
        req.headers?.['x-ghn-secret'] ||
        req.headers?.['x-webhook-secret'] ||
        rawBearer ||
        req.query?.token ||
        req.query?.secret ||
        req.body?.token ||
        req.body?.secret ||
        ''
      ).trim();

      if (!providedSecret || !timingSafeStringEqual(providedSecret, configuredSecret)) {
        console.warn('⚠️ [GHN Webhook Rejected] Token xác thực GHN Webhook thiếu hoặc không khớp');
        return res.status(401).json({
          ok: false,
          success: false,
          message: 'Từ chối truy cập: Chữ ký / Secret token của GHN Webhook không hợp lệ!'
        });
      }
    }

    // 1. Trích xuất thông tin từ GHN Webhook Payload
    const { ClientOrderCode, Status, Reason, OrderCode, Description } = req.body || {};

    if (!ClientOrderCode || !Status || typeof ClientOrderCode !== 'string' || typeof Status !== 'string') {
      console.warn('⚠️ [GHN Webhook Rejected] Payload thiếu ClientOrderCode hoặc Status');
      return res.status(400).json({
        ok: false,
        success: false,
        message: 'Thiếu thông tin bắt buộc: ClientOrderCode hoặc Status từ GHN Webhook!'
      });
    }

    // 2. Tìm kiếm Order trong Database bằng ClientOrderCode (map với Order._id)
    const order = await Order.findById(ClientOrderCode);

    if (!order) {
      console.warn(`⚠️ [GHN Webhook Rejected] Không tìm thấy đơn hàng ClientOrderCode=${ClientOrderCode}`);
      return res.status(404).json({
        ok: false,
        success: false,
        message: 'Không tìm thấy đơn hàng tương ứng'
      });
    }

    const currentCanon = canonicalStatus(order.status);
    const normalizedStatus = String(Status).trim();
    const lowerStatus = normalizedStatus.toLowerCase();

    // Nếu đơn hàng đã Cancelled hoặc Completed -> bỏ qua việc đổi trạng thái (C10)
    if (['Cancelled', 'Completed'].includes(currentCanon)) {
      console.warn(
        `ℹ️ [GHN Webhook Ignored] Đơn hàng #${order._id} đã ở trạng thái "${currentCanon}", bỏ qua sự kiện GHN "${normalizedStatus}"`
      );
      return res.status(200).json({
        ok: true,
        success: true,
        ignored: true,
        message: 'Đơn hàng đã ở trạng thái kết thúc, bỏ qua cập nhật'
      });
    }

    // 3. Khởi tạo mảng trackingLogs nếu đơn hàng cũ chưa có
    if (!Array.isArray(order.trackingLogs)) {
      order.trackingLogs = [];
    }

    // 4. Tạo bản ghi lịch sử hành trình mới và đẩy vào mảng trackingLogs
    const logDescription =
      Reason ||
      Description ||
      `Cập nhật trạng thái vận chuyển từ GHN: ${Status}`;

    const newTrackingLog = {
      status: normalizedStatus,
      description: String(logDescription).trim(),
      updated_at: new Date()
    };

    order.trackingLogs.push(newTrackingLog);

    // 5. Cập nhật trạng thái giao hàng chính (shippingStatus) của Order
    order.shippingStatus = normalizedStatus;

    if (OrderCode && !order.trackingCode) {
      order.trackingCode = String(OrderCode).trim();
    }

    const buyerId = orderBuyerId(order);
    const sellerId = orderSellerId(order);
    const shortOrderCode = order._id
      ? order._id.toString().slice(-6).toUpperCase()
      : String(ClientOrderCode).slice(-6).toUpperCase();

    // 6. Đồng bộ trạng thái tổng của đơn hàng (Order.status) và luồng tài chính / tồn kho
    if (['cancel', 'returned'].includes(lowerStatus)) {
      if (typeof order.save === 'function') {
        await order.save();
      }

      const cancelResult = await cancelOrderWithRefundAndRestock(order, {
        cancelledBy: 'system_ghn',
        reason: logDescription
      });

      order.status = 'Cancelled';
      order.cancelledAt = cancelResult?.order?.cancelledAt || new Date();
      order.cancelReason = logDescription;
      if (cancelResult?.order?.paymentStatus) {
        order.paymentStatus = cancelResult.order.paymentStatus;
      }

      try {
        if (buyerId) {
          await sendNotification({
            userId: buyerId,
            recipientRole: 'buyer',
            type: 'ORDER_STATUS',
            orderId: order._id,
            title: '⚠️ Đơn hàng đã bị hủy / hoàn trả từ GHN',
            message: `Đơn hàng #${shortOrderCode} đã chuyển sang trạng thái "${normalizedStatus}": ${logDescription}.${cancelResult?.refundedAmount > 0 ? ' Tiền đã được hoàn về Ví HaiPay của bạn.' : ''}`,
            link: '/profile?tab=orders_buy',
            targetUrl: '/profile?tab=orders_buy'
          });
        }
        if (sellerId) {
          await sendNotification({
            userId: sellerId,
            shopId: sellerId,
            recipientRole: 'seller',
            type: 'ORDER_STATUS',
            orderId: order._id,
            title: '⚠️ Vận đơn GHN bị hủy / đã hoàn trả',
            message: `Đơn hàng #${shortOrderCode} đã bị hủy hoặc hoàn trả (${logDescription}). Tồn kho sản phẩm đã được cộng lại tự động.`,
            link: '/seller-channel/orders',
            targetUrl: '/seller-channel/orders'
          });
        }
      } catch (notifErr) {
        console.warn('Webhook cancel notification warning:', notifErr.message);
      }

      return res.status(200).json({
        ok: true,
        success: true,
        shippingStatus: order.shippingStatus
      });
    }

    if (lowerStatus === 'return') {
      order.shippingStatus = 'return';
      if (typeof order.save === 'function') {
        await order.save();
      }

      try {
        if (sellerId) {
          await sendNotification({
            userId: sellerId,
            shopId: sellerId,
            recipientRole: 'seller',
            type: 'ORDER_STATUS',
            orderId: order._id,
            title: '↩️ Đơn hàng đang được GHN hoàn trả về Shop',
            message: `Đơn hàng #${shortOrderCode} đang trong quá trình hoàn trả (${logDescription}).`,
            link: '/seller-channel/orders',
            targetUrl: '/seller-channel/orders'
          });
        }
        if (buyerId) {
          await sendNotification({
            userId: buyerId,
            recipientRole: 'buyer',
            type: 'ORDER_STATUS',
            orderId: order._id,
            title: '↩️ Đơn hàng đang hoàn trả',
            message: `Đơn hàng #${shortOrderCode} đang được hoàn trả về người bán (${logDescription}).`,
            link: '/profile?tab=orders_buy',
            targetUrl: '/profile?tab=orders_buy'
          });
        }
      } catch (notifErr) {
        console.warn('Webhook return notification warning:', notifErr.message);
      }

      return res.status(200).json({
        ok: true,
        success: true,
        shippingStatus: order.shippingStatus
      });
    }

    if (lowerStatus === 'delivered') {
      if (currentCanon === 'Shipped') {
        await transitionOrder(order, 'Delivered', 'system_ghn', {
          reason: logDescription,
          extraSet: {
            shippingStatus: order.shippingStatus,
            ...(order.trackingCode ? { trackingCode: order.trackingCode } : {})
          },
          notify: false,
          allowUnpaidToCodFallback: true
        });
      } else {
        console.warn(
          `⚠️ [GHN Webhook Transition Rejected] Không thể chuyển đơn #${order._id} từ "${currentCanon}" sang "Delivered"`
        );
      }

      try {
        if (buyerId && canonicalStatus(order.status) === 'Delivered') {
          await sendNotification({
            userId: buyerId,
            recipientRole: 'buyer',
            type: 'ORDER_STATUS',
            orderId: order._id,
            title: '📦 Đơn hàng đã giao thành công!',
            message: `Đơn hàng #${shortOrderCode} đã được GHN giao thành công. Vui lòng kiểm tra hàng và bấm "Đã nhận được hàng" để hoàn tất đơn hàng nhé!`,
            link: '/profile?tab=orders_buy',
            targetUrl: '/profile?tab=orders_buy'
          });
        }
        if (sellerId && canonicalStatus(order.status) === 'Delivered') {
          await sendNotification({
            userId: sellerId,
            shopId: sellerId,
            recipientRole: 'seller',
            type: 'ORDER_STATUS',
            orderId: order._id,
            title: '✅ GHN đã giao hàng thành công!',
            message: `Đơn hàng #${shortOrderCode} đã được giao tới người mua. Chờ khách xác nhận hoặc Admin giải ngân doanh thu.`,
            link: '/seller-channel/orders',
            targetUrl: '/seller-channel/orders'
          });
        }
      } catch (notifErr) {
        console.warn('Webhook delivered notification warning:', notifErr.message);
      }

      return res.status(200).json({
        ok: true,
        success: true,
        shippingStatus: order.shippingStatus
      });
    }

    if (['picking', 'picked', 'storing', 'transporting', 'sorting', 'delivering'].includes(lowerStatus)) {
      if (currentCanon === 'Processing') {
        await transitionOrder(order, 'Shipped', 'system_ghn', {
          reason: logDescription,
          extraSet: { shippingStatus: order.shippingStatus },
          notify: false,
          allowUnpaidToCodFallback: true
        });
      } else if (typeof order.save === 'function') {
        await order.save();
      }
    } else if (typeof order.save === 'function') {
      await order.save();
    }

    return res.status(200).json({
      ok: true,
      success: true,
      shippingStatus: order.shippingStatus
    });
  } catch (error) {
    console.error('❌ [GHN Webhook Error]:', error.message);
    return res.status(500).json({
      ok: false,
      success: false,
      message: 'Lỗi máy chủ khi xử lý GHN Webhook'
    });
  }
};

module.exports = {
  handleGHNWebhook
};
