import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AppHeader } from '../components/AppHeader';
import { AppFooter } from '../components/AppFooter';
import { ProductCard } from '../components/ProductCard';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function ImageSearchPage() {
  const navigate = useNavigate();
  const [image, setImage] = useState('');
  const [description, setDescription] = useState('');
  const [products, setProducts] = useState([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const selectImage = (file) => {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Chọn ảnh JPG, PNG hoặc WebP có dung lượng không quá 5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImage(reader.result);
      setProducts([]);
      setSearched(false);
      setError('');
    };
    reader.onerror = () => setError('Không đọc được ảnh. Vui lòng chọn ảnh khác.');
    reader.readAsDataURL(file);
  };

  const handleSearch = async (event) => {
    event.preventDefault();
    if (!image || loading) return;
    setLoading(true);
    setError('');
    setSearched(false);
    try {
      const { data } = await axios.post(`${API_URL}/api/image-search/search`, {
        image,
        message: description.trim()
      });
      setProducts(data.products || []);
      setSearched(true);
    } catch (err) {
      setProducts([]);
      setError(err.response?.data?.error || 'Không thể tìm kiếm lúc này. Kiểm tra backend và LM Studio rồi thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFBEB] text-[#1C1917]">
      <AppHeader onSearch={(keyword) => navigate(`/products?search=${encodeURIComponent(keyword)}`)} />
      <main className="max-w-[1200px] mx-auto px-4 py-10 md:py-14">
        <div className="mb-8">
          <p className="text-sm font-semibold text-[#EA580C] mb-2">TÌM SẢN PHẨM</p>
          <h1 className="text-3xl font-bold tracking-tight">Tìm kiếm bằng hình ảnh</h1>
          <p className="mt-3 text-[#57534E] max-w-2xl">Tải ảnh món đồ bạn muốn tìm. Bạn có thể thêm vài từ mô tả để kết quả sát hơn.</p>
        </div>

        <form onSubmit={handleSearch} className="bg-white border border-[#E7E5E4] rounded-xl p-5 md:p-8 shadow-sm">
          <label
            htmlFor="image-search-file"
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (!loading) selectImage(event.dataTransfer.files[0]);
            }}
            className={`flex flex-col items-center justify-center min-h-[240px] rounded-xl border-2 border-dashed cursor-pointer text-center px-4 transition-colors ${dragging ? 'border-[#EAB308] bg-[#FFFBEB]' : 'border-[#D6D3D1] bg-[#FAFAF9] hover:border-[#EAB308]'}`}
          >
            {image ? (
              <>
                <img src={image} alt="Ảnh đang tìm" className="max-h-52 max-w-full object-contain rounded-lg" />
                <span className="text-sm font-medium mt-3">Bấm hoặc kéo ảnh khác vào đây</span>
              </>
            ) : (
              <>
                <span className="text-4xl mb-3" aria-hidden="true">📷</span>
                <span className="font-semibold">Chọn ảnh hoặc kéo thả vào đây</span>
                <span className="text-sm text-[#57534E] mt-2">JPG, PNG, WebP · tối đa 5 MB</span>
              </>
            )}
          </label>
          <input
            id="image-search-file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={loading}
            onChange={(event) => { selectImage(event.target.files?.[0]); event.target.value = ''; }}
          />
          <div className="mt-5 flex flex-col md:flex-row gap-3">
            <input
              type="text"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={200}
              placeholder="Mô tả thêm, ví dụ: gà giống, màu đen... (không bắt buộc)"
              aria-label="Mô tả sản phẩm cần tìm"
              className="flex-1 min-w-0 h-11 px-4 rounded-lg border border-[#E7E5E4] focus:outline-none focus:border-[#EAB308]"
            />
            <button type="submit" disabled={!image || loading} className="h-11 px-7 rounded-lg bg-[#FACC15] hover:bg-[#EAB308] text-[#1C1917] font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'Đang tìm kiếm...' : 'Tìm sản phẩm'}
            </button>
          </div>
          {error && <p role="alert" className="text-red-600 text-sm mt-3">{error}</p>}
        </form>

        {(loading || searched) && (
          <section className="mt-10" aria-live="polite">
            <h2 className="text-2xl font-bold mb-5">Kết quả tìm kiếm</h2>
            {loading ? (
              <p className="text-[#57534E]">AI đang đối chiếu ảnh với sản phẩm trong kho...</p>
            ) : products.length ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {products.map((product) => (
                  <ProductCard
                    key={product._id}
                    hideFavorite
                    product={{
                      id: product._id,
                      title: product.name,
                      price: product.price,
                      imageUrl: product.image,
                      location: product.location || 'Toàn quốc',
                      condition: product.condition,
                      timeAgo: 'Đang bán'
                    }}
                  />
                ))}
              </div>
            ) : (
              <p className="bg-white border border-[#E7E5E4] rounded-lg p-5 text-[#57534E]">Chưa tìm thấy sản phẩm phù hợp với ảnh này trong kho hiện tại. Thử ảnh rõ hơn hoặc thêm mô tả.</p>
            )}
          </section>
        )}
      </main>
      <AppFooter />
    </div>
  );
}
