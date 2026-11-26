import React, { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import axiosClient from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';

const SellerProtectedRoute = () => {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [checking, setChecking] = useState(true);
  const [verifiedUser, setVerifiedUser] = useState(user);

  useEffect(() => {
    let cancelled = false;
    const token = user?.token;
    if (!user || !token) {
      setVerifiedUser(null);
      setChecking(false);
      return;
    }

    axiosClient
      .get('/api/users/profile')
      .then(({ data }) => {
        if (cancelled) return;
        const fresh = data?.user || data;
        if (fresh?._id) {
          const merged = { ...user, ...fresh, token };
          localStorage.setItem('user', JSON.stringify(merged));
          setUser(merged);
          setVerifiedUser(merged);
        } else {
          setVerifiedUser(user);
        }
      })
      .catch(() => {
        if (!cancelled) setVerifiedUser(user);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isApprovedSeller = Boolean(
    verifiedUser && verifiedUser.isSeller === true && verifiedUser.sellerStatus === 'approved'
  );

  // C1: Chuyển side-effect toast vào useEffect thay vì gọi trong lúc render
  useEffect(() => {
    if (checking || !verifiedUser || isApprovedSeller) return;
    if (verifiedUser.sellerStatus === 'pending') {
      toast.info('Hồ sơ đang chờ duyệt', 'Hồ sơ mở Shop của bạn đang được Admin xét duyệt.');
    } else {
      toast.warning('Yêu cầu mở Shop', 'Vui lòng hoàn tất đăng ký Người bán B2C để truy cập Kênh Người Bán.');
    }
  }, [checking, verifiedUser, isApprovedSeller, toast]);

  if (checking) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-3">
        <div className="w-10 h-10 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin"></div>
        <p className="text-sm font-bold text-slate-600">Đang kiểm tra quyền truy cập Kênh Người Bán...</p>
      </div>
    );
  }

  if (!verifiedUser) {
    return <Navigate to="/login" replace />;
  }

  if (!isApprovedSeller) {
    return <Navigate to="/register-seller" replace />;
  }

  return <Outlet />;
};

export default SellerProtectedRoute;
