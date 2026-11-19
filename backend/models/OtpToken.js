const mongoose = require('mongoose');

const otpTokenSchema = new mongoose.Schema({
  identifier: {
    type: String,
    required: true,
    index: true,
    trim: true,
    lowercase: true
  },
  otpHash: {
    type: String,
    required: true
  },
  purpose: {
    type: String,
    enum: ['REGISTER', 'LOGIN', 'TRANSACTION', 'RESET_PASSWORD'],
    default: 'LOGIN'
  },
  attempts: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600 // Automatically removed by MongoDB after 10 minutes (600 seconds - C8)
  }
});

module.exports = mongoose.models.OtpToken || mongoose.model('OtpToken', otpTokenSchema);
