import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import './Header.css';

const Header = ({ keyword: propKeyword, setKeyword: propSetKeyword, onSearch, location: propLocation, setLocation: propSetLocation }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const urlSearch = searchParams.get('search') || '';
  const urlLocation = searchParams.get('location') || 'Toàn quốc';

  const [localKeyword, setLocalKeyword] = useState(urlSearch);
  const [localLocation, setLocalLocation] = useState(urlLocation);
  
  const keyword = propKeyword !== undefined ? propKeyword : localKeyword;
  const location = propLocation !== undefined ? propLocation : localLocation;

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);

  const [notifications, setNotifications] = useState([]);
  const [notifCount, setNotifCount] = useState(0);
  const [cartCount, setCartCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [user, setUser] = useState(null);

  const [provinces, setProvinces] = useState([]);
  const [filteredProvinces, setFilteredProvinces] = useState([]);
  const [locationSearchKeyword, setLocationSearchKeyword] = useState('');

  const API_URL = process.env.REACT_APP_API_URL || 'https://haihand-marketplace.onrender.com';

  // Lấy danh sách tỉnh thành
  useEffect(() => {
    const fetchProvinces = async () => {
        try {
            const { data } = await axios.get('https://provinces.open-api.vn/api/?depth=1');
            setProvinces(data);
            setFilteredProvinces(data);
        } catch (error) {
            console.error("Lỗi lấy danh sách tỉnh thành:", error);
        }
    };
    fetchProvinces();
  }, []);

  const handleLocationSearch = (e) => {
      const keyword = e.target.value.toLowerCase();
      setLocationSearchKeyword(keyword);
      const filtered = provinces.filter(p => p.name.toLowerCase().includes(keyword));
      setFilteredProvinces(filtered);
  };

  const handleSelectLocation = (locName) => {
      if (propSetLocation) propSetLocation(locName);
      else setLocalLocation(locName);
      setShowLocationModal(false);
      navigate(`/?location=${encodeURIComponent(locName)}`);
  };

  // Lấy thông tin user và số lượng giỏ hàng/thông báo
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      
      const fetchCounts = async () => {
          try {
              const resCart = await axios.get(`${API_URL}/api/cart/${parsedUser._id}`);
              setCartCount(resCart.data.items?.length || 0);
          } catch(e) { console.error("Lỗi đếm giỏ hàng:", e); }
      };
      fetchCounts();
    }
  }, [API_URL]);

  const handleSearchSubmit = (e) => {
    if (e.key === 'Enter' || e.type === 'click') {
        const queryParams = new URLSearchParams();
        if (keyword) queryParams.set('search', keyword);
        if (location !== 'Toàn quốc') queryParams.set('location', location);
        
        navigate(`/?${queryParams.toString()}`);
        if (onSearch) onSearch();
    }
  };

  return (
    <header className="bg-white border-bottom shadow-sm">
      <div className="container py-2 d-flex align-items-center justify-content-between gap-3 flex-wrap flex-md-nowrap">
        
        {/* 1. LOGO */}
        <Link to="/" className="text-decoration-none">
          <h2 className="fw-bold text-warning mb-0 m-0" style={{ cursor: 'pointer', minWidth: '120px' }}>HaiHand</h2>
        </Link>

        {/* 2. CỤM TÌM KIẾM & BỘ LỌC ĐỊA ĐIỂM */}
        <div className="d-flex flex-grow-1 align-items-center gap-2 w-100 w-md-auto mt-2 mt-md-0 position-relative">
          <div className="input-group" style={{ maxWidth: '400px' }}>
             <input
                type="text"
                className="form-control bg-light border-0 px-3 py-2"
                placeholder="Tìm kiếm sản phẩm..."
                value={keyword}
                onChange={(e) => propSetKeyword ? propSetKeyword(e.target.value) : setLocalKeyword(e.target.value)}
                onKeyDown={handleSearchSubmit}
             />
             <button className="btn btn-warning px-3" onClick={handleSearchSubmit}>🔍</button>
          </div>
          
          <button onClick={() => setShowLocationModal(!showLocationModal)} className="btn btn-light border text-truncate" style={{ maxWidth: '150px' }}>
              📍 {location}
          </button>
        </div>

        {/* MODAL CHỌN ĐỊA ĐIỂM */}
        {showLocationModal && (
            <div className="position-absolute bg-white shadow-lg border rounded-3 p-3" style={{ top: '60px', left: '50%', transform: 'translateX(-50%)', width: '350px', zIndex: 1050 }}>
                <div className="d-flex justify-content-between mb-3">
                    <h6 className="fw-bold m-0">Chọn khu vực</h6>
                    <button className="btn-close" onClick={() => setShowLocationModal(false)}></button>
                </div>
                <input type="text" className="form-control mb-2" placeholder="Tìm tỉnh/thành phố..." value={locationSearchKeyword} onChange={handleLocationSearch} />
                <button className={`btn btn-outline-warning w-100 mb-2 ${location === 'Toàn quốc' ? 'active' : ''}`} onClick={() => handleSelectLocation('Toàn quốc')}>🌍 Toàn quốc</button>
                <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                    {filteredProvinces.map(p => (
                        <div key={p.code} className="p-2 cursor-pointer hover-bg-light rounded" onClick={() => handleSelectLocation(p.name)}>{p.name}</div>
                    ))}
                </div>
            </div>
        )}

        {/* 3. CỤM BÊN PHẢI: NÚT ĐĂNG TIN VÀ USER */}
        <div className="d-flex align-items-center gap-3">
          
          {/* 🚀 NÚT ĐĂNG TIN (GIỮ IM Ở ĐÂY, LUÔN HIỂN THỊ) */}
          <Link 
            to="/create-post" 
            className="btn btn-warning fw-bold text-dark d-flex align-items-center gap-1 shadow-sm rounded-pill px-3"
          >
            <span className="fs-5 lh-1">+</span>
            <span className="d-none d-sm-inline">Đăng tin</span>
          </Link>

          {/* CÁC CHỨC NĂNG NGƯỜI DÙNG */}
          {user ? (
            <div className="d-flex align-items-center gap-3">
                <div className="position-relative" style={{cursor: 'pointer'}} onClick={() => navigate('/chat')}>
                    💬 
                    {unreadCount > 0 && <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" style={{fontSize: '0.6rem'}}>{unreadCount}</span>}
                </div>
                
                <div className="position-relative" style={{cursor: 'pointer'}} onClick={() => setShowNotifMenu(!showNotifMenu)}>
                    🔔 
                    {notifCount > 0 && <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" style={{fontSize: '0.6rem'}}>{notifCount}</span>}
                </div>
                
                <div className="position-relative" style={{cursor: 'pointer'}} onClick={() => navigate('/cart')}>
                    🛒 
                    {cartCount > 0 && <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" style={{fontSize: '0.6rem'}}>{cartCount}</span>}
                </div>

                <div className="position-relative">
                    <img
                        src={user.avatar || 'https://via.placeholder.com/40'}
                        alt="avatar"
                        className="rounded-circle border"
                        style={{ width: '40px', height: '40px', objectFit: 'cover', cursor: 'pointer' }}
                        onClick={() => setShowProfileMenu(!showProfileMenu)}
                    />
                    {showProfileMenu && (
                        <div className="position-absolute bg-white shadow-lg rounded-4 p-3" style={{ right: 0, top: '50px', width: '280px', border: '1px solid #eee', zIndex: 1050 }}>
                            <div className="d-flex align-items-center gap-3 mb-3 pb-3 border-bottom">
                               <img src={user.avatar || 'https://via.placeholder.com/50'} alt="avatar" className="rounded-circle border" style={{ width: '50px', height: '50px', objectFit: 'cover' }} />
                               <div>
                                   <div className="fw-bold fs-6 text-truncate" style={{maxWidth: '180px'}}>{user.name || 'Người dùng'}</div>
                                   <div className="text-muted small text-truncate" style={{maxWidth: '180px'}}>@{user.email.split('@')[0]}</div>
                               </div>
                            </div>
                            <div className="bg-light rounded-3 p-2 mb-3 text-center">
                                <span className="small text-muted">Số dư HaiPay: </span>
                                <span className="fw-bold text-success">{Number(user.balance || 0).toLocaleString('vi-VN')} đ</span>
                            </div>
                            <ul className="list-unstyled mb-0">
                               <li className="mb-1"><div onClick={() => navigate('/profile')} className="d-block text-dark px-3 py-2 rounded-3 hover-bg-light" style={{cursor: 'pointer'}}>👤 Quản lý cá nhân</div></li>
                               <li className="mb-1"><div onClick={() => navigate('/favorites')} className="d-block text-dark px-3 py-2 rounded-3 hover-bg-light" style={{cursor: 'pointer'}}>❤️ Tin đăng đã lưu</div></li>
                               <li className="mb-1"><div onClick={() => navigate('/followed/followed')} className="d-block text-dark px-3 py-2 rounded-3 hover-bg-light" style={{cursor: 'pointer'}}>👥 Bạn bè (Theo dõi)</div></li>
                               {user.role === 'Admin' && (
                                   <li className="mb-1">
                                       <a href="https://haihand-marketplace.onrender.com/admin" target="_blank" rel="noopener noreferrer" className="d-block text-primary fw-bold px-3 py-2 rounded-3 hover-bg-light text-decoration-none">⚙️ Quản trị hệ thống</a>
                                   </li>
                               )}
                               <li className="border-top pt-2 mt-1"><div onClick={() => { localStorage.clear(); window.location.href='/login'; }} className="d-block text-danger fw-bold px-3 py-2 rounded-3 hover-bg-light" style={{cursor: 'pointer'}}>🚪 Đăng xuất</div></li>
                            </ul>
                        </div>
                    )}
                </div>
            </div>
          ) : (
            <button onClick={() => navigate('/login')} className="btn btn-light fw-bold text-warning rounded-pill px-4 shadow-sm border">Đăng nhập</button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;