const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, sparse: true },
  password: { type: String, required: true },
  name: String,
  email: { type: String, required: true, unique: true },
  phone: String,
  role: { type: String, default: "Khách hàng" }, 
  status: { type: String, enum: ['active', 'locked'], default: 'active' },
  lockReason: { type: String, default: '' },
  lockedUntil: { type: Date, default: null },
  isBanned: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  tokenVersion: { type: Number, default: 0 },
  isSeller: { type: Boolean, default: false },
  sellerStatus: { 
    type: String, 
    enum: ['none', 'pending', 'approved', 'rejected'], 
    default: 'none' 
  },
  sellerAppliedAt: { type: Date },
  sellerApprovedAt: { type: Date },
  sellerRejectionReason: { type: String, default: '' },
  walletBalance: { type: Number, default: 0 },
  pendingBalance: { type: Number, default: 0 },
  isWalletActive: { type: Boolean, default: false },
  walletPhone: { type: String, default: '' },
  bankInfo: {
    name: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    accountName: { type: String, default: '' }
  },
  shopInfo: {
    shopName: { type: String, default: '' },
    description: { type: String, default: '' },
    address: { type: String, default: '' },
    avatar: { type: String, default: '' },
    banner: { type: String, default: '' },
    phone: { type: String, default: '' },
    taxCode: { type: String, default: '' }
  },
  date: { type: Date, default: Date.now },
}, { timestamps: true, strict: false });

module.exports = mongoose.models.User || mongoose.model("User", userSchema);