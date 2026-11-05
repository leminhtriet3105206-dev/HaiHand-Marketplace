const mongoose = require('mongoose');

const ORDER_STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Completed', 'Cancelled'];
const PAYMENT_STATUSES = ['unpaid', 'escrow', 'released', 'refunded'];

const orderSchema = new mongoose.Schema({
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  items: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  orderItems: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    price: Number,
    quantity: { type: Number, default: 1 },
    image: String
  }],
  totalPrice: { type: Number, required: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  paymentMethod: { type: String, default: 'COD' },
  paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'unpaid' },
  status: { type: String, default: 'Pending' },
  shippingCode: { type: String, default: '' },
  shippingCarrier: { type: String, default: 'HaiHand Express' },
  deliveredAt: { type: Date },
  completedAt: { type: Date },
  cancelledAt: { type: Date },
  cancelReason: { type: String, default: '' },
  isReviewed: { type: Boolean, default: false }
}, { timestamps: true });

orderSchema.pre('save', function (next) {
  if (!this.buyer && this.buyerId) this.buyer = this.buyerId;
  if (!this.buyerId && this.buyer) this.buyerId = this.buyer;
  if (!this.seller && this.sellerId) this.seller = this.sellerId;
  if (!this.sellerId && this.seller) this.sellerId = this.seller;
  if (typeof next === 'function') next();
});

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

module.exports = Order;
module.exports.ORDER_STATUSES = ORDER_STATUSES;
module.exports.PAYMENT_STATUSES = PAYMENT_STATUSES;
