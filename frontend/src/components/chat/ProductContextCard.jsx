import React from 'react';
import { Link } from 'react-router-dom';
import { getImageUrl } from '../../utils/imageUrl';

export default function ProductContextCard({ post, order, theme = 'seller', compact = false }) {
  if (!post && !order) return null;

  const isSellerTheme = theme === 'seller';

  if (post) {
    const title = post.title || post.name || 'Sản phẩm';
    const thumb = getImageUrl((post.images && post.images[0]) || post.image);
    const price = Number(post.price || 0).toLocaleString('vi-VN') + 'đ';

    return (
      <div
        className={`flex items-center gap-3 p-2.5 rounded-xl border ${
          isSellerTheme
            ? 'bg-orange-50/70 border-orange-200/80 text-slate-800'
            : 'bg-amber-50 border-amber-200 text-slate-800'
        } ${compact ? 'max-w-xs' : 'w-full'}`}
      >
        <img
          src={thumb}
          alt={title}
          className="w-11 h-11 rounded-lg object-cover border border-slate-200 shrink-0 bg-white"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold truncate">{title}</p>
          <p className="text-xs font-black text-orange-600 mt-0.5">{price}</p>
        </div>
        {post._id && (
          <Link
            to={`/post/${post._id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1.5 rounded-lg bg-white border border-orange-200 text-[11px] font-bold text-orange-600 hover:bg-orange-50 shrink-0 transition-colors"
          >
            Xem sản phẩm
          </Link>
        )}
      </div>
    );
  }

  if (order) {
    const shortId = String(order._id || '').slice(-8).toUpperCase();
    return (
      <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl border bg-slate-50 border-slate-200 text-slate-800">
        <div className="min-w-0">
          <p className="text-xs font-bold">
            <i className="fas fa-receipt text-orange-500 mr-1.5"></i>
            Đơn hàng #{shortId}
          </p>
          {order.status && (
            <p className="text-[11px] text-slate-500 mt-0.5">Trạng thái: {order.status}</p>
          )}
        </div>
        {order._id && (
          <Link
            to={`/seller-channel/orders?search=${order._id}`}
            className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-700 hover:bg-slate-100 shrink-0"
          >
            Xem đơn
          </Link>
        )}
      </div>
    );
  }

  return null;
}
