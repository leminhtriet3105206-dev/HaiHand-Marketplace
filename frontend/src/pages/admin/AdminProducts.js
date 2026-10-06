import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/ConfirmModal';

const AdminProducts = () => {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    
    const toast = useToast();
    const confirm = useConfirm();
    const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';
    const token = localStorage.getItem('adminToken');

    const fetchPosts = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}/api/admin/posts`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { search, status: statusFilter, page, limit: 10 }
            });
            setPosts(res.data.posts);
            setTotalPages(res.data.totalPages);
        } catch (error) {
            toast.error('Lỗi khi tải danh sách bài đăng!');
        } finally {
            setLoading(false);
        }
    }, [API_URL, token, search, statusFilter, page, toast]);

    useEffect(() => {
        fetchPosts();
    }, [fetchPosts]);

    const handleDelete = async (post) => {
        const isConfirmed = await confirm({
            title: `Xác nhận xóa bài đăng`,
            message: `Bạn có chắc chắn muốn xóa bài đăng "${post.title}" không? Hành động này không thể hoàn tác.`,
            confirmText: 'Xóa vĩnh viễn',
            cancelText: 'Hủy'
        });

        if (isConfirmed) {
            try {
                const res = await axios.delete(`${API_URL}/api/admin/posts/${post._id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                toast.success(res.data.message);
                fetchPosts();
            } catch (error) {
                toast.error(error.response?.data?.message || `Lỗi khi xóa bài đăng!`);
            }
        }
    };

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Quản lý Bài đăng</h1>
                    <p className="text-sm text-slate-500 mt-1">Kiểm duyệt và quản lý các sản phẩm trên chợ</p>
                </div>
            </div>
            
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row gap-4 justify-between bg-slate-50/50">
                    <div className="relative w-full max-w-md">
                        <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                        <input 
                            type="text" 
                            placeholder="Tìm kiếm theo tiêu đề..." 
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
                        <option value="Active">Đang bán (Active)</option>
                        <option value="Pending">Chờ duyệt (Pending)</option>
                        <option value="SOLD">Đã bán (SOLD)</option>
                    </select>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left whitespace-nowrap">
                        <thead className="bg-slate-50/80 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                            <tr>
                                <th className="px-6 py-4">Sản phẩm</th>
                                <th className="px-6 py-4">Người bán</th>
                                <th className="px-6 py-4">Giá</th>
                                <th className="px-6 py-4 text-center">Trạng thái</th>
                                <th className="px-6 py-4 text-right">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm font-medium text-slate-700">
                            {loading ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-12 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-8 h-8 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin"></div>
                                            <span className="text-slate-500">Đang tải dữ liệu...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : posts.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-12 text-center text-slate-500 bg-slate-50/50">
                                        <i className="fas fa-box-open text-4xl mb-3 text-slate-300"></i>
                                        <p>Không tìm thấy bài đăng nào.</p>
                                    </td>
                                </tr>
                            ) : (
                                posts.map(post => (
                                    <tr key={post._id} className="hover:bg-slate-50 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-14 h-14 rounded-xl overflow-hidden border border-slate-200 shadow-sm shrink-0 bg-slate-100">
                                                    <img src={post.images?.[0] ? `${API_URL}${post.images[0]}` : '/dummy.jpg'} alt="Thumbnail" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                                                </div>
                                                <div className="max-w-[250px]">
                                                    <p className="text-slate-800 font-bold group-hover:text-orange-600 transition-colors truncate" title={post.title}>{post.title}</p>
                                                    <p className="text-slate-400 text-xs mt-0.5">{new Date(post.createdAt).toLocaleDateString('vi-VN')}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-slate-800 font-bold">{post.author?.name || 'Vô danh'}</span>
                                                <span className="text-slate-400 text-xs">@{post.author?.username || 'user'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-orange-600 font-bold bg-orange-50 px-3 py-1 rounded-lg border border-orange-100">
                                                {post.price?.toLocaleString('vi-VN')} đ
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`inline-flex items-center justify-center min-w-[100px] px-3 py-1 rounded-full text-xs font-bold border 
                                                ${post.status === 'Active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                                  post.status === 'Pending' ? 'bg-amber-50 text-amber-600 border-amber-100' : 
                                                  'bg-slate-100 text-slate-500 border-slate-200'}`}
                                            >
                                                {post.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <a 
                                                    href={`/post/${post._id}`} 
                                                    target="_blank" 
                                                    rel="noreferrer" 
                                                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-500 hover:text-white transition-all shadow-sm"
                                                    title="Xem chi tiết"
                                                >
                                                    <i className="fas fa-eye text-sm"></i>
                                                </a>
                                                <button 
                                                    onClick={() => handleDelete(post)}
                                                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-600 hover:bg-red-500 hover:text-white transition-all shadow-sm"
                                                    title="Xóa bài đăng"
                                                >
                                                    <i className="fas fa-trash-alt text-sm"></i>
                                                </button>
                                            </div>
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

export default AdminProducts;
