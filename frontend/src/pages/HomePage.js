import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { AppHeader } from '../components/AppHeader';
import { AppFooter } from '../components/AppFooter';
import { ProductCard } from '../components/ProductCard';
import { Button } from '../components/Button';

export default function HomePage() {
  const [posts, setPosts] = useState([]); 
  const [categories, setCategories] = useState([{name: 'Tất cả', icon: '🏠'}]);
  const [selectedCategory, setSelectedCategory] = useState('Tất cả'); 
  const [keyword, setKeyword] = useState(''); 
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [locationFilter, setLocationFilter] = useState('Tất cả khu vực');
  
  const bannerImages = [
    "https://lh3.googleusercontent.com/aida-public/AB6AXuA-zPGuXVJem8xfroANf5_FLYZr20mL9sBx_w-IJsUgjPb_SjT8R3gsryBj6lQNHlpsRIMMumvRQQ4JYh14ekpQq87raEcLM5M3DIYA1zykxGLscHnqnwf6RtyRG9E-51zYB-ZlqLjUnk5G4PDg34yxHfMrQ18wuS0ZeIHmiNasgJF0jzAPlFhB7SkgVnw968RJwQro7KFvZl36CB2tPbpUhwGQUS8V2FIDBOTQJU8zOhHaVO-6nt7c",
    "https://images.unsplash.com/photo-1581539250439-c96689b516cb?q=80&w=2072&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1555529902-5261145633bf?q=80&w=2070&auto=format&fit=crop"
  ];
  const [currentBanner, setCurrentBanner] = useState(0);

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

  const fetchPosts = async (currentPage = 1, currentCategory = 'Tất cả', currentKeyword = '', loc = 'Tất cả khu vực') => {
    try {
      let url = `${API_URL}/api/posts?page=${currentPage}&limit=10`;
      
      if (currentCategory !== 'Tất cả' && currentCategory !== 'Kết quả tìm kiếm') {
        url += `&category=${currentCategory}`;
      }
      if (currentKeyword.trim()) {
        url += `&search=${currentKeyword}`;
      }
      if (loc !== 'Tất cả khu vực') {
        url += `&location=${loc}`;
      }

      const { data } = await axios.get(url);

      if (currentPage === 1) {
        setPosts(data);
      } else {
        setPosts(prev => [...prev, ...data]);
      }
      setHasMore(data.length === 10);
    } catch (error) {
      console.error("Lỗi kết nối Server:", error);
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
    fetchPosts(1, category, keyword, locationFilter);
  };

  const handleLocationClick = (loc) => {
    setLocationFilter(loc);
    setPage(1);
    fetchPosts(1, selectedCategory, keyword, loc);
  };

  const handleSearch = (searchKeyword) => {
    setKeyword(searchKeyword);
    setSelectedCategory('Kết quả tìm kiếm');
    setPage(1);
    fetchPosts(1, 'Kết quả tìm kiếm', searchKeyword, locationFilter);
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPosts(nextPage, selectedCategory, keyword, locationFilter);
  };

  useEffect(() => {
    fetchPosts(1, 'Tất cả', '', 'Tất cả khu vực');
    fetchCategories();
    
    const timer = setInterval(() => {
      setCurrentBanner((prev) => (prev + 1) % bannerImages.length);
    }, 3000);
    
    return () => clearInterval(timer);
  }, []);

  const toggleFavorite = async (e, postId) => {
      e.stopPropagation(); 
      e.preventDefault();
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

  const formatTimeAgo = (dateString) => {
    if (!dateString) return 'Mới'; 
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " năm trước";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " tháng trước";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " ngày trước";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " giờ trước";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " phút trước";
    return "Vừa xong";
  };

  const locations = ['Tất cả khu vực', 'Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng'];

  return (
    <div className="bg-[#FFFBEB] min-h-screen text-[#1C1917] font-sans">
      <AppHeader onSearch={handleSearch} />
      <main className="max-w-[1200px] mx-auto px-4 py-8 space-y-10">
        
        {/* Banner Section */}
        <section className="bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col md:flex-row items-stretch border border-[#E7E5E4] min-h-[360px]">
           <div className="flex-1 space-y-5 p-8 md:p-12 flex flex-col justify-center">
             <span className="inline-flex self-start items-center gap-1 text-sm bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full font-semibold border border-emerald-200">
               Mùa dọn nhà đón Tết
             </span>
             <h1 className="text-3xl md:text-4xl font-bold tracking-tight leading-snug">
               Dọn nhà đón Tết — Thanh lý đồ cũ giá tốt
             </h1>
             <p className="text-stone-500 max-w-md leading-relaxed text-lg">
               Giải phóng không gian sống, chuyển giao vật dụng thân yêu cho người cần với hơn 50.000+ người mua đang tìm kiếm mỗi ngày.
             </p>
             <div className="pt-2 flex flex-wrap gap-3">
               <Button variant="primary" onClick={() => navigate('/create-post')}>Đăng tin bán ngay (Miễn phí)</Button>
               <Button variant="secondary" onClick={() => handleCategoryClick('Tất cả')}>Khám phá tin mới</Button>
             </div>
           </div>
           <div className="w-full md:w-[45%] lg:w-[50%] relative shrink-0 min-h-[250px] md:min-h-full group">
             <div className="absolute inset-0 w-full h-full">
               {bannerImages.map((img, idx) => (
                 <img 
                   key={idx}
                   src={img} 
                   alt={`Banner ${idx + 1}`} 
                   className={`absolute top-0 left-0 w-full h-full object-cover transition-opacity duration-1000 ${currentBanner === idx ? 'opacity-100' : 'opacity-0'}`} 
                 />
               ))}
               {/* Indicators */}
               <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5 z-10">
                 {bannerImages.map((_, idx) => (
                   <button 
                     key={idx}
                     onClick={() => setCurrentBanner(idx)}
                     className={`h-1.5 rounded-full transition-all ${currentBanner === idx ? 'bg-[#FACC15] w-6' : 'bg-white/70 w-2 hover:bg-white'}`}
                     aria-label={`Go to slide ${idx + 1}`}
                   />
                 ))}
               </div>
               
               {/* Navigation Arrows */}
               <button 
                 onClick={() => setCurrentBanner(prev => (prev === 0 ? bannerImages.length - 1 : prev - 1))}
                 className="absolute left-0 top-1/2 -translate-y-1/2 bg-black/20 hover:bg-black/50 text-white py-4 px-2 transition-all opacity-0 group-hover:opacity-100 z-10"
                 aria-label="Previous slide"
               >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
               </button>
               <button 
                 onClick={() => setCurrentBanner(prev => (prev === bannerImages.length - 1 ? 0 : prev + 1))}
                 className="absolute right-0 top-1/2 -translate-y-1/2 bg-black/20 hover:bg-black/50 text-white py-4 px-2 transition-all opacity-0 group-hover:opacity-100 z-10"
                 aria-label="Next slide"
               >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
               </button>
               
             </div>
           </div>
        </section>

        {/* Categories Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold tracking-tight">Khám phá danh mục đồ cũ</h2>
            <button className="text-[#EA580C] text-sm font-semibold hover:underline flex items-center gap-1">
              Tất cả danh mục
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {categories.map((cat, idx) => (
              <div 
                key={idx} 
                onClick={() => handleCategoryClick(cat.name)}
                className={`flex flex-col items-center justify-center p-3 bg-white rounded-xl border ${selectedCategory === cat.name ? 'border-[#FACC15] ring-2 ring-[#FACC15]/20' : 'border-[#E7E5E4]'} shadow-sm cursor-pointer hover:shadow-md hover:-translate-y-1 transition-all text-center h-28`}
              >
                <div className="w-12 h-12 mb-2 flex items-center justify-center bg-stone-50 rounded-full overflow-hidden text-2xl">
                  {cat.name === 'Tất cả' || cat.name === 'Kết quả tìm kiếm' ? cat.icon : (
                    <img 
                      src={cat.image?.startsWith('http') ? cat.image : `${API_URL}/uploads/${cat.image}`} 
                      className="w-full h-full object-cover" 
                      alt={cat.name} 
                      onError={(e) => { e.target.src = 'https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg'; }}
                    />
                  )}
                </div>
                <span className={`text-xs font-semibold ${selectedCategory === cat.name ? 'text-[#1C1917]' : 'text-stone-600'} line-clamp-2`}>{cat.name}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Filters */}
        <section className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-stone-500 font-medium text-sm mr-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#EA580C]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
            Bộ lọc nhanh:
          </div>
          {locations.map(loc => (
            <button 
              key={loc}
              onClick={() => handleLocationClick(loc)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${locationFilter === loc ? 'bg-[#FACC15] text-[#1C1917] border-[#EAB308]' : 'bg-white text-stone-600 border-[#E7E5E4] hover:bg-stone-50'}`}
            >
              {loc}
            </button>
          ))}
        </section>

        {/* Product Grid */}
        <section>
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold tracking-tight">
                {selectedCategory === 'Tất cả' ? 'Tin mới đăng' : selectedCategory}
              </h2>
              <div className="flex items-center gap-2 bg-white border border-[#E7E5E4] px-3 py-1.5 rounded-full text-stone-500 text-sm shadow-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="font-medium">Vừa cập nhật</span>
              </div>
            </div>
            
            <div className="flex gap-2 text-sm font-semibold">
               <button className="px-4 py-1.5 border border-[#1C1917] rounded-full bg-white text-[#1C1917]">Mới nhất</button>
               <button className="px-4 py-1.5 border border-[#E7E5E4] rounded-full bg-white text-stone-500 hover:bg-stone-50">Gần bạn nhất</button>
               <button className="px-4 py-1.5 border border-[#E7E5E4] rounded-full bg-white text-stone-500 hover:bg-stone-50">Giá thấp → cao</button>
            </div>
          </div>
          
          {posts.length === 0 ? (
             <div className="text-center py-16 text-stone-500 bg-white rounded-xl shadow-sm border border-[#E7E5E4]">
                <h3 className="text-xl font-bold mb-2">📭 Trống trơn...</h3>
                <p>Hiện chưa có tin nào phù hợp</p>
                <Button variant="secondary" className="mt-4" onClick={() => handleCategoryClick('Tất cả')}>Xem tất cả tin</Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {posts.map((post) => {
                  const isAuthor = user && (post.author === user._id || post.author?._id === user._id);
                  const isFavorited = favoriteIds.includes(post._id);
                  const imageUrl = (post.images && post.images.length > 0) ? (post.images[0].startsWith('http') ? post.images[0] : `${API_URL}/${post.images[0].replace(/\\/g, '/')}`) : (post.image ? (post.image.startsWith('http') ? post.image : `${API_URL}/uploads/${post.image}`) : 'https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg');

                  return (
                    <ProductCard 
                      key={post._id} 
                      product={{
                        id: post._id,
                        title: post.title,
                        price: post.price,
                        imageUrl: imageUrl,
                        condition: post.condition || "Đã qua sử dụng",
                        location: post.location || 'Toàn quốc',
                        timeAgo: formatTimeAgo(post.createdAt),
                        category: post.category
                      }} 
                      isFavorited={isFavorited}
                      isAuthor={isAuthor}
                      onFavorite={(e) => toggleFavorite(e, post._id)}
                    />
                  );
                })}
              </div>
              {hasMore && (
                <div className="mt-8 flex justify-center">
                  <Button variant="secondary" onClick={handleLoadMore} className="px-8 py-2.5">
                    Xem thêm tin đăng khác <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </Button>
                </div>
              )}
            </>
          )}
        </section>

      </main>
      <AppFooter />
    </div>
  );
};