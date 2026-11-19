const Order = require('../models/Order');
const { cancelOrderWithRefundAndRestock } = require('./checkoutController');
const { sendNotification } = require('../utils/notificationService');
const { orderBuyerId, orderSellerId } = require('../utils/b2c');

/**
 * Controller: Xử lý Webhook cập nhật trạng thái vận đơn thời gian thực từ GHN (Giao Hàng Nhanh)
 * Endpoint: POST /api/webhook/ghn
 * Security:
 * - Nếu biến môi trường `GHN_WEBHOOK_SECRET` được cấu hình, bắt buộc kiểm tra token trong
 *   `req.headers['x-ghn-secret']`, `req.headers['x-webhook-secret']`, `req.query.secret` hoặc `req.body.secret`.
 * Business Logic:
 * - Khi `lowerStatus` thuộc `['cancel', 'returned']`: Gọi `cancelOrderWithRefundAndRestock` để hoàn tiền
 *   ví HaiPay cho Buyer, trừ `pendingBalance` của Seller và hoàn lại tồn kho nguyên tử.
 * - Khi `lowerStatus === 'return'`: Cập nhật `order.shippingStatus = 'return'` và gửi thông báo cho Seller & Buyer.
 * - Khi `lowerStatus === 'delivered'`: Cập nhật `order.status = 'Delivered'`, `order.deliveredAt = new Date()`,
 *   và gửi Notification nhắc Buyer xác nhận "Đã nhận được hàng".
 */
const handleGHNWebhook = async (req, res) => {
  try {
    // 0. Kiểm tra bảo mật Webhook nếu GHN_WEBHOOK_SECRET được cấu hình
    const configuredSecret = process.env.GHN_WEBHOOK_SECRET
      ? String(process.env.GHN_WEBHOOK_SECRET).trim()
      : '';
    if (configuredSecret) {
      const providedSecret =
        req.headers?.['x-ghn-secret'] ||
        req.headers?.['x-webhook-secret'] ||
        req.query?.secret ||
        req.body?.secret ||
        '';
      if (String(providedSecret).trim() !== configuredSecret) {
        return res.status(401).json({
          success: false,
          message: 'Từ chối truy cập: Chữ ký / Secret token của GHN Webhook không hợp lệ!'
        });
      }
    }

    // 1. Trích xuất thông tin từ GHN Webhook Payload
    const { ClientOrderCode, Status, Reason, OrderCode, Description } = req.body || {};

    if (!ClientOrderCode || !Status) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin bắt buộc: ClientOrderCode hoặc Status từ GHN Webhook!'
      });
    }

    // 2. Tìm kiếm Order trong Database bằng ClientOrderCode (map với Order._id)
    const order = await Order.findById(ClientOrderCode);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: `Không tìm thấy đơn hàng với ClientOrderCode: ${ClientOrderCode}`
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
      status: String(Status).trim(),
      description: String(logDescription).trim(),
      updated_at: new Date()
    };

    order.trackingLogs.push(newTrackingLog);

    // 5. Cập nhật trạng thái giao hàng chính (shippingStatus) của Order
    const normalizedStatus = String(Status).trim();
    order.shippingStatus = normalizedStatus;

    if (OrderCode && !order.trackingCode) {
      order.trackingCode = String(OrderCode).trim();
    }

    const lowerStatus = normalizedStatus.toLowerCase();
    const buyerId = orderBuyerId(order);
    const sellerId = orderSellerId(order);
    const shortOrderCode = order._id ? order._id.toString().slice(-6).toUpperCase() : String(ClientOrderCode).slice(-6).toUpperCase();

    // 6. Đồng bộ trạng thái tổng của đơn hàng (Order.status) và luồng tài chính / tồn kho
    if (['cancel', 'returned'].includes(lowerStatus)) {
      // Lưu trước trackingLogs và shippingStatus
      if (typeof order.save === 'function') {
        await order.save();
      }

      // Gọi cancelOrderWithRefundAndRestock để tự động hoàn tiền Escrow cho Buyer, trừ pendingBalance của Seller và hoàn lại tồn kho
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
        success: true,
        message: 'Đã xử lý hủy/hoàn trả vận đơn GHN, hoàn tiền và hoàn kho thành công!',
        shippingStatus: order.shippingStatus,
        trackingLogs: order.trackingLogs
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
        success: true,
        message: 'Cập nhật trạng thái đang hoàn hàng (return) thành công!',
        shippingStatus: order.shippingStatus,
        trackingLogs: order.trackingLogs
      });
    }

    if (lowerStatus === 'delivered') {
      order.status = 'Delivered';
      order.deliveredAt = new Date();
      if (typeof order.save === 'function') {
        await order.save();
      }

      try {
        if (buyerId) {
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
        if (sellerId) {
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
        success: true,
        message: 'Cập nhật trạng thái vận đơn GHN thành công!',
        shippingStatus: order.shippingStatus,
        trackingLogs: order.trackingLogs
      });
    }

    if (['picking', 'picked', 'storing', 'transporting', 'sorting', 'delivering'].includes(lowerStatus)) {
      order.status = 'Shipped';
    }

    // 7. Lưu thay đổi vào MongoDB
    if (typeof order.save === 'function') {
      await order.save();
    }

    // 8. Phản hồi 200 OK ngay lập tức để GHN Server không bị timeout hoặc retry
    return res.status(200).json({
      success: true,
      message: 'Cập nhật trạng thái vận đơn GHN thành công!',
      shippingStatus: order.shippingStatus,
      trackingLogs: order.trackingLogs
    });
  } catch (error) {
    console.error('❌ [GHN Webhook Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi xử lý GHN Webhook',
      error: error.message
    });
  }
};

module.exports = {
  handleGHNWebhook
};
