const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');
const PaymentSession = require('../models/PaymentSession');
const Transaction = require('../models/Transaction');
const { Product, Post } = require('../models/Product');
const Notification = require('../models/Notification');
const { sendNotification } = require('../utils/notificationService');
const shippingService = require('../services/shipping');
const { pickAddressFields, isCompleteAddress, formatAddress } = require('../models/schemas/Address');
const { addAddressToUser } = require('../routes/address');
const {
  CATALOG_VISIBLE,
  productOwnerId,
  displayProductName,
  orderSellerId,
  orderBuyerId,
  canonicalStatus,
  isEscrow,
  fetchPlatformFeePercent,
  calculateOrderSplit
} = require('../utils/b2c');
const { buildVnpayPaymentUrl, normalizeIp } = require('../utils/vnpay');

/**
 * Helper: Rollback atomic stock deductions if a subsequent item or wallet payment fails
 */
async function rollbackDeductedStock(deductedItems = []) {
  for (const deducted of deductedItems) {
    try {
      const incFields = {
        stockQuantity: deducted.quantity,
        quantity: deducted.quantity,
        soldCount: -deducted.quantity
      };
      const restored = await Post.findByIdAndUpdate(
        deducted.productId,
        { $inc: incFields },
        { new: true }
      );
      if (restored) {
        const fixSet = {};
        if ((restored.soldCount || 0) < 0) {
          fixSet.soldCount = 0;
        }
        if (
          (restored.status === 'out_of_stock' || restored.status === 'SOLD') &&
          (restored.stockQuantity ?? restored.quantity ?? 0) > 0
        ) {
          fixSet.status = 'active';
        }
        if (deducted.variantKey && Array.isArray(restored.variants)) {
          await Post.updateOne(
            {
              _id: deducted.productId,
              variants: {
                $elemMatch: {
                  $or: [{ sku: deducted.variantKey }, { name: deducted.variantKey }]
                }
              }
            },
            { $inc: { 'variants.$.stock': deducted.quantity } }
          );
        }
        if (Object.keys(fixSet).length > 0) {
          await Post.findByIdAndUpdate(deducted.productId, { $set: fixSet });
        }
      }
    } catch (rbErr) {
      console.error('Rollback stock error:', rbErr.message);
    }
  }
}

/**
 * Helper to settle payment for a paymentSession (called by VNPAY verify/IPN or HaiPay)
 */
