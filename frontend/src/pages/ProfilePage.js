import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { AppHeader } from '../components/AppHeader';
import { AppFooter } from '../components/AppFooter';

export default function ProfilePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [myPosts, setMyPosts] = useState([]);
  const [myOrders, setMyOrders] = useState([]); 
  const [mySales, setMySales] = useState([]);   
  const [myReviews, setMyReviews] = useState([]); 
  const [avgRating, setAvgRating] = useState(0);  

  const [activeTab, setActiveTab] = useState('posts'); 
  const [postFilter, setPostFilter] = useState('all'); 
  const [loading, setLoading] = useState(true);

  // Edit forms (simple toggle for now)
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phone: '', address: '', cccd: '' });
  const [selectedImage, setSelectedImage] = useState(null);
  const fileInputRef = useRef(null);

  const API_URL = process.env.REACT_APP_API_URL || 'https://haihand-marketplace.onrender.com';

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const parsedUser = storedUser && storedUser !== "undefined" ? JSON.parse(storedUser) : null;
    
    if (!parsedUser) {
        navigate('/login');
        return;
    }
    const currentUser = parsedUser;

    setUser(currentUser);
    setEditForm({ name: currentUser.name || '', phone: currentUser.phone || '', address: currentUser.address || '', cccd: currentUser.cccd || '' });

    const fetchData = async () => {
        setLoading(true);
        try {
            const [postsRes, ordersRes, salesRes, profileRes] = await Promise.all([
                axios.get(`${API_URL}/api/posts/user/${currentUser._id}`).catch(() => ({data: []})),
                axios.get(`${API_URL}/api/users/${currentUser._id}/orders`).catch(() => ({data: []})),
                axios.get(`${API_URL}/api/orders/seller/${currentUser._id}`).catch(() => ({data: []})),
                axios.get(`${API_URL}/api/users/public-profile/${currentUser._id}`).catch(() => ({data: {reviews: [], avgRating: 5}}))
            ]);

            setMyPosts(postsRes.data);
            setMyOrders(ordersRes.data);
            setMySales(salesRes.data);
            setMyReviews(profileRes.data.reviews || []);
            setAvgRating(profileRes.data.avgRating || 0);
        } catch (error) {
            console.error("Lỗi tải thông tin Profile", error);
        } finally {
            setLoading(false);
        }
    };
    fetchData();
  }, []);

  const getImageUrl = (imgStr) => {
    if (!imgStr) return 'https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg';
    return imgStr.startsWith('http') ? imgStr : `${API_URL}/${imgStr.replace(/\\/g, '/')}`;
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    try {
        const formData = new FormData();
        Object.keys(editForm).forEach(key => formData.append(key, editForm[key]));
        if (selectedImage) formData.append('avatar', selectedImage);
        const { data } = await axios.put(`${API_URL}/api/users/profile/${user._id}`, formData);
        localStorage.setItem('user', JSON.stringify(data)); 
        setUser(data);
        setIsEditing(false);
        window.dispatchEvent(new Event('userUpdated')); 
        alert('🎉 Đã lưu thành công!');
    } catch (e) { alert('Lỗi cập nhật!'); }
  };

  const handleAvatarChange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
          const formData = new FormData();
          formData.append('avatar', file);
          const { data } = await axios.put(`${API_URL}/api/users/profile/${user._id}`, formData);
          localStorage.setItem('user', JSON.stringify(data));
          setUser(data);
          window.dispatchEvent(new Event('userUpdated'));
      } catch (err) {
          alert('Có lỗi xảy ra khi tải ảnh lên');
      }
  };

  const handleDeletePost = async (postId) => { 
      if(window.confirm("Xóa bài viết này?")) { 
          try { 
              await axios.delete(`${API_URL}/api/posts/${postId}`); 
              setMyPosts(myPosts.filter(p => p._id !== postId)); 
              alert("Đã xóa!"); 
          } catch (e) { alert("Lỗi!"); } 
      } 
  };

  if (!user || loading) return (
      <div className="bg-[#FFFBEB] min-h-screen flex flex-col">
          <AppHeader />
          <div className="flex-1 flex justify-center items-center">
             <div className="w-10 h-10 border-4 border-stone-200 border-t-[#FACC15] rounded-full animate-spin"></div>
          </div>
          <AppFooter />
      </div>
  );

  const getStatusBadge = (status) => {
    if(status === 'Chờ xác nhận') return 'bg-orange-100 text-[#EA580C]';
    if(status === 'Đang giao hàng' || status === 'Đang giao') return 'bg-blue-100 text-blue-700';
    if(status === 'Hoàn thành') return 'bg-emerald-100 text-emerald-700';
    return 'bg-stone-100 text-stone-600'; 
  };

  return (
    <div className="bg-[#FFFBEB] min-h-screen font-sans text-[#1C1917] flex flex-col">
      <AppHeader />
      
      <main className="max-w-[1200px] mx-auto w-full px-4 py-6 flex-1">
        {/* Breadcrumb */}
        <div className="flex items-center justify-between mb-4">
            <nav className="flex items-center gap-2 text-sm text-stone-500">
                <Link to="/" className="hover:text-[#1C1917]">Trang chủ</Link>
                <span>›</span>
                <span className="text-[#1C1917] font-semibold">Tài khoản & Hồ sơ cá nhân</span>
            </nav>
            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-100">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                Hồ sơ trực tuyến 5 phút trước
            </div>
        </div>

        {/* Header Profile Section */}
        <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-6 mb-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                
                <div className="flex items-center gap-6">
                    <div className="relative">
                        <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-stone-50 bg-stone-100 shadow-sm">
                            <img src={user.avatar ? (user.avatar.startsWith('http') ? user.avatar : `${API_URL}/${user.avatar.replace(/\\/g, '/')}`) : 'https://via.placeholder.com/150'} alt="Avatar" className="w-full h-full object-cover" />
                        </div>
                        <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleAvatarChange} />
                        <button onClick={() => fileInputRef.current.click()} className="absolute bottom-0 right-0 w-8 h-8 bg-[#FACC15] text-[#1C1917] rounded-full flex items-center justify-center border-2 border-white shadow-sm hover:bg-[#EAB308]">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        </button>
                    </div>
                    
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="text-2xl font-black text-[#1C1917]">{user.name}</h1>
                            <span className="text-stone-400 text-sm">@{user.email?.split('@')[0]}</span>
                            <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg> Tài khoản hoạt động tích cực
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-xs text-stone-500 font-medium mb-4">
                            <span className="flex items-center gap-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg> {user.phone} <span className="text-emerald-600">(Đã xác minh)</span></span>
                            <span className="flex items-center gap-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> {user.email}</span>
                            <span className="flex items-center gap-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg> {user.address}</span>
                        </div>
                        
                        <div className="flex items-center gap-8 bg-stone-50 px-4 py-2 rounded-lg border border-stone-100">
                            <div>
                                <p className="text-[10px] text-stone-500 uppercase font-bold">Đang đăng bán</p>
                                <p className="text-lg font-black text-[#1C1917]">{myPosts.length} <span className="text-xs font-normal text-stone-400">tin</span></p>
                            </div>
                            <div>
                                <p className="text-[10px] text-stone-500 uppercase font-bold">Đã thanh lý</p>
                                <p className="text-lg font-black text-[#EA580C]">{mySales.length} <span className="text-xs font-normal text-stone-400">món</span></p>
                            </div>
                            <div>
                                <p className="text-[10px] text-stone-500 uppercase font-bold">Đánh giá</p>
                                <p className="text-lg font-black text-emerald-600">{myReviews.length > 0 ? myReviews.length : 0} <span className="text-xs font-normal text-stone-400">nhận xét</span></p>
                            </div>
                            <div>
                                <p className="text-[10px] text-stone-500 uppercase font-bold">Đơn mua</p>
                                <p className="text-lg font-black text-[#1C1917]">{myOrders.length} <span className="text-xs font-normal text-stone-400">đơn</span></p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-2 shrink-0 w-full md:w-auto">
                    <button className="w-full bg-[#FACC15] text-[#1C1917] font-bold py-2.5 px-6 rounded-lg hover:bg-[#EAB308] flex items-center justify-center gap-2 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg> Tạo tin đăng mới
                    </button>
                    <button onClick={() => setIsEditing(!isEditing)} className="w-full bg-stone-100 text-[#1C1917] font-bold py-2.5 px-6 rounded-lg hover:bg-stone-200 flex items-center justify-center gap-2 transition-colors border border-stone-200">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg> Chỉnh sửa hồ sơ
                    </button>
                </div>
            </div>
        </div>

        {/* Main Layout */}
        <div className="flex flex-col lg:flex-row gap-6">
            
            {/* Left Content Area */}
            <div className="w-full lg:w-[65%] flex flex-col gap-4">
                
                {/* Tabs */}
                <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                    <button onClick={() => setActiveTab('posts')} className={`flex items-center gap-2 whitespace-nowrap px-4 py-2.5 rounded-lg font-bold text-sm transition-colors ${activeTab === 'posts' ? 'bg-orange-100 text-[#EA580C] border border-orange-200' : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                        Tin đang đăng bán <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeTab === 'posts' ? 'bg-[#EA580C] text-white' : 'bg-stone-200 text-stone-600'}`}>{myPosts.length}</span>
                    </button>
                    <button onClick={() => setActiveTab('orders_buy')} className={`flex items-center gap-2 whitespace-nowrap px-4 py-2.5 rounded-lg font-bold text-sm transition-colors ${activeTab === 'orders_buy' ? 'bg-orange-100 text-[#EA580C] border border-orange-200' : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                        Lịch sử mua hàng <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeTab === 'orders_buy' ? 'bg-[#EA580C] text-white' : 'bg-stone-200 text-stone-600'}`}>{myOrders.length}</span>
                    </button>
                    <button onClick={() => setActiveTab('orders_sell')} className={`flex items-center gap-2 whitespace-nowrap px-4 py-2.5 rounded-lg font-bold text-sm transition-colors ${activeTab === 'orders_sell' ? 'bg-orange-100 text-[#EA580C] border border-orange-200' : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                        Quản lý đơn bán <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeTab === 'orders_sell' ? 'bg-[#EA580C] text-white' : 'bg-stone-200 text-stone-600'}`}>{mySales.length}</span>
                    </button>
                    <button onClick={() => setActiveTab('reviews')} className={`flex items-center gap-2 whitespace-nowrap px-4 py-2.5 rounded-lg font-bold text-sm transition-colors ${activeTab === 'reviews' ? 'bg-orange-100 text-[#EA580C] border border-orange-200' : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                        Đánh giá cộng đồng <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeTab === 'reviews' ? 'bg-[#EA580C] text-white' : 'bg-stone-200 text-stone-600'}`}>{myReviews.length}</span>
                    </button>
                </div>

                {isEditing && (
                    <form onSubmit={handleUpdateProfile} className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm animate-fade-in mb-4">
                        <h3 className="font-bold text-lg mb-4">Chỉnh sửa hồ sơ</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-xs font-bold text-stone-500 mb-1">Họ và tên</label>
                                <input type="text" className="w-full border border-stone-200 rounded-lg p-2.5 bg-stone-50 focus:outline-none focus:border-[#FACC15]" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} required />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-stone-500 mb-1">Số điện thoại</label>
                                <input type="text" className="w-full border border-stone-200 rounded-lg p-2.5 bg-stone-50 focus:outline-none focus:border-[#FACC15]" value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-stone-500 mb-1">Địa chỉ</label>
                                <input type="text" className="w-full border border-stone-200 rounded-lg p-2.5 bg-stone-50 focus:outline-none focus:border-[#FACC15]" value={editForm.address} onChange={e => setEditForm({...editForm, address: e.target.value})} />
                            </div>
                        </div>
                        <div className="flex gap-3 justify-end mt-4 pt-4 border-t border-stone-100">
                            <button type="button" onClick={() => setIsEditing(false)} className="px-5 py-2 font-bold text-stone-500 hover:text-stone-800">Hủy</button>
                            <button type="submit" className="px-6 py-2 bg-[#1C1917] text-white font-bold rounded-lg hover:bg-stone-800">Lưu thay đổi</button>
                        </div>
                    </form>
                )}

                {!isEditing && activeTab === 'posts' && (
                    <>
                        {/* Filters */}
                        <div className="flex flex-col sm:flex-row justify-between gap-3 mb-2">
                            <div className="flex gap-2 text-sm font-bold bg-white p-1.5 rounded-lg border border-stone-200 shadow-sm overflow-x-auto custom-scrollbar">
                                <button onClick={() => setPostFilter('all')} className={`px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${postFilter === 'all' ? 'bg-[#1C1917] text-white' : 'text-stone-500 hover:bg-stone-100'}`}>Tất cả ({myPosts.length})</button>
                                <button onClick={() => setPostFilter('active')} className={`px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${postFilter === 'active' ? 'bg-[#1C1917] text-white' : 'text-stone-500 hover:bg-stone-100'}`}>Đang hiển thị ({myPosts.filter(p => p.status === 'APPROVED').length})</button>
                                <button onClick={() => setPostFilter('pending')} className={`px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${postFilter === 'pending' ? 'bg-[#1C1917] text-white' : 'text-stone-500 hover:bg-stone-100'}`}>Chờ duyệt ({myPosts.filter(p => p.status === 'PENDING').length})</button>
                            </div>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-stone-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                </span>
                                <input type="text" placeholder="Tìm theo tên sản phẩm..." className="w-full sm:w-64 h-9 pl-9 pr-3 text-sm border border-stone-200 rounded-lg bg-white focus:outline-none focus:border-[#FACC15]" />
                            </div>
                        </div>

                        {/* List */}
                        <div className="flex flex-col gap-4">
                            {myPosts.filter(p => postFilter === 'all' || (postFilter === 'active' && p.status === 'APPROVED') || (postFilter === 'pending' && p.status === 'PENDING')).map(post => (
                                <div key={post._id} className="bg-white rounded-xl border border-stone-200 shadow-sm p-4 hover:border-stone-300 transition-colors">
                                    <div className="flex flex-col sm:flex-row gap-4">
                                        
                                        <div className="w-full sm:w-36 h-36 bg-stone-100 rounded-lg overflow-hidden border border-stone-200 shrink-0 relative cursor-pointer" onClick={() => navigate(`/post/${post._id}`)}>
                                            <span className="absolute top-2 left-2 bg-white/90 text-emerald-700 text-[10px] font-bold px-1.5 rounded shadow-sm">{post.condition || 'Cũ'}</span>
                                            <img src={getImageUrl(post.images?.[0] || post.image)} alt={post.title} className="w-full h-full object-cover" />
                                            <span className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] font-bold px-1.5 rounded flex items-center gap-1 shadow-sm">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg> {post.location?.split(',')[0] || 'Hà Nội'}
                                            </span>
                                        </div>
                                        
                                        <div className="flex-1 flex flex-col justify-between">
                                            <div>
                                                <div className="flex justify-between items-start gap-2 mb-1">
                                                    <h3 className="font-bold text-[#1C1917] line-clamp-2 leading-snug cursor-pointer hover:underline" onClick={() => navigate(`/post/${post._id}`)}>{post.title}</h3>
                                                    {post.status === 'APPROVED' ? (
                                                        <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Đang hiển thị
                                                        </span>
                                                    ) : (
                                                        <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-100">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span> Đang chờ duyệt
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-baseline gap-2 mb-3">
                                                    <span className="text-lg font-black text-[#EA580C]">{new Intl.NumberFormat('vi-VN').format(post.price)} đ</span>
                                                    {post.oldPrice && <span className="text-xs text-stone-400 line-through">{new Intl.NumberFormat('vi-VN').format(post.oldPrice)} đ</span>}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-3 text-[11px] text-stone-500 font-medium">
                                                    <span className="flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg> {post.views || 0} lượt xem</span>
                                                    <span className="flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg> {post.chats || 0} lượt chat</span>
                                                    <span className="flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> {post.timeAgo || 'Vừa đăng'}</span>
                                                </div>
                                            </div>
                                            
                                            <div className="flex justify-between items-center mt-4 pt-3 border-t border-stone-100">
                                                <div className="flex gap-2">
                                                    <button onClick={() => navigate(`/edit-post/${post._id}`)} className="px-4 py-1.5 bg-stone-100 text-stone-600 text-xs font-bold rounded hover:bg-stone-200 flex items-center gap-1">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg> Sửa tin
                                                    </button>
                                                    {post.status === 'APPROVED' && (
                                                        <button className="px-4 py-1.5 bg-[#FACC15] text-[#1C1917] text-xs font-bold rounded hover:bg-[#EAB308] flex items-center gap-1">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 11l7-7 7 7M5 19l7-7 7 7" /></svg> Đẩy tin (Boost)
                                                        </button>
                                                    )}
                                                </div>
                                                <button onClick={() => handleDeletePost(post._id)} className="flex items-center gap-1 text-xs font-bold text-red-500 hover:underline">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Hủy tin / Đã bán
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {!isEditing && activeTab.startsWith('orders') && (
                    <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-6 text-center text-stone-500">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto mb-4 text-stone-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                        <p>Bạn chưa có đơn hàng nào trong mục này.</p>
                    </div>
                )}

                {!isEditing && activeTab === 'reviews' && (
                    <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-6">
                        {myReviews.map((rev, i) => (
                            <div key={i} className="mb-4 pb-4 border-b border-stone-100 last:border-0 last:mb-0 last:pb-0">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <img src={rev.buyer?.avatar || 'https://via.placeholder.com/40'} className="w-10 h-10 rounded-full object-cover bg-stone-100" alt="avt" />
                                        <div>
                                            <p className="font-bold text-sm text-[#1C1917]">{rev.buyer?.name || 'Khách hàng'}</p>
                                            <p className="text-xs text-stone-400">{new Date(rev.createdAt || Date.now()).toLocaleDateString('vi-VN')}</p>
                                        </div>
                                    </div>
                                    <div className="text-[#FACC15] text-sm">{"★".repeat(rev.rating)}</div>
                                </div>
                                <p className="text-sm text-stone-700 italic">"{rev.comment}"</p>
                            </div>
                        ))}
                        {myReviews.length === 0 && <p className="text-center text-stone-500 py-10">Chưa có đánh giá nào.</p>}
                    </div>
                )}
            </div>

            {/* Right Sidebar Area */}
            <div className="w-full lg:w-[35%] flex flex-col gap-4">
                
                {/* Account Rank Card */}
                <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-stone-100 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#EA580C]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                            <h3 className="font-bold text-[#1C1917]">Cấp độ tài khoản</h3>
                        </div>
                        <span className="bg-[#FEF3C7] text-[#D97706] text-xs font-bold px-2 py-0.5 rounded border border-[#FDE68A]">Hạng Vàng</span>
                    </div>
                    <div className="p-4">
                        <div className="flex justify-between text-xs font-bold text-stone-600 mb-2">
                            <span>Tiến trình lên <strong>Người Bán Chuẩn</strong></span>
                            <span className="text-[#EA580C]">0%</span>
                        </div>
                        <div className="w-full bg-stone-100 rounded-full h-1.5 mb-2">
                            <div className="bg-[#EA580C] h-1.5 rounded-full" style={{width: '0%'}}></div>
                        </div>
                        <p className="text-[10px] text-stone-400 mb-4">Hoàn thành thêm giao dịch để nhận huy hiệu.</p>
                        <button className="w-full bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold py-2 rounded-lg transition-colors flex justify-center items-center gap-1">
                            Chi tiết đặc quyền thành viên <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                    </div>
                </div>

                {/* HaiPay Wallet Card */}
                <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-4">
                    <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#EA580C]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                            <h3 className="font-bold text-[#1C1917]">Số dư Ví HaiPay</h3>
                        </div>
                        <span className="text-xs font-bold text-[#EA580C] cursor-pointer hover:underline">Chi tiết ví</span>
                    </div>
                    <div className="mb-4">
                        <p className="text-3xl font-black text-[#1C1917] tracking-tight">{new Intl.NumberFormat('vi-VN').format(user.walletBalance || 0)} <span className="text-xl underline">đ</span></p>
                        <p className="text-xs text-stone-500 mt-1 font-medium">Số dư khả dụng: <strong className="text-[#1C1917]">{new Intl.NumberFormat('vi-VN').format(user.walletBalance || 0)} đ</strong></p>
                    </div>
                    <div className="flex gap-2">
                        <button className="flex-1 bg-[#FACC15] hover:bg-[#EAB308] text-[#1C1917] font-bold py-2 text-sm rounded-lg transition-colors">
                            Rút về ngân hàng
                        </button>
                        <button className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold py-2 text-sm rounded-lg transition-colors">
                            Lịch sử ví
                        </button>
                    </div>
                </div>

                {/* Support Card */}
                <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#EA580C]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                        <h3 className="font-bold text-[#1C1917] uppercase text-sm tracking-wide">Hỗ trợ & Tranh chấp C2C</h3>
                    </div>
                    <p className="text-xs text-stone-500 mb-4 leading-relaxed">
                        Trung tâm hỗ trợ mua bán C2C HaiHand: Hỗ trợ kiểm tra hàng, đối soát thanh toán VNPay, Ví HaiPay, COD nhanh chóng.
                    </p>
                    <div className="flex flex-col gap-2">
                        <button className="flex items-center justify-between p-2.5 border border-stone-100 rounded-lg hover:border-stone-200 hover:bg-stone-50 transition-colors group">
                            <div className="flex items-center gap-2 text-sm font-bold text-stone-600 group-hover:text-[#EA580C]">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg> Gửi khiếu nại đơn hàng
                            </div>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                        <button className="flex items-center justify-between p-2.5 border border-stone-100 rounded-lg hover:border-stone-200 hover:bg-stone-50 transition-colors group">
                            <div className="flex items-center gap-2 text-sm font-bold text-stone-600 group-hover:text-[#EA580C]">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg> Trò chuyện trợ lý 24/7
                            </div>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                    </div>
                </div>

                {/* Tips Card */}
                <div className="bg-[#FFFBEB] rounded-xl border border-[#FDE68A] p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#EA580C]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                        <h3 className="font-bold text-[#EA580C] text-sm">Mẹo tăng tốc bán đồ cũ</h3>
                    </div>
                    <p className="text-xs text-orange-800 leading-relaxed">
                        Chụp đủ 4 góc sản phẩm, kèm ảnh chụp chi tiết lỗi nhỏ (vết xước, cấn viền) giúp tỉ lệ chốt đơn tăng 3.4 lần và không bị hoàn hàng!
                    </p>
                </div>

            </div>

        </div>
      </main>
      
      <AppFooter />
    </div>
  );
}