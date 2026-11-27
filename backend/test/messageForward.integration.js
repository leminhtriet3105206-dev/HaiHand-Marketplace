const assert = require('node:assert/strict');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20_000 });
  const messages = mongoose.connection.db.collection('messages');
  const notifications = mongoose.connection.db.collection('notifications');
  const originalId = new mongoose.Types.ObjectId();
  const senderId = new mongoose.Types.ObjectId();
  const participantId = new mongoose.Types.ObjectId();
  const targetId = new mongoose.Types.ObjectId();
  let forwardedId;

  try {
    await messages.insertOne({
      _id: originalId,
      sender: senderId,
      receiver: participantId,
      content: 'Tin nhắn kiểm tra chuyển tiếp',
      images: ['https://example.com/test-forward.jpg'],
      post: null,
      isRead: false,
      timestamp: new Date()
    });
    const response = await fetch(`http://localhost:4000/api/messages/${originalId}/forward`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ senderId: String(senderId), receiverId: String(targetId) })
    });
    const body = await response.json();
    assert.equal(response.status, 201, JSON.stringify(body));
    assert.equal(body.content, 'Tin nhắn kiểm tra chuyển tiếp');
    assert.deepEqual(body.images, ['https://example.com/test-forward.jpg']);
    assert.equal(String(body.forwardedFrom), String(originalId));
    forwardedId = new mongoose.Types.ObjectId(body._id);
    assert.equal(await messages.countDocuments({ _id: forwardedId }), 1);
    console.log('PASS: API chuyển tiếp giữ nội dung, ảnh và tham chiếu tin gốc.');
  } finally {
    await messages.deleteMany({ _id: { $in: [originalId, ...(forwardedId ? [forwardedId] : [])] } });
    await notifications.deleteMany({ userId: targetId, type: 'MESSAGE' });
    await mongoose.disconnect();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
