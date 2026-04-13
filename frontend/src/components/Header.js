import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom'; 
import axios from 'axios';
import { io } from 'socket.io-client';
import './Header.css'; 

const Header = ({ keyword: propKeyword, setKeyword: propSetKeyword, onSearch, location: propLocation, setLocation: propSetLocation }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams(); 
  
  const [localKeyword, setLocalKeyword] = useState(searchParams.get('search') || '');
  const [localLocation, setLocalLocation] = useState('Toàn quốc');
  const keyword = propKeyword !== undefined ? propKeyword : localKeyword;
  const location = propLocation !== undefined ? propLocation : localLocation;

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  
  // 🚀 STATE CHO THÔNG BÁO
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notifCount, setNotifCount] = useState(0);

  const [cartCount, setCartCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [categories, setCategories] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [tempCity, setTempCity] = useState('');
  const [tempDistrict, setTempDistrict] = useState('');
  
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored && stored !== "undefined" ? JSON.parse(stored) : null;
  });

  const socket = useRef();
  const API_URL = 'http://localhost:4000';

  useEffect(() => {
    axios.get(`${API_URL}/api/categories`).then(({ data }) => setCategories([{name: 'Tất cả', icon: '🏠'}, ...data])).catch(console.error);
    axios.get('https://provinces.open-api.vn/api/?depth=2').then(res => setProvinces(res.data)).catch(console.error);

    if (user?._id) {
      const fetchCounts = () => {
        axios.get(`${API_URL}/api/users/cart/${user._id}`).then(({ data }) => setCartCount(data.length)).catch(console.error);
        axios.get(`${API_URL}/api/messages/unread-count/${user._id}`).then(({ data }) => setUnreadCount(data.count)).catch(console.error);
      };
      
      // 🚀 HÀM LẤY THÔNG BÁO TỰ ĐỘNG
      const fetchNotifications = () => {
        axios.get(`${API_URL}/api/users/${user._id}/notifications`).then(({ data }) => {
            setNotifications(data.notifications);
            setNotifCount(data.unreadCount);
        }).catch(console.error);
      };

      fetchCounts();
      fetchNotifications();

      // Cho phép auto reload thông báo mỗi 10s
      const notifInterval = setInterval(fetchNotifications, 10000);

      const handleUserUpdate = () => setUser(JSON.parse(localStorage.getItem('user')));

      socket.current = io(API_URL, {
         transports: ["websocket", "polling"],
         reconnection: true
    });
      socket.current.emit('addUser', user._id);
      socket.current.on('getMessage', () => setUnreadCount(prev => prev + 1));

      window.addEventListener('cartUpdated', fetchCounts);
      window.addEventListener('messagesRead', fetchCounts);
      window.addEventListener('storage', handleUserUpdate); 
      window.addEventListener('userUpdated', handleUserUpdate); 

      return () => {
        clearInterval(notifInterval);
        window.removeEventListener('cartUpdated', fetchCounts);
        window.removeEventListener('messagesRead', fetchCounts);
        window.removeEventListener('storage', handleUserUpdate);
        window.removeEventListener('userUpdated', handleUserUpdate);
        socket.current?.disconnect();
      };
    }
  }, [user?._id]);

  const handleKeywordChange = (e) => { if (propSetKeyword) propSetKeyword(e.target.value); else setLocalKeyword(e.target.value); };
  const handleSearchSubmit = () => { if (onSearch) onSearch(); else { let url = '/?'; if (keyword.trim()) url += `search=${keyword}&`; if (location !== 'Toàn quốc') url += `location=${location}`; navigate(url); } };
  
  useEffect(() => { if (tempCity) { const city = provinces.find(p => p.name === tempCity); setDistricts(city ? city.districts : []); } else { setDistricts([]); } setTempDistrict(''); }, [tempCity, provinces]);
  
  const handleApplyLocation = () => { let finalLoc = 'Toàn quốc'; if (tempCity) { finalLoc = tempDistrict ? `${tempDistrict}, ${tempCity}` : tempCity; } if (propSetLocation) propSetLocation(finalLoc); else setLocalLocation(finalLoc); setShowLocationModal(false); };
  const handleCategoryClick = (catName) => { setShowCategoryMenu(false); navigate(`/?category=${catName}`); };

  // 🚀 HÀM ĐÁNH DẤU ĐÃ ĐỌC VÀ CHUYỂN TRANG
  const handleNotificationClick = async (link) => {
      setShowNotifMenu(false);
      try { await axios.post(`${API_URL}/api/users/${user._id}/notifications/read`); setNotifCount(0); } catch(e){}
      if(link) navigate(link);
  };

  return (
    <header className="bg-warning py-3 shadow-sm sticky-top" style={{ zIndex: 1040 }}>
      <div className="container d-flex justify-content-between align-items-center">
        
        <div className="d-flex align-items-center gap-4">
          <h2 className="fw-bold m-0 text-white hover-scale" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>HaiHand</h2>
          <div className="position-relative" onMouseEnter={() => setShowCategoryMenu(true)} onMouseLeave={() => setShowCategoryMenu(false)}>
              <div className="d-flex align-items-center gap-2 text-white px-3 py-2 rounded-3" style={{cursor: 'pointer'}}>
                  <span className="fs-4 fw-bold">≡</span><span className="fw-bold d-none d-md-block">Danh mục</span>
              </div>
              {showCategoryMenu && (
                  <div className="position-absolute bg-white shadow-lg rounded-3 py-2" style={{top: '100%', left: '0', width: '260px', zIndex: 1050, border: '1px solid #eaeaea'}}>
                      {categories.map((cat, idx) => (
                          <div key={idx} className="px-3 py-2 d-flex align-items-center gap-3 transition-all" style={{cursor: 'pointer'}} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'} onClick={() => handleCategoryClick(cat.name)}>
                              <div className="d-flex justify-content-center align-items-center bg-light rounded-circle shadow-sm" style={{width: '35px', height: '35px', overflow: 'hidden'}}>
                                  {cat.name === 'Tất cả' ? <span style={{fontSize: '18px'}}>{cat.icon}</span> : <img src={cat.image?.startsWith('http') ? cat.image : `${API_URL}/uploads/${cat.image}`} style={{width: '100%', height: '100%', objectFit: 'cover'}} alt={cat.name} onError={(e) => e.target.src='https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg'}/>}
                              </div>
                              <span className="fw-bold text-dark" style={{fontSize: '14px'}}>{cat.name}</span>
                          </div>
                      ))}
                  </div>
              )}
          </div>
        </div>
        
        <div className="search-bar-wrapper shadow-sm mx-3 d-flex align-items-center bg-white" style={{ borderRadius: '50px', padding: '5px 8px', maxWidth: '600px', flex: 1 }}>
            <span className="ms-2 text-muted">🔍</span>
            <input type="text" className="search-input" placeholder="Tìm sản phẩm, danh mục..." value={keyword} onChange={handleKeywordChange} onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()} style={{ border: 'none', outline: 'none', padding: '10px', flex: 1, background: 'transparent' }} />
            <div className="position-relative border-start border-2 px-3 py-1 d-flex align-items-center" style={{ minWidth: '140px' }}>
                <div className="d-flex align-items-center w-100" style={{ cursor: 'pointer' }} onClick={() => setShowLocationModal(!showLocationModal)}>
                    <span className="fw-bold text-muted text-truncate" style={{maxWidth: '120px'}} title={location}>{location.split(',')[0]}</span><span className="ms-2 text-muted small">▼</span>
                </div>
                {showLocationModal && (
                    <div className="position-absolute bg-white p-3 rounded-4 shadow-lg" style={{ top: '140%', right: '0', width: '300px', zIndex: 1060, border: '1px solid #eaeaea' }}>
                        <h6 className="fw-bold mb-3 text-center text-dark">Khu vực</h6>
                        <div className="mb-3">
                            <label className="form-label fw-bold small text-muted mb-1">Chọn tỉnh thành <span className="text-danger">*</span></label>
                            <select className="form-select border-2 rounded-3" value={tempCity} onChange={e => { setTempCity(e.target.value); setTempDistrict(''); }}>
                                <option value="">Toàn quốc</option>
                                {provinces.map(p => <option key={p.code} value={p.name}>{p.name}</option>)}
                            </select>
                        </div>
                        <div className="mb-3">
                            <label className="form-label fw-bold small text-muted mb-1">Chọn quận huyện <span className="text-danger">*</span></label>
                            <select className="form-select border-2 rounded-3" value={tempDistrict} onChange={e => setTempDistrict(e.target.value)} disabled={!tempCity}>
                                <option value="">Tất cả quận huyện</option>
                                {districts.map(d => <option key={d.code} value={d.name}>{d.name}</option>)}
                            </select>
                        </div>
                        <button className="btn btn-warning w-100 fw-bold rounded-pill text-dark" onClick={handleApplyLocation}>Áp dụng</button>
                    </div>
                )}
            </div>
            <button className="search-button rounded-pill px-4 fw-bold bg-dark text-white border-0 py-2 ms-1" onClick={handleSearchSubmit}>Tìm kiếm</button>
        </div>

        <div className="d-flex align-items-center gap-3">
          
          <div className="position-relative d-flex align-items-center justify-content-center bg-white rounded-circle shadow-sm hover-scale" style={{ width: '40px', height: '40px', cursor: 'pointer', fontSize: '18px' }} onClick={() => { if (!user) { alert("Đăng nhập đi!"); navigate('/login'); } else navigate('/cart'); }}>
            🛒 {cartCount > 0 && <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" style={{fontSize: '10px'}}>{cartCount}</span>}
          </div>

          {user ? (
            <div className="d-flex align-items-center gap-3">
                <div className="text-white position-relative hover-scale d-flex align-items-center justify-content-center" style={{cursor: 'pointer', fontSize: '20px', width: '40px', height: '40px'}} onClick={() => navigate('/chat')} title="Hộp thư">
                    💬 {unreadCount > 0 && <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger border border-white shadow-sm" style={{fontSize: '10px'}}>{unreadCount}</span>}
                </div>

                {/* 🚀 🔔 NÚT THÔNG BÁO */}
                <div className="position-relative" onMouseEnter={() => setShowNotifMenu(true)} onMouseLeave={() => setShowNotifMenu(false)}>
                    <div className="text-white position-relative hover-scale d-flex align-items-center justify-content-center" style={{cursor: 'pointer', fontSize: '20px', width: '40px', height: '40px'}}>
                        🔔 {notifCount > 0 && <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger border border-white shadow-sm animate__animated animate__heartBeat animate__infinite" style={{fontSize: '10px'}}>{notifCount}</span>}
                    </div>

                    {showNotifMenu && (
                        <div className="position-absolute bg-white shadow-lg rounded-4 overflow-hidden" style={{top: '100%', right: '-50px', width: '350px', zIndex: 1050, border: '1px solid #eaeaea'}}>
                            <div className="bg-light p-3 border-bottom d-flex justify-content-between align-items-center">
                                <h6 className="fw-bold mb-0 text-dark">Thông báo của bạn</h6>
                                <button onClick={() => handleNotificationClick()} className="btn btn-sm btn-link text-decoration-none text-primary p-0" style={{fontSize: '12px'}}>Đánh dấu đã đọc</button>
                            </div>
                            <div style={{maxHeight: '400px', overflowY: 'auto'}}>
                                {notifications.length === 0 && <div className="p-4 text-center text-muted small">Chưa có thông báo nào.</div>}
                                {notifications.map((n, i) => (
                                    <div key={i} onClick={() => handleNotificationClick(n.link)} className={`p-3 border-bottom d-flex gap-3 hover-scale transition-all ${!n.isRead ? 'bg-primary-subtle' : ''}`} style={{cursor: 'pointer'}}>
                                        <div className="bg-white rounded-circle d-flex align-items-center justify-content-center shadow-sm" style={{width: '40px', height: '40px', flexShrink: 0, fontSize: '20px'}}>{n.title.includes('đơn')?'📦': n.title.includes('tiền')?'💰':'✨'}</div>
                                        <div>
                                            <h6 className="fw-bold text-dark mb-1" style={{fontSize: '13px'}}>{n.title}</h6>
                                            <p className="text-muted mb-1" style={{fontSize: '12px', lineHeight: '1.4'}}>{n.message}</p>
                                            <small className="text-secondary" style={{fontSize: '10px'}}>{new Date(n.createdAt).toLocaleString('vi-VN')}</small>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                
                <div className="position-relative" onMouseEnter={() => setShowProfileMenu(true)} onMouseLeave={() => setShowProfileMenu(false)}>
                    <div className="d-flex align-items-center gap-2 bg-warning-subtle p-1 pe-3 rounded-pill" style={{cursor:'pointer'}}>
                        <div className="bg-white text-warning rounded-circle fw-bold d-flex justify-content-center align-items-center shadow-sm" style={{width:'35px', height:'35px', overflow: 'hidden'}}>
                            {user.avatar ? <img src={user.avatar} style={{width:'100%', height:'100%', objectFit:'cover'}} alt="avt" /> : user.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="fw-bold text-white d-none d-md-block small">{user.name} ▾</span>
                    </div>

                    {showProfileMenu && (
                        <div className="position-absolute bg-white shadow-lg rounded-4 p-3" style={{top: '100%', right: '0', width: '280px', border: '1px solid #eaeaea', zIndex: 1050}}>
                            <div className="d-flex align-items-center gap-3 mb-3 border-bottom pb-3">
                               <div className="bg-warning text-white rounded-circle fw-bold d-flex justify-content-center align-items-center" style={{width:'50px', height:'50px', fontSize: '20px', overflow: 'hidden'}}>
                                  {user.avatar ? <img src={user.avatar} style={{width:'100%', height:'100%', objectFit:'cover'}} alt="avt" /> : user.name.charAt(0).toUpperCase()}
                               </div>
                               <div><h6 className="fw-bold mb-0 text-dark">{user.name}</h6><small className="text-muted">{user.email}</small></div>
                            </div>
                            
                            <div onClick={() => navigate('/haipay')} className="mb-2 d-flex justify-content-between align-items-center px-3 py-2 rounded-3 hover-scale shadow-sm" style={{cursor: 'pointer', backgroundColor: '#e7f1ff', border: '1px solid #cfe2ff'}}>
                                <span className="fw-bold text-primary" style={{fontSize: '14px'}}>💳 Ví HàiPay</span>
                                <span className="badge bg-primary rounded-pill">{(user.walletBalance || 0).toLocaleString('vi-VN')} đ</span>
                            </div>

                            <ul className="list-unstyled mb-0">
                               <li className="mb-1"><div onClick={() => navigate('/profile')} className="d-block text-dark text-decoration-none px-3 py-2 rounded-3 hover-scale" style={{cursor: 'pointer', backgroundColor: '#f8f9fa'}}>👤 Quản lý cá nhân</div></li>
                               <li className="mb-1"><div onClick={() => navigate('/favorites')} className="d-block text-dark text-decoration-none px-3 py-2 rounded-3 hover-scale" style={{cursor: 'pointer', backgroundColor: '#f8f9fa'}}>❤️ Tin đăng đã lưu</div></li>
                               {/* 🚀 ĐÃ THÊM MỤC BẠN BÈ (THEO DÕI) Ở ĐÂY */}
                               <li className="mb-1"><div onClick={() => navigate('/followed/followed')} className="d-block text-dark text-decoration-none px-3 py-2 rounded-3 hover-scale" style={{cursor: 'pointer', backgroundColor: '#f8f9fa'}}>👥 Bạn bè (Theo dõi)</div></li>
                               <li className="border-top pt-2 mt-1"><div onClick={() => { localStorage.removeItem('user'); window.location.href='/login'; }} className="d-block text-danger fw-bold text-decoration-none px-3 py-2 rounded-3 hover-scale" style={{cursor: 'pointer', backgroundColor: '#fff5f5'}}>🚪 Đăng xuất</div></li>
                            </ul>
                        </div>
                    )}
                </div>
            </div>
          ) : <button onClick={() => navigate('/login')} className="btn btn-light fw-bold text-warning rounded-pill px-4 shadow-sm">Đăng nhập</button>}
        </div>
      </div>
    </header>
  );
};

export default Header;