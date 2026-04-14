import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import emailjs from '@emailjs/browser'; // 🚀 ĐÃ THÊM IMPORT EMAILJS VÀO ĐÂY

const LoginPage = () => {
  const navigate = useNavigate();
  const API_URL = process.env.REACT_APP_API_URL || 'https://haihand-marketplace.onrender.com';

  const [isForgotMode, setIsForgotMode] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  
  // States mới cho luồng OTP
  const [forgotEmail, setForgotEmail] = useState('');
  const [otpForm, setOtpForm] = useState({ otp: '', newPassword: '' });
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [showLoginPass, setShowLoginPass] = useState(false);
  const [showForgotPass, setShowForgotPass] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const { data } = await axios.post(`${API_URL}/api/users/login`, loginForm);
      localStorage.setItem('user', JSON.stringify(data));
      navigate('/');
    } catch (error) {
      alert("❌ " + (error.response?.data?.message || "Đăng nhập thất bại!"));
    }
  };

  // ==============================================================
  // 🚀 NÚT 1: GỬI MÃ OTP VỀ EMAIL (Dùng EmailJS siêu mượt)
  // ==============================================================
  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!forgotEmail) return alert('Vui lòng nhập Email!');
    setIsLoading(true);
    
    try {
        const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // 1. Gửi mã lên Backend
        await axios.post(`${API_URL}/api/users/send-otp`, { 
            email: forgotEmail, 
            generatedOtp: generatedOtp 
        });

        // 2. Gọi EmailJS
        await emailjs.send(
            'service_4q86uoa',      // Bác kiểm tra kỹ KHÔNG có dấu cách dư thừa nhé
            'template_v64f5jg',     
            { 
                email: forgotEmail, 
                otp: generatedOtp   
            },
            {
                publicKey: 'FxVTloEF4YTi7S87P'
            }   
        );
        
        alert("📩 Đã gửi mã OTP vào Email! Bác check hộp thư nhé.");
        setIsOtpSent(true); 
    } catch (error) {
        console.error("LỖI CHI TIẾT:", error);
        
        // 🚀 Đã sửa cách bắt lỗi: Ưu tiên đọc lỗi của EmailJS (error.text)
        const errorMsg = error.text || error.response?.data?.message || "Lỗi không xác định";
        alert("❌ Lỗi: " + errorMsg);
    }
    setIsLoading(false);
  };

  // ==============================================================
  // NÚT 2: XÁC NHẬN MÃ VÀ ĐỔI PASS
  // ==============================================================
  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (otpForm.newPassword.length < 6) return alert('❌ Mật khẩu mới phải có ít nhất 6 ký tự!');
    try {
      const { data } = await axios.post(`${API_URL}/api/users/reset-password-otp`, {
        email: forgotEmail,
        otp: otpForm.otp,
        newPassword: otpForm.newPassword
      });
      alert("✅ " + data.message);
      
      // Reset lại luồng, quay về màn đăng nhập
      setIsForgotMode(false);
      setIsOtpSent(false);
      setForgotEmail('');
      setOtpForm({ otp: '', newPassword: '' });
    } catch (error) { 
        alert("❌ " + (error.response?.data?.message || "Lỗi khôi phục!")); 
    }
  };

  return (
    <div className="d-flex justify-content-center align-items-center vh-100" style={{ backgroundColor: '#F4F4F4' }}>
      <div className="card shadow-lg border-0 rounded-4 overflow-hidden" style={{ width: '400px' }}>
        <div className="bg-warning p-4 text-center">
            <h2 className="fw-bold text-white mb-0 hover-scale" onClick={() => navigate('/')} style={{cursor: 'pointer'}}>HaiHand</h2>
            <p className="text-white-50 small m-0 mt-1">{isForgotMode ? 'Khôi phục mật khẩu' : 'Chào mừng trở lại'}</p>
        </div>

        <div className="card-body p-4 p-sm-5">
            {!isForgotMode ? (
                // =============== FORM ĐĂNG NHẬP ===============
                <form onSubmit={handleLogin}>
                    <div className="mb-3">
                        <label className="form-label fw-bold small text-muted">Email</label>
                        <input type="email" className="form-control bg-light py-2" required value={loginForm.email} onChange={e => setLoginForm({...loginForm, email: e.target.value})} />
                    </div>
                    <div className="mb-4">
                        <div className="d-flex justify-content-between">
                            <label className="form-label fw-bold small text-muted">Mật khẩu</label>
                            <span className="small text-primary fw-bold" style={{cursor: 'pointer'}} onClick={() => setIsForgotMode(true)}>Quên mật khẩu?</span>
                        </div>
                        <div className="input-group">
                            <input type={showLoginPass ? "text" : "password"} className="form-control bg-light py-2 border-end-0" required value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} />
                            <button type="button" className="input-group-text bg-light border-start-0 text-muted" onClick={() => setShowLoginPass(!showLoginPass)}>
                                {showLoginPass ? '🙈' : '👁️'}
                            </button>
                        </div>
                    </div>
                    <button type="submit" className="btn btn-warning w-100 fw-bold py-2 fs-5 text-white rounded-pill shadow-sm">Đăng nhập</button>
                    <div className="text-center mt-4 small">
                        Chưa có tài khoản? <Link to="/register" className="text-decoration-none fw-bold text-warning">Đăng ký ngay</Link>
                    </div>
                </form>
            ) : (
                // =============== FORM QUÊN MẬT KHẨU ===============
                <div>
                    {!isOtpSent ? (
                        // BƯỚC 1: NHẬP EMAIL LẤY MÃ
                        <form onSubmit={handleSendOtp}>
                            <div className="alert alert-info py-2 small border-0 bg-light text-muted text-center mb-4">
                                Nhập Email của bạn để nhận mã xác nhận (OTP) gồm 6 chữ số.
                            </div>
                            <div className="mb-4">
                                <label className="form-label fw-bold small text-muted">Email tài khoản <span className="text-danger">*</span></label>
                                <input type="email" className="form-control bg-light py-2" placeholder="ví dụ: user@gmail.com" required value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} />
                            </div>
                            <button type="submit" className="btn btn-dark w-100 fw-bold py-2 fs-6 rounded-pill shadow-sm mb-3" disabled={isLoading}>
                                {isLoading ? '⏳ Đang gửi mail...' : '📩 Gửi mã OTP'}
                            </button>
                            <button type="button" onClick={() => setIsForgotMode(false)} className="btn btn-light w-100 fw-bold py-2 fs-6 rounded-pill text-muted">⬅ Quay lại Đăng nhập</button>
                        </form>
                    ) : (
                        // BƯỚC 2: NHẬP MÃ VÀ ĐỔI PASS
                        <form onSubmit={handleResetPassword}>
                            <div className="alert alert-success py-2 small border-0 bg-light text-success text-center mb-4">
                                Đã gửi mã OTP tới <b>{forgotEmail}</b>. Vui lòng kiểm tra hộp thư!
                            </div>
                            <div className="mb-3">
                                <label className="form-label fw-bold small text-muted">Nhập mã OTP (6 số) <span className="text-danger">*</span></label>
                                <input type="text" className="form-control bg-light text-center fw-bold fs-5 tracking-widest" maxLength="6" required value={otpForm.otp} onChange={e => setOtpForm({...otpForm, otp: e.target.value})} />
                            </div>
                            <div className="mb-4">
                                <label className="form-label fw-bold small text-muted">Mật khẩu mới <span className="text-danger">*</span></label>
                                <div className="input-group">
                                    <input type={showForgotPass ? "text" : "password"} className="form-control bg-light border-end-0 py-2" required value={otpForm.newPassword} onChange={e => setOtpForm({...otpForm, newPassword: e.target.value})} />
                                    <button type="button" className="input-group-text bg-light border-start-0 text-muted" onClick={() => setShowForgotPass(!showForgotPass)}>
                                        {showForgotPass ? '🙈' : '👁️'}
                                    </button>
                                </div>
                            </div>
                            <button type="submit" className="btn btn-success w-100 fw-bold py-2 fs-6 rounded-pill shadow-sm mb-3">🔄 Xác nhận & Đổi mật khẩu</button>
                            <button type="button" onClick={() => setIsOtpSent(false)} className="btn btn-light w-100 fw-bold py-2 fs-6 rounded-pill text-muted">⬅ Nhập lại Email khác</button>
                        </form>
                    )}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;