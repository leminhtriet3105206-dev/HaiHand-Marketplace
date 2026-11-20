/**
 * Shared Product Mapper for ProductCard component
 * HaiHand Marketplace
 */

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

const CATEGORY_FALLBACK_IMAGES = {
  'Thú cưng & Đồ dùng': 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&auto=format&fit=crop',
  'Điện thoại & Phụ kiện': 'https://images.unsplash.com/photo-1512054502232-10a0a035d672?w=600&auto=format&fit=crop',
  'Điện tử & Công nghệ': 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=600&auto=format&fit=crop',
  'Xe cộ & Phụ tùng': 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=600&auto=format&fit=crop',
  'Thời trang & Phụ kiện': 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=600&auto=format&fit=crop',
  'Đồ gia dụng & Nội thất': 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&auto=format&fit=crop',
  'Đồ chơi, Mẹ & Bé': 'https://images.unsplash.com/photo-1558060370-d644479cb6f7?w=600&auto=format&fit=crop',
  'Thể thao & Dã ngoại': 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600&auto=format&fit=crop'
};

const BROKEN_UNSPLASH_IDS = [
  'photo-1508873696983',
  'photo-1584697964190',
  'photo-1511707171634',
  'photo-1609592424364',
  'photo-1486006920555',
  'photo-1580481077197',
  'photo-1517649763962',
  'Profile_avatar_placeholder'
];

export function getFallbackProductImage(title = '', category = '') {
  const t = (title || '').toLowerCase();
  if (t.includes('ghế công thái học') || t.includes('ergonomic') || t.includes('sihoo')) {
    return 'https://images.unsplash.com/photo-1505843490538-5133c6c7d0e1?w=600&auto=format&fit=crop';
  }
  if (t.includes('đèn pin') || t.includes('dã ngoại')) {
    return 'https://images.unsplash.com/photo-1510519138101-570d1dca3d66?w=600&auto=format&fit=crop';
  }
  if (t.includes('ghế ăn dặm') || t.includes('chilux')) {
    return 'https://images.unsplash.com/photo-1544126592-807ade215a0b?w=600&auto=format&fit=crop';
  }
  if (t.includes('sạc dự phòng') || t.includes('anker')) {
    return 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=600&auto=format&fit=crop';
  }
  if (t.includes('iphone')) {
    return 'https://images.unsplash.com/photo-1591337676887-a217a6970a8a?w=600&auto=format&fit=crop';
  }
  if (t.includes('bơm lốp') || t.includes('kích bình')) {
    return 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600&auto=format&fit=crop';
  }
  return CATEGORY_FALLBACK_IMAGES[category] || CATEGORY_FALLBACK_IMAGES['Đồ gia dụng & Nội thất'];
}

/**
 * Format timestamp into friendly Vietnamese relative time
 */
export function formatTimeAgo(dateString) {
  if (!dateString) return 'Vừa xong';
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  if (hours < 24) return `${hours} giờ trước`;
  if (days < 30) return `${days} ngày trước`;
  return new Date(dateString).toLocaleDateString('vi-VN');
}

/**
 * Extract clean, normalized image URL
 */
export function getProductImageUrl(post) {
  if (!post) return CATEGORY_FALLBACK_IMAGES['Đồ gia dụng & Nội thất'];

  const title = post.title || post.name || '';
  const category = post.category || '';

  let rawUrl = '';
  if (Array.isArray(post.images) && post.images.length > 0 && post.images[0]) {
    const first = post.images[0];
    rawUrl = first.startsWith('http') ? first : `${API_URL}/${first.replace(/\\/g, '/')}`;
  } else if (post.image && typeof post.image === 'string') {
    rawUrl = post.image.startsWith('http') ? post.image : `${API_URL}/uploads/${post.image}`;
  }

  if (!rawUrl || BROKEN_UNSPLASH_IDS.some(id => rawUrl.includes(id))) {
    return getFallbackProductImage(title, category);
  }

  return rawUrl;
}

/**
 * Map raw MongoDB Post/Product document to standard ProductCard props
 */
export function mapPostToProductCard(post, currentUser = null, favoriteIds = []) {
  if (!post) return null;

  const currentUserId = currentUser?._id ? currentUser._id.toString() : null;
  const authorId = post.author?._id ? post.author._id.toString() : (post.author || post.sellerId?._id || post.sellerId || '').toString();

  const isAuthor = Boolean(currentUserId && authorId && currentUserId === authorId);
  const isFavorited = Array.isArray(favoriteIds) && favoriteIds.some((fav) => {
    const fid = fav?._id ? fav._id.toString() : fav.toString();
    return fid === post._id?.toString();
  });

  return {
    product: {
      id: post._id ? post._id.toString() : '',
      title: post.title || post.name || 'Sản phẩm HaiHand',
      price: Number(post.price) || 0,
      imageUrl: getProductImageUrl(post),
      condition: post.condition || 'Đã qua sử dụng',
      location: post.location || 'Toàn quốc',
      timeAgo: formatTimeAgo(post.createdAt || post.date),
      category: post.category || 'Khác',
      recoSource: post.recoSource || null,
      recoReason: post.recoReason || null
    },
    isAuthor,
    isFavorited,
    rawPost: post
  };
}

