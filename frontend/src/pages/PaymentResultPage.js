import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const PaymentResultPage = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState('⏳ Đang kiểm tra trạng thái thanh toán từ máy chủ...');

    useEffect(() => {
        let isMounted = true;
        let pollTimer = null;
        let attempts = 0;
        const maxAttempts = 5;

        const orderId = searchParams.get('vnp_TxnRef') || searchParams.get('orderId');
        const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

        const pollPaymentStatus = async () => {
            if (!orderId) {
                if (isMounted) setStatus('❌ Không tìm thấy mã đơn hàng để kiểm tra!');
                return;
            }

            try {
                const isTopup = orderId.startsWith('NAP_');
                const endpoint = isTopup ? '/api/haipay/verify' : '/api/vnpay/verify';
                const res = await axios.get(`${API_URL}${endpoint}`, {
                    params: isTopup ? { txnRef: orderId } : { orderId }
                });

                const currentStatus = res.data?.status;
                if (!isMounted) return;

                if (currentStatus === 'paid' || res.data?.paid === true) {
                    setStatus('🎉 Thanh toán thành công! Hệ thống ký quỹ (Escrow) đã ghi nhận giao dịch của bạn.');
                    window.dispatchEvent(new Event('cartUpdated'));
                    return;
                }

                if (currentStatus === 'failed') {
                    setStatus('❌ Giao dịch thất bại hoặc đã bị hủy!');
                    return;
                }

                attempts += 1;
                if (attempts < maxAttempts) {
                    setStatus(`⏳ Đang chờ xác nhận thanh toán từ cổng VNPAY (lần ${attempts}/${maxAttempts})...`);
                    pollTimer = setTimeout(pollPaymentStatus, 2000);
                } else {
                    setStatus('⏳ Giao dịch đang được đối soát tự động (IPN). Vui lòng kiểm tra trong mục Đơn mua sau ít phút.');
                }
            } catch (error) {
                if (isMounted) {
                    setStatus('❌ Không thể kiểm tra trạng thái giao dịch. Vui lòng xem trong Đơn mua của bạn!');
                }
            }
        };

        pollPaymentStatus();

        return () => {
            isMounted = false;
            if (pollTimer) clearTimeout(pollTimer);
        };
    }, [searchParams]);

    return (
        <div className="d-flex flex-column align-items-center justify-content-center vh-100 bg-light">
            <div className="card p-5 shadow-lg rounded-4 text-center border-0" style={{maxWidth: '500px'}}>
                <h3 className="fw-bold mb-4 text-dark" style={{lineHeight: '1.5'}}>{status}</h3>
                <button onClick={() => navigate('/profile')} className="btn btn-warning fw-bold px-5 py-3 rounded-pill shadow-sm">
                    🛍️ Vào xem Đơn mua của tôi
                </button>
            </div>
        </div>
    );
};

export default PaymentResultPage;
