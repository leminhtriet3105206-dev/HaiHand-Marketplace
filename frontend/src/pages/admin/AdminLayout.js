import React, { useMemo, useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useToast } from '../../components/Toast';

const AdminLayout = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    const user = useMemo(() => {
        const stored = localStorage.getItem('user');
        return stored && stored !== "undefined" ? JSON.parse(stored) : null;
    }, []);

    // Axios Interceptor for 401/403
    useEffect(() => {
        const interceptor = axios.interceptors.response.use(
            (response) => response,
            (error) => {
                if (error.response && (error.response.status === 401 || error.response.status === 403)) {
                    toast.error('Phiên đăng nhập đã hết hạn hoặc không có quyền truy cập!');
                    localStorage.removeItem('adminToken');
                    localStorage.removeItem('user');
                    navigate('/admin/login');
                }
                return Promise.reject(error);
            }
        );
        return () => axios.interceptors.response.eject(interceptor);
    }, [navigate, toast]);

    const handleLogout = () => {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('user');
        navigate('/admin/login');
    };

    const navItems = [
        { path: '/admin', icon: 'fas fa-chart-pie', label: 'Dashboard', end: true },
        { path: '/admin/users', icon: 'fas fa-users', label: 'Quản lý Users' },
        { path: '/admin/products', icon: 'fas fa-box-open', label: 'Bài đăng' },
        { path: '/admin/orders', icon: 'fas fa-shopping-bag', label: 'Đơn hàng' },
        { path: '/admin/reports', icon: 'fas fa-shield-alt', label: 'Tố cáo & Báo cáo' }
    ];

    return (
        <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
            {/* Sidebar */}
            <aside 
                className={`relative flex flex-col bg-white/80 backdrop-blur-xl border-r border-slate-200 shadow-xl transition-all duration-300 ease-in-out z-50 ${isSidebarOpen ? 'w-64' : 'w-20'}`}
            >
                {/* Logo Area */}
                <div className="flex items-center justify-between h-20 px-6 border-b border-slate-100/50">
                    <div className={`flex items-center gap-3 overflow-hidden transition-all duration-300 ${isSidebarOpen ? 'w-full opacity-100' : 'w-0 opacity-0'}`}>
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 shadow-lg shadow-orange-500/30 flex items-center justify-center shrink-0">
                            <i className="fas fa-bolt text-white text-sm"></i>
                        </div>
                        <span className="font-extrabold text-xl text-slate-800 tracking-tight whitespace-nowrap">HaiHand</span>
                    </div>
                    <button 
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        className="p-2 rounded-lg text-slate-400 hover:text-orange-500 hover:bg-orange-50 transition-colors shrink-0"
                    >
                        <i className={`fas fa-bars ${!isSidebarOpen ? 'mx-auto' : ''}`}></i>
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 py-6 px-3 space-y-2 overflow-y-auto custom-scrollbar">
                    {navItems.map((item) => {
                        const isActive = item.end ? location.pathname === item.path : location.pathname.startsWith(item.path);
                        return (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                end={item.end}
                                className={`flex items-center px-3 py-3.5 rounded-xl transition-all duration-300 group relative
                                    ${isActive 
                                        ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/25' 
                                        : 'text-slate-500 hover:bg-slate-100/80 hover:text-orange-600'
                                    }`}
                            >
                                <i className={`${item.icon} text-lg ${isSidebarOpen ? 'mr-3' : 'mx-auto'} transition-transform duration-300 group-hover:scale-110`}></i>
                                <span className={`font-semibold whitespace-nowrap transition-all duration-300 ${isSidebarOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 absolute'}`}>
                                    {item.label}
                                </span>
                            </NavLink>
                        );
                    })}
                </nav>

                {/* Bottom Profile */}
                <div className="p-4 border-t border-slate-100">
                    <div className={`flex items-center gap-3 transition-all duration-300 ${!isSidebarOpen && 'justify-center'}`}>
                        <div className="w-10 h-10 rounded-full bg-slate-200 border-2 border-white shadow-sm overflow-hidden shrink-0">
                            <img src={user?.avatar || "https://ui-avatars.com/api/?name=Admin&background=f97316&color=fff"} alt="Admin" className="w-full h-full object-cover" />
                        </div>
                        {isSidebarOpen && (
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-800 truncate">{user?.name || 'Admin'}</p>
                                <p className="text-xs text-slate-500 font-medium truncate">Quản trị viên</p>
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden bg-[#F8FAFC]">
                {/* Top Header */}
                <header className="h-20 bg-white/60 backdrop-blur-md border-b border-slate-200/50 sticky top-0 z-40 flex items-center justify-between px-8 shadow-sm">
                    <div className="flex items-center text-slate-400">
                        <i className="fas fa-search mr-3"></i>
                        <input type="text" placeholder="Tìm kiếm nhanh..." className="bg-transparent border-none outline-none text-sm font-medium text-slate-600 placeholder-slate-400 w-64" />
                    </div>
                    <div className="flex items-center gap-5">
                        <button className="relative p-2 text-slate-400 hover:text-orange-500 transition-colors">
                            <i className="far fa-bell text-xl"></i>
                            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
                            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
                        </button>
                        <button 
                            onClick={handleLogout}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 text-red-600 font-semibold text-sm hover:bg-red-100 transition-all duration-300"
                        >
                            <i className="fas fa-sign-out-alt"></i>
                            Đăng xuất
                        </button>
                    </div>
                </header>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-8">
                    {/* The <Outlet /> renders the child route components with a smooth fade-in animation */}
                    <div className="animate-fade-in-up h-full">
                        <Outlet />
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AdminLayout;
