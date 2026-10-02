import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import { AppHeader } from '../components/AppHeader';
import { AppFooter } from '../components/AppFooter';

export default function ChatPage() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const userString = localStorage.getItem('user');
  const parsedUser = useMemo(() => userString && userString !== "undefined" ? JSON.parse(userString) : null, [userString]);
  
  const user = parsedUser || {
      _id: 'mockUser123',
      name: 'Minh Tuấn',
      email: 'tuan.m***@gmail.com',
      phone: '098****234',
      avatar: 'https://i.pravatar.cc/150?u=minhtuan',
      role: 'User'
  };

  const API_URL = process.env.REACT_APP_API_URL || 'https://haihand-marketplace.onrender.com';

  const [inboxList, setInboxList] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState(['u1', 'u2']); // Mock online
  const [selectedReceiver, setSelectedReceiver] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [linkedPost, setLinkedPost] = useState(null);
  const [filter, setFilter] = useState('all'); // all, buy, sell, unread

  const socket = useRef();
  const scrollRef = useRef();
  
  const selectedReceiverRef = useRef(null);
  useEffect(() => { selectedReceiverRef.current = selectedReceiver; }, [selectedReceiver]);

  useEffect(() => {
    // We do not redirect to login if backend is down for UI demo
    if (parsedUser) {
        socket.current = io(API_URL, { transports: ["websocket", "polling"], reconnection: true });
        socket.current.emit('addUser', user._id);
        socket.current.on('getUsers', (users) => { setOnlineUsers(users.map(u => u.userId)); });
        socket.current.on('getMessage', (data) => {
            const currentReceiver = selectedReceiverRef.current;
            if (currentReceiver && data.senderId === currentReceiver._id) {
                setMessages((prev) => [...prev, {
                    sender: data.senderId, content: data.text, images: data.images, post: data.post, createdAt: Date.now()
                }]);
                axios.put(`${API_URL}/api/messages/mark-read`, { userId: user._id, otherId: data.senderId }).catch(console.error);
            }
            fetchInboxList(); 
        });
        return () => socket.current.disconnect();
    }
  }, [user._id, API_URL, parsedUser]);

  const fetchInboxList = async () => {
    setLoading(true);
    try {
      if (!parsedUser) throw new Error("Mock");
      const { data } = await axios.get(`${API_URL}/api/messages/conversations/${user._id}`);
      setInboxList(data);
    } catch (err) { 
      console.warn("Dùng dữ liệu giả lập cho Chat vì backend không phản hồi");
      // Fallback Mock Data matching Stitch UI
      setInboxList([
          {
              otherUser: { _id: 'u1', name: 'Hoàng Nam', avatar: 'https://i.pravatar.cc/150?u=hoangnam', verified: true },
              lastMessage: { content: 'Dạ máy em còn đủ box cáp zin nha anh, anh qua...', sender: 'u1', createdAt: Date.now() - 2 * 60000, isRead: false },
              unreadCount: 1
          },
          {
              otherUser: { _id: 'u2', name: 'Linh Chi', avatar: 'https://i.pravatar.cc/150?u=linhchi' },
              lastMessage: { content: 'Dạ bạn có ship COD về Đà Nẵng không ạ?', sender: 'u2', createdAt: Date.now() - 15 * 60000, isRead: true },
              unreadCount: 0
          },
          {
              otherUser: { _id: 'u3', name: 'Cửa hàng Audio Sài Gòn', avatar: 'https://i.pravatar.cc/150?u=audio', badge: 'Pro' },
              lastMessage: { content: 'Loa Marshall bên em bao test 7 ngày nha anh, có bill...', sender: 'u3', createdAt: Date.now() - 3600000, isRead: true },
              unreadCount: 0
          },
          {
              otherUser: { _id: 'u4', name: 'Bác Hùng (Xe máy cũ)', avatar: 'https://i.pravatar.cc/150?u=bachung' },
              lastMessage: { content: 'Xe biển Hà Nội chính chủ em nhé, qua nhà bác ở Định...', sender: 'mockUser123', createdAt: Date.now() - 86400000, isRead: true },
              unreadCount: 0
          }
      ]);
      // Auto select first user
      handleSelectConversation({ _id: 'u1', name: 'Hoàng Nam', avatar: 'https://i.pravatar.cc/150?u=hoangnam', rating: 4.9, reviews: 128, location: 'Cầu Giấy, Hà Nội' });
    }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchInboxList(); }, []);

  useEffect(() => {
    if (location.state?.receiver) {
      handleSelectConversation(location.state.receiver);
      if (location.state?.post) setLinkedPost(location.state.post);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  const handleSelectConversation = (receiver) => {
    setSelectedReceiver(receiver);
    setSearchTerm(''); setSearchResults([]);
    
    // Simulate fetching messages
    setMessages([
        { sender: 'mockUser123', content: '', post: null, createdAt: Date.now() - 86400000, isDateMarker: 'Hôm nay, 16:42' },
        { sender: 'u1', content: 'Chào anh Tuấn! Máy này em dùng làm máy phụ giữ gìn kỹ lắm ạ. Pin chuẩn zin 91%, chưa từng tháo ốc mở máy hay thay kính bao giờ.', createdAt: Date.now() - 7200000 },
        { sender: 'u1', images: ['https://lh3.googleusercontent.com/aida-public/AB6AXuD2BPluciFYZYJw23LDrVIaS8vuySYm1LHrZjVFeryRZecEqst1lLouo7ou8_xrZDgR7CH1FWAbcWJQlvdOuZ65hu1fIFVT4z0EwpCYiyGYA3UW5953mLuQncp6pk6tqTQRxp6AnmEEWhWliEtvv0kAqhywYhEmRkrx8IhDwCxD3KC6_Bdm1NvzK3XrrUepsav8P9Mi9iYLoEQ-dYacQ_4M9oYKsz1V-A5XDaI2BKsEBHBx4FcJAohm'], textOverlay: 'Viền góc xước dăm nhẹ', createdAt: Date.now() - 7100000 },
        { sender: 'u1', content: 'Dạ máy em còn đủ phụ kiện hộp trùng IMEI và dây sạc zin theo máy nha anh. Nếu anh qua xem trực tiếp ở Duy Tân - Cầu Giấy tối nay em fix thêm 200k tiền xăng xe cho vui vẻ ạ!', createdAt: Date.now() - 7000000 },
        { sender: 'mockUser123', content: 'Tầm 7h tối nay mình qua ngõ 123 Duy Tân xem máy được không bạn? Chỗ bạn có quán cafe nào sáng sủa, có wifi ổn định để mình cắm máy check 3uTools lại lần nữa không?', createdAt: Date.now() - 3600000, status: 'Đã gửi' }
    ]);
    
    // Set linked post if any
    setLinkedPost({
        title: 'iPhone 14 Pro Max 256GB...', price: 19800000, oldPrice: 21500000, condition: 'Như mới • Pin 91%',
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD2BPluciFYZYJw23LDrVIaS8vuySYm1LHrZjVFeryRZecEqst1lLouo7ou8_xrZDgR7CH1FWAbcWJQlvdOuZ65hu1fIFVT4z0EwpCYiyGYA3UW5953mLuQncp6pk6tqTQRxp6AnmEEWhWliEtvv0kAqhywYhEmRkrx8IhDwCxD3KC6_Bdm1NvzK3XrrUepsav8P9Mi9iYLoEQ-dYacQ_4M9oYKsz1V-A5XDaI2BKsEBHBx4FcJAohm'
    });

    setInboxList(prev => prev.map(item => {
        if(item.otherUser._id === receiver._id) return { ...item, unreadCount: 0, lastMessage: { ...item.lastMessage, isRead: true } };
        return item;
    }));
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() && !linkedPost) return;
    const msgData = {
        sender: user._id, content: newMessage, post: linkedPost, createdAt: Date.now(), status: 'Đã gửi'
    };
    setMessages(prev => [...prev, msgData]);
    setNewMessage('');
    setTimeout(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);

    // Call API if not mock
    if (parsedUser) {
        try {
            await axios.post(`${API_URL}/api/messages`, {
                senderId: user._id, receiverId: selectedReceiver._id, text: newMessage, postId: linkedPost?._id || null
            });
            if(socket.current) {
                socket.current.emit('sendMessage', {
                    senderId: user._id, receiverId: selectedReceiver._id, text: newMessage, post: linkedPost, images: []
                });
            }
        } catch (error) { console.error("Lỗi gửi tin nhắn"); }
    }
  };

  const getImageUrl = (imgStr) => {
    if (!imgStr) return 'https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg';
    return imgStr.startsWith('http') ? imgStr : `${API_URL}/${imgStr.replace(/\\/g, '/')}`;
  };

  const formatTime = (ts) => {
      if(!ts) return '';
      const d = new Date(ts);
      return d.toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'});
  };

  const formatTimeAgo = (ts) => {
      const diff = Date.now() - ts;
      if (diff < 3600000) return Math.floor(diff/60000) + ' phút';
      if (diff < 86400000) return Math.floor(diff/3600000) + ' giờ';
      return 'Hôm qua';
  };

  return (
    <div className="bg-[#FFFBEB] min-h-screen font-sans text-[#1C1917] flex flex-col h-screen overflow-hidden">
      <AppHeader />
      
      <main className="max-w-[1400px] w-full mx-auto px-4 py-4 flex-1 flex flex-col min-h-0">
        {/* Breadcrumb & Header info */}
        <div className="flex items-center justify-between mb-4 shrink-0">
            <nav className="flex items-center gap-2 text-sm text-stone-500">
                <Link to="/" className="hover:text-[#1C1917] flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                    Trang chủ
                </Link>
                <span>›</span>
                <span className="text-[#1C1917] font-semibold">Tin nhắn & Trò chuyện C2C</span>
            </nav>
            <div className="hidden md:flex items-center gap-1.5 text-xs font-bold text-orange-800 bg-orange-50 px-3 py-1.5 rounded-full border border-orange-100">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[#EA580C]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                Kênh trao đổi trực tiếp giữa người mua và người bán HaiHand
            </div>
        </div>

        {/* Main Split Layout */}
        <div className="flex bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden flex-1 min-h-0">
            
            {/* Left Pane - Inbox List */}
            <div className="w-full md:w-[320px] lg:w-[380px] border-r border-stone-100 flex flex-col shrink-0 bg-stone-50/50">
                <div className="p-4 border-b border-stone-100 bg-white">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            Tin nhắn 
                            <span className="bg-[#EA580C] text-white text-[10px] px-2 py-0.5 rounded-full font-bold">3 mới</span>
                        </h2>
                        <button className="w-8 h-8 flex items-center justify-center rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                    </div>
                    
                    <div className="relative mb-3">
                        <span className="absolute left-3 top-2.5 text-stone-400">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </span>
                        <input type="text" placeholder="Tìm theo người bán, tên món đồ..." className="w-full h-9 pl-9 pr-3 text-sm border border-stone-200 rounded-lg bg-stone-100 focus:bg-white focus:outline-none focus:border-[#FACC15] transition-colors" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
                        <button onClick={() => setFilter('all')} className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${filter === 'all' ? 'bg-[#FACC15] text-[#1C1917]' : 'bg-white border border-stone-200 text-stone-600'}`}>Tất cả</button>
                        <button onClick={() => setFilter('buy')} className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${filter === 'buy' ? 'bg-[#FACC15] text-[#1C1917]' : 'bg-white border border-stone-200 text-stone-600'}`}>Mua hàng <span className="text-stone-400">(4)</span></button>
                        <button onClick={() => setFilter('sell')} className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${filter === 'sell' ? 'bg-[#FACC15] text-[#1C1917]' : 'bg-white border border-stone-200 text-stone-600'}`}>Bán hàng <span className="text-stone-400">(6)</span></button>
                        <button onClick={() => setFilter('unread')} className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1 ${filter === 'unread' ? 'bg-[#FACC15] text-[#1C1917]' : 'bg-white border border-stone-200 text-stone-600'}`}>
                            <span className="w-1.5 h-1.5 bg-[#EA580C] rounded-full"></span> Chưa đọc
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                    {loading ? (
                        <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-stone-200 border-t-[#FACC15] rounded-full animate-spin"></div></div>
                    ) : (
                        inboxList.map((item, idx) => {
                            const isSelected = selectedReceiver?._id === item.otherUser._id;
                            const isUnread = item.unreadCount > 0;
                            return (
                                <div key={idx} onClick={() => handleSelectConversation(item.otherUser)} className={`p-4 border-b border-stone-100 cursor-pointer transition-colors relative flex items-start gap-3 ${isSelected ? 'bg-[#FFFBEB]' : 'hover:bg-stone-100'}`}>
                                    {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#FACC15]"></div>}
                                    
                                    <div className="relative shrink-0">
                                        <img src={item.otherUser.avatar} className="w-12 h-12 rounded-full object-cover border border-stone-200" alt="avt" />
                                        {onlineUsers.includes(item.otherUser._id) && <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full"></span>}
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start mb-0.5">
                                            <h4 className={`text-sm truncate pr-2 flex items-center gap-1 ${isUnread ? 'font-black text-[#1C1917]' : 'font-bold text-[#1C1917]'}`}>
                                                {item.otherUser.name}
                                                {item.otherUser.verified && <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>}
                                                {item.otherUser.badge && <span className="text-[9px] bg-stone-200 text-stone-600 px-1 rounded">{item.otherUser.badge}</span>}
                                            </h4>
                                            <span className={`text-[10px] shrink-0 ${isUnread ? 'font-bold text-[#EA580C]' : 'text-stone-400'}`}>{formatTimeAgo(item.lastMessage.createdAt)}</span>
                                        </div>
                                        {item.lastMessage.post && (
                                            <div className="flex items-center gap-1 text-[10px] text-stone-500 mb-1 truncate">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                                                {item.lastMessage.post.title || 'iPhone 14 Pro Max 256GB Vàng...'}
                                            </div>
                                        )}
                                        <p className={`text-xs truncate ${isUnread ? 'font-bold text-[#1C1917]' : 'text-stone-500'}`}>
                                            {item.lastMessage.sender === user?._id ? 'Bạn: ' : ''}
                                            {item.lastMessage.content || 'Đã gửi ảnh'}
                                        </p>
                                    </div>
                                    
                                    {isUnread && (
                                        <div className="flex flex-col justify-center items-end shrink-0 pt-1">
                                            <span className="bg-[#EA580C] text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full">{item.unreadCount}</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}

                    <div className="m-4 bg-orange-50 rounded-xl border border-orange-100 p-4 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2 text-orange-200 opacity-50"><svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg></div>
                        <h4 className="font-bold text-[#EA580C] text-xs flex items-center gap-1.5 mb-2 relative z-10">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#EA580C]"></span> Mẹo mua đồ công nghệ an toàn
                        </h4>
                        <p className="text-[10px] text-orange-800 leading-relaxed relative z-10">Luôn yêu cầu người bán test trực tiếp pin, iCloud. Khuyến khích thanh toán qua VNPay, Ví HaiPay hoặc giao dịch COD có đồng kiểm.</p>
                    </div>
                </div>
            </div>

            {/* Right Pane - Chat Window */}
            <div className="flex-1 flex flex-col min-w-0 bg-stone-50/30">
                {selectedReceiver ? (
                    <>
                        {/* Chat Header */}
                        <div className="px-5 py-3 border-b border-stone-200 bg-white flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <img src={selectedReceiver.avatar || 'https://via.placeholder.com/150'} className="w-12 h-12 rounded-full object-cover border border-stone-200" alt="avt" />
                                    {onlineUsers.includes(selectedReceiver._id) && <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></span>}
                                </div>
                                <div>
                                    <h3 className="font-bold text-[#1C1917] flex items-center gap-2">
                                        {selectedReceiver.name}
                                        {onlineUsers.includes(selectedReceiver._id) && <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full font-bold">Đang trực tuyến</span>}
                                    </h3>
                                    <div className="flex items-center gap-2 text-xs text-stone-500 font-medium mt-0.5">
                                        <span className="text-[#EA580C]">★ {selectedReceiver.rating || 4.9} <span className="text-stone-400">({selectedReceiver.reviews || 128} phản hồi)</span></span>
                                        <span>•</span>
                                        <span>Tỷ lệ phản hồi: 99% (Dưới 3 phút)</span>
                                        <span>•</span>
                                        <span>{selectedReceiver.location || 'Cầu Giấy, Hà Nội'}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button className="px-3 py-1.5 bg-stone-100 text-stone-700 rounded-lg text-sm font-bold hover:bg-stone-200 flex items-center gap-1 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg> Xem hồ sơ
                                </button>
                                <button className="w-8 h-8 flex items-center justify-center bg-stone-100 text-stone-500 rounded-lg hover:bg-stone-200 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" /></svg>
                                </button>
                            </div>
                        </div>

                        {/* Linked Post Card */}
                        {linkedPost && (
                            <div className="px-5 py-3 border-b border-stone-200 bg-white flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-3">
                                    <img src={linkedPost.image} className="w-14 h-14 rounded-lg object-cover border border-stone-200" alt="product" />
                                    <div>
                                        <h4 className="font-bold text-sm text-[#1C1917] flex items-center gap-2 mb-0.5">
                                            {linkedPost.title}
                                            {linkedPost.condition && <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded text-[10px]">{linkedPost.condition}</span>}
                                        </h4>
                                        <div className="flex items-baseline gap-2">
                                            <span className="font-black text-[#EA580C] text-sm">{new Intl.NumberFormat('vi-VN').format(linkedPost.price)} đ</span>
                                            {linkedPost.oldPrice && <span className="text-[10px] text-stone-400 line-through">{new Intl.NumberFormat('vi-VN').format(linkedPost.oldPrice)} đ</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button className="px-3 py-1.5 bg-stone-50 border border-stone-200 text-stone-600 font-bold text-xs rounded-lg flex items-center gap-1 hover:bg-stone-100">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg> Hẹn gặp test
                                    </button>
                                    <button className="px-4 py-1.5 bg-[#FACC15] text-[#1C1917] font-bold text-xs rounded-lg flex items-center gap-1 hover:bg-[#EAB308]">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg> Mua ngay
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Safety Notice in Chat */}
                        <div className="px-5 pt-4 shrink-0">
                            <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 flex gap-3 max-w-2xl mx-auto">
                                <div className="text-[#EA580C] shrink-0 mt-0.5">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                </div>
                                <div>
                                    <h4 className="text-xs font-bold text-orange-900 mb-1">LƯU Ý AN TOÀN HAIHAND:</h4>
                                    <p className="text-[11px] text-orange-800 leading-relaxed">Không chuyển tiền đặt cọc trước vào tài khoản lạ. Ưu tiên gặp trực tiếp nơi công cộng hoặc thanh toán qua VNPay, Ví HaiPay hoặc dịch vụ COD đồng kiểm khi nhận hàng.</p>
                                </div>
                            </div>
                        </div>

                        {/* Message List */}
                        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
                            {messages.map((m, idx) => {
                                if (m.isDateMarker) {
                                    return <div key={idx} className="flex justify-center my-2"><span className="bg-stone-100 text-stone-500 text-[10px] font-bold px-3 py-1 rounded-full">{m.isDateMarker}</span></div>;
                                }
                                
                                const isMe = m.sender === user._id;
                                
                                return (
                                    <div key={idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'} gap-2`} ref={idx === messages.length - 1 ? scrollRef : null}>
                                        {!isMe && <img src={selectedReceiver.avatar} className="w-8 h-8 rounded-full object-cover shrink-0 mt-auto" alt="avt" />}
                                        
                                        <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[70%]`}>
                                            {!isMe && <span className="text-[10px] text-stone-400 mb-1 ml-1">{selectedReceiver.name} • {formatTime(m.createdAt)}</span>}
                                            
                                            {m.content && (
                                                <div className={`px-4 py-2.5 rounded-2xl text-sm ${isMe ? 'bg-[#FEF3C7] text-[#1C1917] rounded-br-sm' : 'bg-white border border-stone-200 text-[#1C1917] rounded-bl-sm'} shadow-sm`}>
                                                    {m.content}
                                                </div>
                                            )}

                                            {m.images && m.images.map((img, i) => (
                                                <div key={i} className="relative mt-1">
                                                    <img src={getImageUrl(img)} alt="attached" className="rounded-xl border border-stone-200 shadow-sm max-h-[160px] object-cover" />
                                                    {m.textOverlay && <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm">{m.textOverlay}</div>}
                                                </div>
                                            ))}
                                            
                                            {isMe && (
                                                <div className="flex items-center gap-1 mt-1 text-[9px] text-stone-400 font-medium mr-1">
                                                    {m.status === 'Đã gửi' && <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                                                    Bạn • {formatTime(m.createdAt)}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Input Area */}
                        <div className="px-5 pb-5 shrink-0 bg-stone-50/30">
                            
                            {/* Suggestions */}
                            <div className="flex gap-2 overflow-x-auto custom-scrollbar mb-3">
                                <button className="px-3 py-1.5 bg-white border border-stone-200 text-stone-600 text-xs font-bold rounded-full hover:bg-stone-50 shadow-sm whitespace-nowrap" onClick={() => setNewMessage('Sản phẩm còn không bạn?')}>Sản phẩm còn không bạn?</button>
                                <button className="px-3 py-1.5 bg-white border border-stone-200 text-stone-600 text-xs font-bold rounded-full hover:bg-stone-50 shadow-sm whitespace-nowrap" onClick={() => setNewMessage('Cho mình xin thêm ảnh góc cạnh?')}>Cho mình xin thêm ảnh góc cạnh?</button>
                                <button className="px-3 py-1.5 bg-white border border-stone-200 text-stone-600 text-xs font-bold rounded-full hover:bg-stone-50 shadow-sm whitespace-nowrap" onClick={() => setNewMessage('Có hỗ trợ ship COD kiểm tra hàng không?')}>Có hỗ trợ ship COD kiểm tra hàng không?</button>
                            </div>
                            
                            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                                <button type="button" className="p-2 text-stone-500 hover:text-stone-700 hover:bg-stone-200 rounded-full transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                </button>
                                <button type="button" className="p-2 text-stone-500 hover:text-stone-700 hover:bg-stone-200 rounded-full transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                </button>
                                <button type="button" className="p-2 text-stone-500 hover:text-stone-700 hover:bg-stone-200 rounded-full transition-colors mr-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                                </button>
                                
                                <div className="flex-1 relative">
                                    <input type="text" className="w-full bg-stone-200 border-none h-11 pl-4 pr-10 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-[#FACC15]" placeholder="Nhập tin nhắn... (Không gửi mã OTP hoặc thông tin ngân hàng nhạy cảm)" value={newMessage} onChange={e => setNewMessage(e.target.value)} />
                                    <button type="button" className="absolute right-3 top-2.5 text-stone-400 hover:text-stone-600">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </button>
                                </div>
                                
                                <button type="submit" disabled={!newMessage.trim()} className="w-11 h-11 bg-[#FACC15] text-[#1C1917] flex items-center justify-center rounded-full shadow-sm hover:bg-[#EAB308] disabled:bg-stone-200 disabled:text-stone-400 ml-1 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transform rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                                </button>
                            </form>
                            
                            <div className="flex justify-between items-center mt-3 text-[10px]">
                                <span className="flex items-center gap-1 text-emerald-600 font-bold"><svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg> Tin nhắn được mã hóa hai đầu và giám sát bởi hệ thống chống gian lận HaiHand Guard.</span>
                                <span className="text-red-500 font-bold hover:underline cursor-pointer">Báo cáo vi phạm</span>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="h-full flex flex-col justify-center items-center text-center p-8">
                        <div className="w-24 h-24 bg-stone-100 rounded-full flex items-center justify-center mb-4 border-4 border-white shadow-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-stone-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                        </div>
                        <h2 className="text-xl font-bold text-[#1C1917] mb-2">Chào mừng đến với HaiHand Chat!</h2>
                        <p className="text-sm text-stone-500 max-w-sm">Chọn một người từ danh sách bên trái hoặc sử dụng thanh tìm kiếm để bắt đầu trò chuyện trực tiếp.</p>
                    </div>
                )}
            </div>
            
        </div>
      </main>
    </div>
  );
}