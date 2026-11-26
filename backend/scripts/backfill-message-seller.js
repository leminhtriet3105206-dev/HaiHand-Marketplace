/**
 * Migration script (B1): Backfill `sellerId` cho các tin nhắn cũ chưa có `sellerId`.
 * KHÔNG tự động chạy khi khởi động server. Chạy thủ công:
 *   node backend/scripts/backfill-message-seller.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Message = require('../models/Message');
const User = require('../models/User');
const { Post } = require('../models/Product');
const Order = require('../models/Order');

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ Thiếu MONGO_URI trong biến môi trường');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('✅ Đã kết nối MongoDB');

  const cursor = Message.find({
    $or: [{ sellerId: { $exists: false } }, { sellerId: null }]
  })
    .select('_id sender receiver post order')
    .lean()
    .cursor();

  let scanned = 0;
  let updated = 0;

  const userSellerCache = new Map();
  async function isApprovedSeller(userId) {
    if (!userId) return false;
    const key = String(userId);
    if (userSellerCache.has(key)) return userSellerCache.get(key);
    const u = await User.findById(key).select('isSeller sellerStatus').lean();
    const ok = Boolean(u && u.isSeller === true && u.sellerStatus === 'approved');
    userSellerCache.set(key, ok);
    return ok;
  }

  for await (const msg of cursor) {
    scanned += 1;
    let resolvedSellerId = null;

    if (msg.post) {
      const p = await Post.findById(msg.post).select('sellerId author').lean();
      if (p) resolvedSellerId = p.sellerId || p.author || null;
    }

    if (!resolvedSellerId && msg.order) {
      const o = await Order.findById(msg.order).select('sellerId seller').lean();
      if (o) resolvedSellerId = o.sellerId || o.seller || null;
    }

    if (!resolvedSellerId) {
      if (await isApprovedSeller(msg.receiver)) {
        resolvedSellerId = msg.receiver;
      } else if (await isApprovedSeller(msg.sender)) {
        resolvedSellerId = msg.sender;
      }
    }

    if (resolvedSellerId) {
      await Message.updateOne({ _id: msg._id }, { $set: { sellerId: resolvedSellerId } });
      updated += 1;
    }
  }

  console.log(`🎉 Hoàn tất backfill sellerId: đã quét ${scanned} tin nhắn, cập nhật ${updated} bản ghi.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌ Lỗi backfill:', err);
  process.exit(1);
});
