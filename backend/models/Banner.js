const mongoose = require("mongoose");

const bannerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      default: "",
    },
    imageUrl: {
      type: String,
      required: true,
      trim: true,
    },
    targetUrl: {
      type: String,
      trim: true,
      default: "",
    },
    openInNewTab: {
      type: Boolean,
      default: false,
    },
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: "banners",
  }
);

bannerSchema.index({ isActive: 1, order: 1, createdAt: -1 });

module.exports =
  mongoose.models.Banner || mongoose.model("Banner", bannerSchema, "banners");

