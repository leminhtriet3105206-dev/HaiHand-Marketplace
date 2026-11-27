const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: String,
  unreadCount: Number,
  messages: [{ sender: String, content: String, createdAt: Date }]
}, { timestamps: true, collection: 'support_conversations' });

module.exports = mongoose.models.SupportConversation || mongoose.model('SupportConversation', schema);
