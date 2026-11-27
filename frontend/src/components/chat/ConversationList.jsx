import React, { useMemo } from 'react';
import { getImageUrl } from '../../utils/imageUrl';

function formatShortTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return 'Vừa xong';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ`;
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

export default function ConversationList({
  conversations = [],
  loading = false,
  selectedUserId = null,
  currentUserId = null,
  searchQuery = '',
  onSearchChange,
  filter = 'all',
  onFilterChange,
  onlineUsers = new Set(),
  onSelect,
  theme = 'seller'
}) {
  const isSeller = theme === 'seller';

  const filterOptions = isSeller
    ? [
        { id: 'all', label: 'Tất cả' },
        { id: 'unread', label: 'Chưa đọc' },
        { id: 'unanswered', label: 'Chưa trả lời' },
        { id: 'has_order', label: 'Có đơn hàng' }
      ]
    : [
        { id: 'all', label: 'Tất cả' },
        { id: 'unread', label: 'Chưa đọc' }
      ];

  const displayedConversations = useMemo(() => {
    return conversations.filter((conv) => {
      if (filter === 'unread' && !(conv.unreadCount > 0)) return false;
      if (filter === 'unanswered') {
        const lastSenderId = String(conv.lastMessage?.sender?._id || conv.lastMessage?.sender || '');
        if (!lastSenderId || lastSenderId === String(currentUserId)) return false;
      }
      if (filter === 'has_order' && !conv.hasOrder && !conv.lastMessage?.order) return false;
      return true;
    });
  }, [conversations, filter, currentUserId]);

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      {/* Header + Search */}
      <div className="p-4 border-b border-slate-100 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
            <i className={`fas fa-comments ${isSeller ? 'text-orange-500' : 'text-amber-500'}`}></i>
            {isSeller ? 'Tin nhắn khách hàng' : 'Hội thoại'}
          </h2>
          <span className="text-xs font-bold text-slate-400">{displayedConversations.length}</span>
        </div>

        <div className="relative">
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder={isSeller ? 'Tìm tên khách, sản phẩm...' : 'Tìm kiếm hội thoại...'}
            aria-label="Tìm kiếm hội thoại"
            className="w-full pl-8 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:border-orange-400 focus:bg-white transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange?.('')}
              aria-label="Xóa tìm kiếm"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              <i className="fas fa-times"></i>
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          {filterOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onFilterChange?.(opt.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors ${
                filter === opt.id
                  ? isSeller
                    ? 'bg-orange-500 text-white shadow-xs'
                    : 'bg-amber-400 text-slate-900'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100" role="listbox" aria-label="Danh sách hội thoại">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
            <div className="w-7 h-7 border-3 border-orange-200 border-t-orange-500 rounded-full animate-spin"></div>
            <span className="text-xs font-semibold">Đang tải hội thoại...</span>
          </div>
        ) : displayedConversations.length === 0 ? (
          <div className="py-14 px-5 text-center text-slate-400 space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto text-xl">
              <i className="far fa-comment-dots"></i>
            </div>
            <p className="text-xs font-bold text-slate-600">
              {isSeller ? 'Chưa có khách nào nhắn tin cho shop' : 'Chưa có cuộc trò chuyện nào'}
            </p>
            <p className="text-[11px] text-slate-400">
              {isSeller
                ? 'Khi khách hàng hỏi về sản phẩm hoặc đơn hàng, hội thoại sẽ hiển thị tại đây.'
                : 'Hãy nhắn tin với người bán từ trang sản phẩm.'}
            </p>
          </div>
        ) : (
          displayedConversations.map((conv) => {
            const other = conv.user || conv.otherUser || {};
            const otherId = String(other._id || '');
            const isSelected = selectedUserId && String(selectedUserId) === otherId;
            const isOnline = onlineUsers.has(otherId);
            const lastMsg = conv.lastMessage || {};
            const isMine = String(lastMsg.sender?._id || lastMsg.sender || '') === String(currentUserId || '');
            const previewText = lastMsg.content
              ? `${isMine ? 'Bạn: ' : ''}${lastMsg.content}`
              : lastMsg.images?.length
              ? `${isMine ? 'Bạn: ' : ''}📷 Hình ảnh`
              : lastMsg.post
              ? `${isMine ? 'Bạn: ' : ''}📦 Sản phẩm`
              : lastMsg.order
              ? `${isMine ? 'Bạn: ' : ''}🧾 Đơn hàng`
              : 'Bắt đầu trò chuyện';

            const productName = lastMsg.post?.title || lastMsg.post?.name;

            return (
              <button
                key={otherId || Math.random()}
                type="button"
                role="option"
                aria-selected={Boolean(isSelected)}
                onClick={() => onSelect?.(conv)}
                className={`w-full text-left p-3.5 flex items-start gap-3 transition-colors focus:outline-none focus:bg-orange-50/70 ${
                  isSelected
                    ? isSeller
                      ? 'bg-orange-50/90 border-l-4 border-orange-500'
                      : 'bg-amber-50 border-l-4 border-amber-500'
                    : 'hover:bg-slate-50 border-l-4 border-transparent'
                }`}
              >
                <div className="relative shrink-0">
                  <img
                    src={
                      other.avatar
                        ? getImageUrl(other.avatar)
                        : `https://ui-avatars.com/api/?name=${encodeURIComponent(other.name || 'K')}&background=EA580C&color=fff`
                    }
                    alt={other.name || 'Khách hàng'}
                    className="w-11 h-11 rounded-full object-cover border border-slate-200 bg-slate-100"
                  />
                  {isOnline && (
                    <span
                      title="Đang trực tuyến"
                      className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white"
                    ></span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs truncate ${conv.unreadCount > 0 ? 'font-black text-slate-900' : 'font-bold text-slate-800'}`}>
                      {other.name || 'Khách hàng'}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400 shrink-0">
                      {formatShortTime(lastMsg.createdAt || lastMsg.timestamp)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-1">
                    <p className={`text-[11px] truncate ${conv.unreadCount > 0 ? 'font-bold text-slate-800' : 'text-slate-500'}`}>
                      {previewText}
                    </p>
                    {conv.unreadCount > 0 && (
                      <span className="px-1.5 py-0.5 min-w-[18px] text-center rounded-full bg-red-500 text-white text-[10px] font-black shrink-0">
                        {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                      </span>
                    )}
                  </div>

                  {productName && (
                    <p className="text-[10px] text-orange-600 font-semibold truncate mt-1">
                      <i className="fas fa-tag mr-1"></i>
                      {productName}
                    </p>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
