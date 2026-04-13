import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import Header from '../components/Header';
import Footer from '../components/Footer';

const ProductDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [mainImage, setMainImage] = useState('');
  
  // STATE CHO ĐÁNH GIÁ
  const [reviews, setReviews] = useState([]);
  const [avgRating, setAvgRating] = useState(0);

  // 🚀 STATE CHO BÁO CÁO VI PHẠM
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');

  const currentUser = JSON.parse(localStorage.getItem('user'));
  const API_URL = 'http://localhost:4000';

  useEffect(() => {
    const fetchPostAndReviews = async () => {
      try {
        // 1. Tải thông tin sản phẩm
        const { data } = await axios.get(`${API_URL}/api/posts/${id}`);
        setPost(data);
        if (data.images && data.images.length > 0) setMainImage(data.images[0]);
        else if (data.image) setMainImage(data.image); 

        // 2. Tải đánh giá của người bán
        if (data.author?._id) {
            const profileRes = await axios.get(`${API_URL}/api/users/public-profile/${data.author._id}`);
            setReviews(profileRes.data.reviews || []);
            setAvgRating(profileRes.data.avgRating || 0);
        }
      } catch (error) {
        alert("Lỗi tải thông tin sản phẩm!");
        navigate('/');
      }
    };
    fetchPostAndReviews();
  }, [id, navigate]);

  const getImageUrl = (imgStr) => {
    if (!imgStr) return 'https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg';
    return imgStr.startsWith('http') ? imgStr : `${API_URL}/${imgStr.replace(/\\/g, '/')}`;
  };

  const handleAddToCart = async (isBuyNow = false) => {
    if (!currentUser) {
        alert("Bạn phải đăng nhập thì mới mua được nha!");
        navigate('/login');
        return;
    }
    try {
        await axios.post(`${API_URL}/api/users/cart`, {
            userId: currentUser._id,
            postId: post._id,
            quantity: 1
        });
        
        window.dispatchEvent(new Event('cartUpdated')); 
        
        if (isBuyNow) navigate('/cart');
        else alert("🛒 Đã thêm sản phẩm vào giỏ hàng thành công!");
    } catch (error) {
        console.error("Lỗi thêm giỏ hàng:", error);
        alert("Lỗi kết nối tới Server!");
    }
  };

  const handleChat = () => {
    if (!currentUser) {
        alert("Vui lòng đăng nhập để nhắn tin!");
        navigate('/login');
        return;
    }
    navigate('/chat', { state: { receiver: post.author, post: post } });
  };

  // 🚀 HÀM XỬ LÝ GỬI BÁO CÁO
  const handleReportSubmit = async () => {
    if (!currentUser) {
        alert("Bác phải đăng nhập mới được báo cáo nhé!");
        navigate('/login');
        return;
    }
    if (!reportReason.trim()) {
        alert("Bác ghi rõ lý do báo cáo giúp em với!");
        return;
    }

    try {
        await axios.post(`${API_URL}/api/reports`, {
            reporterId: currentUser._id,
            postId: post._id,
            reason: reportReason
        });
        
        alert("🚩 Đã gửi báo cáo thành công! Admin sẽ xử lý sớm.");
        setShowReportModal(false);
        setReportReason(''); // Xóa trắng form sau khi gửi
    } catch (error) {
        alert("Lỗi khi gửi báo cáo!");
    }
  };

  if (!post) return <div className="min-vh-100 d-flex justify-content-center align-items-center"><h3>Đang tải dữ liệu...</h3></div>;

  const displayImages = post.images && post.images.length > 0 ? post.images : (post.image ? [post.image] : []);

  return (
    <div style={{ backgroundColor: '#F4F4F4', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      <style>
        {`
          .seller-link-hover { transition: color 0.2s ease-in-out; }
          .seller-link-hover:hover { color: #ffc107 !important; }
          .avatar-hover { transition: transform 0.2s ease-in-out; }
          .avatar-hover:hover { transform: scale(1.08); }
        `}
      </style>

      <Header />
      <div className="container py-5 flex-grow-1">
        
        {/* KHỐI CHI TIẾT SẢN PHẨM CHÍNH */}
        <div className="bg-white rounded-4 shadow-sm overflow-hidden p-4 mb-4">
            <div className="row">
                <div className="col-md-7 mb-4 mb-md-0">
                    <div className="rounded-4 overflow-hidden mb-3 bg-light d-flex align-items-center justify-content-center border" style={{height: '450px'}}>
                        <img src={getImageUrl(mainImage)} alt={post.title} style={{width: '100%', height: '100%', objectFit: 'contain'}} onError={(e) => e.target.src='https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg'} />
                    </div>
                    {displayImages.length > 1 && (
                        <div className="d-flex gap-2 overflow-auto py-2">
                            {displayImages.map((img, idx) => (
                                <img key={idx} src={getImageUrl(img)} alt={`thumb-${idx}`} onClick={() => setMainImage(img)} className={`rounded-3 border ${mainImage === img ? 'border-warning border-3 opacity-100' : 'border-secondary opacity-50'}`} style={{width: '80px', height: '80px', objectFit: 'cover', cursor: 'pointer', transition: '0.2s'}} />
                            ))}
                        </div>
                    )}
                </div>

                <div className="col-md-5 d-flex flex-column">
                    <h3 className="fw-bold text-dark mb-2">{post.title}</h3>
                    <div className="d-flex align-items-center gap-3 mb-4">
                        <h2 className="text-danger fw-black mb-0">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(post.price)}</h2>
                        <span className="badge bg-light text-dark border px-3 py-2 fs-6">Kho: {post.quantity ?? 0}</span>
                    </div>

                    <div className="bg-light p-3 rounded-4 border mb-4 d-flex align-items-center shadow-sm">
                        <Link to={`/public-profile/${post.author?._id}`} className="text-decoration-none">
                            <div className="rounded-circle bg-warning text-white fw-bold d-flex align-items-center justify-content-center me-3 avatar-hover shadow-sm" style={{width: '55px', height: '55px', fontSize: '20px', overflow: 'hidden', border: '2px solid white'}}>
                                {post.author?.avatar ? <img src={post.author.avatar} alt="avt" className="w-100 h-100 object-fit-cover"/> : post.author?.name?.charAt(0).toUpperCase() || '?'}
                            </div>
                        </Link>
                        <div>
                            <p className="text-muted small mb-0 text-uppercase fw-bold">Người đăng tin</p>
                            <Link to={`/public-profile/${post.author?._id}`} className="text-decoration-none">
                                <h6 className="fw-bold mb-0 text-dark seller-link-hover fs-5">{post.author?.name || 'Vô danh'}</h6>
                            </Link>
                            <small className="text-success fw-bold">✓ Đã xác minh danh tính</small>
                        </div>
                    </div>

                    <div className="bg-light p-4 rounded-4 border flex-grow-1 shadow-sm">
                        <h6 className="fw-bold border-start border-4 border-warning ps-2 mb-3">Mô tả chi tiết</h6>
                        <p className="text-secondary" style={{whiteSpace: 'pre-line', lineHeight: '1.6'}}>{post.description}</p>
                        <div className="mt-4 pt-3 border-top border-secondary-subtle text-muted small d-flex flex-column gap-2">
                            <span><i className="fa-solid fa-layer-group me-2"></i>Danh mục: <b className="text-dark">{post.category}</b></span>
                            <span><i className="fa-solid fa-location-dot me-2"></i>Khu vực: <b className="text-dark">{post.location}</b></span>
                        </div>
                        
                        {/* 🚀 NÚT BÁO CÁO NẰM Ở ĐÂY */}
                        <div className="mt-4 border-top border-secondary-subtle pt-3 text-end">
                            <button 
                                onClick={() => setShowReportModal(true)} 
                                className="btn btn-sm btn-outline-danger rounded-pill px-3 fw-bold"
                            >
                                🚩 Báo cáo tin đăng này
                            </button>
                        </div>
                    </div>

                    <div className="mt-4 d-flex gap-2">
                        {currentUser && post.author && currentUser._id === post.author._id ? (
                            <button className="btn btn-primary fw-bold py-3 flex-grow-1 rounded-pill shadow-sm fs-5" onClick={() => navigate(`/edit-post/${post._id}`)}>
                                ✏️ Chỉnh sửa tin của bạn
                            </button>
                        ) : (
                            <>
                                <button className="btn btn-outline-warning fw-bold py-3 rounded-pill" style={{flex: 1}} onClick={handleChat}>💬 Chat</button>
                                
                                <button className="btn btn-warning fw-bold text-dark py-3 rounded-pill shadow-sm" style={{flex: 1}} disabled={post.quantity === 0} onClick={() => handleAddToCart(false)}>
                                    🛒 Thêm vào giỏ
                                </button>
                                
                                <button className="btn btn-danger fw-bold text-white py-3 rounded-pill shadow-sm" style={{flex: 1}} disabled={post.quantity === 0} onClick={() => handleAddToCart(true)}>
                                    {post.quantity === 0 ? 'Hết hàng' : '💳 Mua ngay'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>

        {/* KHỐI ĐÁNH GIÁ NGƯỜI BÁN */}
        <div className="bg-white rounded-4 shadow-sm p-4">
            <h5 className="fw-bold mb-4 border-start border-4 border-warning ps-2">Đánh giá người bán ({reviews.length})</h5>

            {reviews.length > 0 && (
                <div className="d-flex align-items-center gap-3 mb-4 bg-light p-3 rounded-4 border" style={{maxWidth: 'max-content'}}>
                    <h2 className="fw-black text-warning mb-0">{avgRating}/5</h2>
                    <div>
                        <div className="text-warning fs-5" style={{letterSpacing: '2px'}}>{"⭐".repeat(Math.round(avgRating))}</div>
                        <small className="text-muted fw-bold">Dựa trên {reviews.length} đánh giá</small>
                    </div>
                </div>
            )}

            {reviews.length === 0 ? (
                <div className="text-center py-5 bg-light rounded-4 border border-dashed">
                    <span className="fs-1 opacity-25">⭐</span>
                    <p className="text-muted mt-2 fw-bold">Người bán này chưa có đánh giá nào.</p>
                </div>
            ) : (
                <div className="row g-4">
                    {reviews.map((rev, index) => (
                        <div key={index} className="col-md-6">
                            <div className="border p-3 rounded-4 h-100 bg-light shadow-sm transition-all hover-scale">
                                <div className="d-flex align-items-center gap-3 mb-2 pb-2 border-bottom border-secondary-subtle">
                                    <img src={rev.buyer?.avatar || 'https://via.placeholder.com/45'} className="rounded-circle shadow-sm border border-2 border-white" style={{width: '45px', height: '45px', objectFit: 'cover'}} alt="avt" />
                                    <div>
                                        <h6 className="fw-bold mb-0 text-dark">{rev.buyer?.name || 'Khách hàng'}</h6>
                                        <small className="text-muted" style={{fontSize: '11px'}}>{new Date(rev.createdAt).toLocaleString('vi-VN')}</small>
                                    </div>
                                    <div className="ms-auto text-warning fs-6">{"⭐".repeat(rev.rating)}</div>
                                </div>
                                <p className="mb-0 text-secondary" style={{fontStyle: 'italic', fontSize: '14px'}}>"{rev.comment}"</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>

      </div>
      <Footer />

      {/* 🚀 MODAL BÁO CÁO */}
      {showReportModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1050 }}>
            <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content rounded-4 border-0 shadow-lg">
                    <div className="modal-header bg-danger text-white border-0 rounded-top-4">
                        <h5 className="modal-title fw-bold">🚩 Báo cáo vi phạm</h5>
                        <button type="button" className="btn-close btn-close-white" onClick={() => setShowReportModal(false)}></button>
                    </div>
                    <div className="modal-body p-4">
                        <p className="small text-muted mb-3">Vì sao bác muốn báo cáo tin đăng này? (Ví dụ: Hàng giả, lừa đảo, sai thông tin...)</p>
                        <textarea 
                            className="form-control bg-light rounded-3 border-secondary-subtle" 
                            rows="4" 
                            placeholder="Nhập lý do chi tiết..."
                            value={reportReason}
                            onChange={(e) => setReportReason(e.target.value)}
                        ></textarea>
                    </div>
                    <div className="modal-footer border-0 bg-light rounded-bottom-4">
                        <button onClick={() => setShowReportModal(false)} className="btn btn-outline-secondary rounded-pill px-4 fw-bold bg-white">Hủy bỏ</button>
                        <button onClick={handleReportSubmit} className="btn btn-danger rounded-pill px-4 fw-bold shadow-sm">Gửi cho Admin</button>
                    </div>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default ProductDetailPage;