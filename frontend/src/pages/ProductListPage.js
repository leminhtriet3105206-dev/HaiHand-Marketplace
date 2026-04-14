import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Header from '../components/Header';
import Footer from '../components/Footer';

const ProductListPage = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [categories, setCategories] = useState([]);

    // 🚀 LẤY ĐẦY ĐỦ THAM SỐ TỪ URL (KHÔNG THIẾU CÁI NÀO)
    const category = searchParams.get('category') || '';
    const location = searchParams.get('location') || '';
    const search = searchParams.get('search') || '';
    const sort = searchParams.get('sort') || 'newest';
    const minPrice = searchParams.get('minPrice') || '';
    const maxPrice = searchParams.get('maxPrice') || '';

    useEffect(() => {
        // Lấy danh sách danh mục để hiển thị cột bên trái
        axios.get(`https://haihand-marketplace.onrender.com/api/categories`)
            .then(({ data }) => setCategories(data))
            .catch(console.error);
    }, []);

    const fetchPosts = async () => {
        setLoading(true);
        try {
            // Gọi API lọc sản phẩm với đầy đủ tham số bao gồm cả giá và sắp xếp
            const res = await axios.get(`https://haihand-marketplace.onrender.com/api/posts`, {
                params: { category, location, search, sort, minPrice, maxPrice }
            });
            setPosts(res.data);
        } catch (err) {
            console.error("Lỗi tải sản phẩm:", err);
        } finally {
            setLoading(false);
        }
    };

    // Theo dõi mọi sự thay đổi trên URL để tải lại dữ liệu
    useEffect(() => {
        fetchPosts();
    }, [category, location, search, sort, minPrice, maxPrice]);

    // 🚀 HÀM XỬ LÝ SẮP XẾP (SORT)
    const handleSortChange = (e) => {
        const newSort = e.target.value;
        searchParams.set('sort', newSort);
        setSearchParams(searchParams);
    };

    // 🚀 HÀM XỬ LÝ LỌC KHOẢNG GIÁ
    const applyPriceFilter = (min, max) => {
        if (min !== null) searchParams.set('minPrice', min); else searchParams.delete('minPrice');
        if (max !== null) searchParams.set('maxPrice', max); else searchParams.delete('maxPrice');
        setSearchParams(searchParams);
    };

    const handleCategorySelect = (name) => {
        if (name === 'Tất cả') searchParams.delete('category');
        else searchParams.set('category', name);
        setSearchParams(searchParams);
    };

    return (
        <div className="bg-light min-vh-100">
            {/* Giữ nguyên Header với đầy đủ chức năng thông báo, chat... */}
            <Header onSearch={fetchPosts} />
            
            <div className="container py-4">
                <div className="row">
                    {/* 🚀 CỘT TRÁI: DANH MỤC & BỘ LỌC GIÁ */}
                    <div className="col-md-3 d-none d-md-block">
                        <div className="bg-white rounded-4 shadow-sm p-3 mb-4 border-0">
                            <h6 className="fw-bold mb-3 border-bottom pb-2">📂 Danh mục tin đăng</h6>
                            <ul className="list-unstyled">
                                <li 
                                    className={`py-2 px-3 rounded-3 mb-1 ${!category ? 'bg-warning fw-bold' : 'hover-bg-light'}`}
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => handleCategorySelect('Tất cả')}
                                >
                                    🏠 Tất cả danh mục
                                </li>
                                {categories.map(cat => (
                                    <li 
                                        key={cat._id}
                                        className={`py-2 px-3 rounded-3 mb-1 ${category === cat.name ? 'bg-warning fw-bold' : 'hover-bg-light'}`}
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => handleCategorySelect(cat.name)}
                                    >
                                        {cat.name}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        
                        {/* 🚀 BỘ LỌC GIÁ: ĐÃ CẬP NHẬT LOGIC CHẠY ĐƯỢC */}
                        <div className="bg-white rounded-4 shadow-sm p-3 border-0">
                            <h6 className="fw-bold mb-3 border-bottom pb-2">💰 Khoảng giá</h6>
                            <button 
                                className={`btn btn-sm w-100 mb-2 rounded-pill ${maxPrice === '2000000' ? 'btn-warning fw-bold' : 'btn-outline-secondary'}`}
                                onClick={() => applyPriceFilter(0, 2000000)}
                            >
                                Dưới 2 triệu
                            </button>
                            <button 
                                className={`btn btn-sm w-100 mb-2 rounded-pill ${minPrice === '2000000' && maxPrice === '5000000' ? 'btn-warning fw-bold' : 'btn-outline-secondary'}`}
                                onClick={() => applyPriceFilter(2000000, 5000000)}
                            >
                                2 - 5 triệu
                            </button>
                            <button 
                                className={`btn btn-sm w-100 mb-2 rounded-pill ${minPrice === '5000000' ? 'btn-warning fw-bold' : 'btn-outline-secondary'}`}
                                onClick={() => applyPriceFilter(5000000, 999999999)}
                            >
                                Trên 5 triệu
                            </button>
                            {(minPrice || maxPrice) && (
                                <button className="btn btn-link btn-sm w-100 text-danger mt-1" onClick={() => applyPriceFilter(null, null)}>
                                    ✖ Xóa lọc giá
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 🚀 CỘT PHẢI: KẾT QUẢ TÌM KIẾM */}
                    <div className="col-md-9">
                        {/* Thanh lọc nhanh: Tin mới nhất, Giá tăng/giảm */}
                        <div className="bg-white p-3 rounded-4 shadow-sm mb-4 d-flex flex-wrap justify-content-between align-items-center border-0">
                            <div className="d-flex align-items-center gap-3">
                                <span className="fw-bold text-muted small">Lọc theo:</span>
                                <select 
                                    className="form-select form-select-sm border-0 bg-light rounded-pill px-3" 
                                    value={sort} 
                                    onChange={handleSortChange} 
                                    style={{ width: '180px', cursor: 'pointer' }}
                                >
                                    <option value="newest">Tin mới nhất</option>
                                    <option value="price-asc">Giá thấp đến cao</option>
                                    <option value="price-desc">Giá cao đến thấp</option>
                                </select>
                            </div>
                            <div className="text-muted small fw-bold">
                                🔍 Tìm thấy <span className="text-warning">{posts.length}</span> tin đăng {location && location !== 'Toàn quốc' && `tại ${location.split(',')[0]}`}
                            </div>
                        </div>

                        {/* Danh sách tin đăng */}
                        <div className="row g-3">
                            {loading ? (
                                <div className="text-center p-5 w-100">
                                    <div className="spinner-border text-warning" role="status"></div>
                                    <p className="mt-2 fw-bold text-muted">Đang tìm đồ ngon cho bác...</p>
                                </div>
                            ) : posts.length > 0 ? (
                                posts.map(post => (
                                    <div key={post._id} className="col-6 col-lg-4">
                                        <div className="card h-100 border-0 shadow-sm hover-scale rounded-4 overflow-hidden" 
                                             style={{ cursor: 'pointer' }}
                                             onClick={() => navigate(`/post/${post._id}`)}>
                                            <div className="position-relative">
                                                <img src={post.images[0]} className="card-img-top" style={{ height: '170px', objectFit: 'cover' }} alt={post.title} />
                                                <span className="position-absolute bottom-0 start-0 bg-dark text-white p-1 px-2 opacity-75 small" style={{fontSize: '10px'}}>
                                                    📷 {post.images?.length || 0}
                                                </span>
                                            </div>
                                            <div className="card-body p-2">
                                                <h6 className="text-dark mb-1 text-truncate-2 fw-bold" style={{ fontSize: '14px', minHeight: '40px' }}>
                                                    {post.title}
                                                </h6>
                                                <div className="text-danger fw-bolder fs-5">
                                                    {post.price?.toLocaleString('vi-VN')} đ
                                                </div>
                                                <div className="d-flex align-items-center text-muted mt-2" style={{ fontSize: '10px' }}>
                                                    <span className="text-truncate">📍 {post.location?.split(',').pop() || 'Toàn quốc'}</span>
                                                    <span className="mx-1">•</span>
                                                    <span>{new Date(post.createdAt).toLocaleDateString('vi-VN')}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center p-5 w-100 bg-white rounded-4 shadow-sm">
                                    <div className="fs-1">🏜️</div>
                                    <h5 className="fw-bold text-muted mt-3">Huhu, không tìm thấy món nào khớp với lọc của bác!</h5>
                                    <button className="btn btn-warning mt-2 fw-bold rounded-pill" onClick={() => navigate('/products')}>Xem tất cả tin</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <Footer />
        </div>
    );
};

export default ProductListPage;