import React, { useMemo } from 'react';
import { Navigate, Outlet } from 'react-router-dom';

const AdminProtectedRoute = () => {
    const user = useMemo(() => {
        const stored = localStorage.getItem('user');
        return stored && stored !== "undefined" ? JSON.parse(stored) : null;
    }, []);

    const token = localStorage.getItem('adminToken');

    if (!user || user.role !== 'Admin' || !token) {
        return <Navigate to="/admin/login" replace />;
    }

    return <Outlet />;
};

export default AdminProtectedRoute;
