/**
 * Migration script (A0): Chuẩn hóa field createdAt / updatedAt cho các document Message cũ
 * vốn chỉ có field `timestamp`.
 *
 * Cách chạy thủ công (KHÔNG tự chạy khi khởi động server):
 *   node backend/scripts/migrate-messages.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Message = require('../models/Message');

async function migrateMessages() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('Thiếu biến môi trường MONGO_URI hoặc MONGODB_URI');
  }

  await mongoose.connect(uri);
  console.log('📡 Đã kết nối MongoDB để migrate Message...');

  const filter = {
    $or: [{ createdAt: { $exists: false } }, { createdAt: null }],
    timestamp: { $exists: true, $ne: null }
  };

  const pendingCount = await Message.collection.countDocuments(filter);
  console.log(`🔍 Tìm thấy ${pendingCount} tin nhắn cũ cần backfill createdAt/updatedAt.`);

  if (pendingCount > 0) {
    const result = await Message.collection.updateMany(filter, [
      {
        $set: {
          createdAt: '$timestamp',
          updatedAt: { $ifNull: ['$updatedAt', '$timestamp'] }
        }
      }
    ]);
    console.log(`✅ Đã cập nhật ${result.modifiedCount} tin nhắn.`);
  }

  await mongoose.disconnect();
  console.log('🔌 Đã ngắt kết nối MongoDB.');
}

if (require.main === module) {
  migrateMessages()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Lỗi migrate messages:', err);
      process.exit(1);
    });
}

module.exports = { migrateMessages };
