const mongoose = require('mongoose');

const userSchema = mongoose.Schema({
    name: { type: String, required: true }, // Họ tên
    email: { type: String, required: true, unique: true }, // Email (không trùng)
    password: { type: String, required: true }, // Mật khẩu (đã mã hóa)
    phone: { type: String, required: true }, // Số điện thoại (Bắt buộc như Chợ Tốt)
    address: { type: String, required: true }, // Địa chỉ giao dịch
    role: { type: String, default: 'user' }, // Vai trò: user hoặc admin
}, {
    timestamps: true
});

const User = mongoose.model('User', userSchema);
module.exports = User;