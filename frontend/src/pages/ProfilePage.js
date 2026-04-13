import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Header from '../components/Header';

const OrderDetailModal = ({ order, onClose }) => {
  if (!order) return null;
  return (
    <div className="fixed-top w-100 h-100 d-flex align-items-center justify-content-center" style={{ background: 'rgba(0,0,0,0.6)', zIndex: 2000, backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-4 shadow-lg w-100 mx-3 overflow-hidden animate__animated animate__zoomIn" style={{ maxWidth: '600px' }}>
        <div className="p-4 border-bottom bg-light d-flex justify-content-between align-items-center">
          <div><h5 className="fw-bold mb-0 text-dark">📦 Chi tiết đơn hàng</h5><small className="text-muted">Mã ĐH: #{order._id.slice(-6).toUpperCase()}</small></div>
          <button onClick={onClose} className="btn-close shadow-none"></button>
        </div>
        <div className="p-4" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <p className="fw-bold text-muted small text-uppercase mb-3 tracking-wider">Sản phẩm trong đơn</p>
          {order.items.map((item, idx) => (
            <div key={idx} className="d-flex align-items-center p-3 mb-3 rounded-4 border bg-white shadow-sm transition-all hover-scale">
              <img src={(item?.images && item.images.length > 0) ? item.images[0] : (item?.image || 'https://via.placeholder.com/80')} style={{ width: '70px', height: '70px', objectFit: 'cover', borderRadius: '12px' }} alt="sp" className="border" />
              <div className="ms-3 flex-grow-1"><h6 className="fw-bold mb-1 text-dark text-truncate" style={{maxWidth: '250px'}}>{item?.title || 'Sản phẩm đã bị xóa'}</h6><p className="text-danger fw-black mb-0">{Number(item?.price || 0).toLocaleString('vi-VN')} đ</p></div>
            </div>
          ))}
          <div className="mt-4 pt-4 border-top">
            <div className="row">
              <div className="col-6"><p className="fw-bold text-muted small text-uppercase mb-2 tracking-wider">Khách hàng</p><p className="fw-bold mb-0 text-dark">{order.buyer?.name || 'Khách hàng'}</p><small className="text-muted">📞 {order.phone}</small></div>
              <div className="col-6 border-start"><p className="fw-bold text-muted small text-uppercase mb-2 tracking-wider">Địa chỉ giao hàng</p><p className="small text-dark mb-0">{order.address}</p></div>
            </div>
          </div>
        </div>
        <div className="p-4 bg-success-subtle border-top d-flex justify-content-between align-items-center">
          <span className="fw-bold text-success uppercase small">Tổng thanh toán</span><h4 className="fw-black text-danger mb-0">{Number(order.totalPrice).toLocaleString('vi-VN')} đ</h4>
        </div>
      </div>
    </div>
  );
};

const ReviewModal = ({ order, onClose, onSuccess }) => {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  if (!order) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (comment.trim() === '') return alert("Vui lòng nhập nhận xét của bạn!");
    try {
      await axios.post('http://localhost:4000/api/reviews', { seller: order.seller, buyer: order.buyer?._id || order.buyer, rating, comment, orderId: order._id });
      alert("✅ Gửi đánh giá thành công! Cảm ơn bạn.");
      onSuccess();
    } catch (error) { alert("❌ " + (error.response?.data?.message || "Lỗi gửi đánh giá")); }
  };

  return (
    <div className="fixed-top w-100 h-100 d-flex align-items-center justify-content-center" style={{ background: 'rgba(0,0,0,0.6)', zIndex: 2000, backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-4 shadow-lg w-100 mx-3 overflow-hidden animate__animated animate__zoomIn p-4" style={{ maxWidth: '500px' }}>
        <div className="d-flex justify-content-between align-items-center mb-4 border-bottom pb-3">
          <h5 className="fw-bold mb-0 text-dark">⭐ Đánh giá người bán</h5>
          <button onClick={onClose} className="btn-close shadow-none"></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="text-center mb-4">
            <p className="fw-bold text-muted small mb-2">Chất lượng sản phẩm và thái độ người bán thế nào?</p>
            <div className="d-flex justify-content-center gap-2 fs-2" style={{cursor: 'pointer'}}>
              {[1, 2, 3, 4, 5].map((star) => (<span key={star} onClick={() => setRating(star)} className={star <= rating ? "text-warning" : "text-secondary opacity-25"}>★</span>))}
            </div>
            <div className="text-warning fw-bold mt-1">{rating} Sao</div>
          </div>
          <div className="mb-4">
            <label className="fw-bold small text-muted mb-2">Nhận xét chi tiết</label>
            <textarea className="form-control bg-light border-0" rows="4" placeholder="Hãy chia sẻ trải nghiệm của bạn về người bán và sản phẩm này nhé..." value={comment} onChange={(e) => setComment(e.target.value)} required></textarea>
          </div>
          <button type="submit" className="btn btn-warning w-100 fw-bold py-3 rounded-pill shadow-sm">GỬI ĐÁNH GIÁ</button>
        </form>
      </div>
    </div>
  );
};

const ProfilePage = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [myPosts, setMyPosts] = useState([]);
  const [myOrders, setMyOrders] = useState([]); 
  const [mySales, setMySales] = useState([]);   
  const [myReviews, setMyReviews] = useState([]); // 🚀 Bảng dữ liệu Đánh giá
  const [avgRating, setAvgRating] = useState(0);  // 🚀 Sao trung bình

  const [activeTab, setActiveTab] = useState('info'); 
  const [subTabOrder, setSubTabOrder] = useState('buy'); 
  
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [reviewOrder, setReviewOrder] = useState(null);

  const [editForm, setEditForm] = useState({ name: '', phone: '', address: '', cccd: '' });
  const [selectedImage, setSelectedImage] = useState(null);
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const parsedUser = storedUser && storedUser !== "undefined" ? JSON.parse(storedUser) : null;
    if (parsedUser) {
      setUser(parsedUser);
      setEditForm({ name: parsedUser.name || '', phone: parsedUser.phone || '', address: parsedUser.address || '', cccd: parsedUser.cccd || '' });
      fetchMyPosts(parsedUser._id);
      fetchMyOrders(parsedUser._id);
      fetchMySales(parsedUser._id); 
      fetchMyReviews(parsedUser._id); // Lấy danh sách đánh giá
    } else { navigate('/login'); }
  }, [navigate]);

  const fetchMyPosts = async (userId) => { try { const { data } = await axios.get(`${API_URL}/api/posts/user/${userId}`); setMyPosts(data); } catch (e) {} };
  const fetchMyOrders = async (userId) => { try { const { data } = await axios.get(`${API_URL}/api/users/${userId}/orders`); setMyOrders(data); } catch (e) {} };
  const fetchMySales = async (userId) => { try { const { data } = await axios.get(`${API_URL}/api/orders/seller/${userId}`); setMySales(data); } catch (e) {} };
  
  // 🚀 Hàm lấy đánh giá
  const fetchMyReviews = async (userId) => {
      try { 
          const { data } = await axios.get(`${API_URL}/api/users/public-profile/${userId}`); 
          setMyReviews(data.reviews); 
          setAvgRating(data.avgRating);
      } catch (error) {}
  };

  const handleConfirmOrder = async (orderId) => {
      if(!window.confirm("Xác nhận chốt đơn và tiến hành giao hàng cho khách?")) return;
      try { await axios.put(`${API_URL}/api/orders/${orderId}/confirm`); alert("✅ Đã xác nhận đơn hàng thành công!"); fetchMySales(user._id); } catch (e) { alert("❌ Lỗi!"); }
  };

  const handleCancelOrder = async (orderId, isSeller = false) => {
      if(!window.confirm("Bạn có chắc chắn muốn hủy đơn hàng này không?")) return;
      try { await axios.put(`${API_URL}/api/orders/${orderId}/cancel`); alert("✅ Đã hủy đơn hàng!"); if (isSeller) fetchMySales(user._id); else fetchMyOrders(user._id); } catch (e) { alert("❌ Lỗi!"); }
  };

  const handleReceiveOrder = async (orderId) => {
      if(!window.confirm("Xác nhận bạn đã nhận được hàng?")) return;
      try { await axios.put(`${API_URL}/api/orders/${orderId}/receive`); alert("✅ Đã xác nhận nhận hàng!"); fetchMyOrders(user._id); } catch (e) { alert("❌ Lỗi!"); }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    try {
        const formData = new FormData();
        Object.keys(editForm).forEach(key => formData.append(key, editForm[key]));
        if (selectedImage) formData.append('avatar', selectedImage);
        const { data } = await axios.put(`${API_URL}/api/users/profile/${user._id}`, formData);
        localStorage.setItem('user', JSON.stringify(data)); setUser(data); setSelectedImage(null); window.dispatchEvent(new Event('userUpdated')); alert('✅ Đã lưu thành công!');
    } catch (e) { alert('❌ Lỗi cập nhật!'); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) return alert('❌ Mật khẩu không khớp!');
    try { await axios.put(`${API_URL}/api/users/change-password/${user._id}`, passwordForm); alert('✅ Thành công! Hãy đăng nhập lại.'); localStorage.removeItem('user'); navigate('/login'); } catch (e) { alert('❌ Lỗi!'); }
  };

  const handleDeletePost = async (postId) => { if(window.confirm("Xóa bài viết này?")) { try { await axios.delete(`${API_URL}/api/posts/${postId}`); setMyPosts(myPosts.filter(p => p._id !== postId)); alert("✅ Đã xóa!"); } catch (e) {} } };

  const getStatusBadge = (status) => {
    if(status === 'Chờ xác nhận') return 'bg-warning text-dark';
    if(status === 'Đã thanh toán (Admin giữ tiền)') return 'bg-info text-dark';
    if(status === 'Người bán đã chuẩn bị hàng') return 'bg-orange text-dark border-orange';
    if(status === 'Đang giao hàng' || status === 'Đang giao') return 'bg-primary';
    if(status === 'Hoàn thành') return 'bg-success';
    return 'bg-secondary'; 
  };

  if (!user) return null;
  const isKycVerified = user.cccd && user.cccd.length > 8;

  return (
    <div style={{ backgroundColor: '#F4F4F4', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      
      {selectedOrder && <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
      {reviewOrder && <ReviewModal order={reviewOrder} onClose={() => setReviewOrder(null)} onSuccess={() => { setReviewOrder(null); fetchMyOrders(user._id); }} />}

      <div className="container py-5 flex-grow-1">
        <div className="row">
          {/* SIDEBAR TABS */}
          <div className="col-md-3 mb-4">
            <div className="bg-white rounded-4 shadow-sm p-3 sticky-top" style={{top: '100px'}}>
              <h6 className="fw-bold mb-3 ms-2 text-muted text-uppercase small">Thiết lập</h6>
              <ul className="list-unstyled mb-4">
                <li><button onClick={() => setActiveTab('info')} className={`btn w-100 text-start fw-bold py-2 mb-1 rounded-3 ${activeTab === 'info' ? 'bg-warning-subtle text-dark' : 'btn-light text-muted bg-white'}`}>👤 Thông tin cá nhân</button></li>
                <li><button onClick={() => setActiveTab('security')} className={`btn w-100 text-start fw-bold py-2 mb-1 rounded-3 ${activeTab === 'security' ? 'bg-warning-subtle text-dark' : 'btn-light text-muted bg-white'}`}>🔒 Bảo mật</button></li>
              </ul>
              <h6 className="fw-bold mb-3 ms-2 text-muted text-uppercase small">Giao dịch</h6>
              <ul className="list-unstyled">
                <li><button onClick={() => setActiveTab('orders')} className={`btn w-100 text-start fw-bold py-2 mb-1 rounded-3 ${activeTab === 'orders' ? 'bg-success text-white' : 'btn-light text-muted bg-white'}`}>📦 Đơn hàng của tôi</button></li>
                <li><button onClick={() => setActiveTab('posts')} className={`btn w-100 text-start fw-bold py-2 mb-1 rounded-3 ${activeTab === 'posts' ? 'bg-warning-subtle text-dark' : 'btn-light text-muted bg-white'}`}>🏪 Quản lý tin đăng</button></li>
                
                {/* 🚀 NÚT XEM ĐÁNH GIÁ MỚI */}
                <li><button onClick={() => setActiveTab('reviews')} className={`btn w-100 text-start fw-bold py-2 mb-1 rounded-3 ${activeTab === 'reviews' ? 'bg-warning-subtle text-dark' : 'btn-light text-muted bg-white'}`}>⭐ Đánh giá của tôi</button></li>
                
                <li className="border-top pt-2 mt-2"><button onClick={() => { localStorage.removeItem('user'); window.location.href='/login'; }} className="btn btn-light bg-white text-danger w-100 text-start fw-bold py-2 rounded-3">🚪 Đăng xuất</button></li>
              </ul>
            </div>
          </div>

          <div className="col-md-9">
            
            {/* TAB THÔNG TIN CÁ NHÂN */}
            {activeTab === 'info' && (
              <form onSubmit={handleUpdateProfile}>
                <div className="bg-white rounded-4 shadow-sm p-4 border-top border-5 border-warning mb-4">
                    <h4 className="fw-bold mb-4 text-dark">Hồ sơ cá nhân</h4>
                    <div className="d-flex align-items-center mb-4 pb-4 border-bottom">
                        <div className="position-relative d-inline-block me-4">
                            <div className="rounded-circle bg-warning text-white d-flex align-items-center justify-content-center fw-bold shadow-sm" style={{width: '90px', height: '90px', fontSize: '35px', overflow: 'hidden'}}>
                                {selectedImage ? <img src={URL.createObjectURL(selectedImage)} style={{width:'100%', height:'100%', objectFit:'cover'}} alt="preview" /> : user?.avatar ? <img src={user.avatar} style={{width:'100%', height:'100%', objectFit:'cover'}} alt="avatar" /> : user?.name?.charAt(0).toUpperCase()}
                            </div>
                            <label className="position-absolute bottom-0 end-0 bg-dark text-white rounded-circle d-flex align-items-center justify-content-center shadow" style={{width: '30px', height: '30px', cursor: 'pointer', border: '2px solid white'}}>
                                📷 <input type="file" hidden onChange={(e) => setSelectedImage(e.target.files[0])} accept="image/*" />
                            </label>
                        </div>
                        <div><h5 className="fw-bold mb-1 text-dark">{user.name}</h5><p className="text-muted mb-0">{user.email}</p></div>
                    </div>
                    <div className="row g-3">
                        <div className="col-md-4"><label className="fw-bold small text-muted mb-1">Họ và tên</label><input type="text" className="form-control bg-light" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} required /></div>
                        <div className="col-md-4"><label className="fw-bold small text-muted mb-1">Số điện thoại</label><input type="text" className="form-control bg-light" value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} /></div>
                        <div className="col-md-4"><label className="fw-bold small text-muted mb-1">Địa chỉ</label><input type="text" className="form-control bg-light" value={editForm.address} onChange={e => setEditForm({...editForm, address: e.target.value})} /></div>
                    </div>
                </div>

                <div className="bg-white rounded-4 shadow-sm p-4 border-top border-5 border-info mb-4 position-relative overflow-hidden">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                        <h5 className="fw-bold text-dark mb-0">Xác minh danh tính (KYC)</h5>
                        {isKycVerified ? (<span className="badge bg-success-subtle text-success px-3 py-2 rounded-pill"><i className="bi bi-shield-check me-1"></i> Đã xác minh an toàn</span>) : (<span className="badge bg-danger-subtle text-danger px-3 py-2 rounded-pill"><i className="bi bi-shield-exclamation me-1"></i> Chưa xác minh</span>)}
                    </div>
                    <p className="text-muted small mb-4">Cung cấp số Căn cước công dân (CCCD) để mở khóa tính năng giao dịch qua <b>Ví HaiPay</b> và tăng độ uy tín.</p>
                    <div className="row">
                        <div className="col-md-6">
                            <label className="fw-bold small text-muted mb-1">Số thẻ CCCD/CMND <span className="text-danger">*</span></label>
                            <div className="input-group">
                                <span className="input-group-text bg-light border-end-0">💳</span>
                                <input type="text" className="form-control border-start-0 ps-0 bg-light" placeholder="Nhập 12 số CCCD của bạn..." value={editForm.cccd} onChange={e => setEditForm({...editForm, cccd: e.target.value})} />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="text-end">
                    <button type="submit" className="btn btn-dark fw-bold px-5 py-3 rounded-pill shadow-sm hover-scale">💾 CẬP NHẬT TẤT CẢ THÔNG TIN</button>
                </div>
              </form>
            )}

            {/* TAB BẢO MẬT */}
            {activeTab === 'security' && (
              <div className="bg-white rounded-4 shadow-sm p-4 border-top border-5 border-dark">
                <h4 className="fw-bold mb-4 text-dark">Đổi mật khẩu</h4>
                <form onSubmit={handleChangePassword}>
                    <div className="mb-3"><label className="fw-bold small text-muted mb-1">Mật khẩu hiện tại</label><input type="password" className="form-control bg-light" value={passwordForm.oldPassword} onChange={e => setPasswordForm({...passwordForm, oldPassword: e.target.value})} required /></div>
                    <div className="mb-3"><label className="fw-bold small text-muted mb-1">Mật khẩu mới</label><input type="password" className="form-control bg-light" value={passwordForm.newPassword} onChange={e => setPasswordForm({...passwordForm, newPassword: e.target.value})} required /></div>
                    <div className="mb-3"><label className="fw-bold small text-muted mb-1">Xác nhận mật khẩu mới</label><input type="password" className="form-control bg-light" value={passwordForm.confirmPassword} onChange={e => setPasswordForm({...passwordForm, confirmPassword: e.target.value})} required /></div>
                    <button type="submit" className="btn btn-dark fw-bold px-5 py-2 rounded-pill shadow-sm">🔒 Cập nhật</button>
                </form>
              </div>
            )}

            {/* TAB QUẢN LÝ TIN ĐĂNG */}
            {activeTab === 'posts' && (
              <div className="bg-white rounded-4 shadow-sm p-4 border-top border-5 border-info">
                  <h4 className="fw-bold mb-4 text-dark text-center">Tin đăng của tôi ({myPosts.length})</h4>
                  {myPosts.length === 0 && <p className="text-center text-muted">Bạn chưa có bài đăng nào.</p>}
                  {myPosts.map(post => (
                    <div key={post._id} className="d-flex p-3 border align-items-center bg-white rounded-4 mb-3 shadow-sm hover-scale transition-all">
                        <img src={(post.images && post.images.length > 0) ? post.images[0] : (post.image || 'https://via.placeholder.com/80')} style={{width:'80px', height:'80px', objectFit:'cover', borderRadius:'12px', cursor: 'pointer'}} className="me-3 shadow-sm border" alt="sp" onClick={() => navigate(`/post/${post._id}`)} />
                        <div className="flex-grow-1" onClick={() => navigate(`/post/${post._id}`)} style={{cursor: 'pointer'}}>
                            <h6 className="fw-bold mb-1">{post.title}</h6>
                            <div className="d-flex align-items-center gap-2">
                                <small className="text-danger fw-bold">{Number(post.price).toLocaleString('vi-VN')} đ</small>
                                <span className="badge bg-light text-dark border small">Kho: {post.quantity || 0}</span>
                            </div>
                        </div>
                        <div className="ms-2 d-flex flex-column align-items-end gap-2">
                            <span className={`badge rounded-pill px-3 py-1 ${ (post.quantity === 0 || post.status === 'SOLD') ? 'bg-secondary' : (post.status === 'APPROVED' ? 'bg-success' : 'bg-warning text-dark')}`}>
                                { (post.quantity === 0 || post.status === 'SOLD') ? '🤝 Đã bán hết' : (post.status === 'APPROVED' ? '✅ Đang bán' : '⏳ Chờ duyệt')}
                            </span>
                            <div className="d-flex gap-2">
                                <button onClick={() => navigate(`/edit-post/${post._id}`)} className="btn btn-sm btn-outline-primary rounded-pill fw-bold px-3">Sửa</button>
                                <button onClick={() => handleDeletePost(post._id)} className="btn btn-sm btn-outline-danger rounded-pill fw-bold px-3">Xóa</button>
                            </div>
                        </div>
                    </div>
                  ))}
              </div>
            )}

            {/* TAB QUẢN LÝ ĐƠN HÀNG */}
            {activeTab === 'orders' && (
              <div className="bg-white rounded-4 shadow-sm p-4 border-top border-5 border-success">
                <h4 className="fw-bold mb-4 text-dark text-center">Quản lý Đơn hàng</h4>
                <div className="d-flex justify-content-center gap-3 mb-4 border-bottom pb-3">
                    <button onClick={() => setSubTabOrder('buy')} className={`btn fw-bold px-4 rounded-pill transition-all ${subTabOrder === 'buy' ? 'btn-success' : 'btn-outline-success'}`}>🛒 Đơn Mua ({myOrders.length})</button>
                    <button onClick={() => setSubTabOrder('sell')} className={`btn fw-bold px-4 rounded-pill transition-all ${subTabOrder === 'sell' ? 'btn-warning text-dark' : 'btn-outline-warning text-dark'}`}>🏪 Đơn Bán ({mySales.length})</button>
                </div>

                {/* ĐƠN MUA */}
                {subTabOrder === 'buy' && (
                    <div>
                        {myOrders.length === 0 && <p className="text-center text-muted">Bạn chưa đặt mua đơn hàng nào.</p>}
                        {myOrders.map(order => (
                        <div key={order._id} className="border rounded-4 mb-4 shadow-sm overflow-hidden bg-white">
                            <div className="bg-light p-3 border-bottom d-flex justify-content-between align-items-center">
                                <span className="text-muted fw-bold small">Mã: #{order._id.slice(-6).toUpperCase()}</span>
                                <span className={`badge rounded-pill px-3 py-2 ${getStatusBadge(order.status)}`}>{order.status}</span>
                            </div>
                            <div className="p-3">
                                {order.items.map((item, idx) => (
                                    <div key={idx} className="d-flex align-items-center mb-3 pb-3 border-bottom border-light">
                                        <img src={(item?.images && item.images[0]) || item?.image || 'https://via.placeholder.com/60'} style={{width:'60px', height:'60px', objectFit:'cover', borderRadius:'8px'}} alt="sp" className="border shadow-sm" />
                                        <div className="ms-3 flex-grow-1">
                                            <h6 className="fw-bold mb-1 text-dark text-truncate" style={{maxWidth: '350px'}}>{item?.title}</h6>
                                            <small className="text-danger fw-bold">{Number(item?.price || 0).toLocaleString('vi-VN')} đ</small>
                                        </div>
                                        <div className="d-flex gap-2">
                                            <button onClick={() => setSelectedOrder(order)} className="btn btn-sm btn-outline-secondary rounded-pill fw-bold px-4 hover-scale transition-all">Chi tiết</button>
                                        </div>
                                    </div>
                                ))}
                                <div className="d-flex justify-content-between align-items-center pt-2 bg-success-subtle p-3 rounded-4 mt-2">
                                    <div className="d-flex gap-2">
                                        {(order.status === 'Chờ xác nhận' || order.status === 'Đã thanh toán (Admin giữ tiền)') && (
                                            <button onClick={() => handleCancelOrder(order._id, false)} className="btn btn-sm btn-danger rounded-pill fw-bold px-3 shadow-sm">Hủy đơn</button>
                                        )}
                                        {(order.status === 'Đang giao hàng' || order.status === 'Đang giao') && (
                                            <button onClick={() => handleReceiveOrder(order._id)} className="btn btn-sm btn-success rounded-pill fw-bold px-3 shadow-sm">✅ Đã nhận được hàng</button>
                                        )}
                                        {order.status === 'Hoàn thành' && !order.isReviewed && (
                                            <button onClick={() => setReviewOrder(order)} className="btn btn-sm btn-outline-warning text-dark fw-bold rounded-pill px-4 shadow-sm border-2">⭐ Đánh giá ngay</button>
                                        )}
                                    </div>
                                    <div className="text-end d-flex align-items-center gap-3">
                                        <span className="text-muted small">Tổng tiền:</span>
                                        <span className="text-danger fw-black fs-5">{Number(order.totalPrice).toLocaleString('vi-VN')} đ</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        ))}
                    </div>
                )}

                {/* ĐƠN BÁN */}
                {subTabOrder === 'sell' && (
                    <div>
                        {mySales.length === 0 && <p className="text-center text-muted">Chưa có ai đặt mua hàng của bạn.</p>}
                        {mySales.map(order => (
                        <div key={order._id} className="border border-warning rounded-4 mb-4 shadow-sm overflow-hidden bg-white">
                            <div className="bg-warning-subtle p-3 border-bottom border-warning d-flex justify-content-between align-items-center">
                                <div>
                                    <span className="text-dark fw-bold small me-2">Mã: #{order._id.slice(-6).toUpperCase()}</span>
                                    <span className="text-muted small">| Người mua: <b>{order.buyer?.name}</b></span>
                                </div>
                                <span className={`badge rounded-pill px-3 py-2 ${getStatusBadge(order.status)}`}>{order.status}</span>
                            </div>
                            <div className="p-3">
                                {order.items.map((item, idx) => (
                                    <div key={idx} className="d-flex align-items-center mb-3 pb-3 border-bottom border-light">
                                        <img src={(item?.images && item.images[0]) || item?.image || 'https://via.placeholder.com/60'} style={{width:'60px', height:'60px', objectFit:'cover', borderRadius:'8px'}} alt="sp" className="border shadow-sm" />
                                        <div className="ms-3 flex-grow-1">
                                            <h6 className="fw-bold mb-1 text-dark text-truncate" style={{maxWidth: '350px'}}>{item?.title}</h6>
                                            <small className="text-danger fw-bold">{Number(item?.price || 0).toLocaleString('vi-VN')} đ</small>
                                        </div>
                                        <div className="d-flex gap-2">
                                            <button onClick={() => setSelectedOrder(order)} className="btn btn-sm btn-outline-secondary rounded-pill fw-bold px-4 hover-scale transition-all">Chi tiết</button>
                                        </div>
                                    </div>
                                ))}
                                <div className="d-flex justify-content-between align-items-center pt-2 bg-warning-subtle p-3 rounded-4 mt-2">
                                    <div className="d-flex gap-2">
                                        {(order.status === 'Chờ xác nhận' || order.status === 'Đã thanh toán (Admin giữ tiền)') && (
                                            <>
                                                <button onClick={() => handleConfirmOrder(order._id)} className="btn btn-sm btn-success rounded-pill fw-bold px-4 shadow-sm">Xác nhận đơn</button>
                                                <button onClick={() => handleCancelOrder(order._id, true)} className="btn btn-sm btn-outline-danger rounded-pill fw-bold px-3">Từ chối</button>
                                            </>
                                        )}
                                    </div>
                                    <div className="text-end d-flex align-items-center gap-3">
                                        <span className="text-muted small">Thu về:</span>
                                        <span className="text-danger fw-black fs-5">{Number(order.totalPrice).toLocaleString('vi-VN')} đ</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        ))}
                    </div>
                )}
              </div>
            )}

            {/* 🚀 TAB: ĐÁNH GIÁ CỦA TÔI (CHO NGƯỜI BÁN) */}
            {activeTab === 'reviews' && (
                <div className="bg-white rounded-4 shadow-sm p-4 border-top border-5 border-warning">
                    <h4 className="fw-bold mb-4 text-dark text-center">Đánh giá từ khách hàng</h4>
                    
                    <div className="text-center mb-5 bg-light p-4 rounded-4">
                        <h1 className="fw-black text-warning display-4 mb-0">{avgRating}/5</h1>
                        <div className="text-warning fs-3">{"⭐".repeat(Math.round(avgRating))}</div>
                        <p className="text-muted fw-bold">Dựa trên {myReviews.length} lượt đánh giá</p>
                    </div>

                    {myReviews.length === 0 && <p className="text-center text-muted">Bạn chưa nhận được đánh giá nào.</p>}
                    
                    {myReviews.map(rev => (
                        <div key={rev._id} className="d-flex gap-3 border-bottom pb-4 mb-4">
                            <img src={rev.buyer?.avatar || 'https://via.placeholder.com/50'} className="rounded-circle shadow-sm" style={{width: '50px', height: '50px', objectFit: 'cover'}} alt="avt" />
                            <div>
                                <div className="bg-light p-3 rounded-4 position-relative">
                                    <h6 className="fw-bold text-dark mb-1">{rev.buyer?.name || 'Khách hàng'}</h6>
                                    <div className="text-warning small mb-2">{"⭐".repeat(rev.rating)}</div>
                                    <p className="text-secondary mb-0" style={{fontStyle: 'italic'}}>"{rev.comment}"</p>
                                </div>
                                <small className="text-muted ms-2 mt-1 d-block" style={{fontSize: '10px'}}>{new Date(rev.createdAt).toLocaleString('vi-VN')}</small>
                            </div>
                        </div>
                    ))}
                </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;