const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String },
  title: { type: String },
  sku: { type: String, default: '' },
  price: {
    type: Number,
    required: true,
    min: [1000, 'Giá sản phẩm phải tối thiểu từ 1.000đ trở lên']
  },
  originalPrice: {
    type: Number,
    default: 0,
    min: [0, 'Giá gốc không được là số âm'],
    validate: {
      validator: (v) => v == null || (Number.isFinite(v) && Number.isInteger(v) && v >= 0),
      message: 'Giá gốc phải là số nguyên không âm'
    }
  },
  stockQuantity: {
    type: Number,
    default: 1,
    min: [0, 'Số lượng tồn kho không được âm'],
    validate: {
      validator: (v) => v == null || (Number.isFinite(v) && Number.isInteger(v) && v >= 0),
      message: 'Số lượng tồn kho phải là số nguyên không âm'
    }
  },
  quantity: {
    type: Number,
    default: 1,
    min: [0, 'Số lượng không được âm'],
    validate: {
      validator: (v) => v == null || (Number.isFinite(v) && Number.isInteger(v) && v >= 0),
      message: 'Số lượng phải là số nguyên không âm'
    }
  },
  soldCount: { type: Number, default: 0 },
  weight: { type: Number, default: 500, min: 1 }, // grams per unit, for shipping fee
  category: { type: String, required: true },
  location: { type: String, default: 'Toàn quốc' },
  description: { type: String, default: '' },
  images: [{ type: String }],
  condition: { type: String, default: 'Mới' },
  variants: [{
    name: { type: String, default: '' },
    price: { type: Number },
    stock: { type: Number, default: 0 },
    sku: { type: String, default: '' },
    options: [String]
  }],
  details: { type: Map, of: String },
  ragText: { type: String, default: '' },
  textEmbedding: { type: [Number], default: undefined, select: false },
  embeddingModel: { type: String, default: '', select: false },
  imageEmbedding: { type: [Number], default: undefined, select: false },
  imageEmbeddingModel: { type: String, default: '', select: false },
  status: {
    type: String,
    enum: ['active', 'inactive', 'out_of_stock', 'pending', 'PENDING', 'APPROVED', 'SOLD', 'DELETED', 'Pending', 'Chờ duyệt'],
    default: 'active'
  },
  moderationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'locked'],
    default: 'pending'
  },
  moderationReason: {
    type: String,
    default: ''
  }
}, { timestamps: true });

const LEGACY_STATUS = {
  PENDING: 'pending',
  Pending: 'pending',
  'Chờ duyệt': 'pending',
  APPROVED: 'active',
  SOLD: 'out_of_stock',
  DELETED: 'inactive'
};

productSchema.pre('validate', function (next) {
  if (!this.title && this.name) this.title = this.name;
  if (!this.name && this.title) this.name = this.title;
  if (!this.author && this.sellerId) this.author = this.sellerId;
  if (!this.sellerId && this.author) this.sellerId = this.author;
  if (this.stockQuantity !== undefined && (this.quantity === undefined || this.quantity === null)) {
    this.quantity = this.stockQuantity;
  }
  if (this.quantity !== undefined && (this.stockQuantity === undefined || this.stockQuantity === null)) {
    this.stockQuantity = this.quantity;
  }
  if (LEGACY_STATUS[this.status]) this.status = LEGACY_STATUS[this.status];
  if (this.status === 'active' && !this.isModified('moderationStatus') && this.moderationStatus === 'pending') {
    this.moderationStatus = 'approved';
  }
  if (Number(this.stockQuantity) === 0 && (this.status === 'active' || this.status === 'pending')) {
    this.status = 'out_of_stock';
  }
  if (typeof next === 'function') next();
});

const Product = mongoose.models.Product || mongoose.model('Product', productSchema, 'posts');
const Post = mongoose.models.Post || mongoose.model('Post', productSchema, 'posts');

module.exports = { Product, Post, productSchema };
