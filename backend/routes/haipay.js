const fs = require('fs');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { createAndSaveOtp, verifyOtp } = require('../utils/otpService');
const { getJwtSecret, sanitizeUser, signUserToken } = require('../utils/b2c');
const { hashPassword, verifyPassword } = require('../utils/password');
const { otpLimiter, loginLimiter } = require('../middleware/security');

const router = express.Router();
const ALLOWED_OTP_PURPOSES = new Set(['LOGIN', 'REGISTER', 'TRANSACTION']);

/**
 * Middleware to authenticate HaiPay wallet session
 */
const requireWalletAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Vui lòng đăng nhập vào Ví HaiPay' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, getJwtSecret());
    const user = await User.findById(decoded.id || decoded._id);

    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    if (user.status === 'locked' || user.isBanned === true) {
      return res.status(403).json({ message: 'Tài khoản của bạn đã bị khóa' });
    }

    req.walletUser = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Phiên làm việc của Ví đã hết hạn hoặc không hợp lệ' });
  }
};

/**
 * Helper: Verify Firebase ID Token via firebase-admin (C8)
 */
async function verifyFirebaseIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') return null;
  try {
    // eslint-disable-next-line global-require, import/no-unresolved
    const admin = require('firebase-admin');
    if (admin) {
      if (!admin.apps || admin.apps.length === 0) {
        if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
          const cert = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
          admin.initializeApp({ credential: admin.credential.cert(cert) });
        } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH && fs.existsSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)) {
          const cert = JSON.parse(fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8'));
          admin.initializeApp({ credential: admin.credential.cert(cert) });
        } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
          admin.initializeApp({
            credential: admin.credential.cert({
              projectId: process.env.FIREBASE_PROJECT_ID,
              clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
              privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
            })
          });
        }
      }
      if (admin.apps && admin.apps.length > 0) {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        return decodedToken;
      }
    }
  } catch (e) {
    // firebase-admin not installed or token verification failed
  }
  return null;
}

/**
 * POST /api/haipay/send-otp
 * Generates and dispatches OTP (C8 & H14: whitelist purpose, rate limit, anti-enumeration)
 */
router.post('/send-otp', otpLimiter, async (req, res) => {
  try {
    const { identifier, purpose = 'LOGIN' } = req.body || {};

    if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
      return res.status(400).json({ message: 'Vui lòng cung cấp Email hoặc Số điện thoại' });
    }

    const cleanPurpose = String(purpose || 'LOGIN').trim().toUpperCase();
    if (!ALLOWED_OTP_PURPOSES.has(cleanPurpose)) {
      return res.status(400).json({ message: 'Mục đích yêu cầu OTP (purpose) không hợp lệ!' });
    }

    const cleanIdentifier = identifier.trim().toLowerCase();

    if (cleanPurpose === 'LOGIN') {
      const existingUser = await User.findOne({
        $or: [{ email: cleanIdentifier }, { phone: cleanIdentifier }]
      });

      if (!existingUser) {
        return res.status(200).json({
          success: true,
          message: `Nếu tài khoản tồn tại, mã OTP đã được gửi đến ${cleanIdentifier}.`,
          expiresIn: 600
        });
      }
    }

    await createAndSaveOtp(cleanIdentifier, cleanPurpose);

    return res.status(200).json({
      success: true,
      message: `Mã OTP đã được gửi đến ${cleanIdentifier}. Vui lòng kiểm tra hộp thư.`,
      expiresIn: 600
    });
  } catch (error) {
    if (error.statusCode === 429) {
      return res.status(429).json({ message: error.message });
    }
    console.error('Send OTP Error:', error);
    return res.status(500).json({ message: 'Lỗi khi gửi mã OTP' });
  }
});

/**
 * POST /api/haipay/register
 * Verifies OTP and activates the standalone wallet
 */
