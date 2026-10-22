import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axiosClient from '../../api/axiosClient';
import { useToast } from '../../components/Toast';

const SellerDashboard = () => {
    const toast = useToast();
    const [stats, setStats] = useState(null);
    const [shop, setShop] = useState(null);
    const [recentOrders, setRecentOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDashboardData = async () => {
            setLoading(true);
            try {
                const [dashRes, ordersRes] = await Promise.all([
                    axiosClient.get('/api/seller/dashboard'),
                    axiosClient.get('/api/seller/orders')
                ]);
                setStats(dashRes.data.stats || {});
                setShop(dashRes.data.shop || {});
                setRecentOrders((ordersRes.data || []).slice(0, 5));
            } catch (error) {
                console.error("Lỗi tải dashboard Seller", error);
                toast.error('Không thể tải dữ liệu thống kê Kênh Người Bán');
            } finally {
                setLoading(false);
            }
        };

        fetchDashboardData();
    }, [toast]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-24 space-y-4">
                <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin"></div>
                <p className="text-sm font-bold text-slate-500">Đang tải dữ liệu Kênh Người Bán...</p>
            </div>
        );
    }

    const formatCurrency = (val) => Number(val || 0).toLocaleString('vi-VN') + 'đ';

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Header / Welcome */}
            <div className="bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-orange-500/15 relative overflow-hidden">
                <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 pointer-events-none flex items-center justify-center text-9xl">
                    <i className="fas fa-store"></i>
                </div>
                <div className="relative z-10 max-w-2xl">
                    <span className="inline-block px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-black uppercase tracking-wider mb-2">
                        Trung tâm vận hành B2C
                    </span>
                    <h1 className="text-2xl sm:text-3xl font-black">
                        Xin chào, {shop?.shopName || "Quý đối tác"}! 👋
                    </h1>
                    <p className="text-white/90 text-sm mt-2 font-medium">
                        Theo dõi hiệu suất kinh doanh, quản lý kho hàng và xử lý đơn hàng B2C nhanh chóng ngay hôm nay.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-3">
                        <Link 
                            to="/seller-channel/products/create"
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-orange-600 rounded-xl text-xs font-black shadow-md hover:bg-orange-50 transition-all"
                        >
                            <i className="fas fa-plus"></i> Đăng sản phẩm mới
                        </Link>
                        <Link 
                            to="/seller-channel/orders"
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-black/20 hover:bg-black/30 backdrop-blur-md text-white rounded-xl text-xs font-bold transition-all"
                        >
                            <i className="fas fa-box-check"></i> Xử lý đơn hàng ({stats?.pendingOrders || 0})
                        </Link>
                    </div>
                </div>
            </div>

            {/* Metric KPI Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* Revenue */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl shrink-0">
                        <i className="fas fa-coins"></i>
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Doanh thu thực nhận</p>
                        <h3 className="text-xl font-black text-slate-800 mt-0.5">{formatCurrency(stats?.revenue)}</h3>
                        <p className="text-[11px] text-emerald-600 font-bold mt-0.5">
                            <i className="fas fa-check-circle mr-1"></i>Đã trừ 5% phí sàn
                        </p>
                    </div>
                </div>

                {/* Pending Orders */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl shrink-0">
                        <i className="fas fa-hourglass-half"></i>
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Chờ xác nhận</p>
                        <h3 className="text-xl font-black text-slate-800 mt-0.5">{stats?.pendingOrders || 0} đơn</h3>
                        <p className="text-[11px] text-amber-600 font-bold mt-0.5">Cần đóng gói & giao</p>
                    </div>
                </div>

                {/* Active Deliveries */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl shrink-0">
                        <i className="fas fa-truck-moving"></i>
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Đang giao / Xử lý</p>
                        <h3 className="text-xl font-black text-slate-800 mt-0.5">{stats?.openOrders || 0} đơn</h3>
                        <p className="text-[11px] text-blue-600 font-bold mt-0.5">Đang trên đường giao</p>
                    </div>
                </div>

                {/* Products */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center text-xl shrink-0">
                        <i className="fas fa-boxes"></i>
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Sản phẩm Shop</p>
                        <h3 className="text-xl font-black text-slate-800 mt-0.5">{stats?.activeProducts || 0} / {stats?.productCount || 0}</h3>
                        <p className="text-[11px] text-purple-600 font-bold mt-0.5">Đang kích hoạt bán</p>
                    </div>
                </div>
            </div>

            {/* Wallet Balances card */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
                    <div>
                        <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                            <i className="fas fa-wallet text-orange-500"></i>
                            Số dư & Dòng tiền Shop (HaiPay)
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">Quản lý dòng tiền bán hàng an toàn thông qua bảo chứng HaiPay</p>
                    </div>
                    <Link
                        to="/haipay/dashboard"
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all"
                    >
                        Chi tiết ví HaiPay <i className="fas fa-chevron-right ml-1 text-[10px]"></i>
                    </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/60">
                        <span className="text-xs font-bold text-slate-500">Số dư khả dụng</span>
                        <p className="text-2xl font-black text-slate-800 mt-1">{formatCurrency(stats?.walletBalance)}</p>
                        <p className="text-[11px] text-slate-400 mt-1">Có thể rút về tài khoản ngân hàng hoặc mua sắm</p>
                    </div>
                    <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200/60">
                        <span className="text-xs font-bold text-amber-700">Đang ký quỹ (Tạm giữ)</span>
                        <p className="text-2xl font-black text-amber-900 mt-1">{formatCurrency(stats?.pendingBalance)}</p>
                        <p className="text-[11px] text-amber-700 mt-1">Sẽ tự động cộng vào số dư khả dụng khi người mua nhận hàng thành công</p>
                    </div>
                </div>
            </div>

            {/* Recent Orders Table */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <h3 className="text-base font-extrabold text-slate-800">Đơn hàng mới nhất</h3>
                        <p className="text-xs text-slate-400 mt-0.5">Xử lý ngay để đảm bảo tốc độ vận chuyển chuẩn B2C</p>
                    </div>
                    <Link 
                        to="/seller-channel/orders"
                        className="text-xs font-bold text-orange-600 hover:text-orange-700"
                    >
                        Xem tất cả ({recentOrders.length}) →
                    </Link>
                </div>

                {recentOrders.length === 0 ? (
                    <div className="p-12 text-center">
                        <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3 text-xl">
                            <i className="fas fa-inbox"></i>
                        </div>
                        <p className="text-sm font-bold text-slate-700">Chưa có đơn hàng nào</p>
                        <p className="text-xs text-slate-400 mt-1">Các đơn hàng mới của Shop sẽ xuất hiện tại đây.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                                <tr>
                                    <th className="py-3 px-6">Mã đơn</th>
                                    <th className="py-3 px-6">Người mua</th>
                                    <th className="py-3 px-6">Tổng giá trị</th>
                                    <th className="py-3 px-6">Trạng thái</th>
                                    <th className="py-3 px-6 text-right">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {recentOrders.map((order) => {
                                    const st = order.canonicalStatus || order.status;
                                    let badgeColor = 'bg-slate-100 text-slate-700';
                                    if (st === 'Pending') badgeColor = 'bg-amber-100 text-amber-700';
                                    if (st === 'Processing') badgeColor = 'bg-blue-100 text-blue-700';
                                    if (st === 'Shipped') badgeColor = 'bg-indigo-100 text-indigo-700';
                                    if (st === 'Delivered' || st === 'Completed') badgeColor = 'bg-emerald-100 text-emerald-700';
                                    if (st === 'Cancelled') badgeColor = 'bg-rose-100 text-rose-700';

                                    return (
                                        <tr key={order._id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="py-4 px-6 font-mono font-bold text-xs text-slate-700">
                                                #{order._id.slice(-6).toUpperCase()}
                                            </td>
                                            <td className="py-4 px-6">
                                                <p className="font-bold text-slate-800">{order.buyer?.name || order.shippingAddress?.fullName || 'Khách hàng'}</p>
                                                <p className="text-[11px] text-slate-400">{order.shippingAddress?.phone || order.buyer?.phone || ''}</p>
                                            </td>
                                            <td className="py-4 px-6 font-bold text-slate-800">
                                                {formatCurrency(order.totalPrice)}
                                            </td>
                                            <td className="py-4 px-6">
                                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${badgeColor}`}>
                                                    {st}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6 text-right">
                                                <Link 
                                                    to="/seller-channel/orders"
                                                    className="px-3 py-1.5 bg-slate-100 hover:bg-orange-50 hover:text-orange-600 rounded-lg text-xs font-bold transition-colors"
                                                >
                                                    Chi tiết
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SellerDashboard;
