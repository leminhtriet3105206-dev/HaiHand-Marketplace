/**
 * Global Error Handler Middleware (0.3 / M9 / H13):
 * - Trả thông báo lỗi chung an toàn cho client (`{ message }`), KHÔNG bao giờ trả `error.stack`,
 *   chi tiết lỗi hệ thống / MongoDB / GHN hay `trackingLogs` trong lỗi 500.
 * - Xử lý lỗi Multer (`LIMIT_FILE_SIZE`, `LIMIT_FILE_COUNT`, `INVALID_FILE_TYPE`...) trả về 400 rõ ràng.
 */
function errorHandler(err, req, res, next) {
  if (!err) return next();

  // Lỗi từ Multer (vượt dung lượng 5MB, quá 8 file, hoặc sai định dạng ảnh)
  if (err.name === 'MulterError' || err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_FILE_COUNT') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'Tệp tải lên vượt quá dung lượng tối đa cho phép (5MB).' });
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ message: 'Số lượng tệp tải lên vượt quá giới hạn cho phép (tối đa 8 ảnh).' });
    }
    return res.status(400).json({ message: 'Lỗi tải tệp lên. Vui lòng kiểm tra định dạng và kích thước ảnh.' });
  }

  if (err.code === 'INVALID_FILE_TYPE' || err.code === 'INVALID_FILE_EXTENSION') {
    return res.status(400).json({ message: err.message });
  }

  // Lỗi CORS bị từ chối
  if (err.code === 'CORS_NOT_ALLOWED') {
    return res.status(403).json({ message: 'Origin không được phép truy cập (CORS Policy)' });
  }

  // Lỗi ValidationError chủ động từ middleware/validate.js
  if (err.name === 'ValidationError' && typeof err.statusCode === 'number') {
    return res.status(err.statusCode).json({ message: err.message });
  }

  // Lỗi JSON cú pháp sai từ express.json()
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ message: 'Dữ liệu JSON gửi lên không hợp lệ.' });
  }

  const statusCode = typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600
    ? err.statusCode
    : 500;

  // Log chi tiết ở phía server để đội kỹ thuật theo dõi
  console.error(`[ServerError] ${req.method} ${req.originalUrl || req.url}:`, err.message);

  if (statusCode >= 500) {
    return res.status(500).json({
      message: 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.'
    });
  }

  return res.status(statusCode).json({
    message: err.publicMessage || err.message || 'Yêu cầu không hợp lệ.'
  });
}

module.exports = errorHandler;
module.exports.errorHandler = errorHandler;
