const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: { type: String, enum: ['customer', 'admin'], required: true },
  content: { type: String, required: true, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const schema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  status: { type: String, enum: ['pending', 'active'], default: 'pending' },
  unreadCount: { type: Number, default: 0 },
  messages: [messageSchema]
}, { timestamps: true, collection: 'support_conversations' });

module.exports = mongoose.models.SupportConversation || mongoose.model('SupportConversation', schema);
