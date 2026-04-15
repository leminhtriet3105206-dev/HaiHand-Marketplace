import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import './Header.css';

const Header = () => {
  const [user, setUser] = useState(null);
  const [categories, setCategories] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  // Khôi phục nguyên vẹn Logic lấy thông tin User và Categories của bác
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) setUser(JSON.parse(storedUser));

    const fetchCategories = async () => {
      try {
        const API_URL = process.env.REACT_APP_API_URL || 'https://haihand-marketplace.onrender.com';
        const response = await axios.get(`${API_URL}/api/categories`);
        setCategories(response.data);
      } catch (error) {
        console.error('Lỗi khi lấy danh mục:', error);
      }
    };
    fetchCategories();
  }, [location]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
    navigate('/login');
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${searchQuery}`);
    }
  };

  return (
    // Thêm class 'sticky-top' để Header luôn nằm trên cùng khi cuộn trang
    <nav className="navbar navbar-expand-lg navbar-light bg-white shadow-sm border-bottom py-2 sticky-top" style={{ zIndex: 1030 }}>
      <div className="container d-flex align-items-center">
        
        {/* LOGO */}
        <Link className="navbar-brand fw-bold text-warning fs-3 m-0" to="/">HaiHand</Link>

        {/* CỤM NÚT BÊN PHẢI: Luôn hiển thị (Gắn cứng nút Đăng tin ở đây) */}
        <div className="d-flex align-items-center ms-auto order-lg-3">
          
          {/* NÚT ĐĂNG TIN DUY NHẤT TRÊN HEADER */}
          <Link 
            to="/create-post" 
            className="btn btn-warning fw-bold text-dark d-flex align-items-center gap-1 shadow-sm rounded-pill px-3 py-2 ms-2"
          >
            <span style={{ fontSize: '1.2rem', lineHeight: '1' }}>+</span>
            <span className="d-none d-sm-inline">Đăng tin</span>
          </Link>

          {/* USER DROPDOWN / ĐĂNG NHẬP */}
          {user ? (
            <div className="dropdown ms-2 ms-sm-3">
              <button className="btn d-flex align-items-center gap-2 border-0 p-0 dropdown-toggle no-caret" type="button" id="userDropdown" data-bs-toggle="dropdown" aria-expanded="false">
                <img 
                  src={user.avatar || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'} 
                  alt="Avatar" 
                  className="rounded-circle border" 
                  style={{ width: '38px', height: '38px', objectFit: 'cover' }} 
                />
                <span className="fw-bold d-none d-md-inline small">{user.name}</span>
              </button>
              <ul className="dropdown-menu dropdown-menu-end shadow-lg border-0 mt-2 rounded-3" aria-labelledby="userDropdown">
                <li><Link className="dropdown-item py-2" to="/profile">👤 Trang cá nhân</Link></li>
                <li><Link className="dropdown-item py-2" to="/my-posts">📦 Tin đã đăng</Link></li>
                {user.role === 'Admin' && (
                  <li>
                    <a className="dropdown-item py-2" href="https://haihand-marketplace.onrender.com/admin" target="_blank" rel="noopener noreferrer">
                      ⚙️ Quản trị hệ thống
                    </a>
                  </li>
                )}
                <li><hr className="dropdown-divider" /></li>
                <li><button className="dropdown-item py-2 text-danger fw-bold" onClick={handleLogout}>🚪 Đăng xuất</button></li>
              </ul>
            </div>
          ) : (
            <Link to="/login" className="btn btn-outline-warning fw-bold rounded-pill px-3 py-2 ms-2 ms-sm-3 small">
              Đăng nhập
            </Link>
          )}

          {/* NÚT TOGGLE MENU (Chỉ hiện trên mobile cho phần Tìm kiếm) */}
          <button className="navbar-toggler border-0 shadow-none ms-2 p-1" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
            <span className="navbar-toggler-icon" style={{ width: '1.4rem', height: '1.4rem' }}></span>
          </button>
        </div>

        {/* THANH TÌM KIẾM: Sẽ thu gọn vào menu trên mobile */}
        <div className="collapse navbar-collapse order-lg-2" id="navbarNav">
          <form className="d-flex mx-auto mt-3 mt-lg-0" style={{ maxWidth: '450px', width: '100%' }} onSubmit={handleSearch}>
            <div className="input-group">
              <input 
                type="text" 
                className="form-control bg-light border-0 px-4 rounded-pill-start shadow-none" 
                placeholder="Tìm kiếm sản phẩm..." 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
              />
              <button className="btn btn-warning px-3 rounded-pill-end shadow-none" type="submit">
                🔍
              </button>
            </div>
          </form>
        </div>
        
      </div>
    </nav>
  );
};

export default Header;