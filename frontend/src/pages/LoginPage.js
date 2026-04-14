import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

const LoginPage = () => {
  const navigate = useNavigate();
  const API_URL = process.env.REACT_APP_API_URL || 'https://haihand-marketplace.onrender.com';

  const [isForgotMode, setIsForgotMode] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [forgotForm, setForgotForm] = useState({ email: '', phone: '', newPassword: '' });

  // 🚀 States bật/tắt con mắt mật khẩu
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

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (forgotForm.newPassword.length < 6) return alert('❌ Mật khẩu mới phải có ít nhất 6 ký tự!');
    try {
      const { data } = await axios.post(`${API_URL}/api/users/forgot-password`, forgotForm);
      alert("✅ " + data.message);
      setIsForgotMode(false);
      setForgotForm({ email: '', phone: '', newPassword: '' });
    } catch (error) { alert("❌ " + (error.response?.data?.message || "Lỗi khôi phục!")); }
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
                        {/* 🚀 Ô nhập mật khẩu có con mắt */}
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
                <form onSubmit={handleForgotPassword}>
                    <div className="alert alert-info py-2 small border-0 bg-light text-muted text-center mb-4">
                        Xác thực bằng <b>Số điện thoại</b> đã đăng ký để đổi mật khẩu.
                    </div>
                    <div className="mb-3">
                        <label className="form-label fw-bold small text-muted">Email tài khoản <span className="text-danger">*</span></label>
                        <input type="email" className="form-control bg-light" required value={forgotForm.email} onChange={e => setForgotForm({...forgotForm, email: e.target.value})} />
                    </div>
                    <div className="mb-3">
                        <label className="form-label fw-bold small text-muted">Số điện thoại xác thực <span className="text-danger">*</span></label>
                        <input type="text" className="form-control bg-light" required value={forgotForm.phone} onChange={e => setForgotForm({...forgotForm, phone: e.target.value})} />
                    </div>
                    <div className="mb-4">
                        <label className="form-label fw-bold small text-muted">Mật khẩu mới <span className="text-danger">*</span></label>
                        {/* 🚀 Ô nhập mật khẩu có con mắt */}
                        <div className="input-group">
                            <input type={showForgotPass ? "text" : "password"} className="form-control bg-light border-end-0" required value={forgotForm.newPassword} onChange={e => setForgotForm({...forgotForm, newPassword: e.target.value})} />
                            <button type="button" className="input-group-text bg-light border-start-0 text-muted" onClick={() => setShowForgotPass(!showForgotPass)}>
                                {showForgotPass ? '🙈' : '👁️'}
                            </button>
                        </div>
                    </div>
                    <button type="submit" className="btn btn-dark w-100 fw-bold py-2 fs-6 rounded-pill shadow-sm mb-3">🔄 Khôi phục mật khẩu</button>
                    <button type="button" onClick={() => setIsForgotMode(false)} className="btn btn-light w-100 fw-bold py-2 fs-6 rounded-pill text-muted">⬅ Quay lại Đăng nhập</button>
                </form>
            )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;