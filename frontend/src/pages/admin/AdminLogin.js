import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useToast } from '../../components/Toast';

const AdminLogin = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    
    const navigate = useNavigate();
    const toast = useToast();
    
    const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await axios.post(`${API_URL}/api/admin/login`, { username, password });
            if (res.data.token && res.data.user) {
                localStorage.setItem('adminToken', res.data.token);
                localStorage.setItem('user', JSON.stringify(res.data.user));
                toast.success('Đăng nhập Admin thành công!');
                navigate('/admin');
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Lỗi đăng nhập Admin!');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 relative overflow-hidden font-sans">
            {/* Background elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-gradient-to-br from-orange-400 to-amber-300 opacity-20 blur-3xl mix-blend-multiply animate-pulse"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-gradient-to-tl from-blue-400 to-emerald-300 opacity-20 blur-3xl mix-blend-multiply animate-pulse" style={{ animationDelay: '2s' }}></div>

            <div className="relative z-10 w-full max-w-md p-8 bg-white/80 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/50 animate-fade-in-up">
                <div className="text-center mb-10">
                    <div className="w-16 h-16 mx-auto bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl shadow-lg shadow-orange-500/30 flex items-center justify-center mb-6 transform rotate-3 hover:rotate-0 transition-transform duration-300">
                        <i className="fas fa-bolt text-white text-3xl"></i>
                    </div>
                    <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">HaiHand Admin</h2>
                    <p className="text-slate-500 font-medium mt-2">Đăng nhập vào hệ thống quản trị</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">Tên đăng nhập</label>
                        <div className="relative">
                            <i className="fas fa-user absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                            <input 
                                type="text" 
                                placeholder="Nhập tên đăng nhập"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full pl-11 pr-4 py-3.5 bg-slate-50/50 border border-slate-200 rounded-xl outline-none focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-500/10 transition-all font-medium text-slate-700"
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">Mật khẩu</label>
                        <div className="relative">
                            <i className="fas fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                            <input 
                                type="password" 
                                placeholder="Nhập mật khẩu"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-11 pr-4 py-3.5 bg-slate-50/50 border border-slate-200 rounded-xl outline-none focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-500/10 transition-all font-medium text-slate-700"
                                required
                            />
                        </div>
                    </div>

                    <button 
                        type="submit" 
                        disabled={loading}
                        className="w-full py-4 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 transition-all duration-300 transform hover:-translate-y-1 flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
                    >
                        {loading ? (
                            <>
                                <i className="fas fa-circle-notch animate-spin"></i>
                                Đang xác thực...
                            </>
                        ) : (
                            <>
                                Đăng nhập <i className="fas fa-arrow-right text-sm"></i>
                            </>
                        )}
                    </button>
                </form>
                
                <div className="mt-8 text-center text-sm text-slate-500 font-medium">
                    &copy; 2026 HaiHand Marketplace.
                </div>
            </div>
        </div>
    );
};

export default AdminLogin;
