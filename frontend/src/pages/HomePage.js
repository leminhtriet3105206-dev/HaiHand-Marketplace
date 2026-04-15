import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header'; 
import Footer from '../components/Footer';

const HomePage = () => {
  const [filteredPosts, setFilteredPosts] = useState([]); 
  const [selectedCategory, setSelectedCategory] = useState('Tất cả'); 
  const [keyword, setKeyword] = useState(''); 
  const [categories, setCategories] = useState([{name: 'Tất cả', icon: '🏠'}]);
  
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  
  const [favoriteIds, setFavoriteIds] = useState([]);
  
  // 🚀 THÊM STATE LOADING
  const [isLoading, setIsLoading] = useState(true);
  
  const navigate = useNavigate();
  const API_URL = process.env.REACT_APP_API_URL || 'https://haihand-marketplace.onrender.com'; 
  const user = JSON.parse(localStorage.getItem('user'));

  useEffect(() => {
    if (user) {
        axios.get(`${API_URL}/api/users/favorites/${user._id}`)
             .then(res => setFavoriteIds(res.data.map(post => post._id)))
             .catch(err => console.log(err));
    }
  }, [user?._id]);

  const fetchPosts = async (currentPage = 1, currentCategory = 'Tất cả', currentKeyword = '') => {
    // 🚀 BẬT LOADING KHI BẮT ĐẦU GỌI API
    if (currentPage === 1) setIsLoading(true);

    try {
      let url = `${API_URL}/api/posts?page=${currentPage}&limit=8`;
      
      if (currentCategory !== 'Tất cả' && currentCategory !== 'Kết quả tìm kiếm') {
        url += `&category=${currentCategory}`;
      }
      if (currentKeyword.trim()) {
        url += `&search=${currentKeyword}`;
      }

      const { data } = await axios.get(url);

      if (currentPage === 1) {
        setFilteredPosts(data);
      } else {
        setFilteredPosts(prev => [...prev, ...data]);
      }

      setHasMore(data.length === 8);
    } catch (error) {
      console.error("Lỗi kết nối Server:", error);
    } finally {
      // 🚀 TẮT LOADING KHI ĐÃ CÓ DỮ LIỆU HOẶC BỊ LỖI
      setIsLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/categories`);
      const dynamicCats = data.map(c => ({ name: c.name, image: c.image }));
      setCategories([{name: 'Tất cả', icon: '🏠'}, ...dynamicCats]);
    } catch (error) { console.error("Lỗi lấy danh mục:", error); }
  };

  const handleCategoryClick = (category) => {
    setSelectedCategory(category);
    setPage(1);
    setKeyword('');
    fetchPosts(1, category, '');
  };

  const handleSearch = () => {
    if(!keyword.trim()) {
      setSelectedCategory('Tất cả');
      setPage(1);
      return fetchPosts(1, 'Tất cả', '');
    }
    setSelectedCategory('Kết quả tìm kiếm');
    setPage(1);
    fetchPosts(1, 'Kết quả tìm kiếm', keyword);
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPosts(nextPage, selectedCategory, keyword);
  };

  useEffect(() => {
    fetchPosts(1, 'Tất cả', '');
    fetchCategories();
    // eslint-disable-next-line
  }, []);

  const getImageUrl = (post) => {
    if (post.images && post.images.length > 0) {
        return post.images[0].startsWith('http') ? post.images[0] : `${API_URL}/${post.images[0].replace(/\\/g, '/')}`;
    }
    if (post.image) {
        return post.image.startsWith('http') ? post.image : `${API_URL}/uploads/${post.image}`;
    }
    return 'https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg';
  };

  const toggleFavorite = async (e, postId) => {
      e.stopPropagation(); 
      if (!user) { alert('Vui lòng đăng nhập để lưu tin!'); return; }

      try {
          if (favoriteIds.includes(postId)) {
              setFavoriteIds(favoriteIds.filter(id => id !== postId)); 
          } else {
              setFavoriteIds([...favoriteIds, postId]); 
          }
          await axios.post(`${API_URL}/api/users/favorites`, { userId: user._id, postId: postId });
      } catch (error) { 
          console.error(error); 
      }
  };

  return (
    <div style={{ backgroundColor: '#F4F4F4', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      <style>
        {`
          .heart-btn-hover { transition: all 0.2s ease-in-out; }
          .heart-btn-hover:hover { transform: scale(1.15); }
          .heart-btn-hover:active { transform: scale(0.9); }
          .hover-shadow:hover { box-shadow: 0 0.5rem 1rem rgba(0,0,0,0.15) !important; transform: translateY(-2px); transition: all 0.2s; }
        `}
      </style>

      <Header keyword={keyword} setKeyword={setKeyword} onSearch={handleSearch} />

      <div className="bg-white py-4 mb-4 border-bottom shadow-sm">
          <div className="container">
              <div className="d-flex justify-content-center gap-4 flex-wrap">
                  {categories.map((cat, idx) => (
                      <div key={idx} className="text-center p-2 rounded-3 transition-all" 
                        style={{ cursor: 'pointer', minWidth: '80px', backgroundColor: selectedCategory === cat.name ? '#FFF3CD' : 'transparent', border: selectedCategory === cat.name ? '1px solid #FFC107' : '1px solid transparent' }}
                        onClick={() => handleCategoryClick(cat.name)}
                      >
                          <div className="bg-light rounded-circle d-flex align-items-center justify-content-center mb-2 mx-auto shadow-sm overflow-hidden" style={{width: '55px', height: '55px', fontSize: '24px'}}>
                              {cat.name === 'Tất cả' ? cat.icon : (
                                  <img 
                                    src={cat.image?.startsWith('http') ? cat.image : `${API_URL}/uploads/${cat.image}`} 
                                    style={{width: '100%', height: '100%', objectFit: 'cover'}} 
                                    alt={cat.name} 
                                    onError={(e) => { e.target.src = 'https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg'; }}
                                  />
                              )}
                          </div>
                          <small className={`fw-bold ${selectedCategory === cat.name ? 'text-dark' : 'text-muted'}`}>{cat.name}</small>
                      </div>
                  ))}
              </div>
          </div>
      </div>

      <div style={{ flex: 1 }}>
        <div className="container">
          <div className="d-flex justify-content-between align-items-center mb-4">
              <h5 className="fw-bold m-0 border-start border-4 border-warning ps-3">
                  {selectedCategory === 'Tất cả' ? 'Tin đăng mới nhất' : `Danh mục: ${selectedCategory}`}
              </h5>
              <small className="text-muted">{!isLoading ? filteredPosts.length : 0} tin đăng</small>
          </div>
          
          {/* 🚀 HIỂN THỊ LOADING NẾU ĐANG TẢI */}
          {isLoading ? (
              <div className="text-center py-5">
                  <div className="spinner-border text-warning" role="status" style={{ width: '3rem', height: '3rem' }}>
                      <span className="visually-hidden">Loading...</span>
                  </div>
                  <h5 className="mt-3 text-muted fw-bold">Đang tải dữ liệu...</h5>
                  <p className="text-muted small">Server đang được đánh thức, bác chờ khoảng 30s nhé!</p>
              </div>
          ) : filteredPosts.length === 0 ? (
              <div className="text-center py-5 text-muted bg-white rounded shadow-sm">
                  <h3 className="mb-2">📭 Trống trơn...</h3>
                  <p>Hiện chưa có tin nào thuộc mục <b>{selectedCategory}</b></p>
                  <button onClick={() => handleCategoryClick('Tất cả')} className="btn btn-sm btn-outline-warning rounded-pill">Xem tất cả tin</button>
              </div>
          ) : (
              <>
                <div className="row">
                  {filteredPosts.map((post) => {
                    const isAuthor = user && (post.author === user._id || post.author?._id === user._id);
                    const isFavorited = favoriteIds.includes(post._id);

                    return (
                    <div className="col-6 col-md-3 mb-4" key={post._id}>
                      <div className="card h-100 border-0 shadow-sm hover-shadow position-relative" style={{cursor: 'pointer', borderRadius: '15px', overflow: 'hidden'}} onClick={() => navigate(`/post/${post._id}`)}>
                        
                        <div style={{height: '180px', overflow: 'hidden'}} className="bg-light d-flex align-items-center justify-content-center position-relative">
                            <img 
                                src={getImageUrl(post)} 
                                className="card-img-top" 
                                alt={post.title} 
                                style={{width: '100%', height: '100%', objectFit: 'cover'}} 
                                onError={(e) => {e.target.src = 'https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg'}} 
                            />
                            
                            <span className="position-absolute top-0 start-0 bg-warning text-dark fw-bold px-2 py-1 shadow-sm" style={{fontSize: '10px', borderRadius: '0 0 12px 0'}}>MỚI</span>
                            
                            {!isAuthor && (
                                <button 
                                    onClick={(e) => toggleFavorite(e, post._id)} 
                                    className="position-absolute m-2 btn btn-light shadow-sm rounded-circle d-flex justify-content-center align-items-center heart-btn-hover" 
                                    style={{ width: '35px', height: '35px', zIndex: 10, top: 0, right: 0, padding: 0 }}
                                    title={isFavorited ? "Bỏ lưu tin" : "Lưu tin này"}
                                >
                                    {isFavorited ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#dc3545">
                                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                                        </svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#6c757d" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                        </svg>
                                    )}
                                </button>
                            )}
                        </div>
                        <div className="card-body p-3 d-flex flex-column">
                          <h6 className="card-title text-truncate fw-bold mb-1" style={{fontSize: '14px', color: '#333'}}>{post.title}</h6>
                          <p className="text-danger fw-bold fs-6 mb-2">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(post.price)}</p>
                          <div className="mt-auto d-flex justify-content-between align-items-center border-top pt-2">
                            <small className="text-muted" style={{fontSize: '11px'}}>📍 {post.location || 'Toàn quốc'}</small>
                            <span className="badge bg-light text-muted fw-normal" style={{fontSize: '10px'}}>{post.category}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )})}
                </div>
                
                {hasMore && (
                  <div className="text-center mt-3 mb-5">
                    <button onClick={handleLoadMore} className="btn btn-outline-warning rounded-pill px-5 py-2 fw-bold shadow-sm">
                      ⬇️ Xem thêm tin
                    </button>
                  </div>
                )}
              </>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default HomePage;