router.post('/register', async (req, res) => {
  try {
    const { email, phone, fullName, password, cccd, otp, pin } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Vui lòng điền đầy đủ Email và Mã OTP' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // 1. Verify OTP
    const otpResult = await verifyOtp(cleanEmail, otp, 'REGISTER');
    if (!otpResult.valid) {
      return res.status(400).json({ message: otpResult.message });
    }

    // 2. Check if user already exists
    let user = await User.findOne({ email: cleanEmail });

    if (user) {
      if (!password || typeof password !== 'string') {
        return res.status(400).json({ message: 'Tài khoản đã tồn tại. Vui lòng nhập mật khẩu tài khoản để kích hoạt ví!' });
      }
      const isPasswordValid = await verifyPassword(user, password);
      if (!isPasswordValid) {
        return res.status(400).json({ message: 'Mật khẩu tài khoản không chính xác!' });
      }

      user.isWalletActive = true;
      if (phone && typeof phone === 'string') user.walletPhone = phone.trim();
      if (fullName && typeof fullName === 'string' && (!user.name || user.name === 'User')) user.name = fullName.trim();
      if (cccd && typeof cccd === 'string') user.cccd = cccd.trim();
      if (pin && typeof pin === 'string') user.walletPin = await hashPassword(pin.trim(), 10);
      user.walletRegisteredAt = new Date();
      await user.save();
    } else {
      if (!password || typeof password !== 'string') {
        return res.status(400).json({ message: 'Vui lòng đặt mật khẩu cho tài khoản mới' });
      }

      const hashedPassword = await hashPassword(password, 10);
      let hashedPin = '';
      if (pin && typeof pin === 'string') hashedPin = await hashPassword(pin.trim(), 10);

      user = new User({
        name: fullName && typeof fullName === 'string' ? fullName.trim() : cleanEmail.split('@')[0],
        email: cleanEmail,
        password: hashedPassword,
        phone: phone && typeof phone === 'string' ? phone.trim() : '',
        walletPhone: phone && typeof phone === 'string' ? phone.trim() : '',
        cccd: cccd && typeof cccd === 'string' ? cccd.trim() : '',
        walletPin: hashedPin,
        isWalletActive: true,
        walletRegisteredAt: new Date(),
        walletBalance: 0,
        pendingBalance: 0,
        role: 'Khách hàng',
        isSeller: false,
        sellerStatus: 'none'
      });
      await user.save();
    }

    const token = signUserToken(user, {
      extra: {
        email: user.email,
        isWalletActive: true,
        sessionType: 'HAIPAY_WALLET'
      }
    });

    return res.status(200).json({
      success: true,
      message: '🎉 Kích hoạt Ví HaiPay thành công!',
      token,
      user: sanitizeUser(user)
    });
  } catch (error) {
    console.error('HaiPay Register Error:', error);
    return res.status(500).json({ message: 'Lỗi kích hoạt ví: ' + error.message });
  }
});

/**
 * POST /api/haipay/login
 * Authenticates user credentials + verifies OTP to return specialized wallet session
 */
router.post('/login', async (req, res) => {
  try {
    const { identifier, password, otp } = req.body;

    if (!identifier || !identifier.trim()) {
      return res.status(400).json({ message: 'Vui lòng nhập Email hoặc Số điện thoại' });
    }

    const cleanIdentifier = identifier.trim().toLowerCase();
    const user = await User.findOne({
      $or: [{ email: cleanIdentifier }, { phone: cleanIdentifier }, { walletPhone: cleanIdentifier }]
    });

    if (!user) {
      return res.status(404).json({ message: 'Tài khoản không tồn tại trong hệ thống' });
    }

    if (user.status === 'locked' || user.isBanned === true) {
      return res.status(403).json({ message: 'Tài khoản của bạn đã bị khóa' });
    }

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ message: 'Vui lòng nhập mật khẩu tài khoản' });
    }

    const isPasswordValid = await verifyPassword(user, password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Mật khẩu không chính xác' });
    }

    if (!otp) {
      try {
        await createAndSaveOtp(user.email, 'LOGIN');
      } catch (otpErr) {
        if (otpErr.statusCode === 429) {
          return res.status(429).json({ message: otpErr.message });
        }
        throw otpErr;
      }
      return res.status(200).json({
        requireOtp: true,
        email: user.email,
        message: `Mã OTP đã được gửi đến email ${user.email}. Vui lòng nhập mã để hoàn tất đăng nhập!`
      });
    }

    const otpResult = await verifyOtp(user.email, otp, 'LOGIN');
    if (!otpResult.valid) {
      return res.status(400).json({ message: otpResult.message });
    }

    if (!user.isWalletActive) {
      user.isWalletActive = true;
      user.walletRegisteredAt = user.walletRegisteredAt || new Date();
      await user.save();
    }

    const token = signUserToken(user, {
      extra: {
        email: user.email,
        isWalletActive: true,
        sessionType: 'HAIPAY_WALLET'
      }
    });

    return res.status(200).json({
      success: true,
      message: '🎉 Đăng nhập Ví HaiPay thành công!',
      token,
      user: sanitizeUser(user)
    });
  } catch (error) {
    console.error('HaiPay Login Error:', error);
    return res.status(500).json({ message: 'Lỗi đăng nhập Ví HaiPay: ' + error.message });
  }
});

