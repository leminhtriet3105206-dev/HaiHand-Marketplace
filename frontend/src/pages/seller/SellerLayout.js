import React, { useMemo, useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const SellerLayout = () => {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    const shop = useMemo(() => {
        return user?.shopInfo || {};
    }, [user]);

    const navItems = [
        { path: '/seller-channel', icon: 'fas fa-chart-pie', label: 'Tổng quan Shop', end: true },
        { path: '/seller-channel/products', icon: 'fas fa-box-open', label: 'Quản lý sản phẩm' },
        { path: '/seller-channel/products/create', icon: 'fas fa-plus-circle', label: 'Đăng sản phẩm' },
        { path: '/seller-channel/orders', icon: 'fas fa-shipping-fast', label: 'Quản lý đơn hàng' },
        { path: '/seller-channel/settings', icon: 'fas fa-store-alt', label: 'Hồ sơ & Cài đặt Shop' },
    ];

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="flex h-screen bg-[#F8FAFC] font-sans overflow-hidden">
            {/* Sidebar */}
            <aside className={`relative flex flex-col bg-white border-r border-slate-200 shadow-sm transition-all duration-300 ease-in-out z-40 ${isSidebarOpen ? 'w-64' : 'w-20'}`}>
                {/* Brand / Logo */}
                <div className="flex items-center justify-between h-20 px-6 border-b border-slate-100">
                    <div className={`flex items-center gap-3 overflow-hidden transition-all duration-300 ${isSidebarOpen ? 'w-full opacity-100' : 'w-0 opacity-0'}`}>
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 shadow-md shadow-orange-500/20 flex items-center justify-center shrink-0 text-white font-black text-lg">
                            <i className="fas fa-store"></i>
                        </div>
                        <div className="leading-tight">
                            <span className="font-extrabold text-base text-slate-800 tracking-tight block">Kênh Người Bán</span>
                            <span className="text-[11px] font-bold text-orange-600 uppercase tracking-wider">HaiHand B2C</span>
                        </div>
                    </div>
                    <button 
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        className="p-2 rounded-lg text-slate-400 hover:text-orange-500 hover:bg-orange-50 transition-colors shrink-0"
                        title={isSidebarOpen ? "Thu gọn" : "Mở rộng"}
                    >
                        <i className={`fas fa-bars ${!isSidebarOpen ? 'mx-auto' : ''}`}></i>
                    </button>
                </div>

                {/* Shop Quick Info Banner */}
                {isSidebarOpen && (
                    <div className="p-4 mx-3 my-3 bg-gradient-to-br from-orange-50 to-amber-50/50 rounded-2xl border border-orange-100/80 flex items-center gap-3">
                        <img 
                            src={shop.avatar || user?.avatar || "https://ui-avatars.com/api/?name=" + encodeURIComponent(shop.shopName || user?.name || "Shop") + "&background=EA580C&color=fff"} 
                            alt="Shop Avatar" 
                            className="w-11 h-11 rounded-xl object-cover border border-orange-200 shadow-xs shrink-0" 
                        />
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-800 truncate">{shop.shopName || user?.name || "Shop của tôi"}</p>
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full mt-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                Seller Đã Duyệt
                            </span>
                        </div>
                    </div>
                )}

                {/* Navigation items */}
                <nav className="flex-1 py-3 px-3 space-y-1.5 overflow-y-auto custom-scrollbar">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.end}
                            className={({ isActive }) => `flex items-center px-3.5 py-3 rounded-xl font-bold text-sm transition-all duration-200 group relative ${
                                isActive 
                                    ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/25' 
                                    : 'text-slate-600 hover:bg-slate-100 hover:text-orange-600'
                            }`}
                        >
                            <i className={`${item.icon} text-base ${isSidebarOpen ? 'mr-3' : 'mx-auto'} transition-transform group-hover:scale-110`}></i>
                            <span className={`whitespace-nowrap transition-all duration-200 ${isSidebarOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 absolute'}`}>
                                {item.label}
                            </span>
                        </NavLink>
                    ))}
                </nav>

                {/* Back to buyer store & logout */}
                <div className="p-3 border-t border-slate-100 space-y-1">
                    <Link
                        to="/"
                        className={`flex items-center px-3 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-100 transition-colors ${!isSidebarOpen ? 'justify-center' : ''}`}
                    >
                        <i className="fas fa-shopping-bag mr-2.5 text-slate-400"></i>
                        {isSidebarOpen && <span>Về Sàn Mua Sắm</span>}
                    </Link>
                    <button
                        onClick={handleLogout}
                        className={`w-full flex items-center px-3 py-2.5 rounded-xl font-bold text-xs text-red-600 hover:bg-red-50 transition-colors ${!isSidebarOpen ? 'justify-center' : ''}`}
                    >
                        <i className="fas fa-sign-out-alt mr-2.5"></i>
                        {isSidebarOpen && <span>Đăng xuất</span>}
                    </button>
                </div>
            </aside>

            {/* Main Area */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Topbar */}
                <header className="h-20 bg-white border-b border-slate-200/80 sticky top-0 z-30 flex items-center justify-between px-8 shadow-xs">
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider hidden sm:inline">HaiHand B2C Seller Hub</span>
                        <span className="hidden sm:inline text-slate-300">/</span>
                        <h2 className="text-base font-extrabold text-slate-800">
                            {shop.shopName || user?.name || "Kênh Bán Hàng"}
                        </h2>
                    </div>

                    <div className="flex items-center gap-4">
                        <Link 
                            to="/seller-channel/products/create"
                            className="hidden sm:inline-flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold shadow-sm shadow-orange-500/20 transition-all hover:scale-102"
                        >
                            <i className="fas fa-plus"></i>
                            Đăng sản phẩm mới
                        </Link>

                        <Link
                            to="/haipay/dashboard"
                            className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 hover:bg-amber-100/80 border border-amber-200/80 rounded-xl transition-all"
                            title="Ví HaiPay của bạn"
                        >
                            <i className="fas fa-wallet text-amber-600 text-sm"></i>
                            <div className="text-left hidden md:block">
                                <span className="text-[10px] text-amber-700 block font-bold leading-none">Số dư ví</span>
                                <span className="text-xs font-black text-amber-900 leading-none">
                                    {(user?.walletBalance || 0).toLocaleString('vi-VN')}đ
                                </span>
                            </div>
                        </Link>

                        <Link to="/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                            <img 
                                src={user?.avatar || "https://ui-avatars.com/api/?name=" + encodeURIComponent(user?.name || "U") + "&background=f97316&color=fff"} 
                                alt={user?.name} 
                                className="w-9 h-9 rounded-full object-cover border-2 border-slate-100 shadow-xs" 
                            />
                        </Link>
                    </div>
                </header>

                {/* Page Content */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8">
                    <div className="max-w-7xl mx-auto">
                        <Outlet />
                    </div>
                </div>
            </main>
        </div>
    );
};

export default SellerLayout;
