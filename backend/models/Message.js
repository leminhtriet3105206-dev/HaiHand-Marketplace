const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    content: { type: String, default: '', maxlength: 2000, trim: true },
    images: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => !Array.isArray(arr) || arr.length <= 4,
        message: 'Tối đa 4 hình ảnh cho mỗi tin nhắn'
      }
    },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', default: null },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null }
  },
  { timestamps: true }
);

messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });
messageSchema.index({ receiver: 1, isRead: 1 });
messageSchema.index({ sellerId: 1, createdAt: -1 });

const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

module.exports = Message;
