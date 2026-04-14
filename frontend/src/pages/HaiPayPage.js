import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';

const HaiPayPage = () => {
  const navigate = useNavigate();
  const API_URL = process.env.REACT_APP_API_URL || 'https://haihand-marketplace.onrender.com';
  
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')));
  const [activeTab, setActiveTab] = useState('deposit'); 
  
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [bankName, setBankName] = useState('Vietcombank');
  const [bankAccount, setBankAccount] = useState('');
  const [transactions, setTransactions] = useState([]);

  // Hàm tải dữ liệu ví và lịch sử giao dịch mới nhất
  const fetchWalletData = async () => {
    if (!user?._id) return;
    try {
        // Lấy thông tin user mới nhất (số dư ví)
        const userRes = await axios.get(`${API_URL}/api/users/${user._id}`);
        if (userRes.data) {
            setUser(userRes.data);
            localStorage.setItem('user', JSON.stringify(userRes.data));
        }
        
        // Lấy lịch sử giao dịch
        const transRes = await axios.get(`${API_URL}/api/users/${user._id}/transactions`);
        setTransactions(transRes.data);
    } catch (error) {
        console.error("Lỗi đồng bộ ví:", error);
    }
  };

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    fetchWalletData();
  }, [user?._id, navigate]);

  // 🚀 XỬ LÝ NẠP TIỀN VNPAY THẬT
  const handleDeposit = async () => {
    const amount = parseInt(depositAmount);
    if (!amount || amount < 10000) return alert("Nạp tối thiểu 10.000đ bác nhé!");

    try {
        // Gọi API nạp tiền đã viết trong server.js
        const { data } = await axios.post(`${API_URL}/api/haipay/deposit`, {
            amount: amount,
            userId: user._id
        });

        if (data.paymentUrl) {
            window.location.href = data.paymentUrl; // Chuyển sang VNPay
        }
    } catch (error) {
        alert("Lỗi kết nối cổng thanh toán!");
    }
  };

  // 🚀 XỬ LÝ RÚT TIỀN (ĐÃ SỬA LỖI 404)
  const handleWithdraw = async (e) => {
    e.preventDefault();
    const amount = Number(withdrawAmount);
    if (!amount || !bankAccount) return alert("Vui lòng điền đủ thông tin!");
    if (amount < 50000) return alert("Rút tối thiểu 50.000đ bác nhé!");
    if (amount > user.walletBalance) return alert("Số dư không đủ để rút!");

    if (window.confirm(`Xác nhận rút ${amount.toLocaleString('vi-VN')}đ về ${bankName}?`)) {
        try {
            // 🚀 ĐÃ SỬA: Gọi đúng địa chỉ API trong server.js
            const res = await axios.post(`${API_URL}/api/users/${user._id}/withdraw`, {
                amount: amount,
                bankName,
                bankAccount
            });
            
            alert("✅ " + res.data.message);
            // Cập nhật lại state user sau khi rút
            setUser(res.data.user);
            localStorage.setItem('user', JSON.stringify(res.data.user));
            
            setWithdrawAmount(''); 
            setBankAccount('');
            setActiveTab('history');
            fetchWalletData(); // Tải lại lịch sử để hiện dòng "Đang xử lý"
        } catch (error) {
            alert("❌ " + (error.response?.data?.message || "Lỗi xử lý!"));
        }
    }
  };

  const getStatusColor = (status) => {
    if (status === 'Thành công') return 'text-success bg-success-subtle border-success';
    if (status === 'Đang xử lý') return 'text-warning-emphasis bg-warning-subtle border-warning';
    return 'text-danger bg-danger-subtle border-danger';
  };

  if (!user) return null;

  return (
    <div className="d-flex flex-column min-vh-100" style={{ backgroundColor: '#f0f2f5' }}>
      <Header />
      <div className="container py-5 flex-grow-1 d-flex justify-content-center">
        <div className="w-100" style={{ maxWidth: '600px' }}>
            <div className="bg-dark text-white p-4 rounded-top-4 text-center shadow-lg position-relative overflow-hidden">
                <div className="position-absolute top-0 start-0 w-100 h-100 bg-warning opacity-20" style={{filter: 'blur(40px)'}}></div>
                <h5 className="fw-bold mb-1 position-relative z-1 text-warning-emphasis">💳 Ví HÀI PAY</h5>
                <div className="position-relative z-1 bg-black bg-opacity-40 py-4 rounded-4 border border-white border-opacity-10 shadow-lg mx-3 mt-3">
                    <p className="text-white-50 small text-uppercase fw-bold mb-1">Số dư hiện tại</p>
                    <h1 className="display-4 fw-black text-white mb-0">
                        {(user.walletBalance || 0).toLocaleString('vi-VN')} đ
                    </h1>
                </div>
            </div>

            <div className="bg-white d-flex border-bottom shadow-sm">
                <button onClick={() => setActiveTab('deposit')} className={`flex-grow-1 py-3 fw-bold bg-transparent border-0 ${activeTab === 'deposit' ? 'text-warning border-bottom border-warning border-3' : 'text-muted'}`}>NẠP TIỀN</button>
                <button onClick={() => setActiveTab('withdraw')} className={`flex-grow-1 py-3 fw-bold bg-transparent border-0 ${activeTab === 'withdraw' ? 'text-warning border-bottom border-warning border-3' : 'text-muted'}`}>RÚT TIỀN</button>
                <button onClick={() => setActiveTab('history')} className={`flex-grow-1 py-3 fw-bold bg-transparent border-0 ${activeTab === 'history' ? 'text-warning border-bottom border-warning border-3' : 'text-muted'}`}>LỊCH SỬ</button>
            </div>

            <div className="bg-white p-4 rounded-bottom-4 shadow-sm" style={{ minHeight: '350px' }}>
                {activeTab === 'deposit' && (
                    <div className="animate__animated animate__fadeIn">
                        <label className="fw-bold text-muted small mb-2">Số tiền muốn nạp (VNĐ)</label>
                        <input type="number" className="form-control mb-4 fs-5 py-3 fw-bold" placeholder="VD: 100000" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} />
                        <button onClick={handleDeposit} className="btn btn-warning w-100 fw-bold fs-5 py-3 rounded-3 shadow-sm">⚡ NẠP TIỀN QUA VNPAY</button>
                    </div>
                )}

                {activeTab === 'withdraw' && (
                    <form onSubmit={handleWithdraw} className="animate__animated animate__fadeIn">
                        <div className="mb-3">
                            <label className="fw-bold text-muted small mb-2">Số tiền muốn rút (VNĐ)</label>
                            <input type="number" className="form-control fw-bold" placeholder="Tối thiểu 50.000đ" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} required />
                        </div>
                        <div className="mb-3">
                            <label className="fw-bold text-muted small mb-2">Ngân hàng</label>
                            <select className="form-select fw-bold" value={bankName} onChange={e => setBankName(e.target.value)}>
                                <option value="Vietcombank">Vietcombank</option>
                                <option value="Techcombank">Techcombank</option>
                                <option value="MB Bank">MB Bank</option>
                                <option value="Agribank">Agribank</option>
                            </select>
                        </div>
                        <div className="mb-4">
                            <label className="fw-bold text-muted small mb-2">Số tài khoản</label>
                            <input type="text" className="form-control fw-bold" placeholder="Số tài khoản của bác..." value={bankAccount} onChange={e => setBankAccount(e.target.value)} required />
                        </div>
                        <button type="submit" className="btn btn-dark w-100 fw-bold fs-5 py-3 rounded-3">🏦 YÊU CẦU RÚT TIỀN</button>
                    </form>
                )}

                {activeTab === 'history' && (
                    <div className="animate__animated animate__fadeIn">
                        {transactions.length === 0 ? (
                            <div className="text-center py-5 text-muted">Chưa có giao dịch phát sinh.</div>
                        ) : (
                            transactions.map(t => (
                                <div key={t._id} className="d-flex justify-content-between align-items-center p-3 mb-2 bg-light rounded-3 border">
                                    <div className="d-flex align-items-center gap-3">
                                        <div className="fs-4">{t.type === 'Nạp tiền' ? '💸' : '🏦'}</div>
                                        <div>
                                            <h6 className="fw-bold mb-0">{t.type}</h6>
                                            <small className="text-muted" style={{fontSize: '11px'}}>{new Date(t.createdAt).toLocaleString('vi-VN')}</small>
                                        </div>
                                    </div>
                                    <div className="text-end">
                                        <h6 className={`fw-bold mb-1 ${t.type === 'Rút tiền' ? 'text-danger' : 'text-success'}`}>{t.type === 'Rút tiền' ? '-' : '+'}{t.amount.toLocaleString()} đ</h6>
                                        <span className={`badge border px-2 py-1 ${getStatusColor(t.status)}`}>{t.status}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default HaiPayPage;