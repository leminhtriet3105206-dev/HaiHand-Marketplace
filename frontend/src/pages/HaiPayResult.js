import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Header from '../components/Header';
import Footer from '../components/Footer';

const HaiPayResult = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState('⏳ Đang xác thực giao dịch nạp tiền...');

    useEffect(() => {
        const verifyDeposit = async () => {
            const responseCode = searchParams.get('vnp_ResponseCode');
            const txnRef = searchParams.get('vnp_TxnRef');
            const amount = searchParams.get('vnp_Amount');

            if (responseCode === '00') {
                try {
                    await axios.post('https://haihand-marketplace.onrender.com/api/haipay/verify', {
                        txnRef, responseCode, amount
                    });
                    setStatus('🎉 Nạp tiền HàiPay thành công! Số dư đã được cập nhật.');
                    
                    const currentUser = JSON.parse(localStorage.getItem('user'));
                    const actualAmount = parseInt(amount) / 100;
                    currentUser.walletBalance = (currentUser.walletBalance || 0) + actualAmount;
                    localStorage.setItem('user', JSON.stringify(currentUser));
                    
                    // 🚀 Bắn tin cho Header cập nhật ngay lập tức
                    window.dispatchEvent(new Event('userUpdated'));
                } catch (error) {
                    setStatus('❌ Lỗi hệ thống khi cộng tiền vào ví!');
                }
            } else {
                setStatus('❌ Nạp tiền thất bại hoặc giao dịch bị hủy.');
            }
        };
        verifyDeposit();
    }, [searchParams]);

    return (
        <div className="d-flex flex-column min-vh-100 bg-light">
            <Header />
            <div className="container d-flex flex-column align-items-center justify-content-center my-auto py-5">
                <div className="card p-5 shadow-lg border-0 text-center rounded-4" style={{maxWidth: '600px'}}>
                    <div className="display-4 mb-4">{status.includes('thành công') ? '✅' : '❌'}</div>
                    <h3 className="fw-bold mb-4 text-dark" style={{lineHeight: '1.4'}}>{status}</h3>
                    <button onClick={() => navigate('/haipay')} className="btn btn-warning fw-bold px-5 py-3 rounded-pill shadow-sm">
                        💳 Quay lại Ví HàiPay
                    </button>
                </div>
            </div>
            <Footer />
        </div>
    );
};

export default HaiPayResult;