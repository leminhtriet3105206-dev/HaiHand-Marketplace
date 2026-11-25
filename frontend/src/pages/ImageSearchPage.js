import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AppHeader } from '../components/AppHeader';
import { AppFooter } from '../components/AppFooter';
import { ProductCard } from '../components/ProductCard';
import './ImageSearchPage.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function ImageSearchPage() {
  const navigate = useNavigate();
  const [image, setImage] = useState('');
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
        image
      });
      setProducts(data.products || []);
      setSearched(true);
    } catch (err) {
      setProducts([]);
      setError(err.response?.data?.error || 'Chưa thể tìm kiếm lúc này. Bạn vui lòng thử lại sau.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFBEB] text-[#1C1917]">
      <AppHeader onSearch={(keyword) => navigate(`/products?search=${encodeURIComponent(keyword)}`)} />
      <main className="max-w-[1200px] mx-auto px-4 py-10 md:py-14">
        <div className="image-search-intro mb-8">
          <div>
          <p className="text-sm font-semibold text-[#EA580C] mb-2">TÌM SẢN PHẨM</p>
          <h1 className="text-3xl font-bold tracking-tight">Tìm kiếm bằng hình ảnh</h1>
          <p className="mt-3 text-[#57534E] max-w-2xl">Thấy món đồ bạn thích? Tải ảnh lên để khám phá những sản phẩm tương tự trên HaiHand.</p>
          <p className="image-search-tip">Một bức ảnh rõ nét. Thêm nhiều lựa chọn.</p>
          </div>
          <div className={`image-search-art ${loading ? 'is-scanning' : ''}`} aria-hidden="true">
            <div className="image-search-photo"><span>✦</span><div className="image-search-mountains" /></div>
            <div className="image-search-lens"><div /></div>
            <i className="image-search-spark spark-one">✦</i><i className="image-search-spark spark-two">✧</i>
          </div>
        </div>

        <form onSubmit={handleSearch} className="image-search-panel bg-white border border-[#E7E5E4] rounded-xl p-5 md:p-8 shadow-sm" aria-busy={loading}>
          <label
            htmlFor="image-search-file"
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (!loading) selectImage(event.dataTransfer.files[0]);
            }}
            className={`image-search-drop ${loading ? 'is-scanning' : ''} flex flex-col items-center justify-center min-h-[280px] rounded-xl border-2 border-dashed cursor-pointer text-center px-4 transition-colors ${dragging ? 'border-[#EAB308] bg-[#FFFBEB]' : 'border-[#D6D3D1] bg-[#FAFAF9] hover:border-[#EAB308]'}`}
          >
            {image ? (
              <>
                <img src={image} alt="Ảnh đang tìm" className="max-h-52 max-w-full object-contain rounded-lg" />
                <span className="text-sm font-medium mt-3">{loading ? 'Đang đối chiếu ảnh của bạn…' : 'Bấm hoặc kéo ảnh khác vào đây'}</span>
              </>
            ) : (
              <>
                <span className="image-search-upload-icon" aria-hidden="true">↑</span>
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
          <div className="mt-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <p className="text-sm text-[#78716C]">Mẹo: chọn ảnh có một món đồ rõ nét, ít chi tiết nền.</p>
            <button type="submit" disabled={!image || loading} className="image-search-submit h-12 px-7 rounded-xl bg-[#FACC15] hover:bg-[#EAB308] text-[#1C1917] font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'Đang tìm kiếm...' : 'Tìm sản phẩm'}
            </button>
          </div>
          {error && <p role="alert" className="text-red-600 text-sm mt-3">{error}</p>}
        </form>

        {(loading || searched) && (
          <section className="mt-10" aria-live="polite">
            <h2 className="text-2xl font-bold mb-5">Kết quả tìm kiếm</h2>
            {loading ? (
              <div className="image-search-progress" role="status"><span />Đang tìm những món đồ giống ảnh của bạn…</div>
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
              <p className="bg-white border border-[#E7E5E4] rounded-lg p-5 text-[#57534E]">Chưa tìm thấy sản phẩm phù hợp. Bạn thử chụp gần hơn, chọn ảnh rõ nét hoặc cắt bớt phần nền nhé.</p>
            )}
          </section>
        )}
      </main>
      <AppFooter />
    </div>
  );
}
