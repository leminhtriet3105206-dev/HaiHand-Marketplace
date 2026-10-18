import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/ConfirmModal';

const AdminUsers = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    
    const toast = useToast();
    const confirm = useConfirm();
    const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';
    const token = localStorage.getItem('adminToken');

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}/api/admin/users`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { search, status: statusFilter, page, limit: 10 }
            });
            setUsers(res.data.users);
            setTotalPages(res.data.totalPages);
        } catch (error) {
            toast.error('Lỗi khi tải danh sách người dùng!');
        } finally {
            setLoading(false);
        }
    }, [API_URL, token, search, statusFilter, page, toast]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const toggleBan = async (user) => {
        const actionText = user.isBanned ? 'mở khóa' : 'khóa';
        const isConfirmed = await confirm({
            title: `Xác nhận ${actionText} tài khoản`,
            message: `Bạn có chắc chắn muốn ${actionText} tài khoản ${user.username} không?`,
            confirmText: 'Đồng ý',
            cancelText: 'Hủy'
        });

        if (isConfirmed) {
            try {
                const res = await axios.put(`${API_URL}/api/admin/users/${user._id}/ban`, {}, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                toast.success(res.data.message);
                fetchUsers();
            } catch (error) {
                toast.error(error.response?.data?.message || `Lỗi khi ${actionText} tài khoản!`);
            }
        }
    };

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Quản lý Người dùng</h1>
                    <p className="text-sm text-slate-500 mt-1">Quản lý tài khoản, trạng thái và số dư HaiPay</p>
                </div>
            </div>
            
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row gap-4 justify-between bg-slate-50/50">
                    <div className="relative w-full max-w-md">
                        <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                        <input 
                            type="text" 
                            placeholder="Tìm kiếm theo username..." 
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
                        <option value="active">Đang hoạt động</option>
                        <option value="banned">Đã bị khóa</option>
                    </select>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left whitespace-nowrap">
                        <thead className="bg-slate-50/80 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                            <tr>
                                <th className="px-6 py-4">Tài khoản</th>
                                <th className="px-6 py-4">Email</th>
                                <th className="px-6 py-4">SĐT</th>
                                <th className="px-6 py-4">Ví HaiPay</th>
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
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-12 text-center text-slate-500 bg-slate-50/50">
                                        <i className="fas fa-inbox text-4xl mb-3 text-slate-300"></i>
                                        <p>Không tìm thấy người dùng nào.</p>
                                    </td>
                                </tr>
                            ) : (
                                users.map(user => (
                                    <tr key={user._id} className="hover:bg-slate-50 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <img src={user.avatar || `https://ui-avatars.com/api/?name=${user.username}&background=f97316&color=fff`} alt="" className="w-10 h-10 rounded-full object-cover shadow-sm border border-slate-200" />
                                                <div>
                                                    <p className="text-slate-800 font-bold group-hover:text-orange-600 transition-colors">{user.name}</p>
                                                    <p className="text-slate-500 text-xs">@{user.username}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">{user.email}</td>
                                        <td className="px-6 py-4 text-slate-600">{user.phone || '--'}</td>
                                        <td className="px-6 py-4">
                                            <span className="text-orange-600 font-bold bg-orange-50 px-3 py-1 rounded-lg border border-orange-100">
                                                {(user.walletBalance || 0).toLocaleString('vi-VN')} đ
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${user.isBanned ? 'bg-red-50 text-red-600 border-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                                                <i className={`fas ${user.isBanned ? 'fa-lock' : 'fa-check-circle'}`}></i>
                                                {user.isBanned ? 'Đã khóa' : 'Hoạt động'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {user.role !== 'Admin' && (
                                                <button 
                                                    onClick={() => toggleBan(user)}
                                                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${
                                                        user.isBanned 
                                                        ? 'bg-emerald-500 text-white hover:bg-emerald-600 hover:shadow-emerald-500/30' 
                                                        : 'bg-red-500 text-white hover:bg-red-600 hover:shadow-red-500/30'
                                                    }`}
                                                >
                                                    {user.isBanned ? 'Mở khóa' : 'Khóa'}
                                                </button>
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

export default AdminUsers;