async function settlePaymentSession(parentOrderId, { gatewayPayload = {}, paymentMethod } = {}) {
  const session = await PaymentSession.findOneAndUpdate(
    { parentOrderId, status: { $ne: 'paid' } },
    {
      $set: {
        status: 'paid',
        paidAt: new Date(),
        gatewayPayload
      }
    },
    { new: true }
  );

  if (!session) {
    const verifiedSession = await PaymentSession.findOne({ parentOrderId });
    if (verifiedSession && verifiedSession.status === 'paid') {
      return { session: verifiedSession, alreadyPaid: true };
    }
    throw new Error(`Không tìm thấy phiên thanh toán với mã ${parentOrderId}`);
  }

  const feePercent = await fetchPlatformFeePercent();
  const orders = await Order.find({ _id: { $in: session.orderIds } });
  for (const order of orders) {
    const { sellerReceive } = calculateOrderSplit(order, feePercent);
    order.paymentStatus = 'escrow';
    order.paidAt = new Date();
    order.status = 'Pending';
    if (order.commissionRate == null) order.commissionRate = feePercent;
    if (order.sellerReceive == null) order.sellerReceive = sellerReceive;
    await order.save();

    const sId = orderSellerId(order);
    if (sId) {
      await User.findByIdAndUpdate(sId, {
        $inc: { pendingBalance: sellerReceive }
      });
    }

    try {
      if (sId) {
        await sendNotification({
          userId: sId,
          shopId: sId,
          recipientRole: 'seller',
          type: 'NEW_ORDER',
          orderId: order._id,
          title: '🎉 Đơn hàng mới đã thanh toán!',
          message: `Khách hàng vừa thanh toán đơn hàng #${order._id.toString().slice(-6).toUpperCase()} trị giá ${(order.totalPrice || 0).toLocaleString('vi-VN')} đ qua ${order.paymentMethod}. Hãy chuẩn bị hàng nhé!`,
          link: '/seller-channel/orders',
          targetUrl: '/seller-channel/orders'
        });
      }
    } catch (notifErr) {
      console.warn('Notification to seller error:', notifErr.message);
    }
  }

  // Only deduct inventory here if it was not already atomically reserved during processCheckout
  const alreadyDeducted = session.gatewayPayload?.stockDeducted === true || gatewayPayload?.stockDeducted === true;
  if (!alreadyDeducted && Array.isArray(session.purchasedItems)) {
    for (const item of session.purchasedItems) {
      if (item.productId && mongoose.Types.ObjectId.isValid(item.productId)) {
        const qty = Math.max(1, Number(item.quantity) || 1);
        const updatedPost = await Post.findOneAndUpdate(
          {
            _id: item.productId,
            stockQuantity: { $gte: qty }
          },
          {
            $inc: {
              stockQuantity: -qty,
              quantity: -qty,
              soldCount: qty
            }
          },
          { new: true }
        );
        if (updatedPost && (updatedPost.stockQuantity ?? updatedPost.quantity ?? 0) <= 0) {
          await Post.findByIdAndUpdate(item.productId, { $set: { status: 'out_of_stock' } });
        }
      }
    }
  }

  // Clear purchased items from buyer's cart
  const buyer = await User.findById(session.buyer);
  if (buyer && Array.isArray(buyer.cart)) {
    const purchasedIdsStr = (session.purchasedItems || []).map((p) => p.productId.toString());
    buyer.cart = buyer.cart.filter(
      (c) => c.product && !purchasedIdsStr.includes(c.product.toString())
    );
    await buyer.save();
  }

  return { session, orders, alreadyPaid: false };
}

/**
 * POST /api/checkout
 * Main multi-vendor checkout endpoint with:
 * - Product active status check
 * - Anti-self-purchase guard
 * - Variant price/stock matching
 * - Atomic stock deduction ($inc with $gte) & automatic rollback on failure
 * - Commission calculated strictly on itemsSubtotal (excluding shippingFee)
 */