/**
 * POST /api/haipay/verify-firebase
 * Security Hardened (C8 - Anti-Account Takeover):
 * - Sử dụng `firebase-admin` -> `verifyIdToken(idToken)`, lấy số điện thoại & uid trực tiếp từ token đã verify.
 * - TUYỆT ĐỐI không tin `phoneNumber` hay `firebaseUid` trần trong `req.body` nếu không có bằng chứng xác thực từ server.
 * - Nếu môi trường chưa có Firebase Admin token thì chỉ cho phép xác thực tài khoản thông qua `verifyOtp` hoặc `verifyPassword`.
 */
router.post('/verify-firebase', loginLimiter, async (req, res) => {
  try {
    const { phoneNumber, fullName, email, idToken, otp, password, otpPurpose = 'LOGIN' } = req.body || {};

    if (!idToken && !otp && !password) {
      return res.status(401).json({
        message: 'Từ chối truy cập: Bắt buộc cung cấp Firebase idToken hợp lệ hoặc xác thực kèm OTP / Mật khẩu tài khoản!'
      });
    }

    // 1. Verify idToken via Firebase Admin SDK
    const verifiedFirebaseClaims = await verifyFirebaseIdToken(idToken);
    let verifiedByFirebaseAdmin = false;
    let verifiedUid = '';
    let resolvedRawPhone = '';

    if (verifiedFirebaseClaims) {
      const claimPhone = verifiedFirebaseClaims.phone_number ? String(verifiedFirebaseClaims.phone_number).trim() : '';
      if (!claimPhone) {
        return res.status(401).json({ message: 'Firebase idToken không chứa thông tin số điện thoại đã xác thực!' });
      }
      resolvedRawPhone = claimPhone;
      verifiedUid = verifiedFirebaseClaims.uid ? String(verifiedFirebaseClaims.uid) : '';
      verifiedByFirebaseAdmin = true;
    } else {
      if (!phoneNumber || typeof phoneNumber !== 'string' || !phoneNumber.trim()) {
        return res.status(401).json({ message: 'Không thể xác thực Firebase idToken!' });
      }
      resolvedRawPhone = phoneNumber.trim();
    }

    const localPhone = resolvedRawPhone.startsWith('+84')
      ? '0' + resolvedRawPhone.slice(3)
      : (resolvedRawPhone.startsWith('84') ? '0' + resolvedRawPhone.slice(2) : resolvedRawPhone);
    const intlPhone = resolvedRawPhone.startsWith('+')
      ? resolvedRawPhone
      : (resolvedRawPhone.startsWith('0') ? '+84' + resolvedRawPhone.slice(1) : '+84' + resolvedRawPhone);

    // 2. Find existing user by verified phone
    let user = await User.findOne({
      $or: [
        { phone: localPhone },
        { phone: intlPhone },
        { walletPhone: localPhone },
        { walletPhone: intlPhone }
      ]
    });

    // 3. Nếu không verify được qua Firebase Admin SDK -> BẮT BUỘC phải verify qua OTP server hoặc mật khẩu tài khoản
    if (!verifiedByFirebaseAdmin) {
      let secondaryVerified = false;
      const safeOtpPurpose = ALLOWED_OTP_PURPOSES.has(String(otpPurpose).toUpperCase())
        ? String(otpPurpose).toUpperCase()
        : 'LOGIN';

      if (otp && typeof otp === 'string') {
        const otpIdentifier = (typeof email === 'string' && email.trim().toLowerCase()) || user?.email || localPhone;
        const otpCheck = await verifyOtp(otpIdentifier, otp.trim(), safeOtpPurpose);
        if (!otpCheck.valid) {
          return res.status(401).json({ message: otpCheck.message || 'Mã OTP xác thực không hợp lệ hoặc đã hết hạn!' });
        }
        secondaryVerified = true;
      } else if (password && typeof password === 'string' && user) {
        const isPassMatch = await verifyPassword(user, password);
        if (!isPassMatch) {
          return res.status(401).json({ message: 'Mật khẩu xác thực không chính xác!' });
        }
        secondaryVerified = true;
      }

      if (!secondaryVerified) {
        return res.status(401).json({
          message: 'Không thể xác thực Firebase idToken. Vui lòng xác thực bằng mã OTP hoặc mật khẩu tài khoản!'
        });
      }
    }

    if (user) {
      if (user.status === 'locked' || user.isBanned === true || user.isDeleted === true) {
        return res.status(403).json({ message: 'Tài khoản của bạn đã bị khóa' });
      }

      user.isWalletActive = true;
      if (!user.walletPhone) user.walletPhone = localPhone;
      // Chỉ lưu firebaseUid nếu lấy từ token đã được Firebase Admin SDK verify (TUYỆT ĐỐI không lấy firebaseUid từ body)
      if (verifiedUid && !user.firebaseUid) user.firebaseUid = verifiedUid;
      if (!user.walletRegisteredAt) user.walletRegisteredAt = new Date();
      if (typeof fullName === 'string' && fullName.trim() && (!user.name || user.name.startsWith('Người dùng'))) {
        user.name = fullName.trim();
      }
      user.lastActive = new Date();
      await user.save();
    } else {
      const cleanEmail = typeof email === 'string' && email.trim()
        ? email.trim().toLowerCase()
        : `haipay_${localPhone.replace(/\D/g, '') || Date.now()}@haipay.vn`;

      const existingEmailUser = await User.findOne({ email: cleanEmail });
      const finalEmail = existingEmailUser
        ? `haipay_${Date.now()}_${Math.floor(Math.random() * 1000)}@haipay.vn`
        : cleanEmail;

      const rawPass = typeof password === 'string' && password.trim()
        ? password.trim()
        : `fb_auth_${verifiedUid || Date.now()}`;
      const hashedPassword = await hashPassword(rawPass, 10);

      user = new User({
        name: typeof fullName === 'string' && fullName.trim() ? fullName.trim() : `Người dùng HaiPay ${localPhone.slice(-4) || 'Mới'}`,
        email: finalEmail,
        phone: localPhone,
        walletPhone: localPhone,
        firebaseUid: verifiedUid || '',
        password: hashedPassword,
        isWalletActive: true,
        walletRegisteredAt: new Date(),
        walletBalance: 0,
        pendingBalance: 0,
        role: 'Khách hàng',
        isSeller: false,
        sellerStatus: 'none',
        lastActive: new Date()
      });

      await user.save();
    }

    const token = signUserToken(user, {
      extra: {
        email: user.email,
        phone: user.phone || user.walletPhone,
        isWalletActive: true,
        sessionType: 'HAIPAY_WALLET'
      }
    });

    return res.status(200).json({
      success: true,
      message: '🎉 Xác thực ví HaiPay thành công!',
      token,
      user: sanitizeUser(user)
    });
  } catch (error) {
    console.error('Firebase Auth Verification Error:', error);
    return res.status(500).json({ message: 'Lỗi đồng bộ xác thực với máy chủ' });
  }
});

/**
 * GET /api/haipay/me
 * Retrieves current wallet profile, balances, and transaction history
 */
router.get('/me', requireWalletAuth, async (req, res) => {
  try {
    const user = req.walletUser;
    const transactions = await Transaction.find({ user: user._id })
      .sort({ createdAt: -1 })
      .limit(50);

    return res.status(200).json({
      success: true,
      user: sanitizeUser(user),
      wallet: {
        walletBalance: user.walletBalance || 0,
        pendingBalance: user.pendingBalance || 0,
        isWalletActive: !!user.isWalletActive,
        walletPhone: user.walletPhone || user.phone || '',
        cccd: user.cccd || '',
        bankInfo: user.bankInfo || { name: '', accountNumber: '', accountName: '' },
        registeredAt: user.walletRegisteredAt
      },
      transactions
    });
  } catch (error) {
    console.error('HaiPay Me Error:', error);
    return res.status(500).json({ message: 'Lỗi lấy thông tin ví: ' + error.message });
  }
});

module.exports = router;
