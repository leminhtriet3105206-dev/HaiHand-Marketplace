import React, { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import axiosClient, { persistUser } from '../api/axiosClient';
import { useToast } from './Toast';

/**
 * SellerProtectedRoute (M11):
 * Luôn gọi `/api/users/profile` từ server để xác thực quyền `isSeller === true && sellerStatus === 'approved'`
 * thay vì chỉ tin dữ liệu cũ trong localStorage.
 */
const SellerProtectedRoute = () => {
    const toast = useToast();
    const [status, setStatus] = useState('checking'); // 'checking' | 'unauthenticated' | 'approved' | 'pending' | 'not_seller'

    useEffect(() => {
        let mounted = true;
        const verifySeller = async () => {
            try {
                const stored = localStorage.getItem('user');
                const localUser = stored && stored !== 'undefined' ? JSON.parse(stored) : null;
                if (!localUser || !localUser.token) {
                    if (mounted) setStatus('unauthenticated');
                    return;
                }

                const { data } = await axiosClient.get('/api/users/profile');
                if (!mounted) return;
                if (data) {
                    persistUser(data);
                    if (data.isSeller === true && data.sellerStatus === 'approved') {
                        setStatus('approved');
                    } else if (data.sellerStatus === 'pending') {
                        toast.info('Hồ sơ đang chờ duyệt', 'Hồ sơ mở Shop của bạn đang được Admin xét duyệt.');
                        setStatus('pending');
                    } else {
                        toast.warning('Yêu cầu mở Shop', 'Vui lòng hoàn tất đăng ký Người bán B2C để truy cập Kênh Người Bán.');
                        setStatus('not_seller');
                    }
                } else {
                    setStatus('unauthenticated');
                }
            } catch (err) {
                if (!mounted) return;
                if (err.response?.status === 401 || err.response?.status === 403) {
                    setStatus('unauthenticated');
                } else {
                    setStatus('not_seller');
                }
            }
        };
        verifySeller();
        return () => {
            mounted = false;
        };
    }, [toast]);

    if (status === 'checking') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#FFFBEB] text-stone-600 text-sm font-bold">
                Đang xác thực quyền Kênh Người Bán...
            </div>
        );
    }

    if (status === 'unauthenticated') {
        return <Navigate to="/login" replace />;
    }

    if (status !== 'approved') {
        return <Navigate to="/register-seller" replace />;
    }

    return <Outlet />;
};

export default SellerProtectedRoute;
