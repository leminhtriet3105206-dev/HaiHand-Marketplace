import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AppHeader } from '../components/AppHeader';
import { AppFooter } from '../components/AppFooter';

const HaiPayResult = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState('⏳ Đang xác thực giao dịch qua VNPAY...');
    const [isOrder, setIsOrder] = useState(false);

    useEffect(() => {
        const verifyTransaction = async () => {
            const responseCode = searchParams.get('vnp_ResponseCode');
            const txnRef = searchParams.get('vnp_TxnRef');
            const amount = searchParams.get('vnp_Amount');
            const secureHash = searchParams.get('vnp_SecureHash');

            if (!responseCode || !txnRef) {
                setStatus('❌ Dữ liệu phản hồi VNPay không hợp lệ!');
                return;
            }

            const allParams = {};
            for (const [key, value] of searchParams.entries()) {
                allParams[key] = value;
            }

            const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

            // Case A: HaiPay Wallet Topup (Read-only poll from server DB)
            if (txnRef.startsWith('NAP_')) {
                setIsOrder(false);
                try {
                    const res = await axios.get(`${API_URL}/api/haipay/verify`, { params: { txnRef } });
                    if (res.data?.status === 'paid' || res.data?.paid === true) {
                        setStatus('🎉 Nạp tiền Ví HaiPay thành công! Số dư đã được cập nhật.');
                        window.dispatchEvent(new Event('userUpdated'));
                    } else if (res.data?.status === 'failed' || (responseCode && responseCode !== '00')) {
                        setStatus('❌ Nạp tiền thất bại hoặc bạn đã hủy giao dịch.');
                    } else {
                        setStatus('⏳ Giao dịch đang chờ cổng VNPAY xác nhận (IPN)...');
                    }
                } catch (error) {
                    setStatus('❌ ' + (error.response?.data?.message || 'Lỗi hệ thống khi kiểm tra trạng thái nạp tiền!'));
                }
            } else {
                // Case B: Order Checkout Payment (Read-only poll from server DB)
                setIsOrder(true);
                try {
                    const res = await axios.get(`${API_URL}/api/vnpay/verify`, { params: { orderId: txnRef } });
                    if (res.data?.status === 'paid' || res.data?.paid === true) {
                        setStatus('🎉 Thanh toán đơn hàng thành công qua VNPAY! Người bán đang chuẩn bị hàng.');
                        window.dispatchEvent(new Event('cartUpdated'));
                    } else if (res.data?.status === 'failed' || (responseCode && responseCode !== '00')) {
                        setStatus('❌ Thanh toán đơn hàng thất bại hoặc bạn đã hủy giao dịch!');
                    } else {
                        setStatus('⏳ Giao dịch đang chờ cổng VNPAY xác nhận (IPN)...');
                    }
                } catch (error) {
                    setStatus('❌ ' + (error.response?.data?.message || 'Lỗi hệ thống khi kiểm tra trạng thái thanh toán đơn hàng!'));
                }
            }
        };
        verifyTransaction();
    }, [searchParams]);

    return (
        <div className="d-flex flex-column min-vh-100 bg-light">
            <AppHeader />
            <div className="container d-flex flex-column align-items-center justify-content-center my-auto py-5">
                <div className="card p-5 shadow-lg border-0 text-center rounded-4" style={{maxWidth: '600px'}}>
                    <div className="display-4 mb-4">{status.includes('thành công') ? '✅' : '❌'}</div>
                    <h3 className="fw-bold mb-4 text-dark" style={{lineHeight: '1.4'}}>{status}</h3>
                    {isOrder ? (
                        <button onClick={() => navigate('/profile?tab=orders_buy')} className="btn btn-warning fw-bold px-5 py-3 rounded-pill shadow-sm">
                            🛍️ Vào xem Đơn mua của tôi
                        </button>
                    ) : (
                        <button onClick={() => navigate('/haipay')} className="btn btn-warning fw-bold px-5 py-3 rounded-pill shadow-sm">
                            💳 Quay lại Ví HaiPay
                        </button>
                    )}
                </div>
            </div>
            <AppFooter />
        </div>
    );
};

export default HaiPayResult;