import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import axiosClient from '../../api/axiosClient';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/ConfirmModal';
import useChat from '../../hooks/useChat';
import ConversationList from '../../components/chat/ConversationList';
import MessageThread from '../../components/chat/MessageThread';
import MessageInput from '../../components/chat/MessageInput';
import { getImageUrl } from '../../utils/imageUrl';

export default function SellerMessages() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const initialWithUserId = searchParams.get('with') || location.state?.receiver?._id || null;
  const initialReceiver = location.state?.receiver || null;
  const initialPost = location.state?.post || null;
  const initialOrder = location.state?.order || null;

  const {
    conversations,
    loadingConversations,
    searchQuery,
    setSearchQuery,
    filter,
    setFilter,
    selectedUser,
    activePost,
    activeOrder,
    messages,
    loadingThread,
    loadingMore,
    hasMore,
    onlineUsers,
    typingUsers,
    selectConversation,
    loadMoreMessages,
    sendMessage,
    retryMessage,
    emitTypingStart,
    emitTypingStop,
    blockUser
  } = useChat({
    scope: 'seller',
    initialWithUserId,
    initialReceiver,
    initialPost,
    initialOrder
  });

  // Mobile responsive: 1 cột chuyển giữa danh sách và khung chat
  const [mobileView, setMobileView] = useState(initialWithUserId ? 'chat' : 'list');
  const [showInfoDrawer, setShowInfoDrawer] = useState(false);

  // Buyer summary (cột phải)
  const [buyerSummary, setBuyerSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // Quick replies (B4)
  const [quickReplies, setQuickReplies] = useState([]);
  const [defaultReplies, setDefaultReplies] = useState([]);
  const [showQuickPopover, setShowQuickPopover] = useState(false);
  const [showQuickModal, setShowQuickModal] = useState(false);
  const [editingReply, setEditingReply] = useState(null);
  const [replyForm, setReplyForm] = useState({ title: '', content: '' });

  // Product picker (gửi thẻ sản phẩm)
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [shopProducts, setShopProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  const inputRef = useRef(null);

  useEffect(() => {
    if (selectedUser?._id) {
      setMobileView('chat');
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [selectedUser?._id]);

  // Tải buyer summary khi đổi khách hàng
  useEffect(() => {
    if (!selectedUser?._id) {
      setBuyerSummary(null);
      return;
    }
    let cancelled = false;
    setLoadingSummary(true);
    axiosClient
      .get(`/api/seller/buyers/${selectedUser._id}/summary`)
      .then(({ data }) => {
        if (!cancelled) setBuyerSummary(data);
      })
      .catch(() => {
        if (!cancelled) setBuyerSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingSummary(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedUser?._id]);

  // Tải mẫu trả lời nhanh
  const fetchQuickReplies = useCallback(async () => {
    try {
      const { data } = await axiosClient.get('/api/seller/quick-replies');
      setQuickReplies(data.quickReplies || []);
      setDefaultReplies(data.defaults || []);
    } catch (err) {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchQuickReplies();
  }, [fetchQuickReplies]);

  const handleInsertReply = (content) => {
    const buyerName = selectedUser?.name || 'bạn';
    const resolved = String(content || '').replace(/\{ten_khach\}/gi, buyerName);
    inputRef.current?.insertTemplate?.(resolved);
    setShowQuickPopover(false);
  };

  const handleAddDefaultReply = async (def) => {
    try {
      const { data } = await axiosClient.post('/api/seller/quick-replies', {
        title: def.title,
        content: def.content
      });
      setQuickReplies(data.quickReplies || []);
      toast.success('Đã thêm vào mẫu trả lời nhanh');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không thể thêm mẫu');
    }
  };

  const handleSaveReplyForm = async (e) => {
    e.preventDefault();
    try {
      if (editingReply?._id) {
        const { data } = await axiosClient.put(`/api/seller/quick-replies/${editingReply._id}`, replyForm);
        setQuickReplies(data.quickReplies || []);
        toast.success('Đã cập nhật mẫu trả lời nhanh');
      } else {
        const { data } = await axiosClient.post('/api/seller/quick-replies', replyForm);
        setQuickReplies(data.quickReplies || []);
        toast.success('Đã thêm mẫu trả lời nhanh');
      }
      setEditingReply(null);
      setReplyForm({ title: '', content: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi lưu mẫu');
    }
  };

  const handleDeleteReply = async (replyId) => {
    try {
      const { data } = await axiosClient.delete(`/api/seller/quick-replies/${replyId}`);
      setQuickReplies(data.quickReplies || []);
      toast.success('Đã xóa mẫu');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi xóa mẫu');
    }
  };

  const handleOpenProductPicker = async () => {
    setShowProductPicker(true);
    if (shopProducts.length === 0) {
      setLoadingProducts(true);
      try {
        const { data } = await axiosClient.get('/api/seller/products');
        setShopProducts(Array.isArray(data) ? data : (data?.products || []));
      } catch (err) {
        toast.error('Không thể tải danh sách sản phẩm của Shop');
      } finally {
        setLoadingProducts(false);
      }
    }
  };

  const handleBlockCurrentUser = async (targetId) => {
    const ok = await confirm?.({
      title: 'Chặn người mua này?',
      message: 'Người này sẽ không thể gửi tin nhắn cho Shop nữa.',
      confirmText: 'Chặn',
      cancelText: 'Hủy'
    });
    if (ok !== false) {
      await blockUser(targetId);
    }
  };

  const quickRepliesButton = (
    <div className="relative">
      <button
        type="button"
        disabled={!selectedUser}
        onClick={() => setShowQuickPopover((v) => !v)}
        aria-label="Mẫu trả lời nhanh"
        title="Mẫu trả lời nhanh"
        className="p-2 rounded-xl text-slate-500 hover:text-orange-600 hover:bg-orange-50 disabled:opacity-40 transition-colors"
      >
        <i className="fas fa-bolt text-base"></i>
      </button>

      {showQuickPopover && (
        <div className="absolute bottom-full left-0 mb-2 w-72 sm:w-80 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden z-30">
          <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-800">Mẫu trả lời nhanh</span>
            <button
              type="button"
              onClick={() => {
                setShowQuickPopover(false);
                setShowQuickModal(true);
              }}
              className="text-[11px] font-bold text-orange-600 hover:text-orange-700"
            >
              Quản lý ({quickReplies.length}/20)
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
            {quickReplies.length > 0 ? (
              quickReplies.map((qr) => (
                <button
                  key={qr._id || qr.title}
                  type="button"
                  onClick={() => handleInsertReply(qr.content)}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-orange-50/70 transition-colors"
                >
                  <p className="text-xs font-bold text-slate-800">{qr.title}</p>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">{qr.content}</p>
                </button>
              ))
            ) : (
              <div className="p-3 space-y-2">
                <p className="text-[11px] font-semibold text-slate-500">Gợi ý mẫu nhanh (bấm để dùng hoặc lưu):</p>
                {defaultReplies.map((def) => (
                  <div key={def.title} className="p-2 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleInsertReply(def.content)}
                      className="text-left min-w-0 flex-1"
                    >
                      <p className="text-xs font-bold text-slate-800 truncate">{def.title}</p>
                      <p className="text-[11px] text-slate-500 truncate">{def.content}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddDefaultReply(def)}
                      className="px-2 py-1 rounded-lg bg-orange-100 text-orange-700 text-[10px] font-bold hover:bg-orange-200 shrink-0"
                    >
                      Lưu
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderBuyerInfoPanel = () => {
    if (!selectedUser) return null;
    const b = buyerSummary?.buyer || selectedUser;
    const st = buyerSummary?.stats;
    const recentOrders = buyerSummary?.recentOrders || [];

    return (
      <div className="flex flex-col h-full bg-white border-l border-slate-200 overflow-y-auto p-4 space-y-5">
        <div className="flex items-center justify-between xl:hidden border-b border-slate-100 pb-3">
          <h3 className="text-sm font-extrabold text-slate-800">Thông tin khách hàng</h3>
          <button
            type="button"
            onClick={() => setShowInfoDrawer(false)}
            className="text-slate-400 hover:text-slate-600"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Profile */}
        <div className="flex flex-col items-center text-center pt-2">
          <img
            src={
              b.avatar
                ? getImageUrl(b.avatar)
                : `https://ui-avatars.com/api/?name=${encodeURIComponent(b.name || 'K')}&background=EA580C&color=fff`
            }
            alt={b.name}
            className="w-16 h-16 rounded-full object-cover border-2 border-orange-100 shadow-xs"
          />
          <h4 className="text-sm font-extrabold text-slate-800 mt-2.5">{b.name || 'Khách hàng'}</h4>
          {b.createdAt && (
            <p className="text-[11px] text-slate-400 mt-0.5">
              Tham gia: {new Date(b.createdAt).toLocaleDateString('vi-VN')}
            </p>
          )}
          <Link
            to={`/public-profile/${selectedUser._id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
          >
            Xem hồ sơ công khai
          </Link>
        </div>

        {loadingSummary ? (
          <div className="py-6 text-center text-xs text-slate-400">Đang tải thông tin...</div>
        ) : (
          <>
            {/* Order stats */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Đơn tại Shop</p>
                <p className="text-base font-black text-slate-800 mt-0.5">{st?.totalOrders || 0}</p>
              </div>
              <div className="p-3 rounded-xl bg-orange-50/60 border border-orange-200/70">
                <p className="text-[10px] font-bold text-orange-600 uppercase">Tổng chi tiêu</p>
                <p className="text-sm font-black text-orange-700 mt-0.5">
                  {Number(st?.totalSpent || 0).toLocaleString('vi-VN')}đ
                </p>
              </div>
            </div>

            {b.activeOrderPhone && (
              <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80 text-xs space-y-1">
                <p className="font-bold text-emerald-800">Đơn đang xử lý</p>
                {b.activeOrderRecipientName && <p className="text-slate-700">Người nhận: {b.activeOrderRecipientName}</p>}
                <p className="text-slate-700 font-mono">SĐT: {b.activeOrderPhone}</p>
              </div>
            )}

            {/* Recent orders */}
            <div className="space-y-2.5">
              <h5 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">5 đơn gần nhất</h5>
              {recentOrders.length === 0 ? (
                <p className="text-xs text-slate-400">Khách chưa có đơn hàng nào tại Shop.</p>
              ) : (
                <div className="space-y-2">
                  {recentOrders.map((ord) => (
                    <Link
                      key={ord._id}
                      to={`/seller-channel/orders?search=${ord._id}`}
                      className="block p-3 rounded-xl border border-slate-200/80 hover:border-orange-300 hover:bg-orange-50/30 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono font-bold text-slate-800">#{ord.shortId}</span>
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                          {ord.canonicalStatus || ord.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1.5">
                        <span>{ord.itemsCount} sản phẩm</span>
                        <span className="font-bold text-orange-600">
                          {Number(ord.totalPrice || 0).toLocaleString('vi-VN')}đ
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="h-[calc(100vh-8.5rem)] bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex relative">
      {/* Cột 1: Danh sách hội thoại */}
      <div className={`w-full md:w-80 shrink-0 h-full ${mobileView === 'chat' ? 'hidden md:block' : 'block'}`}>
        <ConversationList
          conversations={conversations}
          loading={loadingConversations}
          selectedUserId={selectedUser?._id}
          currentUserId={user?._id}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filter={filter}
          onFilterChange={setFilter}
          onlineUsers={onlineUsers}
          onSelect={(conv) => {
            selectConversation(conv);
            setMobileView('chat');
          }}
          theme="seller"
        />
      </div>

      {/* Cột 2: Khung chat */}
      <div className={`flex-1 flex flex-col min-w-0 h-full ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}`}>
        <MessageThread
          selectedUser={selectedUser}
          currentUserId={user?._id}
          messages={messages}
          loading={loadingThread}
          loadingMore={loadingMore}
          hasMore={hasMore}
          onLoadMore={loadMoreMessages}
          onRetry={retryMessage}
          onBackMobile={() => setMobileView('list')}
          onToggleInfoPanel={() => setShowInfoDrawer((v) => !v)}
          onBlockUser={handleBlockCurrentUser}
          activePost={activePost}
          activeOrder={activeOrder}
          isOnline={Boolean(selectedUser?._id && onlineUsers.has(String(selectedUser._id)))}
          isTyping={Boolean(selectedUser?._id && typingUsers[String(selectedUser._id)])}
          theme="seller"
        />

        <MessageInput
          ref={inputRef}
          inputRef={inputRef}
          disabled={!selectedUser}
          onSend={(payload) => sendMessage(payload)}
          onTypingStart={emitTypingStart}
          onTypingStop={emitTypingStop}
          quickRepliesNode={quickRepliesButton}
          onOpenProductPicker={handleOpenProductPicker}
        />
      </div>

      {/* Cột 3: Thông tin người mua (Desktop >= xl) */}
      {selectedUser && (
        <div className="hidden xl:block w-72 shrink-0 h-full">
          {renderBuyerInfoPanel()}
        </div>
      )}

      {/* Drawer Thông tin người mua (< xl) */}
      {selectedUser && showInfoDrawer && (
        <div className="xl:hidden fixed inset-0 z-50 bg-black/40 flex justify-end">
          <div className="w-80 max-w-full h-full bg-white shadow-2xl">{renderBuyerInfoPanel()}</div>
        </div>
      )}

      {/* Modal quản lý mẫu trả lời nhanh (B4) */}
      {showQuickModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-800">
                Quản lý mẫu trả lời nhanh ({quickReplies.length}/20)
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowQuickModal(false);
                  setEditingReply(null);
                  setReplyForm({ title: '', content: '' });
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <form onSubmit={handleSaveReplyForm} className="space-y-2.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200/70">
              <input
                type="text"
                required
                maxLength={40}
                value={replyForm.title}
                onChange={(e) => setReplyForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Tiêu đề ngắn (tối đa 40 ký tự)"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
              />
              <textarea
                rows={2}
                required
                maxLength={500}
                value={replyForm.content}
                onChange={(e) => setReplyForm((p) => ({ ...p, content: e.target.value }))}
                placeholder="Nội dung (hỗ trợ {ten_khach}, tối đa 500 ký tự)"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
              />
              <div className="flex justify-end gap-2">
                {editingReply && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingReply(null);
                      setReplyForm({ title: '', content: '' });
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600"
                  >
                    Hủy sửa
                  </button>
                )}
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold"
                >
                  {editingReply ? 'Cập nhật mẫu' : 'Thêm mẫu'}
                </button>
              </div>
            </form>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {quickReplies.map((qr) => (
                <div key={qr._id} className="py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-800">{qr.title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 break-words">{qr.content}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingReply(qr);
                        setReplyForm({ title: qr.title, content: qr.content });
                      }}
                      className="p-1.5 text-slate-500 hover:text-orange-600 text-xs"
                      aria-label="Sửa mẫu"
                    >
                      <i className="fas fa-edit"></i>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteReply(qr._id)}
                      className="p-1.5 text-slate-500 hover:text-rose-600 text-xs"
                      aria-label="Xóa mẫu"
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal chọn sản phẩm để gửi thẻ sản phẩm (B3) */}
      {showProductPicker && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-3 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-800">Gửi thẻ sản phẩm của Shop</h3>
              <button
                type="button"
                onClick={() => setShowProductPicker(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <input
              type="text"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Tìm tên sản phẩm..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            />
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {loadingProducts ? (
                <div className="py-8 text-center text-xs text-slate-400">Đang tải sản phẩm...</div>
              ) : (
                shopProducts
                  .filter((p) => {
                    const name = (p.title || p.name || '').toLowerCase();
                    return !productSearch.trim() || name.includes(productSearch.trim().toLowerCase());
                  })
                  .map((p) => (
                    <button
                      key={p._id}
                      type="button"
                      onClick={async () => {
                        setShowProductPicker(false);
                        await sendMessage({ content: '', post: p });
                      }}
                      className="w-full text-left py-2.5 px-2 hover:bg-orange-50/70 rounded-xl flex items-center gap-3 transition-colors"
                    >
                      <img
                        src={getImageUrl((p.images && p.images[0]) || p.image)}
                        alt={p.title || p.name}
                        className="w-11 h-11 rounded-lg object-cover border border-slate-200 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800 truncate">{p.title || p.name}</p>
                        <p className="text-xs font-black text-orange-600 mt-0.5">
                          {Number(p.price || 0).toLocaleString('vi-VN')}đ
                        </p>
                      </div>
                    </button>
                  ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
