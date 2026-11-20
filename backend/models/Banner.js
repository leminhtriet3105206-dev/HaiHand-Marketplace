const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  title: String,
  imageUrl: String,
  targetUrl: String,
  openInNewTab: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.models.Banner || mongoose.model('Banner', bannerSchema);
