import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Header from '../components/Header';

const PublicProfile = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  
  const API_URL = 'http://localhost:4000';
  const currentUser = JSON.parse(localStorage.getItem('user'));

  useEffect(() => {
    // 1. Lấy thông tin Profile và số lượng Follower/Following từ API Public Profile
    axios.get(`${API_URL}/api/users/public-profile/${userId}`)
      .then(res => {
          setData(res.data);
          // Cập nhật số lượng trực tiếp từ dữ liệu trả về của Backend
          setCounts({ 
              followers: res.data.followersCount || 0, 
              following: res.data.followingCount || 0 
          });
      })
      .catch(err => {
          console.error("Lỗi tải trang cá nhân:", err);
      });

    // 2. Kiểm tra trạng thái "Đã theo dõi chưa" nếu người xem đã đăng nhập
    if (currentUser && currentUser._id !== userId) {
        axios.get(`${API_URL}/api/users/follow-status`, { 
            params: { followerId: currentUser._id, followingId: userId } 
        })
        .then(res => {
            setIsFollowing(res.data.isFollowing);
        })
        .catch(err => console.error("Lỗi kiểm tra trạng thái theo dõi:", err));
    }
  }, [userId, currentUser?._id]);

  const handleFollow = async () => {
    if (!currentUser) {
        alert("Vui lòng đăng nhập để theo dõi người dùng này!");
        return;
    }
    
    try {
        const { data: resData } = await axios.post(`${API_URL}/api/users/follow`, {
            followerId: currentUser._id,
            followingId: userId
        });
        
        setIsFollowing(resData.isFollowing);

        // Sau khi bấm, gọi lại API profile để cập nhật lại con số hiển thị chính xác nhất
        const updateRes = await axios.get(`${API_URL}/api/users/public-profile/${userId}`);
        setCounts({ 
            followers: updateRes.data.followersCount || 0, 
            following: updateRes.data.followingCount || 0 
        });
    } catch (e) {
        alert("Không thể thực hiện thao tác theo dõi lúc này!");
    }
  };

  const handleChat = () => {
    if (!currentUser) {
        alert("Vui lòng đăng nhập để nhắn tin!");
        return;
    }
    // Chuyển hướng sang trang Chat và truyền thông tin người nhận qua state
    navigate('/chat', { state: { receiver: data.user } });
  };

  if (!data) return <div className="text-center py-5">Đang tải thông tin...</div>;

  return (
    <div className="bg-light min-vh-100">
      <Header />
      <div className="container py-4">
        {/* CARD THÔNG TIN NGƯỜI BÁN */}
        <div className="card border-0 shadow-sm rounded-4 mb-4 overflow-hidden">
          <div className="bg-secondary" style={{height: '150px', backgroundImage: 'linear-gradient(to right, #ece9e6, #ffffff)'}}></div>
          <div className="px-4 pb-4" style={{marginTop: '-50px'}}>
            <div className="d-flex align-items-end gap-3 mb-3">
              <img 
                src={data.user.avatar || 'https://via.placeholder.com/100'} 
                className="rounded-circle border border-4 border-white shadow" 
                style={{width: '100px', height: '100px', objectFit: 'cover'}} 
                alt="avatar" 
              />
              <div className="mb-2">
                <h4 className="fw-bold mb-0">{data.user.name}</h4>
                <small className="text-success">● Đang hoạt động</small>
              </div>
            </div>

            <div className="d-flex gap-4 text-muted small mb-3">
              <span>⭐ {data.avgRating || 5.0} ({data.reviews?.length || 0} đánh giá)</span>
              <span>👤 <b>{counts.followers}</b> Người theo dõi</span>
              <span>📅 Tham gia: {new Date(data.user.createdAt).toLocaleDateString('vi-VN')}</span>
            </div>
            
            <div className="d-flex gap-2">
              {/* Không hiện nút theo dõi nếu đang xem chính trang của mình */}
              {currentUser?._id !== userId && (
                <>
                  <button 
                    onClick={handleFollow} 
                    className={`btn rounded-pill px-4 fw-bold shadow-sm transition-all ${isFollowing ? 'btn-outline-secondary' : 'btn-outline-warning'}`}
                  >
                    {isFollowing ? '✓ Đang theo dõi' : '+ Theo dõi'}
                  </button>
                  <button onClick={handleChat} className="btn btn-warning rounded-pill px-4 fw-bold shadow-sm">
                    💬 Chat với người bán
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="row">
          {/* DANH SÁCH TIN ĐĂNG */}
          <div className="col-md-8">
            <h5 className="fw-bold mb-3 border-start border-4 border-warning ps-2">Tin đang đăng ({data.posts?.length || 0})</h5>
            <div className="row g-3">
              {data.posts && data.posts.length > 0 ? (
                data.posts.map(post => (
                  <div key={post._id} className="col-6 col-md-4" onClick={() => navigate(`/post/${post._id}`)} style={{cursor: 'pointer'}}>
                    <div className="card h-100 border-0 shadow-sm hover-scale transition-all overflow-hidden rounded-3">
                      <img 
                        src={post.images?.[0] || post.image || 'https://via.placeholder.com/150'} 
                        className="card-img-top" 
                        style={{height: '150px', objectFit: 'cover'}} 
                        alt={post.title} 
                      />
                      <div className="card-body p-2">
                        <p className="small fw-bold text-truncate mb-1">{post.title}</p>
                        <p className="text-danger fw-black mb-0">{Number(post.price).toLocaleString('vi-VN')} đ</p>
                        <small className="text-muted" style={{fontSize: '10px'}}>📍 {post.location}</small>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-12 text-center py-5 bg-white rounded-3 shadow-sm text-muted">
                   Người dùng này chưa có tin đăng nào.
                </div>
              )}
            </div>
          </div>

          {/* KHỐI ĐÁNH GIÁ */}
          <div className="col-md-4">
            <h5 className="fw-bold mb-3 border-start border-4 border-warning ps-2">Phản hồi từ người mua</h5>
            <div className="bg-white p-3 rounded-4 shadow-sm">
              {data.reviews && data.reviews.length > 0 ? (
                data.reviews.map(rev => (
                  <div key={rev._id} className="border-bottom pb-3 mb-3 last-child-border-0">
                    <div className="d-flex align-items-center gap-2 mb-1">
                      <img 
                        src={rev.buyer?.avatar || 'https://via.placeholder.com/30'} 
                        className="rounded-circle" 
                        style={{width: '30px', height: '30px'}} 
                        alt="buyer" 
                      />
                      <span className="fw-bold small">{rev.buyer?.name}</span>
                    </div>
                    <div className="text-warning small mb-1">{"★".repeat(rev.rating)}{"☆".repeat(5-rev.rating)}</div>
                    <p className="small text-muted mb-0 italic">"{rev.comment}"</p>
                  </div>
                ))
              ) : (
                <p className="text-muted text-center py-4 small">Chưa có đánh giá nào cho người bán này.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicProfile;