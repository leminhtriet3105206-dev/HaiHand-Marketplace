import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';

const CartPage = () => {
  const [cartItems, setCartItems] = useState([]);
  const navigate = useNavigate();
  
  const currentUser = JSON.parse(localStorage.getItem('user'));
  const API_URL = process.env.REACT_APP_API_URL || 'https://haihand-marketplace.onrender.com';

  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [address, setAddress] = useState(currentUser?.address || '');
  const [paymentMethod, setPaymentMethod] = useState('COD'); 

  const fetchCart = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/users/cart/${currentUser._id}`);
      setCartItems(data);
    } catch (error) {
      console.error("Lỗi tải giỏ hàng", error);
    }
  };

  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }
    fetchCart();
    
  }, []);

  const handleRemoveItem = async (postId) => {
    try {
      await axios.delete(`${API_URL}/api/users/cart/${currentUser._id}/${postId}`);
      fetchCart(); 
      window.dispatchEvent(new Event('cartUpdated')); 
    } catch (error) {
      alert("Lỗi không thể gỡ sản phẩm!");
    }
  };

  const handleClearCart = async () => {
    if (!window.confirm("Bạn có chắc muốn dọn sạch toàn bộ giỏ hàng không?")) return;
    try {
        await axios.delete(`${API_URL}/api/users/cart/clear/${currentUser._id}`);
        setCartItems([]);
        window.dispatchEvent(new Event('cartUpdated'));
    } catch (error) {
        alert("Lỗi dọn giỏ hàng!");
    }
  };

  const handleUpdateQuantity = async (postId, currentQty, change, maxStock) => {
    const newQty = currentQty + change;
    
    if (newQty < 1) {
        if(window.confirm("Bạn có muốn gỡ sản phẩm này khỏi giỏ hàng?")) {
            handleRemoveItem(postId);
        }
        return;
    }

    if (change > 0 && newQty > maxStock) {
        alert(`Sản phẩm này hiện chỉ còn ${maxStock} món trong kho!`);
        return;
    }

    try {
        await axios.post(`${API_URL}/api/users/cart`, {
            userId: currentUser._id,
            postId: postId,
            quantity: change 
        });
        fetchCart(); 
        window.dispatchEvent(new Event('cartUpdated'));
    } catch (error) {
        alert("Lỗi cập nhật số lượng!");
    }
  };

  const handleCheckout = async () => {
    if (cartItems.length === 0) return alert("Giỏ hàng đang trống!");
    if (!phone || !address) return alert("Vui lòng nhập đầy đủ Số điện thoại và Địa chỉ!");

    const confirmPay = window.confirm(`Bạn xác nhận thanh toán số tiền ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(calculateTotal())} bằng phương thức ${paymentMethod}?`);
    if (!confirmPay) return;

    try {
        const itemIds = cartItems.map(item => item.product._id);
        const orderRes = await axios.post(`${API_URL}/api/users/${currentUser._id}/checkout`, {
            items: itemIds,
            totalPrice: calculateTotal(),
            phone,
            address,
            paymentMethod
        });

        const newOrder = orderRes.data.order;

        if (paymentMethod === 'COD') {
            setCartItems([]);
            window.dispatchEvent(new Event('cartUpdated'));
            alert("🎉 Đặt hàng thành công!");
            navigate('/');
        } 
        else if (paymentMethod === 'VNPAY') {
            const vnpayRes = await axios.post(`${API_URL}/api/vnpay/create_payment_url`, {
                amount: calculateTotal(),
                orderId: newOrder._id
            });
            if (vnpayRes.data && vnpayRes.data.paymentUrl) window.location.href = vnpayRes.data.paymentUrl;
            else alert("Không thể tạo link VNPay!");
        }
        
        else if (paymentMethod === 'HAIPAY') {
            setCartItems([]);
            window.dispatchEvent(new Event('cartUpdated'));
            
            
            const updatedUser = { ...currentUser, walletBalance: orderRes.data.newBalance };
            localStorage.setItem('user', JSON.stringify(updatedUser));
            window.dispatchEvent(new Event('userUpdated')); 

            alert("🎉 Thanh toán rẹt rẹt bằng HaiPay thành công!");
            navigate('/');
        }
    } catch (error) {
        
        if (error.response && error.response.status === 400) {
            alert("❌ " + error.response.data.error);
            if (error.response.data.error.includes('CCCD')) navigate('/profile');
            if (error.response.data.error.includes('Số dư')) navigate('/haipay');
        } else {
            alert("Lỗi trong quá trình thanh toán!");
        }
    }
  };

  const getImageUrl = (imgStr) => {
    if (!imgStr) return 'https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg';
    return imgStr.startsWith('http') ? imgStr : `${API_URL}/${imgStr.replace(/\\/g, '/')}`;
  };

  const calculateTotal = () => {
    return cartItems.reduce((total, item) => {
      if (item.product && item.product.price) return total + (item.product.price * item.quantity);
      return total;
    }, 0);
  };

  return (
    <div className="min-vh-100 d-flex flex-column" style={{backgroundColor: '#f4f4f4'}}>
      <Header />
      <div className="container py-5 flex-grow-1">
        
        <div className="d-flex justify-content-between align-items-center mb-4">
            <button onClick={() => navigate(-1)} className="btn btn-warning fw-bold rounded-pill shadow-sm px-4">← Quay lại</button>
            {cartItems.length > 0 && (
                <button onClick={handleClearCart} className="btn btn-outline-danger fw-bold rounded-pill px-4">🗑️ Dọn sạch giỏ</button>
            )}
        </div>
        
        <h2 className="fw-bold mb-4 d-flex align-items-center gap-2">🛒 Giỏ hàng của tôi</h2>

        {cartItems.length === 0 ? (
            <div className="bg-white rounded-4 shadow-sm p-5 text-center">
                <h3 className="text-muted mb-3">Giỏ hàng trống trơn!</h3>
                <button onClick={() => navigate('/')} className="btn btn-warning fw-bold rounded-pill px-4">Đi mua sắm ngay</button>
            </div>
        ) : (
            <div className="row">
                <div className="col-md-7 mb-4">
                    {cartItems.map((item, index) => {
                        if (!item.product) return null; 
                        const displayImage = item.product.images?.length > 0 ? item.product.images[0] : item.product.image;
                        return (
                            <div key={`cart-item-${index}`} className="bg-white rounded-4 shadow-sm p-3 mb-3 d-flex align-items-center position-relative">
                                <div className="bg-light rounded-3 overflow-hidden d-flex justify-content-center align-items-center me-4 border flex-shrink-0" style={{width: '100px', height: '100px'}}>
                                    <img src={getImageUrl(displayImage)} alt={item.product.title || 'Product'} style={{width: '100%', height: '100%', objectFit: 'cover'}} onError={(e) => e.target.src='https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg'} />
                                </div>
                                <div className="flex-grow-1 pe-5">
                                    <h5 className="fw-bold text-dark mb-1 text-truncate" style={{maxWidth: '100%'}}>{item.product.title || 'Sản phẩm không xác định'}</h5>
                                    <p className="text-danger fw-bold fs-5 mb-2">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.product.price || 0)}</p>
                                    <div className="d-flex align-items-center mt-1">
                                        <span className="text-muted small me-3">Số lượng:</span>
                                        <div className="input-group input-group-sm" style={{width: '110px'}}>
                                            <button className="btn btn-outline-secondary px-2" type="button" onClick={() => handleUpdateQuantity(item.product._id, item.quantity, -1, item.product.quantity)}>-</button>
                                            <input type="text" className="form-control text-center fw-bold bg-white" value={item.quantity} readOnly />
                                            <button className="btn btn-outline-secondary px-2" type="button" onClick={() => handleUpdateQuantity(item.product._id, item.quantity, 1, item.product.quantity)}>+</button>
                                        </div>
                                    </div>
                                    {item.quantity >= item.product.quantity && (<small className="text-danger d-block mt-1">Kho chỉ còn {item.product.quantity} món</small>)}
                                </div>
                                <button className="btn btn-outline-danger rounded-circle position-absolute d-flex justify-content-center align-items-center" style={{top: '50%', right: '15px', transform: 'translateY(-50%)', width: '35px', height: '35px'}} onClick={() => handleRemoveItem(item.product._id)}>✕</button>
                            </div>
                        );
                    })}
                </div>

                <div className="col-md-5">
                    <div className="bg-white rounded-4 shadow-sm p-4 sticky-top" style={{top: '100px'}}>
                        <h4 className="fw-bold mb-4 border-bottom pb-3">Thông tin đặt hàng</h4>
                        <div className="mb-3">
                            <label className="form-label text-muted small fw-bold mb-1">Số điện thoại</label>
                            <input type="text" className="form-control bg-light" value={phone} onChange={(e) => setPhone(e.target.value)} />
                        </div>
                        <div className="mb-3">
                            <label className="form-label text-muted small fw-bold mb-1">Địa chỉ giao hàng</label>
                            <textarea className="form-control bg-light" rows="2" value={address} onChange={(e) => setAddress(e.target.value)}></textarea>
                        </div>
                        <div className="mb-4">
                            <label className="form-label text-muted small fw-bold mb-1">Phương thức thanh toán</label>
                            <select className="form-select bg-light fw-bold" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                                <option value="COD">💵 Thanh toán tiền mặt (COD)</option>
                                <option value="VNPAY">💳 Chuyển khoản ngân hàng (VNPay)</option>
                                
                                <option value="HAIPAY">⚡ Thanh toán qua ví HaiPay</option>
                            </select>
                        </div>

                        <div className="bg-light p-3 rounded-3 mb-4 border">
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted small">Tạm tính ({cartItems.length} SP):</span>
                                <span className="fw-bold text-dark">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(calculateTotal())}</span>
                            </div>
                            <div className="d-flex justify-content-between mb-3 border-bottom pb-3">
                                <span className="text-muted small">Phí giao hàng:</span>
                                <span className="fw-bold text-success">Miễn phí</span>
                            </div>
                            <div className="d-flex justify-content-between align-items-center">
                                <span className="fw-bold fs-5">Tổng cộng:</span>
                                <span className="fw-black text-danger fs-3">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(calculateTotal())}</span>
                            </div>
                        </div>
                        
                        <button onClick={handleCheckout} className={`btn w-100 fw-bold py-3 rounded-pill shadow-sm fs-5 hover-scale ${paymentMethod === 'VNPAY' ? 'btn-primary text-white' : (paymentMethod === 'HAIPAY' ? 'btn-info text-dark' : 'btn-warning text-dark')}`}>
                            {paymentMethod === 'VNPAY' ? 'Thanh toán qua VNPay' : (paymentMethod === 'HAIPAY' ? 'Thanh toán ví HaiPay' : 'Xác nhận đặt hàng')}
                        </button>
                    </div>
                </div>
            </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default CartPage;