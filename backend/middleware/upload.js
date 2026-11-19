const fs = require('fs');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_FILES_COUNT = 8;

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif'
]);

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function imageFileFilter(req, file, cb) {
  const mime = (file?.mimetype || '').toLowerCase();
  const ext = path.extname(file?.originalname || '').toLowerCase();

  if (!ALLOWED_MIME_TYPES.has(mime)) {
    const err = new Error('Định dạng tệp tải lên không hợp lệ. Chỉ chấp nhận ảnh JPEG, PNG, WEBP hoặc GIF.');
    err.statusCode = 400;
    err.code = 'INVALID_FILE_TYPE';
    return cb(err, false);
  }

  if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
    const err = new Error('Phần mở rộng tệp không hợp lệ. Chỉ chấp nhận .jpg, .jpeg, .png, .webp, .gif.');
    err.statusCode = 400;
    err.code = 'INVALID_FILE_EXTENSION';
    return cb(err, false);
  }

  return cb(null, true);
}

/**
 * Tạo Multer instance có giới hạn 5MB/file, tối đa 8 files và kiểm tra MIME strict
 */
function createUploadMiddleware({ storage } = {}) {
  let effectiveStorage = storage;

  if (!effectiveStorage) {
    if (process.env.NODE_ENV === 'test') {
      effectiveStorage = multer.memoryStorage();
    } else if (
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    ) {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
      });
      effectiveStorage = new CloudinaryStorage({
        cloudinary,
        params: {
          folder: 'HaiHand_Images',
          allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'gif']
        }
      });
    } else {
      const uploadDir = path.join(__dirname, '../uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      effectiveStorage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => {
          const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
          cb(null, `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
        }
      });
    }
  }

  return multer({
    storage: effectiveStorage,
    limits: {
      fileSize: MAX_FILE_SIZE_BYTES,
      files: MAX_FILES_COUNT
    },
    fileFilter: imageFileFilter
  });
}

const upload = createUploadMiddleware();

module.exports = upload;
module.exports.upload = upload;
module.exports.createUploadMiddleware = createUploadMiddleware;
module.exports.imageFileFilter = imageFileFilter;
module.exports.MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_BYTES;
module.exports.MAX_FILES_COUNT = MAX_FILES_COUNT;
module.exports.ALLOWED_MIME_TYPES = ALLOWED_MIME_TYPES;