async function processCheckout(req, res) {
  const deductedItems = [];
  try {
    const buyerId = req.user ? req.user._id : req.body.userId;
    if (!buyerId || !mongoose.Types.ObjectId.isValid(buyerId)) {
      return res.status(401).json({ message: 'Vui lòng đăng nhập để tiến hành đặt hàng' });
    }

    const buyer = await User.findById(buyerId);
    if (!buyer) {
      return res.status(404).json({ message: 'Không tìm thấy thông tin tài khoản người mua' });
    }

    const {
      items,
      shippingAddress: rawAddress,
      saveAsDefault = false,
      paymentMethod = 'COD'
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Vui lòng chọn ít nhất 1 sản phẩm để đặt hàng' });
    }

    // 1. Resolve and validate Shipping Address
    let targetAddress = null;
    if (rawAddress && typeof rawAddress === 'object') {
      targetAddress = pickAddressFields(rawAddress);
    } else if (buyer.addresses && buyer.addresses.length > 0) {
      const def = buyer.addresses.find((a) => a.isDefault) || buyer.addresses[0];
      targetAddress = pickAddressFields(def);
    }

    if (!targetAddress || !isCompleteAddress(targetAddress)) {
      return res.status(400).json({
        message: 'Vui lòng cung cấp đầy đủ địa chỉ giao hàng (Họ tên, SĐT, Đường/Số nhà, Tỉnh/Thành, Quận/Huyện, Phường/Xã)'
      });
    }

    if (saveAsDefault) {
      try {
        await addAddressToUser(buyer._id, targetAddress, { makeDefault: true });
      } catch (addrErr) {
        console.warn('Failed to save default address:', addrErr.message);
      }
    }

    // 2. Normalize requested items (including optional variantName / sku)
    const normalizedItems = [];
    const buyerCart = Array.isArray(buyer.cart) ? buyer.cart : [];

    for (const it of items) {
      let pId = null;
      let qty = 1;
      let variantName = '';
      let sku = '';

      if (typeof it === 'string' || mongoose.Types.ObjectId.isValid(it)) {
        pId = it.toString();
        const cartMatch = buyerCart.find((c) => c.product && c.product.toString() === pId);
        qty = cartMatch ? Math.max(1, parseInt(cartMatch.quantity, 10) || 1) : 1;
      } else if (it && (it.productId || it._id || it.product)) {
        pId = (it.productId || it._id || it.product).toString();
        const rawQty = it.quantity !== undefined ? it.quantity : 1;
        const parsed = parseInt(rawQty, 10);
        if (isNaN(parsed) || parsed < 1 || !Number.isInteger(parsed) || String(rawQty).includes('.')) {
          return res.status(400).json({ message: 'Số lượng sản phẩm không hợp lệ (phải là số nguyên dương >= 1)' });
        }
        qty = parsed;
        if (it.variantName) variantName = String(it.variantName).trim();
        if (it.sku) sku = String(it.sku).trim();
      }
      if (pId && mongoose.Types.ObjectId.isValid(pId)) {
        normalizedItems.push({ productId: pId, quantity: qty, variantName, sku });
      }
    }

    if (normalizedItems.length === 0) {
      return res.status(400).json({ message: 'Danh sách sản phẩm không hợp lệ' });
    }

    // 3. Load products from DB and validate availability, ownership, and variants
    const productIds = [...new Set(normalizedItems.map((n) => n.productId))];
    const dbProducts = await Post.find({ _id: { $in: productIds } });
    if (!dbProducts || dbProducts.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm trong hệ thống' });
    }

    const productMap = new Map(dbProducts.map((p) => [p._id.toString(), p]));
    const groupsBySeller = {};

    for (const item of normalizedItems) {
      const p = productMap.get(item.productId);
      if (!p) {
        return res.status(404).json({ message: `Không tìm thấy sản phẩm (${item.productId}) trong hệ thống` });
      }

      // Check product status is active / APPROVED
      if (!CATALOG_VISIBLE.includes(p.status)) {
        return res.status(400).json({
          message: `Sản phẩm "${displayProductName(p)}" hiện không khả dụng để đặt mua (Trạng thái: ${p.status}).`
        });
      }

      // Check seller ownership & block self-purchase
      const sId = productOwnerId(p);
      if (!sId || !mongoose.Types.ObjectId.isValid(sId)) {
        return res.status(400).json({
          message: `Sản phẩm "${displayProductName(p)}" thiếu thông tin người bán hợp lệ.`
        });
      }
      if (sId === buyer._id.toString()) {
        return res.status(400).json({
          message: 'Bạn không thể tự đặt mua sản phẩm của chính Shop mình!'
        });
      }

      // Check variant if requested
      let matchedVariant = null;
      if ((item.variantName || item.sku) && Array.isArray(p.variants) && p.variants.length > 0) {
        matchedVariant = p.variants.find(
          (v) =>
            (item.sku && v.sku && String(v.sku).trim() === item.sku) ||
            (item.variantName && v.name && String(v.name).trim() === item.variantName)
        );
        if (!matchedVariant) {
          return res.status(400).json({
            message: `Phân loại "${item.variantName || item.sku}" của sản phẩm "${displayProductName(p)}" không tồn tại!`
          });
        }
        const varStock = Number(matchedVariant.stock ?? 0);
        if (varStock < item.quantity) {
          return res.status(400).json({
            message: `Phân loại "${matchedVariant.name || matchedVariant.sku}" của sản phẩm "${displayProductName(p)}" chỉ còn ${varStock} sản phẩm, không đủ số lượng ${item.quantity}.`
          });
        }
      }

      const currentStock = p.stockQuantity ?? p.quantity ?? 0;
      if (currentStock < item.quantity) {
        return res.status(400).json({
          message: `Sản phẩm "${displayProductName(p)}" chỉ còn ${currentStock} cái trong kho, không đủ số lượng ${item.quantity}.`
        });
      }

      if (!groupsBySeller[sId]) {
        groupsBySeller[sId] = [];
      }
      groupsBySeller[sId].push({
        product: p,
        quantity: item.quantity,
        variant: matchedVariant,
        variantName: item.variantName,
        sku: item.sku
      });
    }

    const sellerIds = Object.keys(groupsBySeller);
    if (sellerIds.length === 0) {
      return res.status(400).json({ message: 'Không thể khởi tạo nhóm sản phẩm theo người bán' });
    }

    // 4. Calculate dynamic shipping fee per seller package
    let totalItemsSubtotal = 0;
    let totalShippingFee = 0;
    const sellerPackages = [];

    for (const sId of sellerIds) {
      const pkgItems = groupsBySeller[sId];
      let pkgItemsSubtotal = 0;
      const orderItems = [];

      for (const { product: p, quantity: qty, variant } of pkgItems) {
        const unitPrice =
          variant && variant.price !== undefined && variant.price !== null
            ? Number(variant.price) || 0
            : Number(p.price) || 0;

        pkgItemsSubtotal += unitPrice * qty;
        const itemDisplayName = variant?.name
          ? `${displayProductName(p)} (${variant.name})`
          : displayProductName(p);

        orderItems.push({
          productId: p._id,
          name: itemDisplayName,
          price: unitPrice,
          quantity: qty,
          weight: Number(p.weight) || 500,
          image: (p.images && p.images[0]) || ''
        });
      }

      let shippingQuote;
      try {
        shippingQuote = await shippingService.quotePackage({
          sellerId: sId,
          items: pkgItems.map((i) => ({ productId: i.product._id, quantity: i.quantity })),
          toAddress: targetAddress
        });
      } catch (shipErr) {
        console.warn(`Shipping calculation warning for seller ${sId}:`, shipErr.message);
        shippingQuote = {
          fee: 25000,
          provider: 'mock',
          carrier: 'HaiHand Express (Tiêu chuẩn)'
        };
      }

      const pkgShippingFee = Math.max(0, Number(shippingQuote.fee) || 0);
      const pkgTotal = pkgItemsSubtotal + pkgShippingFee;

      totalItemsSubtotal += pkgItemsSubtotal;
      totalShippingFee += pkgShippingFee;

      sellerPackages.push({
        sellerId: sId,
        orderItems,
        itemIds: pkgItems.map((i) => i.product._id),
        itemsSubtotal: pkgItemsSubtotal,
        shippingFee: pkgShippingFee,
        totalPrice: pkgTotal,
        shippingService: {
          provider: shippingQuote.provider || '',
          serviceId: shippingQuote.serviceId,
          serviceTypeId: shippingQuote.serviceTypeId,
          expectedDeliveryTime: shippingQuote.expectedDeliveryTime
        }
      });
    }

    const finalAmount = totalItemsSubtotal + totalShippingFee;

    // Pre-check HaiPay balance if using wallet
    if (paymentMethod === 'HAIPAY') {
      if (!buyer.isWalletActive) {
        return res.status(400).json({ message: 'Bạn chưa kích hoạt Ví HaiPay. Vui lòng kích hoạt trong mục Ví!' });
      }
      if ((buyer.walletBalance || 0) < finalAmount) {
        return res.status(400).json({
          message: `Số dư Ví HaiPay không đủ (Hiện có: ${(buyer.walletBalance || 0).toLocaleString('vi-VN')} đ, Cần thanh toán: ${finalAmount.toLocaleString('vi-VN')} đ). Vui lòng nạp thêm tiền!`
        });
      }
    }

    // 5. Atomic Stock Deduction ($inc with $gte) for all items to prevent race-condition overselling
    for (const item of normalizedItems) {
      const p = productMap.get(item.productId);
      const updatedPost = await Post.findOneAndUpdate(
        {
          _id: item.productId,
          status: { $in: ['active', 'APPROVED'] },
          stockQuantity: { $gte: item.quantity }
        },
        {
          $inc: {
            stockQuantity: -item.quantity,
            quantity: -item.quantity,
            soldCount: item.quantity
          }
        },
        { new: true }
      );

      if (!updatedPost) {
        await rollbackDeductedStock(deductedItems);
        return res.status(400).json({
          message: `Sản phẩm "${displayProductName(p)}" vừa hết hàng hoặc không đủ số lượng tồn kho (${item.quantity}).`
        });
      }

      const variantKey = item.sku || item.variantName || '';
      if (variantKey && Array.isArray(p?.variants) && p.variants.length > 0) {
        const varResult = await Post.updateOne(
          {
            _id: item.productId,
            variants: {
              $elemMatch: {
                $or: [{ sku: variantKey }, { name: variantKey }],
                stock: { $gte: item.quantity }
              }
            }
          },
          { $inc: { 'variants.$.stock': -item.quantity } }
        );
        if (!varResult || varResult.modifiedCount === 0) {
          await rollbackDeductedStock(deductedItems);
          // Hoàn lại phần vừa trừ trên Post tổng của item hiện tại
          await Post.findByIdAndUpdate(item.productId, {
            $inc: { stockQuantity: item.quantity, quantity: item.quantity, soldCount: -item.quantity }
          });
          return res.status(400).json({
            message: `Phân loại "${variantKey}" của sản phẩm "${displayProductName(p)}" vừa hết hàng!`
          });
        }
      }

      deductedItems.push({
        productId: item.productId,
        quantity: item.quantity,
        variantKey
      });

      if ((updatedPost.stockQuantity ?? updatedPost.quantity ?? 0) <= 0) {
        await Post.findByIdAndUpdate(item.productId, { $set: { status: 'out_of_stock' } });
      }
    }

    // 6. Generate parentOrderId sharing across all sub-orders
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const parentOrderId = `HH${dateStr}${randSuffix}`;

    // 7. Create Order documents (commission calculated strictly on itemsSubtotal)
    const savedOrders = [];
    const formattedAddressStr = formatAddress(targetAddress);
    const currentFeePercent = await fetchPlatformFeePercent();

    for (const pkg of sellerPackages) {
      const { sellerReceive } = calculateOrderSplit(
        {
          itemsSubtotal: pkg.itemsSubtotal,
          shippingFee: pkg.shippingFee,
          totalPrice: pkg.totalPrice
        },
        currentFeePercent
      );

      const newOrder = new Order({
        parentOrderId,
        buyer: buyer._id,
        buyerId: buyer._id,
        seller: pkg.sellerId,
        sellerId: pkg.sellerId,
        items: pkg.itemIds,
        orderItems: pkg.orderItems,
        itemsSubtotal: pkg.itemsSubtotal,
        shippingFee: pkg.shippingFee,
        totalPrice: pkg.totalPrice,
        commissionRate: currentFeePercent,
        sellerReceive,
        phone: targetAddress.phone,
        address: formattedAddressStr,
        shippingAddress: targetAddress,
        shippingService: pkg.shippingService,
        paymentMethod,
        paymentStatus: paymentMethod === 'HAIPAY' ? 'escrow' : 'unpaid',
        status: 'Pending'
      });

      await newOrder.save();
      savedOrders.push(newOrder);
    }

    // 8. Create PaymentSession
    const paymentSession = new PaymentSession({
      parentOrderId,
      buyer: buyer._id,
      orderIds: savedOrders.map((o) => o._id),
      purchasedItems: normalizedItems.map((n) => ({
        productId: n.productId,
        quantity: n.quantity
      })),
      itemsSubtotal: totalItemsSubtotal,
      shippingTotal: totalShippingFee,
      amount: finalAmount,
      method: paymentMethod,
      status: 'pending',
      gatewayPayload: { stockDeducted: true }
    });
    await paymentSession.save();

    // 9. Handle Payment Method branches
    let paymentUrl = null;

    if (paymentMethod === 'HAIPAY') {
      const updatedBuyer = await User.findOneAndUpdate(
        {
          _id: buyer._id,
          isWalletActive: true,
          walletBalance: { $gte: finalAmount }
        },
        {
          $inc: { walletBalance: -finalAmount }
        },
        { new: true }
      );

      if (!updatedBuyer) {
        await rollbackDeductedStock(deductedItems);
        await Order.deleteMany({ parentOrderId });
        await PaymentSession.deleteOne({ parentOrderId });
        return res.status(400).json({
          message: 'Số dư Ví HaiPay không đủ hoặc giao dịch bị từ chối do xung đột đồng thời. Vui lòng thử lại!'
        });
      }

      try {
        await Transaction.create({
          user: buyer._id,
          type: 'Thanh toán đơn hàng',
          amount: -finalAmount,
          status: 'Thành công',
          txnRef: parentOrderId,
          description: `Thanh toán đơn hàng #${parentOrderId} bằng Ví HaiPay`
        });
      } catch (txErr) {
        console.warn('Lỗi ghi Transaction ví:', txErr.message);
      }

      await settlePaymentSession(parentOrderId, {
        gatewayPayload: {
          type: 'HAIPAY_WALLET',
          buyerBalanceAfter: updatedBuyer.walletBalance,
          stockDeducted: true
        }
      });
    } else if (paymentMethod === 'COD') {
      const purchasedIdsStr = normalizedItems.map((n) => n.productId);
      buyer.cart = buyerCart.filter(
        (c) => c.product && !purchasedIdsStr.includes(c.product.toString())
      );
      await buyer.save();

      for (const order of savedOrders) {
        try {
          const sId = orderSellerId(order);
          if (sId) {
            await sendNotification({
              userId: sId,
              shopId: sId,
              recipientRole: 'seller',
              type: 'NEW_ORDER',
              orderId: order._id,
              title: '🎉 Đơn hàng mới (COD)!',
              message: `Bạn có đơn hàng COD #${order._id.toString().slice(-6).toUpperCase()} trị giá ${(order.totalPrice || 0).toLocaleString('vi-VN')} đ. Hãy chuẩn bị hàng nhé!`,
              link: '/seller-channel/orders',
              targetUrl: '/seller-channel/orders'
            });
          }
        } catch (e) {}
      }
    } else if (paymentMethod === 'VNPAY') {
      const ipAddr = normalizeIp(req);
      paymentUrl = buildVnpayPaymentUrl({
        orderId: parentOrderId,
        amount: finalAmount,
        ipAddr,
        orderInfo: `Thanh toan don hang HaiHand ${parentOrderId}`
      });
    }

    try {
      await sendNotification({
        userId: buyer._id,
        recipientRole: 'buyer',
        type: 'ORDER',
        title: '📦 Đặt hàng thành công!',
        message: `Đơn hàng ${parentOrderId} gồm ${savedOrders.length} gói hàng đã được khởi tạo thành công.`,
        link: '/profile?tab=orders_buy',
        targetUrl: '/profile?tab=orders_buy'
      });
    } catch (e) {}

    return res.status(200).json({
      success: true,
      message: 'Đặt hàng thành công!',
      parentOrderId,
      amount: finalAmount,
      itemsSubtotal: totalItemsSubtotal,
      shippingTotal: totalShippingFee,
      orders: savedOrders,
      paymentUrl,
      paymentMethod
    });
  } catch (error) {
    if (deductedItems.length > 0) {
      await rollbackDeductedStock(deductedItems);
    }
    console.error('Checkout error:', error);
    return res.status(500).json({
      message: 'Lỗi trong quá trình tạo đơn hàng: ' + error.message,
      error: error.message
    });
  }
}

