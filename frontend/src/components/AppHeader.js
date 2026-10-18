import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from './Button';
import { useToast } from './Toast';
import axios from 'axios';

export const AppHeader = ({ onSearch }) => {
  const [keyword, setKeyword] = useState('');
  const navigate = useNavigate();
  const toast = useToast();
  const [cartCount, setCartCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  const user = JSON.parse(localStorage.getItem('user'));
  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

  const fetchCartCount = async () => {
    if (user) {
      try {
        const { data } = await axios.get(`${API_URL}/api/users/cart/${user._id}`);
        setCartCount(data.length);
      } catch (err) {
        console.error("Lỗi lấy số lượng giỏ hàng:", err);
      }
    }
  };

  const fetchUnreadCount = async () => {
    if (user) {
      try {
        const { data } = await axios.get(`${API_URL}/api/messages/unread-count/${user._id}`);
        setUnreadCount(data.count || 0);
      } catch (err) {
        console.error("Lỗi lấy số lượng tin nhắn chưa đọc:", err);
      }
    }
  };

  useEffect(() => {
    fetchCartCount();
    fetchUnreadCount();
    window.addEventListener('cartUpdated', fetchCartCount);
    window.addEventListener('userUpdated', fetchCartCount); // login/logout updates
    window.addEventListener('messageUpdated', fetchUnreadCount);
    return () => {
      window.removeEventListener('cartUpdated', fetchCartCount);
      window.removeEventListener('userUpdated', fetchCartCount);
      window.removeEventListener('messageUpdated', fetchUnreadCount);
    };
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (onSearch) {
      onSearch(keyword);
    }
  };

  const handleCreatePostClick = () => {
    if (!user) {
      toast.warning('Yêu cầu đăng nhập', 'Vui lòng đăng nhập để đăng tin bán hàng!');
      navigate('/login');
    } else {
      navigate('/create-post');
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-[#FACC15] shadow-sm">
      <div className="max-w-[1200px] mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="HaiHand" className="h-10 w-auto object-contain" />
        </Link>
        
        <div className="flex-1 max-w-2xl mx-8 hidden md:block">
          <form className="relative" onSubmit={handleSearchSubmit}>
            <input 
              type="text" 
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Tìm kiếm đồ cũ, điện tử, thời trang..." 
              className="w-full h-10 pl-4 pr-12 rounded-lg bg-white border border-transparent focus:border-[#EAB308] focus:outline-none text-sm"
            />
            <button type="submit" aria-label="Tìm kiếm" className="absolute right-1 top-1 bottom-1 w-10 flex items-center justify-center bg-[#1C1917] text-white rounded-md hover:bg-stone-800 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </form>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <nav className="hidden lg:flex items-center gap-5 text-sm font-medium text-[#1C1917]">
            <Link to="/" className="hover:underline">Trang chủ</Link>
            <Link to="/products" className="hover:underline">Khám phá</Link>
            {user && (
              <Link to="/chat" className="relative hover:underline">
                Tin nhắn
                {unreadCount > 0 && <span className="absolute -top-1 -right-2 w-2 h-2 bg-red-500 rounded-full border border-[#FACC15]"></span>}
              </Link>
            )}
          </nav>
          
          <div className="flex items-center gap-1">
            {user ? (
              <>
                <Link to="/haipay" className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 mr-1 rounded-full bg-white/50 hover:bg-white transition-colors font-bold text-sm text-[#1C1917] border border-stone-200/50 shadow-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#EA580C]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                  Ví HaiPay
                </Link>
                <button aria-label="Thông báo" className="p-2 relative hover:bg-black/5 rounded-full transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-[#1C1917]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </button>
                <button onClick={() => navigate('/cart')} aria-label="Giỏ hàng" className="p-2 relative hover:bg-black/5 rounded-full transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-[#1C1917]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                  {cartCount > 0 && <span className="absolute top-1 right-1 flex items-center justify-center w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full border border-[#FACC15]">{cartCount}</span>}
                </button>
                <Link to="/profile" className="hidden sm:flex items-center gap-2 ml-2 pl-2 border-l border-black/10 hover:opacity-80 transition-opacity">
                  <img src={user.avatar ? (user.avatar.startsWith('http') ? user.avatar : `${API_URL}/${user.avatar.replace(/\\/g, '/')}`) : "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png"} alt={user.name} className="w-8 h-8 rounded-full border border-white object-cover" />
                  <span className="text-sm font-semibold text-[#1C1917]">{user.name}</span>
                </Link>
              </>
            ) : (
              <div className="flex items-center gap-3 ml-2 border-l border-black/10 pl-2">
                <Link to="/login" className="text-sm font-semibold text-[#1C1917] hover:underline">Đăng nhập</Link>
                <span className="text-black/20">|</span>
                <Link to="/register" className="text-sm font-semibold text-[#1C1917] hover:underline">Đăng ký</Link>
              </div>
            )}
          </div>
          
          <Button variant="dark" className="hidden sm:flex ml-1 py-1.5 px-3" onClick={handleCreatePostClick}>
            + Đăng tin
          </Button>
        </div>
      </div>
    </header>
  );
};
