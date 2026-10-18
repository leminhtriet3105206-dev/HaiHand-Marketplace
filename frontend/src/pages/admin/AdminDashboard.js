import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useToast } from '../../components/Toast';

const AdminDashboard = () => {
    const [stats, setStats] = useState({
        userCount: 0,
        postCount: 0,
        pendingCount: 0,
        revenue: 0
    });
    const [loading, setLoading] = useState(true);
    const toast = useToast();
    const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const token = localStorage.getItem('adminToken');
                const res = await axios.get(`${API_URL}/api/admin/dashboard-stats`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setStats(res.data.stats);
            } catch (error) {
                toast.error('Không thể lấy dữ liệu thống kê');
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, [API_URL, toast]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin"></div>
                    <p className="text-slate-500 font-semibold animate-pulse">Đang tải dữ liệu hệ thống...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Tổng quan hệ thống</h1>
                    <p className="text-slate-500 text-sm mt-1">Cập nhật lúc {new Date().toLocaleTimeString('vi-VN')}</p>
                </div>
                <button 
                    onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 500); }} 
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 font-medium shadow-sm hover:bg-slate-50 transition-all"
                >
                    <i className="fas fa-sync-alt"></i> Làm mới
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Users Card */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-shadow">
                    <div className="absolute -right-6 -top-6 w-24 h-24 bg-blue-50 rounded-full group-hover:scale-110 transition-transform duration-500"></div>
                    <div className="relative z-10 flex items-start justify-between">
                        <div>
                            <p className="text-slate-500 text-sm font-semibold mb-1">TỔNG NGƯỜI DÙNG</p>
                            <h3 className="text-3xl font-bold text-slate-800">{stats.userCount}</h3>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/30">
                            <i className="fas fa-users text-xl"></i>
                        </div>
                    </div>
                </div>

                {/* Active Posts Card */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-shadow">
                    <div className="absolute -right-6 -top-6 w-24 h-24 bg-emerald-50 rounded-full group-hover:scale-110 transition-transform duration-500"></div>
                    <div className="relative z-10 flex items-start justify-between">
                        <div>
                            <p className="text-slate-500 text-sm font-semibold mb-1">BÀI ĐĂNG HOẠT ĐỘNG</p>
                            <h3 className="text-3xl font-bold text-slate-800">{stats.postCount}</h3>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30">
                            <i className="fas fa-box-open text-xl"></i>
                        </div>
                    </div>
                </div>

                {/* Pending Posts Card */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-shadow">
                    <div className="absolute -right-6 -top-6 w-24 h-24 bg-amber-50 rounded-full group-hover:scale-110 transition-transform duration-500"></div>
                    <div className="relative z-10 flex items-start justify-between">
                        <div>
                            <p className="text-slate-500 text-sm font-semibold mb-1">BÀI CHỜ DUYỆT</p>
                            <h3 className="text-3xl font-bold text-slate-800">{stats.pendingCount}</h3>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/30">
                            <i className="fas fa-clock text-xl"></i>
                        </div>
                    </div>
                </div>

                {/* Revenue Card */}
                <div className="bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl p-6 shadow-lg shadow-orange-500/20 relative overflow-hidden group hover:shadow-orange-500/30 transition-shadow">
                    <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/10 rounded-full group-hover:scale-110 transition-transform duration-500"></div>
                    <div className="relative z-10 flex items-start justify-between">
                        <div>
                            <p className="text-orange-50 text-sm font-semibold mb-1 opacity-90">DOANH THU HAIPAY</p>
                            <h3 className="text-3xl font-bold text-white">{stats.revenue.toLocaleString('vi-VN')} đ</h3>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm text-white flex items-center justify-center">
                            <i className="fas fa-wallet text-xl"></i>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Quick Actions / Placeholders for charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-6 shadow-sm min-h-[300px] flex items-center justify-center">
                    <p className="text-slate-400 font-medium">Biểu đồ doanh thu sẽ được hiển thị ở đây</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm min-h-[300px]">
                    <h3 className="font-bold text-slate-800 mb-4">Hoạt động gần đây</h3>
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                            <p className="text-sm text-slate-600 flex-1">Người dùng mới đăng ký</p>
                            <span className="text-xs text-slate-400">Vừa xong</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                            <p className="text-sm text-slate-600 flex-1">Đơn hàng #1234 hoàn tất</p>
                            <span className="text-xs text-slate-400">5 phút trước</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                            <p className="text-sm text-slate-600 flex-1">Có 3 bài đăng chờ duyệt</p>
                            <span className="text-xs text-slate-400">10 phút trước</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