const ALLOWED_CANCEL_STATUSES = [
  'Pending',
  'Processing',
  'Chờ xác nhận',
  'Chờ thanh toán VNPay',
  'Đã thanh toán (Admin giữ tiền)',
  'Người bán đã chuẩn bị hàng'
];

const SYSTEM_CANCEL_STATUSES = [
  ...ALLOWED_CANCEL_STATUSES,
  'Shipped',
  'Đang giao hàng',
  'Đang giao',
  'Đã hủy (Chờ hoàn tiền)'
];

/**
 * Shared atomic order cancellation helper for Buyer, Seller, Admin, and GHN Webhook.
 * - Atomically transitions order status to 'Cancelled'
 * - Refunds buyer's walletBalance ($inc) and deducts seller's pendingBalance ($inc) if in escrow
 * - Creates 'Hoàn tiền' Transaction record
 * - Accurately sums product quantities across orderItems and atomically restocks stockQuantity, quantity, and decrements soldCount (clamped >= 0)
 */
async function cancelOrderWithRefundAndRestock(orderOrId, { cancelledBy = 'buyer', reason = '' } = {}) {
  const order =
    typeof orderOrId === 'object' && orderOrId !== null && orderOrId._id
      ? orderOrId
      : await Order.findById(orderOrId);

  if (!order) {
    return { success: false, statusCode: 404, message: 'Không tìm thấy đơn hàng' };
  }

  const isPrivilegedCancel = cancelledBy === 'system_ghn' || cancelledBy === 'admin';
  const current = canonicalStatus(order.status);

  if (current === 'Cancelled' && order.paymentStatus !== 'escrow') {
    return {
      success: false,
      alreadyCancelled: true,
      statusCode: 400,
      message: 'Đơn này đã bị hủy từ trước rồi!'
    };
  }

  if (!isPrivilegedCancel && ['Shipped', 'Delivered', 'Completed'].includes(current)) {
    return {
      success: false,
      statusCode: 400,
      message: 'Đơn hàng đang giao hoặc đã hoàn thành, không thể hủy!'
    };
  }

  if (isPrivilegedCancel && ['Delivered', 'Completed'].includes(current)) {
    return {
      success: false,
      statusCode: 400,
      message: 'Đơn hàng đã giao thành công hoặc đã hoàn tất, không thể hủy!'
    };
  }

  const wasEscrow = isEscrow(order) || order.paymentStatus === 'escrow';
  const nextPaymentStatus = wasEscrow ? 'refunded' : (order.paymentStatus || 'unpaid');
  const now = new Date();
  const cancelNote =
    reason ||
    order.cancelReason ||
    (cancelledBy === 'seller'
      ? 'Người bán hủy đơn'
      : cancelledBy === 'system_ghn'
        ? 'Hãng vận chuyển GHN hủy / hoàn trả đơn hàng'
        : cancelledBy === 'admin'
          ? 'Admin hủy & hoàn tiền đơn hàng'
          : 'Khách hàng hủy đơn');
  const existingTrackingCode = order.trackingCode || order.shippingCode || order.shipment?.trackingCode || '';

  const updateDoc = {
    $set: {
      status: 'Cancelled',
      paymentStatus: nextPaymentStatus,
      cancelledAt: now,
      cancelReason: cancelNote
    },
    $push: {
      statusHistory: {
        from: current,
        to: 'Cancelled',
        actor: cancelledBy,
        reason: cancelNote,
        changedAt: now
      }
    }
  };

  if (existingTrackingCode && cancelledBy !== 'system_ghn') {
    console.warn(`⚠️ [OrderCancel] Đơn hàng #${order._id} đã có mã vận đơn (${existingTrackingCode}). Cần hủy vận đơn trên cổng GHN.`);
    updateDoc.$push.trackingLogs = {
      status: 'cancel_requested',
      description: `Đơn hàng đã bị hủy (${cancelNote}). Cần hủy vận đơn ${existingTrackingCode} trên cổng GHN.`,
      updated_at: now
    };
  }

  const allowedStatusesForFilter = isPrivilegedCancel
    ? [...SYSTEM_CANCEL_STATUSES, 'Cancelled', 'Đã hủy']
    : ALLOWED_CANCEL_STATUSES;

  const filterCondition = isPrivilegedCancel
    ? {
        _id: order._id,
        status: { $in: allowedStatusesForFilter },
        paymentStatus: { $nin: ['refunded', 'released'] }
      }
    : {
        _id: order._id,
        status: { $in: ALLOWED_CANCEL_STATUSES }
      };

  const updatedOrder = await Order.findOneAndUpdate(filterCondition, updateDoc, { new: true });

  if (!updatedOrder) {
    return {
      success: false,
      alreadyCancelled: true,
      statusCode: 400,
      message: 'Đơn này đã bị hủy hoặc chuyển trạng thái từ trước rồi!'
    };
  }

  // 1. Refund buyer & deduct seller pendingBalance if order was paid into escrow
  const totalAmount = Number(order.totalPrice || order.totalAmount || 0);
  let refundedAmount = 0;
  let sellerDeducted = 0;
  let refundTransaction = null;

  if (wasEscrow && totalAmount > 0) {
    const feePercent = await fetchPlatformFeePercent();
    const { sellerReceive: sellerShare } = calculateOrderSplit(order, feePercent);
    const buyerId = orderBuyerId(order);
    const sellerId = orderSellerId(order);

    if (buyerId) {
      await User.findByIdAndUpdate(buyerId, {
        $inc: { walletBalance: totalAmount }
      });
      refundedAmount = totalAmount;

      refundTransaction = await Transaction.create({
        user: buyerId,
        type: 'Hoàn tiền',
        amount: totalAmount,
        status: 'Thành công',
        txnRef: `REFUND_${order._id}_${Date.now()}`,
        description: `Hoàn tiền đơn hàng đã hủy #${order._id.toString().slice(-6).toUpperCase()} (${cancelNote})`
      });
    }

    if (sellerId && sellerShare > 0) {
      await User.findByIdAndUpdate(sellerId, {
        $inc: { pendingBalance: -sellerShare }
      });
      sellerDeducted = sellerShare;
    }
  }

  // 2. Sum quantities per product accurately and atomically restore stock & decrement soldCount
  const qtyByProduct = {};
  if (Array.isArray(order.orderItems) && order.orderItems.length > 0) {
    for (const item of order.orderItems) {
      const pid = item.productId?._id || item.productId;
      if (pid) {
        const key = pid.toString();
        qtyByProduct[key] = (qtyByProduct[key] || 0) + (Number(item.quantity) || 1);
      }
    }
  } else if (Array.isArray(order.items) && order.items.length > 0) {
    for (const rawId of order.items) {
      const pid = rawId?._id || rawId;
      if (pid) {
        const key = pid.toString();
        qtyByProduct[key] = (qtyByProduct[key] || 0) + 1;
      }
    }
  }

  for (const [productId, addQty] of Object.entries(qtyByProduct)) {
    if (addQty > 0) {
      const restoredProduct = await Post.findByIdAndUpdate(
        productId,
        {
          $inc: {
            stockQuantity: addQty,
            quantity: addQty,
            soldCount: -addQty
          }
        },
        { new: true }
      );
      if (restoredProduct) {
        const patchSet = {};
        if ((restoredProduct.soldCount || 0) < 0) {
          patchSet.soldCount = 0;
        }
        if (
          (restoredProduct.status === 'out_of_stock' || restoredProduct.status === 'SOLD') &&
          (restoredProduct.stockQuantity ?? restoredProduct.quantity ?? 0) > 0
        ) {
          patchSet.status = 'active';
        }
        if (Object.keys(patchSet).length > 0) {
          await Post.findByIdAndUpdate(productId, { $set: patchSet });
        }
      }
    }
  }

  return {
    success: true,
    statusCode: 200,
    order: updatedOrder,
    refundedAmount,
    sellerDeducted,
    refundTransaction,
    qtyByProduct
  };
}

module.exports = {
  processCheckout,
  settlePaymentSession,
  cancelOrderWithRefundAndRestock
};
