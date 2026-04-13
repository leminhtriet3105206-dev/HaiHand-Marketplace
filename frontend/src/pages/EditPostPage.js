import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';

const EditPostPage = () => {
  const { id } = useParams(); 
  const navigate = useNavigate();
  
  const [files, setFiles] = useState([]); 
  const [existingImages, setExistingImages] = useState([]); 
  const [previewImages, setPreviewImages] = useState([]); 

  const [formData, setFormData] = useState({ 
    title: '', price: '', category: 'Đồ điện tử', description: '', quantity: 1 
  });

  // 🚀 STATE ĐỊA CHỈ XỊN
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

  useEffect(() => {
    // 1. Kéo dữ liệu 63 tỉnh thành
    axios.get('https://provinces.open-api.vn/api/?depth=2')
      .then(res => setProvinces(res.data)).catch(console.error);

    // 2. Kéo dữ liệu cũ về điền vào Form
    const fetchPost = async () => {
      try {
        const { data } = await axios.get(`${API_URL}/api/posts/${id}`);
        setFormData({
          title: data.title,
          price: data.price,
          category: data.category,
          description: data.description,
          quantity: data.quantity || 1
        });
        
        // Lấy ảnh cũ hiển thị
        if (data.images && data.images.length > 0) {
            setExistingImages(data.images);
        } else if (data.image) {
            setExistingImages([data.image]); 
        }

        // Tách địa chỉ cũ ra để set vào Select (Nếu có dấu phẩy)
        if (data.location && data.location.includes(',')) {
            const parts = data.location.split(',').map(item => item.trim());
            // Format đệ tử tạo là "Quận/Huyện, Tỉnh/Thành"
            if (parts.length >= 2) {
                setSelectedDistrict(parts[0]);
                setSelectedCity(parts[1]);
            } else {
                setSelectedCity(parts[0]);
            }
        } else {
            setSelectedCity(data.location || '');
        }

      } catch (error) {
        alert("Lỗi không lấy được thông tin bài đăng!");
        navigate('/profile');
      }
    };
    fetchPost();
  }, [id, navigate]);

  // 🚀 Tự động lọc Quận/Huyện khi Tỉnh/Thành thay đổi
  useEffect(() => {
    if (selectedCity && provinces.length > 0) {
      const city = provinces.find(p => p.name === selectedCity);
      setDistricts(city ? city.districts : []);
    } else {
      setDistricts([]);
    }
  }, [selectedCity, provinces]);

  // Xóa bộ nhớ đệm của ảnh preview để web không bị nặng
  useEffect(() => {
    return () => {
        previewImages.forEach(url => URL.revokeObjectURL(url));
    };
  }, [previewImages]);

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length > 5) {
      alert("Bẩm lão đại, hệ thống chỉ cho phép tối đa 5 tấm thôi ạ! 😅");
      e.target.value = null;
      setFiles([]);
      setPreviewImages([]);
      return;
    }
    setFiles(selectedFiles);

    // TẠO LINK XEM TRƯỚC (PREVIEW) CHO ẢNH MỚI
    const previews = selectedFiles.map(file => URL.createObjectURL(file));
    setPreviewImages(previews);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedCity) return alert("Lão đại vui lòng chọn Tỉnh/Thành phố nha!");

    const data = new FormData();
    data.append('title', formData.title); 
    data.append('price', formData.price);
    data.append('category', formData.category); 
    data.append('description', formData.description); 
    data.append('quantity', formData.quantity);

    // Ghép địa chỉ chuẩn: "Quận/Huyện, Tỉnh/Thành"
    const finalLocation = selectedDistrict ? `${selectedDistrict}, ${selectedCity}` : selectedCity;
    data.append('location', finalLocation);

    // Bơm ảnh mới vào nếu có
    if (files.length > 0) {
        files.forEach(f => { data.append('images', f); });
    }

    try {
      await axios.put(`${API_URL}/api/posts/${id}`, data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      alert("🎉 Bẩm lão đại, cập nhật bài đăng thành công!"); 
      navigate('/profile'); 
    } catch (err) { 
      alert("Lỗi: " + (err.response?.data?.message || err.message)); 
    }
  };

  const getImageUrl = (imgStr) => {
      return imgStr.startsWith('http') ? imgStr : `${API_URL}/${imgStr.replace(/\\/g, '/')}`;
  };

  return (
    <div className="d-flex flex-column min-vh-100" style={{ backgroundColor: '#F4F4F4' }}>
      <Header />
      <div className="container py-5 flex-grow-1" style={{maxWidth: '600px'}}>
        <div className="d-flex justify-content-center mb-4">
            <button onClick={() => navigate(-1)} className="btn btn-warning fw-bold shadow-sm px-4 rounded-pill">← Quay lại</button>
        </div>
        
        <form onSubmit={handleSubmit} className="bg-white p-5 rounded-4 shadow-sm border-top border-5 border-warning">
          <h3 className="fw-bold mb-4 text-center">✏️ Sửa bài đăng</h3>
          
          <div className="mb-3">
            <label className="form-label fw-bold text-muted small">Tiêu đề bài đăng</label>
            <input type="text" className="form-control bg-light" required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
          </div>
          
          <div className="row mb-3">
            <div className="col-md-6">
                <label className="form-label fw-bold text-muted small">Giá bán (VNĐ)</label>
                <input type="number" className="form-control bg-light" required value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} />
            </div>
            <div className="col-md-6">
                <label className="form-label fw-bold text-muted small">Số lượng kho</label>
                <input type="number" className="form-control bg-light" min="1" required value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} />
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label fw-bold text-muted small">Danh mục</label>
            <select className="form-select bg-light" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                <option value="Đồ điện tử">📱 Đồ điện tử</option>
                <option value="Xe cộ">🛵 Xe cộ</option>
                <option value="Thời trang">👕 Thời trang</option>
                <option value="Thú cưng">🐶 Thú cưng</option>
                <option value="Bất Động Sản">🏡 Bất Động Sản</option>
                <option value="Khác">📦 Khác</option>
            </select>
          </div>

          {/* 🚀 BỘ CHỌN ĐỊA CHỈ THÔNG MINH ĐÃ ĐƯỢC MANG VÀO ĐÂY */}
          <div className="row mb-3">
            <div className="col-md-6">
                <label className="form-label fw-bold text-muted small">Tỉnh / Thành phố</label>
                <select className="form-select bg-light" required value={selectedCity} onChange={e => { setSelectedCity(e.target.value); setSelectedDistrict(''); }}>
                    <option value="">-- Chọn Tỉnh/Thành --</option>
                    {provinces.map(p => <option key={p.code} value={p.name}>{p.name}</option>)}
                </select>
            </div>
            <div className="col-md-6">
                <label className="form-label fw-bold text-muted small">Quận / Huyện</label>
                <select className="form-select bg-light" value={selectedDistrict} onChange={e => setSelectedDistrict(e.target.value)} disabled={!selectedCity}>
                    <option value="">-- Tất cả Quận/Huyện --</option>
                    {districts.map(d => <option key={d.code} value={d.name}>{d.name}</option>)}
                </select>
            </div>
          </div>

          {/* 🚀 KHU VỰC HIỂN THỊ ẢNH (CŨ VÀ PREVIEW) */}
          <div className="mb-3 border p-3 rounded-3 bg-light">
              {previewImages.length > 0 ? (
                  <>
                      <label className="form-label fw-bold text-success small">📸 Ảnh mới sẽ được cập nhật ({previewImages.length} tấm)</label>
                      <div className="d-flex gap-2 overflow-auto pb-2">
                          {previewImages.map((src, idx) => (
                              <img key={idx} src={src} alt="preview" style={{width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '2px solid #198754'}} />
                          ))}
                      </div>
                  </>
              ) : (
                  <>
                      <label className="form-label fw-bold text-muted small">🖼️ Ảnh hiện tại</label>
                      <div className="d-flex gap-2 overflow-auto pb-2">
                          {existingImages.length > 0 ? existingImages.map((img, idx) => (
                              <img key={idx} src={getImageUrl(img)} alt="old-pic" style={{width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #ddd'}} />
                          )) : <span className="text-muted small fst-italic">Chưa có ảnh</span>}
                      </div>
                  </>
              )}
          </div>
          
          {/* UPLOAD ẢNH MỚI */}
          <div className="mb-3">
            <label className="form-label fw-bold text-muted small">Tải ảnh mới (Tối đa 5 tấm)</label>
            <input type="file" className="form-control bg-light" accept="image/*" multiple onChange={handleFileChange} />
            <small className="text-muted fst-italic d-block mt-1">* Chọn ảnh mới sẽ ghi đè lên ảnh cũ. 💡 Mẹo: Nhấn đè phím <b>Ctrl</b> để chọn nhiều ảnh.</small>
          </div>

          <div className="mb-4">
              <label className="form-label fw-bold text-muted small">Mô tả chi tiết</label>
              <textarea className="form-control bg-light" rows="5" required value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}></textarea>
          </div>
          
          <button type="submit" className="btn btn-warning w-100 fw-bold text-dark py-3 rounded-pill shadow-sm fs-5">💾 Lưu Thay Đổi</button>
        </form>
      </div>
      <Footer />
    </div>
  );
};

export default EditPostPage;