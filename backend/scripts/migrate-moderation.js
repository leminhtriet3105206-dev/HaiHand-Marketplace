/**
 * Migration Script (H3): Đồng bộ trường `moderationStatus` (`pending | approved | rejected | locked`)
 * cho dữ liệu sản phẩm/bài đăng cũ trong collection `posts`.
 *
 * Cách chạy thủ công (CON NGƯỜI CHẠY):
 *   cd backend && node scripts/migrate-moderation.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { Post } = require('../models/Product');

async function runMigration() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ Thiếu biến môi trường MONGO_URI');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('✅ Đã kết nối MongoDB. Bắt đầu đồng bộ moderationStatus...');

  const resApproved = await Post.updateMany(
    {
      status: { $in: ['active', 'APPROVED', 'out_of_stock', 'SOLD', 'inactive'] },
      $or: [{ moderationStatus: { $exists: false } }, { moderationStatus: null }]
    },
    { $set: { moderationStatus: 'approved' } }
  );

  const resPending = await Post.updateMany(
    {
      status: { $in: ['pending', 'PENDING', 'Pending', 'Chờ duyệt'] },
      $or: [{ moderationStatus: { $exists: false } }, { moderationStatus: null }]
    },
    { $set: { moderationStatus: 'pending' } }
  );

  const resLocked = await Post.updateMany(
    {
      status: 'DELETED',
      $or: [{ moderationStatus: { $exists: false } }, { moderationStatus: null }]
    },
    { $set: { moderationStatus: 'locked' } }
  );

  console.log(`🎉 Hoàn tất migration:
  - Approved: ${resApproved.modifiedCount}
  - Pending : ${resPending.modifiedCount}
  - Locked  : ${resLocked.modifiedCount}`);

  await mongoose.disconnect();
}

if (require.main === module) {
  runMigration().catch((err) => {
    console.error('❌ Lỗi migration:', err);
    process.exit(1);
  });
}

module.exports = { runMigration };
