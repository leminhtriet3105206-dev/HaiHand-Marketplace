import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getImageUrl } from '../../utils/imageUrl';
import MessageText from './MessageText';
import ProductContextCard from './ProductContextCard';

function formatMessageTime(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function formatDateSeparator(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Hôm nay';
  if (d.toDateString() === yesterday.toDateString()) return 'Hôm qua';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatLastActive(dateStr) {
  if (!dateStr) return 'Ngoại tuyến';
  const diffMin = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diffMin < 1) return 'Vừa hoạt động';
  if (diffMin < 60) return `Hoạt động ${diffMin} phút trước`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Hoạt động ${diffHours} giờ trước`;
  return `Hoạt động ${Math.floor(diffHours / 24)} ngày trước`;
}

export default function MessageThread({
  selectedUser,
  currentUserId,
  messages = [],
  loading = false,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
  onRetry,
  onBackMobile,
  onToggleInfoPanel,
  onBlockUser,
  activePost,
  activeOrder,
  isOnline = false,
  isTyping = false,
  theme = 'seller'
}) {
  const scrollContainerRef = useRef(null);
  const prevLenRef = useRef(0);
  const isSeller = theme === 'seller';

  // Chỉ tự cuộn xuống cuối khi mở thread hoặc khi đang ở gần cuối và có tin mới
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const isInitialLoad = prevLenRef.current === 0 && messages.length > 0;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (isInitialLoad || distFromBottom < 180) {
      el.scrollTop = el.scrollHeight;
    }
    prevLenRef.current = messages.length;
  }, [messages.length, selectedUser?._id]);

  if (!selectedUser) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50/70 p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-orange-100 text-orange-500 flex items-center justify-center text-2xl mb-4 shadow-xs">
          <i className="fas fa-comments"></i>
        </div>
        <h3 className="text-base font-extrabold text-slate-800">Chọn một cuộc trò chuyện</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-xs">
          Chọn khách hàng ở danh sách bên trái để xem tin nhắn, đơn hàng liên quan và phản hồi ngay.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50/60 min-w-0">
      {/* Header */}
      <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {onBackMobile && (
            <button
              type="button"
              onClick={onBackMobile}
              aria-label="Quay lại danh sách"
              className="md:hidden p-2 -ml-1 rounded-lg text-slate-600 hover:bg-slate-100"
            >
              <i className="fas fa-arrow-left"></i>
            </button>
          )}

          <div className="relative shrink-0">
            <img
              src={
                selectedUser.avatar
                  ? getImageUrl(selectedUser.avatar)
                  : `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedUser.name || 'K')}&background=EA580C&color=fff`
              }
              alt={selectedUser.name || 'Khách hàng'}
              className="w-10 h-10 rounded-full object-cover border border-slate-200"
            />
            {isOnline && (
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white"></span>
            )}
          </div>

          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-slate-800 truncate">{selectedUser.name || 'Khách hàng'}</h3>
            <p className="text-[11px] font-semibold text-slate-500">
              {isTyping ? (
                <span className="text-orange-600 animate-pulse">Đang nhập tin nhắn...</span>
              ) : isOnline ? (
                <span className="text-emerald-600">Đang trực tuyến</span>
              ) : (
                formatLastActive(selectedUser.lastActive)
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            to={`/public-profile/${selectedUser._id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
          >
            <i className="fas fa-user"></i>
            Hồ sơ
          </Link>

          {onBlockUser && (
            <button
              type="button"
              onClick={() => onBlockUser(selectedUser._id)}
              aria-label="Chặn người dùng"
              title="Chặn tin nhắn từ người dùng này"
              className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 text-xs transition-colors"
            >
              <i className="fas fa-ban"></i>
            </button>
          )}

          {onToggleInfoPanel && (
            <button
              type="button"
              onClick={onToggleInfoPanel}
              aria-label="Thông tin khách hàng"
              className="xl:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50 border border-orange-200 text-orange-600 text-xs font-bold hover:bg-orange-100 transition-colors"
            >
              <i className="fas fa-info-circle"></i>
              Thông tin
            </button>
          )}
        </div>
      </div>

      {/* Pinned Context Card (if any) */}
      {(activePost || activeOrder) && (
        <div className="px-4 py-2 bg-white border-b border-slate-100">
          <ProductContextCard post={activePost} order={activeOrder} theme={theme} />
        </div>
      )}

      {/* Messages Scroll Area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {hasMore && (
          <div className="text-center pb-2">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingMore}
              className="px-3.5 py-1.5 rounded-full bg-white border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              {loadingMore ? 'Đang tải...' : 'Tải tin nhắn cũ hơn'}
            </button>
          </div>
        )}

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
            <div className="w-7 h-7 border-3 border-orange-200 border-t-orange-500 rounded-full animate-spin"></div>
            <span className="text-xs font-semibold">Đang tải tin nhắn...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs font-medium">
            Chưa có tin nhắn nào trong cuộc trò chuyện này.
          </div>
        ) : (
          messages.map((msg, index) => {
            const msgSenderId = String(msg.sender?._id || msg.sender || '');
            const isMine = msgSenderId === String(currentUserId || '');
            const msgDate = msg.createdAt || msg.timestamp;
            const prevDate = index > 0 ? (messages[index - 1].createdAt || messages[index - 1].timestamp) : null;
            const showDateSep =
              index === 0 ||
              (msgDate && prevDate && new Date(msgDate).toDateString() !== new Date(prevDate).toDateString());

            const isLastMine =
              isMine &&
              index === messages.length - 1;

            return (
              <React.Fragment key={msg._id || msg.clientId || index}>
                {showDateSep && msgDate && (
                  <div className="flex justify-center my-2">
                    <span className="px-3 py-1 rounded-full bg-slate-200/70 text-[10px] font-bold text-slate-600">
                      {formatDateSeparator(msgDate)}
                    </span>
                  </div>
                )}

                <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[78%] sm:max-w-[68%] rounded-2xl px-3.5 py-2.5 shadow-2xs space-y-2 ${
                      isMine
                        ? isSeller
                          ? 'bg-orange-500 text-white rounded-br-sm'
                          : 'bg-amber-500 text-white rounded-br-sm'
                        : 'bg-white text-slate-800 border border-slate-200/80 rounded-bl-sm'
                    }`}
                  >
                    {msg.post && (
                      <div className="mb-1">
                        <ProductContextCard post={msg.post} theme={theme} compact />
                      </div>
                    )}

                    {msg.order && (
                      <div className="mb-1">
                        <ProductContextCard order={msg.order} theme={theme} compact />
                      </div>
                    )}

                    {Array.isArray(msg.images) && msg.images.length > 0 && (
                      <div className={`grid gap-1.5 ${msg.images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {msg.images.map((img, i) => {
                          const src = img.startsWith('blob:') ? img : getImageUrl(img);
                          return (
                            <a
                              key={i}
                              href={src}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block overflow-hidden rounded-xl bg-black/5"
                            >
                              <img
                                src={src}
                                alt="Ảnh đính kèm"
                                className="max-h-52 w-full object-cover hover:opacity-95 transition-opacity"
                              />
                            </a>
                          );
                        })}
                      </div>
                    )}

                    {msg.content && <MessageText text={msg.content} className="text-xs leading-relaxed block" />}

                    <div
                      className={`flex items-center justify-end gap-1.5 text-[10px] ${
                        isMine ? 'text-white/80' : 'text-slate-400'
                      }`}
                    >
                      <span>{formatMessageTime(msgDate)}</span>
                      {isMine && msg.status === 'sending' && <span>• Đang gửi...</span>}
                      {isMine && msg.status === 'failed' && <span className="text-rose-200 font-bold">• Lỗi gửi</span>}
                      {isLastMine && !msg.status && (
                        <span>• {msg.isRead ? 'Đã xem' : 'Đã gửi'}</span>
                      )}
                    </div>
                  </div>

                  {isMine && msg.status === 'failed' && onRetry && (
                    <button
                      type="button"
                      onClick={() => onRetry(msg)}
                      className="mt-1 text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1"
                    >
                      <i className="fas fa-redo-alt"></i>
                      Gửi lại
                    </button>
                  )}
                </div>
              </React.Fragment>
            );
          })
        )}
      </div>
    </div>
  );
}
