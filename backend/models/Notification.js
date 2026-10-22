const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['ORDER', 'MESSAGE', 'SYSTEM', 'PAYMENT', 'PRODUCT', 'SELLER'],
    default: 'SYSTEM'
  },
  link: {
    type: String,
    default: '/'
  },
  targetUrl: {
    type: String,
    default: '/'
  },
  isRead: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true, strict: false });

notificationSchema.pre('save', function (next) {
  if (this.link && (!this.targetUrl || this.targetUrl === '/')) {
    this.targetUrl = this.link;
  }
  if (this.targetUrl && (!this.link || this.link === '/')) {
    this.link = this.targetUrl;
  }
  if (typeof next === 'function') next();
});

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
