import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';

const CreatePostPage = () => {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [previewImages, setPreviewImages] = useState([]);
  
  // 🚀 STATE ĐỂ LƯU DANH SÁCH DANH MỤC TỪ BACKEND
  const [categories, setCategories] = useState([]);

  const [formData, setFormData] = useState({
    title: '', price: '', category: '', description: '', quantity: 1
  });

  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');

  const API_URL = 'http://localhost:4000';

  useEffect(() => {
    // Lấy dữ liệu 63 tỉnh thành
    axios.get('https://provinces.open-api.vn/api/?depth=2')
      .then(res => setProvinces(res.data)).catch(console.error);

    // 🚀 GỌI API LẤY DANH MỤC TỪ ADMIN VÀO ĐÂY
    axios.get(`${API_URL}/api/categories`)
      .then(res => {
          setCategories(res.data);
          // Tự động chọn danh mục đầu tiên làm mặc định để khỏi bị lỗi rỗng
          if (res.data.length > 0) {
              setFormData(prev => ({ ...prev, category: res.data[0].name }));
          }
      }).catch(console.error);
  }, []);

  // Tự động lọc Quận/Huyện khi chọn Tỉnh/Thành
  useEffect(() => {
    if (selectedCity) {
      const city = provinces.find(p => p.name === selectedCity);
      setDistricts(city ? city.districts : []);
    } else {
      setDistricts([]);
    }
    setSelectedDistrict('');
  }, [selectedCity, provinces]);

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length > 5) {
      alert("Tối đa 5 tấm thôi bạn ơi! 😂");
      e.target.value = null;
      return;
    }
    setFiles(selectedFiles);
    const previews = selectedFiles.map(file => URL.createObjectURL(file));
    setPreviewImages(previews);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedCity) return alert("Vui lòng chọn Tỉnh/Thành phố nha!");

    const data = new FormData();
    data.append('title', formData.title);
    data.append('price', formData.price);
    data.append('category', formData.category);
    data.append('description', formData.description);
    data.append('quantity', formData.quantity);
    
    const finalLocation = selectedDistrict ? `${selectedDistrict}, ${selectedCity}` : selectedCity;
    data.append('location', finalLocation);

    const user = JSON.parse(localStorage.getItem('user'));
    if (user && user._id) {
        data.append('author', user._id);
    }

    files.forEach(f => data.append('images', f));

    try {
      await axios.post(`${API_URL}/api/posts`, data, {
        headers: { 'Content-Type': 'multipart/form-data', 'Authorization': `Bearer ${user?.token}` }
      });
      alert("🎉 Đăng tin thành công! Bài viết đang chờ Admin kiểm duyệt.");
      navigate('/profile'); 
    } catch (err) { alert("Lỗi rồi: " + err.message); }
  };

  return (
    <div className="min-vh-100 d-flex flex-column" style={{backgroundColor: '#f4f4f4'}}>
      <Header />
      <div className="container py-5 flex-grow-1" style={{maxWidth: '700px'}}>
        <form onSubmit={handleSubmit} className="bg-white p-5 rounded-4 shadow-sm border-top border-5 border-warning">
          <h3 className="fw-bold mb-4 text-center">🆕 Đăng tin mới</h3>
          
          <div className="mb-3">
            <label className="form-label fw-bold small text-muted">Hình ảnh (Tối đa 5 tấm)</label>
            <input type="file" className="form-control bg-light" multiple accept="image/*" onChange={handleFileChange} required />
            <div className="d-flex gap-2 mt-2 overflow-auto">
                {previewImages.map((src, i) => <img key={i} src={src} className="rounded border" style={{width:'70px', height:'70px', objectFit:'cover'}} alt="preview"/>)}
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label fw-bold small text-muted">Tiêu đề</label>
            <input type="text" className="form-control bg-light" placeholder="Ví dụ: iPhone 15 Pro Max mới 99%" required onChange={e => setFormData({...formData, title: e.target.value})} />
          </div>

          <div className="row">
            <div className="col-md-6 mb-3">
                <label className="form-label fw-bold small text-muted">Giá bán (VNĐ)</label>
                <input type="number" className="form-control bg-light" required onChange={e => setFormData({...formData, price: e.target.value})} />
            </div>
            <div className="col-md-6 mb-3">
                <label className="form-label fw-bold small text-muted">Số lượng</label>
                <input type="number" className="form-control bg-light" min="1" defaultValue="1" onChange={e => setFormData({...formData, quantity: e.target.value})} />
            </div>
          </div>

          <div className="row">
            <div className="col-md-6 mb-3">
                <label className="form-label fw-bold small text-muted">Tỉnh / Thành phố</label>
                <select className="form-select bg-light" required value={selectedCity} onChange={e => setSelectedCity(e.target.value)}>
                    <option value="">-- Chọn Tỉnh/Thành --</option>
                    {provinces.map(p => <option key={p.code} value={p.name}>{p.name}</option>)}
                </select>
            </div>
            <div className="col-md-6 mb-3">
                <label className="form-label fw-bold small text-muted">Quận / Huyện</label>
                <select className="form-select bg-light" value={selectedDistrict} onChange={e => setSelectedDistrict(e.target.value)} disabled={!selectedCity}>
                    <option value="">-- Tất cả Quận/Huyện --</option>
                    {districts.map(d => <option key={d.code} value={d.name}>{d.name}</option>)}
                </select>
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label fw-bold small text-muted">Danh mục</label>
            {/* 🚀 ĐÃ CẬP NHẬT: Vòng lặp map để in ra toàn bộ danh mục từ Backend */}
            <select className="form-select bg-light" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                {categories.length === 0 ? (
                    <option value="">Đang tải danh mục...</option>
                ) : (
                    categories.map((cat, index) => (
                        <option key={index} value={cat.name}>{cat.name}</option>
                    ))
                )}
            </select>
          </div>

          <div className="mb-4">
            <label className="form-label fw-bold small text-muted">Mô tả chi tiết</label>
            <textarea className="form-control bg-light" rows="4" required onChange={e => setFormData({...formData, description: e.target.value})}></textarea>
          </div>

          <button type="submit" className="btn btn-warning w-100 fw-bold py-3 rounded-pill shadow-sm fs-5">🚀 Đăng tin ngay</button>
        </form>
      </div>
      <Footer />
    </div>
  );
};

export default CreatePostPage;