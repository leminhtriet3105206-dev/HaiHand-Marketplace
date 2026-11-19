const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { createAndSaveOtp, verifyOtp } = require('../utils/otpService');
const { getJwtSecret, sanitizeUser } = require('../utils/b2c');

const router = express.Router();

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
 * Helper: Verify Firebase ID Token if firebase-admin is installed and initialized
 */
async function verifyFirebaseIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') return null;
  try {
    // Attempt to use firebase-admin if configured in the environment
    // eslint-disable-next-line global-require, import/no-unresolved
    const admin = require('firebase-admin');
    if (admin && admin.apps && admin.apps.length > 0) {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      return decodedToken;
    }
  } catch (e) {
    // firebase-admin not installed or not initialized in dev environment
  }
  return null;
}

/**
 * POST /api/haipay/send-otp
 * Generates and dispatches OTP
 */
router.post('/send-otp', async (req, res) => {
  try {
    const { identifier, purpose = 'LOGIN' } = req.body;

    if (!identifier || !identifier.trim()) {
      return res.status(400).json({ message: 'Vui lòng cung cấp Email hoặc Số điện thoại' });
    }

    const cleanIdentifier = identifier.trim().toLowerCase();

    if (purpose === 'LOGIN') {
      const existingUser = await User.findOne({
        $or: [{ email: cleanIdentifier }, { phone: cleanIdentifier }]
      });

      if (!existingUser) {
        return res.status(404).json({ message: 'Tài khoản chưa được đăng ký trong hệ thống HaiHand' });
      }
    }

    await createAndSaveOtp(cleanIdentifier, purpose);

    return res.status(200).json({
      success: true,
      message: `Mã OTP đã được gửi đến ${cleanIdentifier}. Vui lòng kiểm tra hộp thư (hoặc console server).`,
      expiresIn: 300
    });
  } catch (error) {
    if (error.statusCode === 429) {
      return res.status(429).json({ message: error.message });
    }
    console.error('Send OTP Error:', error);
    return res.status(500).json({ message: 'Lỗi khi gửi mã OTP: ' + error.message });
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
      if (!password) {
        return res.status(400).json({ message: 'Tài khoản đã tồn tại. Vui lòng nhập mật khẩu tài khoản để kích hoạt ví!' });
      }
      const isBcryptHash = typeof user.password === 'string' && /^\$2[aby]\$/.test(user.password);
      const isPasswordValid = isBcryptHash
        ? await bcrypt.compare(password, user.password)
        : user.password === password;
      if (!isPasswordValid) {
        return res.status(400).json({ message: 'Mật khẩu tài khoản không chính xác!' });
      }
      if (!isBcryptHash) {
        user.password = await bcrypt.hash(password, 10);
      }

      user.isWalletActive = true;
      if (phone) user.walletPhone = phone.trim();
      if (fullName && (!user.name || user.name === 'User')) user.name = fullName.trim();
      if (cccd) user.cccd = cccd.trim();
      if (pin) user.walletPin = await bcrypt.hash(pin.trim(), 8);
      user.walletRegisteredAt = new Date();
      await user.save();
    } else {
      if (!password) {
        return res.status(400).json({ message: 'Vui lòng đặt mật khẩu cho tài khoản mới' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      let hashedPin = '';
      if (pin) hashedPin = await bcrypt.hash(pin.trim(), 8);

      user = new User({
        name: fullName ? fullName.trim() : cleanEmail.split('@')[0],
        email: cleanEmail,
        password: hashedPassword,
        phone: phone ? phone.trim() : '',
        walletPhone: phone ? phone.trim() : '',
        cccd: cccd ? cccd.trim() : '',
        walletPin: hashedPin,
        isWalletActive: true,
        walletRegisteredAt: new Date(),
        walletBalance: 0,
        pendingBalance: 0
      });
      await user.save();
    }

    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        isWalletActive: true,
        sessionType: 'HAIPAY_WALLET'
      },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

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

    const isBcryptHash = typeof user.password === 'string' && /^\$2[aby]\$/.test(user.password);
    const isPasswordValid = isBcryptHash
      ? await bcrypt.compare(password, user.password)
      : user.password === password;
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Mật khẩu không chính xác' });
    }

    if (!isBcryptHash) {
      user.password = await bcrypt.hash(password, 10);
      await user.save();
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

    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        isWalletActive: true,
        sessionType: 'HAIPAY_WALLET'
      },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

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
 * Security Hardened (Anti-Account Takeover):
 * - Không cho phép chỉ gửi `phoneNumber` từ `req.body` để lấy JWT.
 * - Bắt buộc phải có `idToken` được xác thực bởi Firebase Admin SDK, HOẶC nếu môi trường dev
 *   chưa cấu hình Firebase Admin SDK thì bắt buộc phải xác thực bằng OTP (`verifyOtp`) hoặc mật khẩu (`password`) của tài khoản.
 */
router.post('/verify-firebase', async (req, res) => {
  try {
    const { phoneNumber, firebaseUid, fullName, email, idToken, otp, password, otpPurpose = 'LOGIN' } = req.body || {};

    if (!phoneNumber || !phoneNumber.trim()) {
      return res.status(400).json({ message: 'Thiếu số điện thoại được xác thực' });
    }

    if (!idToken && !otp && !password) {
      return res.status(401).json({
        message: 'Từ chối truy cập: Bắt buộc cung cấp Firebase idToken hợp lệ hoặc xác thực kèm OTP / Mật khẩu tài khoản!'
      });
    }

    const cleanRawPhone = phoneNumber.trim();
    const localPhone = cleanRawPhone.startsWith('+84')
      ? '0' + cleanRawPhone.slice(3)
      : (cleanRawPhone.startsWith('84') ? '0' + cleanRawPhone.slice(2) : cleanRawPhone);
    const intlPhone = cleanRawPhone.startsWith('+')
      ? cleanRawPhone
      : (cleanRawPhone.startsWith('0') ? '+84' + cleanRawPhone.slice(1) : '+84' + cleanRawPhone);

    // 1. Try verifying idToken via Firebase Admin SDK if present
    const verifiedFirebaseClaims = await verifyFirebaseIdToken(idToken);
    let verifiedByFirebaseAdmin = false;

    if (verifiedFirebaseClaims) {
      const claimPhone = verifiedFirebaseClaims.phone_number || '';
      if (claimPhone && claimPhone !== localPhone && claimPhone !== intlPhone) {
        return res.status(401).json({ message: 'Số điện thoại không khớp với Firebase idToken!' });
      }
      verifiedByFirebaseAdmin = true;
    }

    // 2. Find existing user by phone
    let user = await User.findOne({
      $or: [
        { phone: localPhone },
        { phone: intlPhone },
        { walletPhone: localPhone },
        { walletPhone: intlPhone }
      ]
    });

    // 3. If Firebase Admin SDK did not verify idToken (e.g. dev environment without serviceAccount),
    // strictly require server-side OTP verification or account password verification!
    if (!verifiedByFirebaseAdmin) {
      let secondaryVerified = false;

      if (otp) {
        const otpIdentifier = (email && email.trim().toLowerCase()) || user?.email || localPhone;
        const otpCheck = await verifyOtp(otpIdentifier, String(otp).trim(), otpPurpose);
        if (!otpCheck.valid) {
          return res.status(401).json({ message: otpCheck.message || 'Mã OTP xác thực không hợp lệ hoặc đã hết hạn!' });
        }
        secondaryVerified = true;
      } else if (password && user) {
        const isBcryptHash = typeof user.password === 'string' && /^\$2[aby]\$/.test(user.password);
        const isPassMatch = isBcryptHash
          ? await bcrypt.compare(String(password), user.password)
          : user.password === String(password);

        if (!isPassMatch) {
          return res.status(401).json({ message: 'Mật khẩu xác thực không chính xác!' });
        }
        if (!isBcryptHash) {
          user.password = await bcrypt.hash(String(password), 10);
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
      if (user.status === 'locked' || user.isBanned === true) {
        return res.status(403).json({ message: 'Tài khoản của bạn đã bị khóa' });
      }

      user.isWalletActive = true;
      if (!user.walletPhone) user.walletPhone = localPhone;
      const resolvedUid = verifiedFirebaseClaims?.uid || firebaseUid;
      if (resolvedUid && !user.firebaseUid) user.firebaseUid = resolvedUid;
      if (!user.walletRegisteredAt) user.walletRegisteredAt = new Date();
      if (fullName && (!user.name || user.name.startsWith('Người dùng'))) {
        user.name = fullName.trim();
      }
      user.lastActive = new Date();
      await user.save();
    } else {
      const cleanEmail = email && email.trim()
        ? email.trim().toLowerCase()
        : `haipay_${localPhone.replace(/\D/g, '') || Date.now()}@haipay.vn`;

      const existingEmailUser = await User.findOne({ email: cleanEmail });
      const finalEmail = existingEmailUser
        ? `haipay_${Date.now()}_${Math.floor(Math.random() * 1000)}@haipay.vn`
        : cleanEmail;

      const rawPass = password && String(password).trim()
        ? String(password).trim()
        : `fb_auth_${verifiedFirebaseClaims?.uid || firebaseUid || Date.now()}`;
      const hashedPassword = await bcrypt.hash(rawPass, 10);

      user = new User({
        name: fullName && fullName.trim() ? fullName.trim() : `Người dùng HaiPay ${localPhone.slice(-4) || 'Mới'}`,
        email: finalEmail,
        phone: localPhone,
        walletPhone: localPhone,
        firebaseUid: verifiedFirebaseClaims?.uid || firebaseUid || '',
        password: hashedPassword,
        isWalletActive: true,
        walletRegisteredAt: new Date(),
        walletBalance: 0,
        pendingBalance: 0,
        lastActive: new Date()
      });

      await user.save();
    }

    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        phone: user.phone || user.walletPhone,
        isWalletActive: true,
        sessionType: 'HAIPAY_WALLET'
      },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      success: true,
      message: '🎉 Xác thực ví HaiPay thành công!',
      token,
      user: sanitizeUser(user)
    });
  } catch (error) {
    console.error('Firebase Auth Verification Error:', error);
    return res.status(500).json({ message: 'Lỗi đồng bộ xác thực với máy chủ: ' + error.message });
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
