const fs = require('fs');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif'
]);

const ALLOWED_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function createUploadMiddleware({
  maxFileSize = 5 * 1024 * 1024,
  maxFiles = 4,
  folder = 'HaiHand_Images'
} = {}) {
  const hasCloudinary = Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET &&
    process.env.NODE_ENV !== 'test'
  );

  let storage;
  if (hasCloudinary) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
    storage = new CloudinaryStorage({
      cloudinary,
      params: {
        folder,
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'gif']
      }
    });
  } else {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    storage = multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadDir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
        const safeExt = ALLOWED_IMAGE_EXTS.has(ext) ? ext : '.jpg';
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `msg-${unique}${safeExt}`);
      }
    });
  }

  return multer({
    storage,
    limits: {
      fileSize: maxFileSize,
      files: maxFiles
    },
    fileFilter: (req, file, cb) => {
      const mime = String(file.mimetype || '').toLowerCase();
      const ext = path.extname(file.originalname || '').toLowerCase();
      if (!ALLOWED_IMAGE_MIMES.has(mime) || (ext && !ALLOWED_IMAGE_EXTS.has(ext))) {
        const err = new Error('Chỉ chấp nhận tệp hình ảnh (JPG, PNG, WebP, GIF) tối đa 5MB.');
        err.code = 'INVALID_FILE_TYPE';
        err.statusCode = 400;
        return cb(err, false);
      }
      return cb(null, true);
    }
  });
}

module.exports = {
  createUploadMiddleware,
  ALLOWED_IMAGE_MIMES,
  ALLOWED_IMAGE_EXTS
};
