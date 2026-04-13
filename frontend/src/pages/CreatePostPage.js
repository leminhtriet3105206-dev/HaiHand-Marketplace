import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';

const CreatePostPage = () => {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [previewImages, setPreviewImages] = useState([]);
  const [categories, setCategories] = useState([]);

  const [formData, setFormData] = useState({
    title: '', price: '', category: '', description: '', quantity: 1
  });

  // 🚀 STATE LƯU THÔNG TIN CHI TIẾT THEO DANH MỤC
  const [details, setDetails] = useState({});

  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

  useEffect(() => {
    axios.get('https://provinces.open-api.vn/api/?depth=2')
      .then(res => setProvinces(res.data)).catch(console.error);

    axios.get(`${API_URL}/api/categories`)
      .then(res => {
          setCategories(res.data);
          if(res.data.length > 0) setFormData(prev => ({...prev, category: res.data[0].name}));
      }).catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedCity) {
      const city = provinces.find(p => p.name === selectedCity);
      setDistricts(city ? city.districts : []);
    } else {
      setDistricts([]);
    }
    setSelectedDistrict('');
  }, [selectedCity, provinces]);

  // 🚀 HÀM HIỂN THỊ CÁC Ô NHẬP CHI TIẾT TÙY THEO DANH MỤC
  const renderDynamicFields = () => {
    const handleChange = (e) => {
        setDetails({ ...details, [e.target.name]: e.target.value });
    };

    if (formData.category === 'Đồ điện tử' || formData.category === 'Điện thoại') {
        return (
            <div className="bg-light p-3 rounded-4 mb-3 border-0 shadow-sm">
                <h6 className="fw-bold mb-3 text-primary">📱 Thông số thiết bị</h6>
                <div className="row g-2">
                    <div className="col-6">
                        <label className="small fw-bold">Hãng sản xuất</label>
                        <input type="text" name="brand" className="form-control form-control-sm" placeholder="VD: Apple, Samsung" onChange={handleChange} />
                    </div>
                    <div className="col-6">
                        <label className="small fw-bold">Tình trạng</label>
                        <select name="condition" className="form-select form-select-sm" onChange={handleChange}>
                            <option value="">-- Chọn --</option>
                            <option value="Mới">Mới (100%)</option>
                            <option value="99%">Cũ (99%)</option>
                            <option value="Cũ">Cũ (Trầy xước)</option>
                        </select>
                    </div>
                    <div className="col-12 mt-2">
                        <label className="small fw-bold">Bảo hành</label>
                        <input type="text" name="warranty" className="form-control form-control-sm" placeholder="VD: Còn 6 tháng, Hết bảo hành" onChange={handleChange} />
                    </div>
                </div>
            </div>
        );
    }
    if (formData.category === 'Xe cộ') {
        return (
            <div className="bg-light p-3 rounded-4 mb-3 border-0 shadow-sm">
                <h6 className="fw-bold mb-3 text-primary">🏍️ Thông số xe</h6>
                <div className="row g-2">
                    <div className="col-6">
                        <label className="small fw-bold">Năm đăng ký</label>
                        <input type="number" name="year" className="form-control form-control-sm" placeholder="VD: 2023" onChange={handleChange} />
                    </div>
                    <div className="col-6">
                        <label className="small fw-bold">Số Km đã đi</label>
                        <input type="text" name="km" className="form-control form-control-sm" placeholder="VD: 5000km" onChange={handleChange} />
                    </div>
                </div>
            </div>
        );
    }
    return null;
  };

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles([...files, ...selectedFiles]);
    const previews = selectedFiles.map(file => URL.createObjectURL(file));
    setPreviewImages([...previewImages, ...previews]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const user = JSON.parse(localStorage.getItem('user'));
    const data = new FormData();
    data.append('title', formData.title);
    data.append('price', formData.price);
    data.append('category', formData.category);
    data.append('description', formData.description);
    data.append('quantity', formData.quantity);
    data.append('location', `${selectedDistrict}, ${selectedCity}`);
    data.append('userId', user._id);
    // 🚀 GỬI KÈM THÔNG TIN CHI TIẾT
    data.append('details', JSON.stringify(details));
    
    files.forEach(file => data.append('images', file));

    try {
      await axios.post(`${API_URL}/api/posts`, data);
      alert("Đăng tin thành công!");
      navigate('/');
    } catch (error) { alert("Lỗi rồi bác ơi!"); }
  };

  return (
    <div className="bg-light min-vh-100">
      <Header />
      <div className="container py-5">
        <form onSubmit={handleSubmit} className="bg-white p-4 rounded-4 shadow-sm mx-auto" style={{maxWidth: '700px'}}>
          <h3 className="fw-bold mb-4 text-center text-warning">📢 Đăng Tin Rao Bán</h3>

          <div className="mb-3">
            <label className="form-label fw-bold small text-muted">Hình ảnh sản phẩm</label>
            <input type="file" className="form-control bg-light" multiple onChange={handleFileChange} />
            <div className="d-flex gap-2 mt-3 flex-wrap">
                {previewImages.map((src, i) => (
                    <img key={i} src={src} className="rounded-3 border" style={{width: '80px', height: '80px', objectFit: 'cover'}} />
                ))}
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label fw-bold small text-muted">Tiêu đề</label>
            <input type="text" className="form-control bg-light px-3" required onChange={e => setFormData({...formData, title: e.target.value})} />
          </div>

          <div className="row mb-3">
            <div className="col-md-6">
                <label className="form-label fw-bold small text-muted">Giá bán (VNĐ)</label>
                <input type="number" className="form-control bg-light" required onChange={e => setFormData({...formData, price: e.target.value})} />
                {formData.price > 0 && <div className="mt-1 text-primary small fw-bold">💰 {Number(formData.price).toLocaleString('vi-VN')} đ</div>}
            </div>
            <div className="col-md-6">
                <label className="form-label fw-bold small text-muted">Danh mục</label>
                <select className="form-select bg-light" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                    {categories.map((cat, index) => <option key={index} value={cat.name}>{cat.name}</option>)}
                </select>
            </div>
          </div>

          {/* 🚀 HIỂN THỊ Ô NHẬP CHI TIẾT TẠI ĐÂY */}
          {renderDynamicFields()}

          <div className="row mb-3">
            <div className="col-md-6">
                <label className="form-label fw-bold small text-muted">Tỉnh / Thành</label>
                <select className="form-select bg-light" required value={selectedCity} onChange={e => setSelectedCity(e.target.value)}>
                    <option value="">-- Chọn Tỉnh --</option>
                    {provinces.map(p => <option key={p.code} value={p.name}>{p.name}</option>)}
                </select>
            </div>
            <div className="col-md-6">
                <label className="form-label fw-bold small text-muted">Quận / Huyện</label>
                <select className="form-select bg-light" required value={selectedDistrict} onChange={e => setSelectedDistrict(e.target.value)} disabled={!selectedCity}>
                    <option value="">-- Chọn Huyện --</option>
                    {districts.map(d => <option key={d.code} value={d.name}>{d.name}</option>)}
                </select>
            </div>
          </div>

          <div className="mb-4">
            <label className="form-label fw-bold small text-muted">Mô tả</label>
            <textarea className="form-control bg-light px-3" rows="4" required onChange={e => setFormData({...formData, description: e.target.value})}></textarea>
          </div>

          <button type="submit" className="btn btn-warning w-100 fw-bold py-3 rounded-pill shadow-sm">🚀 Đăng tin ngay</button>
        </form>
      </div>
      <Footer />
    </div>
  );
};

export default CreatePostPage;