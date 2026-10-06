import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/ConfirmModal';

const AdminOrders = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    
    const toast = useToast();
    const confirm = useConfirm();
    const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';
    const token = localStorage.getItem('adminToken');

    const fetchOrders = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}/api/admin/orders`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { search, status: statusFilter, page, limit: 10 }
            });
            setOrders(res.data.orders);
            setTotalPages(res.data.totalPages);
        } catch (error) {
            toast.error('Lỗi khi tải danh sách đơn hàng!');
        } finally {
            setLoading(false);
        }
    }, [API_URL, token, search, statusFilter, page, toast]);

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    const handleReleaseFunds = async (order) => {
        const isConfirmed = await confirm({
            title: `Giải ngân tiền cho người bán`,
            message: `Bạn xác nhận chuyển ${(order.totalPrice * 0.95).toLocaleString('vi-VN')} đ (Đã trừ 5% phí sàn) cho người bán "${order.seller?.username}"?`,
            confirmText: 'Giải ngân',
            cancelText: 'Hủy'
        });

        if (isConfirmed) {
            try {
                const res = await axios.post(`${API_URL}/api/admin/release-funds/${order._id}`, {}, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                toast.success(res.data.message || 'Đã giải ngân thành công!');
                fetchOrders();
            } catch (error) {
                toast.error(error.response?.data?.message || `Lỗi khi giải ngân!`);
            }
        }
    };

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Quản lý Đơn hàng</h1>
                    <p className="text-sm text-slate-500 mt-1">Kiểm soát đơn hàng, trạng thái và giải ngân HaiPay</p>
                </div>
            </div>
            
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row gap-4 justify-between bg-slate-50/50">
                    <div className="relative w-full max-w-md">
                        <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                        <input 
                            type="text" 
                            placeholder="Tìm kiếm mã đơn hàng..." 
                            className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all text-sm font-medium"
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        />
                    </div>
                    <select 
                        className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all text-sm font-medium min-w-[200px]"
                        value={statusFilter}
                        onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                    >
                        <option value="all">Tất cả trạng thái</option>
                        <option value="Chờ xác nhận">Chờ xác nhận</option>
                        <option value="Đang giao hàng">Đang giao hàng</option>
                        <option value="Đã giao thành công">Đã giao thành công</option>
                        <option value="Đã thanh toán (Admin giữ tiền)">Admin giữ tiền</option>
                        <option value="Đã hủy">Đã hủy</option>
                        <option value="Đã hoàn tiền">Đã hoàn tiền</option>
                    </select>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left whitespace-nowrap">
                        <thead className="bg-slate-50/80 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                            <tr>
                                <th className="px-6 py-4">Mã đơn</th>
                                <th className="px-6 py-4">Giao dịch giữa</th>
                                <th className="px-6 py-4 text-right">Tổng Tiền</th>
                                <th className="px-6 py-4 text-center">Thanh toán</th>
                                <th className="px-6 py-4 text-center">Trạng thái</th>
                                <th className="px-6 py-4 text-right">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm font-medium text-slate-700">
                            {loading ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-12 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-8 h-8 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin"></div>
                                            <span className="text-slate-500">Đang tải dữ liệu...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : orders.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-12 text-center text-slate-500 bg-slate-50/50">
                                        <i className="fas fa-receipt text-4xl mb-3 text-slate-300"></i>
                                        <p>Không tìm thấy đơn hàng nào.</p>
                                    </td>
                                </tr>
                            ) : (
                                orders.map(order => (
                                    <tr key={order._id} className="hover:bg-slate-50 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <i className="fas fa-hashtag text-slate-300"></i>
                                                <span className="text-slate-600 font-mono bg-slate-100 px-2 py-1 rounded-md">{order._id.substring(0, 8)}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-4">
                                                <div className="flex flex-col">
                                                    <span className="text-slate-400 text-xs uppercase">Bán bởi</span>
                                                    <span className="text-slate-800 font-bold">{order.seller?.name || order.seller?.username || 'N/A'}</span>
                                                </div>
                                                <i className="fas fa-arrow-right text-slate-300"></i>
                                                <div className="flex flex-col">
                                                    <span className="text-slate-400 text-xs uppercase">Mua bởi</span>
                                                    <span className="text-slate-800 font-bold">{order.buyer?.name || order.buyer?.username || 'N/A'}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-orange-600 font-bold text-base">
                                                {order.totalPrice?.toLocaleString('vi-VN')} đ
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border 
                                                ${(order.paymentMethod === 'VNPay' || order.paymentMethod === 'HaiPay') ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                                            >
                                                <i className={`fas ${(order.paymentMethod === 'VNPay' || order.paymentMethod === 'HaiPay') ? 'fa-credit-card' : 'fa-truck'}`}></i>
                                                {(order.paymentMethod === 'VNPay' || order.paymentMethod === 'HaiPay') ? 'Online' : 'COD'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`inline-flex items-center justify-center min-w-[120px] px-3 py-1 rounded-full text-xs font-bold border 
                                                ${order.status === 'Đã giao thành công' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                                  order.status.includes('hủy') || order.status.includes('hoàn') ? 'bg-red-50 text-red-600 border-red-100' :
                                                  order.status.includes('Admin giữ tiền') ? 'bg-purple-50 text-purple-600 border-purple-100' :
                                                  'bg-amber-50 text-amber-600 border-amber-100'}`}
                                            >
                                                {order.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {order.status === 'Đã giao thành công' && order.paymentMethod !== 'COD' && (
                                                <button 
                                                    onClick={() => handleReleaseFunds(order)}
                                                    className="px-4 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm bg-purple-500 text-white hover:bg-purple-600 hover:shadow-purple-500/30"
                                                >
                                                    <i className="fas fa-hand-holding-usd mr-1"></i> Giải ngân
                                                </button>
                                            )}
                                            {(order.status !== 'Đã giao thành công' || order.paymentMethod === 'COD') && (
                                                <span className="text-slate-300 text-xs italic">Không khả dụng</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                
                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/50">
                        <button 
                            disabled={page === 1} 
                            onClick={() => setPage(p => p - 1)}
                            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${page === 1 ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'}`}
                        >
                            <i className="fas fa-chevron-left mr-2 text-xs"></i> Trang trước
                        </button>
                        <div className="px-4 py-2 bg-slate-100 rounded-xl text-sm font-bold text-slate-600">
                            {page} <span className="text-slate-400 font-medium">/</span> {totalPages}
                        </div>
                        <button 
                            disabled={page === totalPages} 
                            onClick={() => setPage(p => p + 1)}
                            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${page === totalPages ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'}`}
                        >
                            Trang sau <i className="fas fa-chevron-right ml-2 text-xs"></i>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminOrders;
