import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import Header from '../components/Header';

const ChatPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const userString = localStorage.getItem('user');
  const user = useMemo(() => userString ? JSON.parse(userString) : null, [userString]);
  const isAdmin = user?.role === 'Admin';
  
  const API_URL = process.env.REACT_APP_API_URL || 'https://haihand-marketplace.onrender.com';

  const [inboxList, setInboxList] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [selectedReceiver, setSelectedReceiver] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [linkedPost, setLinkedPost] = useState(null);

  const socket = useRef();
  const scrollRef = useRef();
  const fileInputRef = useRef();
  
  const selectedReceiverRef = useRef(null);
  useEffect(() => { selectedReceiverRef.current = selectedReceiver; }, [selectedReceiver]);

  useEffect(() => {
    if (!user?._id) { navigate('/login'); return; }

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
  }, [user?._id, navigate]);

  const fetchInboxList = async () => {
    if (!user?._id) return;
    try {
      const { data } = await axios.get(`${API_URL}/api/messages/conversations/${user._id}`);
      setInboxList(data);
    } catch (err) { console.error("Lỗi tải inbox:", err); }
    finally { setIsLoadingList(false); }
  };

  useEffect(() => { fetchInboxList(); }, [user?._id]);

  useEffect(() => {
    const searchUsers = async () => {
      if (!searchTerm.trim()) return setSearchResults([]);
      try {
        const { data } = await axios.get(`${API_URL}/api/users/search?q=${searchTerm}&exclude=${user?._id}`);
        setSearchResults(data);
      } catch (err) { console.error("Lỗi tìm kiếm:", err); }
    };
    const delayDebounceFn = setTimeout(() => searchUsers(), 300);
    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, user?._id]);

  useEffect(() => {
    if (location.state?.receiver) {
      setSelectedReceiver(location.state.receiver);
      if (location.state?.post) setLinkedPost(location.state.post);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  const handleSelectConversation = (receiver) => {
    setSelectedReceiver(receiver);
    setSearchTerm(''); setSearchResults([]); setLinkedPost(null);
    setInboxList(prev => prev.map(item => {
        if(item.otherUser._id === receiver._id) {
            return { ...item, lastMessage: { ...item.lastMessage, isRead: true } };
        }
        return item;
    }));
  };

  useEffect(() => {
    const fetchMessages = async () => {
      if (!selectedReceiver || !user?._id) return;
      try {
        const { data } = await axios.get(`${API_URL}/api/messages/${user._id}/${selectedReceiver._id}`);
        setMessages(data);
        await axios.put(`${API_URL}/api/messages/mark-read`, { userId: user._id, otherId: selectedReceiver._id });
        window.dispatchEvent(new Event('messagesRead'));
      } catch (err) { console.error("Lỗi tải tin nhắn:", err); }
    };
    fetchMessages();
  }, [selectedReceiver, user?._id]);

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() && !selectedImage && !linkedPost) return;

    const messageData = new FormData();
    messageData.append('senderId', user._id);
    messageData.append('receiverId', selectedReceiver._id);
    messageData.append('text', newMessage);
    if (selectedImage) messageData.append('image', selectedImage);
    if (linkedPost) messageData.append('postId', linkedPost._id);

    try {
      const { data } = await axios.post(`${API_URL}/api/messages`, messageData);
      socket.current.emit('sendMessage', { 
        senderId: user._id, receiverId: selectedReceiver._id, text: newMessage, images: data.images, post: linkedPost 
      });
      setMessages((prevMessages) => [...prevMessages, data]);
      setNewMessage(''); setSelectedImage(null); setPreviewImage(null); setLinkedPost(null);
      fetchInboxList();
    } catch (err) { console.error("Lỗi gửi tin:", err); }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) { setSelectedImage(file); setPreviewImage(URL.createObjectURL(file)); }
  };

  const getImageUrl = (imgStr) => {
    if (!imgStr) return null;
    if (imgStr.includes('cloudinary.com')) {
        const parts = imgStr.split('/upload/');
        if (parts.length === 2) return `${parts[0]}/upload/c_fill,w_300,h_300,q_auto,f_auto/${parts[1]}`;
    }
    return imgStr.startsWith('http') ? imgStr : `${API_URL}/${imgStr.replace(/\\/g, '/')}`;
  };
  
  const getAvatar = (userData) => {
    if (userData.avatar) return <img src={userData.avatar} style={{width:'100%', height:'100%', objectFit:'cover'}} alt="avt" />;
    return userData.name?.charAt(0).toUpperCase() || '?';
  };

  const formatTime = (timeData) => {
      if (!timeData) return '';
      const dateObj = new Date(timeData);
      if (isNaN(dateObj)) return '';
      return dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  };

  return (
    <div className="vh-100 d-flex flex-column" style={{ backgroundColor: '#f0f2f5' }}>
      
      
      {window.self === window.top && <Header />}

      <div className="container-fluid flex-grow-1 overflow-hidden p-0 d-flex">
        <div className="row g-0 flex-grow-1 w-100 h-100 flex-nowrap">
          
          <div className="col-4 border-end bg-white d-flex flex-column h-100">
            <div className="p-3 border-bottom bg-light">
                <h5 className="fw-bold mb-3 text-dark">
                    {isAdmin ? '🎧 Trung tâm CSKH' : '💬 Chat'}
                </h5>
                <div className="input-group input-group-sm">
                    <span className="input-group-text bg-white border-end-0 rounded-pill-start text-muted">🔍</span>
                    <input type="text" className="form-control border-start-0 rounded-pill-end" placeholder="Tìm người dùng..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
            </div>

            <div className="flex-grow-1 overflow-auto">
                {isLoadingList && <div className="p-3 text-center text-muted small">Đang tải...</div>}
                {searchTerm.trim() !== '' ? (
                    <>
                        <div className="px-3 pt-3 pb-1 text-muted small fw-bold text-uppercase">Kết quả tìm kiếm</div>
                        {searchResults.length === 0 && <div className="p-3 text-center text-muted small">Không tìm thấy ai phù hợp 😥</div>}
                        {searchResults.map(result => {
                            const isOnline = onlineUsers.includes(result._id);
                            return (
                            <div key={result._id} className="d-flex align-items-center gap-3 p-3 border-bottom transition-all" style={{cursor: 'pointer'}} onClick={() => handleSelectConversation(result)} onMouseOver={e=>e.currentTarget.style.backgroundColor='#f8f9fa'} onMouseOut={e=>e.currentTarget.style.backgroundColor='transparent'}>
                                <div className="position-relative">
                                    <div className="bg-warning text-white rounded-circle fw-bold d-flex justify-content-center align-items-center shadow-sm" style={{width:'45px', height:'45px', overflow:'hidden'}}>{getAvatar(result)}</div>
                                    {isOnline && <span className="position-absolute bottom-0 end-0 bg-success border border-white rounded-circle" style={{width:'12px', height:'12px'}}></span>}
                                </div>
                                <div className="flex-grow-1 overflow-hidden">
                                    <div className="fw-bold text-dark text-truncate">{result.name}</div>
                                    <div className="text-muted small text-truncate">{result.email}</div>
                                </div>
                            </div>
                        )})}
                    </>
                ) : (
                    <>
                        {inboxList.length === 0 && !isLoadingList && (
                            <div className="p-5 text-center text-muted">
                                <div style={{fontSize:'40px'}}>💬</div>
                                <p className="mt-2 small">Chưa có cuộc hội thoại nào.</p>
                            </div>
                        )}
                        {inboxList.map(item => {
                            const otherUser = item.otherUser;
                            const isSelected = selectedReceiver?._id === otherUser._id;
                            const senderId = item.lastMessage.sender?._id || item.lastMessage.sender;
                            const isUnread = !item.lastMessage.isRead && String(senderId) === String(otherUser._id);
                            const isOnline = onlineUsers.includes(otherUser._id);

                            return (
                                <div key={otherUser._id} className={`d-flex align-items-center p-3 border-bottom transition-all position-relative ${isSelected ? 'bg-warning-subtle' : ''}`} style={{cursor: 'pointer'}} onClick={() => handleSelectConversation(otherUser)} onMouseOver={e=>!isSelected && (e.currentTarget.style.backgroundColor='#f8f9fa')} onMouseOut={e=>!isSelected && (e.currentTarget.style.backgroundColor='transparent')}>
                                    <div className="position-relative flex-shrink-0">
                                        <div className="bg-warning text-white rounded-circle fw-bold d-flex justify-content-center align-items-center shadow-sm" style={{width:'50px', height:'50px', overflow:'hidden'}}>{getAvatar(otherUser)}</div>
                                        {isOnline && <span className="position-absolute bottom-0 end-0 bg-success border border-2 border-white rounded-circle" style={{width:'14px', height:'14px'}}></span>}
                                    </div>
                                    <div className="flex-grow-1 overflow-hidden ms-3">
                                        <div className="d-flex justify-content-between align-items-center mb-1">
                                            <div className={`text-truncate ${isUnread ? 'fw-bold text-dark fs-6' : 'fw-semibold text-secondary'}`} style={{maxWidth: '70%'}}>{otherUser.name}</div>
                                            <small className={isUnread ? 'text-primary fw-bold' : 'text-muted'} style={{fontSize: '11px'}}>{formatTime(item.lastMessage.createdAt || item.lastMessage.timestamp)}</small>
                                        </div>
                                        <div className={`small text-truncate ${isUnread ? 'fw-bold text-dark' : 'text-muted'}`}>
                                            {item.lastMessage.sender === user?._id ? 'Bạn: ' : ''}
                                            {item.lastMessage.content || ((item.lastMessage.images?.length > 0 || item.lastMessage.image) ? '📷 Đã gửi ảnh' : '📦 Đã gửi sản phẩm')}
                                        </div>
                                    </div>
                                    {isUnread && !isSelected && <div className="ms-2 d-flex align-items-center"><span className="bg-danger rounded-circle shadow-sm" style={{width:'12px', height:'12px'}}></span></div>}
                                    {isSelected && <div className="position-absolute top-0 start-0 bottom-0 bg-warning" style={{width:'4px'}}></div>}
                                </div>
                            );
                        })}
                    </>
                )}
            </div>
          </div>

          <div className="col-8 d-flex flex-column bg-white h-100">
            {selectedReceiver ? (
              <>
                <div className="bg-white shadow-sm px-4 py-3 d-flex align-items-center gap-3 border-bottom sticky-top" style={{zIndex:10}}>
                    <div className="position-relative">
                        <div className="bg-warning text-white rounded-circle fw-bold d-flex justify-content-center align-items-center shadow-sm" style={{width:'45px', height:'45px', overflow:'hidden'}}>{getAvatar(selectedReceiver)}</div>
                        {onlineUsers.includes(selectedReceiver._id) && <span className="position-absolute bottom-0 end-0 bg-success border border-white rounded-circle" style={{width:'12px', height:'12px'}}></span>}
                    </div>
                    <div className="flex-grow-1">
                        <h6 className="fw-bold mb-0">{selectedReceiver.name}</h6>
                        <small className={`small fw-bold ${onlineUsers.includes(selectedReceiver._id) ? 'text-success' : 'text-secondary'}`}>{onlineUsers.includes(selectedReceiver._id) ? '● Đang hoạt động' : '○ Ngoại tuyến'}</small>
                    </div>
                </div>

                <div className="flex-grow-1 overflow-auto p-4 d-flex flex-column gap-3" style={{ backgroundColor: '#f9f9f9', minHeight: 0 }}>
                    {messages.map((m, idx) => (
                    <div key={idx} ref={scrollRef} className={`d-flex ${m.sender === user?._id ? 'justify-content-end' : 'justify-content-start'}`}>
                        <div className={`p-3 rounded-4 shadow-sm max-vw-75 ${m.sender === user?._id ? 'bg-warning text-white' : 'bg-white'}`} style={{ maxWidth: '70%', borderRadius: m.sender === user?._id ? '20px 20px 0 20px' : '20px 20px 20px 0' }}>
                        {m.post && (
                            <div className="bg-light text-dark p-2 rounded-3 mb-2 border d-flex align-items-center gap-3" style={{cursor:'pointer'}} onClick={() => navigate(`/post/${m.post._id}`)}>
                                <img src={getImageUrl(m.post.images?.[0] || m.post.image)} loading="lazy" style={{width:'50px', height:'50px', objectFit:'cover', borderRadius:'8px'}} alt="sp" />
                                <div className="overflow-hidden">
                                    <small className="fw-bold d-block text-truncate">{m.post.title}</small>
                                    <strong className="text-danger small">{Number(m.post.price).toLocaleString('vi-VN')} đ</strong>
                                </div>
                            </div>
                        )}
                        {m.content && <p className="mb-1" style={{wordBreak:'break-word'}}>{m.content}</p>}
                        {(() => {
                            const imgLink = m.image || (m.images && m.images.length > 0 ? m.images[0] : null);
                            return imgLink ? <img src={getImageUrl(imgLink)} alt="chat-img" loading="lazy" className="img-fluid rounded-3 mt-1" style={{maxHeight: '200px', objectFit:'cover'}} /> : null;
                        })()}
                        <div className="text-end mt-1" style={{fontSize: '9px', opacity: 0.7}}>{formatTime(m.createdAt || m.timestamp)}</div>
                        </div>
                    </div>
                    ))}
                </div>

                <div className="p-3 bg-white border-top mt-auto">
                    {linkedPost && (
                        <div className="bg-warning-subtle p-2 rounded-3 mb-3 border border-warning d-flex justify-content-between align-items-center gap-3">
                            <div className="d-flex align-items-center gap-3">
                                <img src={getImageUrl(linkedPost.images?.[0] || linkedPost.image)} style={{width:'40px', height:'40px', objectFit:'cover', borderRadius:'6px'}} alt="preview" />
                                <div className="overflow-hidden">
                                    <small className="fw-bold d-block text-truncate text-warning-emphasis" style={{fontSize:'12px'}}>{linkedPost.title}</small>
                                    <strong className="text-danger small">{Number(linkedPost.price).toLocaleString('vi-VN')} đ</strong>
                                </div>
                            </div>
                            <button onClick={() => setLinkedPost(null)} className="btn btn-sm btn-outline-warning rounded-circle py-0 px-2 fw-bold">✕</button>
                        </div>
                    )}
                    {previewImage && (
                        <div className="position-relative d-inline-block mb-3">
                            <img src={previewImage} style={{height: '80px', borderRadius: '8px', border: '1px solid #ddd'}} alt="preview" />
                            <button onClick={() => { setSelectedImage(null); setPreviewImage(null); fileInputRef.current.value = ''; }} className="btn btn-sm btn-danger rounded-circle position-absolute top-0 start-100 translate-middle py-0 px-1">✕</button>
                        </div>
                    )}
                    <form onSubmit={handleSendMessage} className="d-flex align-items-center gap-2">
                    <input type="file" hidden ref={fileInputRef} onChange={handleImageSelect} accept="image/*" />
                    <button type="button" onClick={() => fileInputRef.current.click()} className="btn btn-light rounded-circle shadow-sm" style={{width: '45px', height: '45px'}}>📷</button>
                    <input type="text" className="form-control rounded-pill px-4 bg-light border-0 py-2" placeholder={`Nhắn tin...`} value={newMessage} onChange={(e) => setNewMessage(e.target.value)} />
                    <button type="submit" className="btn btn-warning rounded-circle shadow-sm d-flex justify-content-center align-items-center" style={{width: '45px', height: '45px'}}>✈️</button>
                    </form>
                </div>
              </>
            ) : (
              <div className="h-100 d-flex flex-column justify-content-center align-items-center bg-light text-muted p-5 text-center">
                <div style={{fontSize:'80px', opacity: 0.3}}>
                    {isAdmin ? '🎧' : '💬'}
                </div>
                <h4 className="fw-bold mt-3 text-dark">
                    {isAdmin ? 'Chào mừng Admin đến với Trung tâm Hỗ trợ!' : 'Chào mừng đến với HaiHand Chat!'}
                </h4>
                <p className="mt-2">Chọn một người từ danh sách bên trái hoặc sử dụng thanh tìm kiếm để bắt đầu trò chuyện.</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default ChatPage;