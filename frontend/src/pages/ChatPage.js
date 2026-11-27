import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import axiosClient from '../api/axiosClient';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { AppHeader } from '../components/AppHeader';
import { useToast } from '../components/Toast';
import { DEFAULT_AVATAR_PLACEHOLDER, getImageUrl } from '../utils/imageUrl';

function renderTextWithLinks(text) {
  if (!text) return null;
  const parts = String(text).split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, idx) => {
    if (/^https?:\/\/[^\s]+$/i.test(part)) {
      return (
        <a
          key={idx}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-[#EA580C] break-all"
        >
          {part}
        </a>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export default function ChatPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const { user } = useAuth();
  const { socket, onlineUsers } = useSocket();

  useEffect(() => {
    if (!user?._id) {
      navigate('/login');
    }
  }, [user?._id, navigate]);

  const [inboxList, setInboxList] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedReceiver, setSelectedReceiver] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [linkedPost, setLinkedPost] = useState(null);
  const [filter, setFilter] = useState('all'); // all, buy, sell, unread
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [forwarding, setForwarding] = useState(false);

  const initialLoadDoneRef = useRef(false);
  const messagesContainerRef = useRef(null);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const selectedReceiverRef = useRef(null);
  const searchTermRef = useRef('');

  useEffect(() => {
    selectedReceiverRef.current = selectedReceiver;
  }, [selectedReceiver]);

  useEffect(() => {
    searchTermRef.current = searchTerm;
  }, [searchTerm]);

  const isNearBottom = () => {
    const el = messagesContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  };

  const scrollToBottom = (behavior = 'smooth') => {
    setTimeout(() => {
      scrollRef.current?.scrollIntoView({ behavior });
    }, 60);
  };

  const fetchInboxList = useCallback(
    async ({ silent = false, q } = {}) => {
      if (!user?._id || !user?.token) {
        setLoading(false);
        return;
      }
      if (!silent && !initialLoadDoneRef.current) {
        setLoading(true);
      }
      try {
        const queryVal = q !== undefined ? q : searchTermRef.current;
        const params = { limit: 50 };
        if (queryVal && queryVal.trim()) {
          params.q = queryVal.trim();
        }
        const { data } = await axiosClient.get('/api/messages/conversations', { params });
        setInboxList(Array.isArray(data) ? data : []);
      } catch (err) {
        console.warn('Lỗi tải tin nhắn:', err.message);
      } finally {
        initialLoadDoneRef.current = true;
        setLoading(false);
      }
    },
    [user?._id, user?.token]
  );

  useEffect(() => {
    fetchInboxList({ silent: false });
  }, [fetchInboxList]);

  // A6.6: Tìm kiếm phía server (debounce 300ms) để không bỏ sót hội thoại ngoài trang đầu
  useEffect(() => {
    if (!initialLoadDoneRef.current) return;
    const timer = setTimeout(() => {
      fetchInboxList({ silent: true, q: searchTerm });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, fetchInboxList]);

  const handleSelectConversation = useCallback(
    async (receiver) => {
      if (!receiver?._id) return;
      if (user?._id && String(receiver._id) === String(user._id)) {
        toast.warning('Chú ý', 'Bạn không thể tự trò chuyện với chính mình!');
        return;
      }

      setSelectedReceiver(receiver);
      setMessages([]);

      if (user?._id && user?.token) {
        try {
          const { data } = await axiosClient.get(`/api/messages/thread/${receiver._id}`, {
            params: { limit: 50 }
          });
          setMessages(Array.isArray(data) ? data : []);
          scrollToBottom('auto');

          await axiosClient.put(`/api/messages/read/${receiver._id}`);
          window.dispatchEvent(new Event('messageUpdated'));
        } catch (error) {
          console.error('Lỗi tải tin nhắn:', error);
          toast.error('Lỗi tải tin nhắn', error.response?.data?.message || 'Không thể tải nội dung cuộc trò chuyện.');
        }
      }

      setInboxList((prev) =>
        prev.map((item) => {
          if (String(item.otherUser?._id) === String(receiver._id)) {
            return {
              ...item,
              unreadCount: 0,
              lastMessage: item.lastMessage ? { ...item.lastMessage, isRead: true } : item.lastMessage
            };
          }
          return item;
        })
      );
    },
    [user?._id, user?.token, toast]
  );

  // Mở hội thoại từ location.state (ProductDetailPage, PublicProfile, FollowPage...)
  useEffect(() => {
    if (location.state?.receiver) {
      handleSelectConversation(location.state.receiver);
      if (location.state?.post) setLinkedPost(location.state.post);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate, handleSelectConversation]);

  // A7: Mở sẵn hội thoại từ query ?with=<userId>
  useEffect(() => {
    const withUserId = searchParams.get('with');
    if (!withUserId || !user?._id) return;
    if (String(withUserId) === String(user._id)) {
      toast.warning('Chú ý', 'Không thể mở hội thoại với chính mình!');
      setSearchParams({}, { replace: true });
      return;
    }

    const existing = inboxList.find((c) => String(c.otherUser?._id) === String(withUserId));
    if (existing?.otherUser) {
      handleSelectConversation(existing.otherUser);
      setSearchParams({}, { replace: true });
      return;
    }

    let cancelled = false;
    axiosClient
      .get(`/api/users/public-profile/${withUserId}`)
      .then(({ data }) => {
        if (cancelled) return;
        const target = data?.user;
        if (target?._id) {
          handleSelectConversation(target);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSearchParams({}, { replace: true });
      });

    return () => {
      cancelled = true;
    };
  }, [searchParams, setSearchParams, inboxList, user?._id, handleSelectConversation, toast]);

  // Lắng nghe sự kiện Socket.IO chuẩn hóa (A1/A2/A5/A6)
  useEffect(() => {
    if (!user?._id || !socket) return;

    const handleNewMessage = (msg) => {
      const myId = String(user._id);
      const senderId = String(msg.sender?._id || msg.sender || '');
      const receiverId = String(msg.receiver?._id || msg.receiver || '');
      const currentReceiver = selectedReceiverRef.current;
      const currentOtherId = currentReceiver ? String(currentReceiver._id) : null;

      const isCurrentThread =
        currentOtherId &&
        ((senderId === currentOtherId && receiverId === myId) ||
          (senderId === myId && receiverId === currentOtherId));

      if (isCurrentThread) {
        const shouldScroll = isNearBottom() || senderId === myId;
        setMessages((prev) => {
          if (msg._id && prev.some((m) => String(m._id) === String(msg._id))) {
            return prev;
          }
          return [...prev, msg];
        });
        if (shouldScroll) {
          scrollToBottom('smooth');
        }
        if (senderId === currentOtherId) {
          axiosClient.put(`/api/messages/read/${currentOtherId}`).catch(() => {});
          window.dispatchEvent(new Event('messageUpdated'));
        }
      } else {
        window.dispatchEvent(new Event('messageUpdated'));
      }

      fetchInboxList({ silent: true });
    };

    const handleInboxUpdate = () => {
      fetchInboxList({ silent: true });
      window.dispatchEvent(new Event('messageUpdated'));
    };

    const handleMessagesRead = ({ byUserId } = {}) => {
      const currentReceiver = selectedReceiverRef.current;
      if (currentReceiver && String(currentReceiver._id) === String(byUserId)) {
        setMessages((prev) =>
          prev.map((m) =>
            String(m.sender?._id || m.sender) === String(user._id) ? { ...m, isRead: true } : m
          )
        );
      }
    };

    socket.on('message:new', handleNewMessage);
    socket.on('inbox:update', handleInboxUpdate);
    socket.on('messages:read', handleMessagesRead);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('inbox:update', handleInboxUpdate);
      socket.off('messages:read', handleMessagesRead);
    };
  }, [user?._id, socket, fetchInboxList]);

  const sendTextMessageRequest = async ({ clientId, content, postObj }) => {
    try {
      const { data } = await axiosClient.post('/api/messages', {
        receiverId: selectedReceiver._id,
        content,
        postId: postObj?._id || null
      });
      setMessages((prev) => {
        const replaced = prev.map((m) => (m.clientId === clientId ? { ...data, status: 'Đã gửi' } : m));
        // Khử trùng nếu socket đã đẩy vào trước
        const seen = new Set();
        return replaced.filter((m) => {
          if (!m._id) return true;
          const k = String(m._id);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      });
      fetchInboxList({ silent: true });
    } catch (error) {
      const errMsg = error.response?.data?.message || 'Không thể gửi tin nhắn. Vui lòng thử lại.';
      toast.error('Gửi tin nhắn thất bại', errMsg);
      setMessages((prev) =>
        prev.map((m) => (m.clientId === clientId ? { ...m, status: 'failed' } : m))
      );
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!selectedReceiver?._id || !user?._id) return;
    const trimmed = newMessage.trim();
    if (!trimmed && !linkedPost) return;

    const clientId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const currentLinkedPost = linkedPost;
    const optimisticMsg = {
      clientId,
      sender: user._id,
      receiver: selectedReceiver._id,
      content: trimmed,
      post: currentLinkedPost,
      createdAt: new Date().toISOString(),
      status: 'Đang gửi',
      retryPayload: { content: trimmed, postObj: currentLinkedPost }
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setNewMessage('');
    setLinkedPost(null);
    setShowEmojiPicker(false);
    scrollToBottom('smooth');

    await sendTextMessageRequest({ clientId, content: trimmed, postObj: currentLinkedPost });
  };

  const handleRetryMessage = async (failedMsg) => {
    if (!failedMsg?.clientId || !failedMsg?.retryPayload) return;
    setMessages((prev) =>
      prev.map((m) => (m.clientId === failedMsg.clientId ? { ...m, status: 'Đang gửi' } : m))
    );
    await sendTextMessageRequest({
      clientId: failedMsg.clientId,
      content: failedMsg.retryPayload.content,
      postObj: failedMsg.retryPayload.postObj
    });
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, 4);
    e.target.value = '';
    if (files.length === 0 || !selectedReceiver?._id || !user?._id) return;

    const oversized = files.find((f) => f.size > 5 * 1024 * 1024);
    if (oversized) {
      toast.error('Ảnh quá lớn', 'Mỗi ảnh tối đa 5MB.');
      return;
    }

    const formData = new FormData();
    files.forEach((f) => formData.append('images', f));
    formData.append('receiverId', selectedReceiver._id);
    const currentLinkedPost = linkedPost;
    if (currentLinkedPost?._id) {
      formData.append('postId', currentLinkedPost._id);
    }

    const tempUrls = files.map((f) => URL.createObjectURL(f));
    const clientId = `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const optimisticMsg = {
      clientId,
      sender: user._id,
      receiver: selectedReceiver._id,
      content: '',
      images: tempUrls,
      post: currentLinkedPost,
      createdAt: new Date().toISOString(),
      status: 'Đang gửi'
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setLinkedPost(null);
    scrollToBottom('smooth');

    try {
      const { data } = await axiosClient.post('/api/messages', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setMessages((prev) => {
        const replaced = prev.map((m) => (m.clientId === clientId ? { ...data, status: 'Đã gửi' } : m));
        const seen = new Set();
        return replaced.filter((m) => {
          if (!m._id) return true;
          const k = String(m._id);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      });
      fetchInboxList({ silent: true });
    } catch (err) {
      toast.error('Lỗi gửi ảnh', err.response?.data?.message || 'Không thể tải ảnh lên.');
      setMessages((prev) =>
        prev.map((m) => (m.clientId === clientId ? { ...m, status: 'failed' } : m))
      );
    } finally {
      tempUrls.forEach((u) => URL.revokeObjectURL(u));
    }
  };

  const handleSendLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setNewMessage((prev) => `${prev} 📍 Vị trí của tôi: https://www.google.com/maps?q=${latitude},${longitude} `);
        },
        () => {
          toast.warning('Không lấy được vị trí', 'Vui lòng cấp quyền truy cập vị trí trên trình duyệt.');
        }
      );
    } else {
      toast.warning('Thông báo', 'Trình duyệt không hỗ trợ lấy vị trí!');
    }
  };

  const handleSharePost = () => {
    setNewMessage((prev) => `${prev} 📦 Hỏi về sản phẩm: `);
  };

  const handleForwardMessage = async (receiver) => {
    if (!forwardingMessage?._id || !receiver || forwarding) return;
    setForwarding(true);
    try {
      const { data } = await axiosClient.post(`/api/messages/${forwardingMessage._id}/forward`, {
        senderId: user._id,
        receiverId: receiver._id
      });
      if (selectedReceiver?._id === receiver._id) setMessages(prev => [...prev, data]);
      if (socket) {
        socket.emit('sendMessage', {
          _id: data._id,
          senderId: user._id,
          receiverId: receiver._id,
          text: data.content || '',
          post: data.post || null,
          images: data.images || [],
          forwardedFrom: data.forwardedFrom
        });
      }
      setForwardingMessage(null);
      fetchInboxList();
      toast.success(`Đã chuyển tiếp đến ${receiver.name}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể chuyển tiếp tin nhắn');
    } finally {
      setForwarding(false);
    }
  };

  const emojis = ['😀', '😂', '🥰', '😍', '😎', '😭', '😡', '👍', '🙏', '❤️'];

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  const formatTimeAgo = (ts) => {
    if (!ts) return '';
    const dateObj = new Date(ts);
    if (Number.isNaN(dateObj.getTime())) return 'Gần đây';

    const diff = Date.now() - dateObj.getTime();
    if (diff < 60000) return 'Vừa xong';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} phút`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} giờ`;

    return `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`;
  };

  const isSellingConversation = useCallback(
    (item) => {
      if (!user?._id) return false;
      const sid = item.sellerId || item.lastMessage?.sellerId;
      if (sid) return String(sid) === String(user._id);
      const authorId = item.lastMessage?.post?.author?._id || item.lastMessage?.post?.author;
      return Boolean(authorId && String(authorId) === String(user._id));
    },
    [user?._id]
  );

  const unreadTotal = useMemo(
    () => inboxList.reduce((acc, item) => acc + (item.unreadCount || 0), 0),
    [inboxList]
  );
  const sellCount = useMemo(
    () => inboxList.filter((item) => isSellingConversation(item)).length,
    [inboxList, isSellingConversation]
  );
  const buyCount = useMemo(
    () => inboxList.filter((item) => !isSellingConversation(item)).length,
    [inboxList, isSellingConversation]
  );

  const filteredInbox = useMemo(() => {
    let filtered = inboxList;
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      filtered = filtered.filter(
        (item) =>
          String(item.otherUser?.name || '').toLowerCase().includes(q) ||
          String(item.lastMessage?.post?.title || item.lastMessage?.post?.name || '').toLowerCase().includes(q)
      );
    }
    if (filter === 'unread') {
      filtered = filtered.filter((item) => item.unreadCount > 0);
    } else if (filter === 'buy') {
      filtered = filtered.filter((item) => !isSellingConversation(item));
    } else if (filter === 'sell') {
      filtered = filtered.filter((item) => isSellingConversation(item));
    }
    return filtered;
  }, [inboxList, filter, searchTerm, isSellingConversation]);

  return (
    <div className="bg-[#FFFBEB] min-h-screen font-sans text-[#1C1917] flex flex-col h-screen overflow-hidden">
      <AppHeader />

      <main className="max-w-[1400px] w-full mx-auto px-4 py-4 flex-1 flex flex-col min-h-0">
        {/* Breadcrumb & Header info */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <nav className="flex items-center gap-2 text-sm text-stone-500">
            <Link to="/" className="hover:text-[#1C1917] flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Trang chủ
            </Link>
            <span>›</span>
            <span className="text-[#1C1917] font-semibold">Tin nhắn & Trò chuyện C2C</span>
          </nav>
          <div className="hidden md:flex items-center gap-1.5 text-xs font-bold text-orange-800 bg-orange-50 px-3 py-1.5 rounded-full border border-orange-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[#EA580C]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Kênh trao đổi trực tiếp giữa người mua và người bán HaiHand
          </div>
        </div>

        {/* Main Split Layout */}
        <div className="flex bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden flex-1 min-h-0">
          {/* Left Pane - Inbox List */}
          <div className="w-full md:w-[320px] lg:w-[380px] border-r border-stone-100 flex flex-col shrink-0 bg-stone-50/50">
            <div className="p-4 border-b border-stone-100 bg-white">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  Tin nhắn
                  {unreadTotal > 0 && (
                    <span className="bg-[#EA580C] text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                      {unreadTotal} mới
                    </span>
                  )}
                </h2>
              </div>

              <div className="relative mb-3">
                <span className="absolute left-3 top-2.5 text-stone-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </span>
                <input
                  type="text"
                  placeholder="Tìm theo người bán, tên món đồ..."
                  className="w-full h-9 pl-9 pr-3 text-sm border border-stone-200 rounded-lg bg-stone-100 focus:bg-white focus:outline-none focus:border-[#FACC15] transition-colors"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${filter === 'all' ? 'bg-[#FACC15] text-[#1C1917]' : 'bg-white border border-stone-200 text-stone-600'}`}
                >
                  Tất cả
                </button>
                <button
                  onClick={() => setFilter('buy')}
                  className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${filter === 'buy' ? 'bg-[#FACC15] text-[#1C1917]' : 'bg-white border border-stone-200 text-stone-600'}`}
                >
                  Mua hàng <span className="text-stone-400">({buyCount})</span>
                </button>
                <button
                  onClick={() => setFilter('sell')}
                  className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${filter === 'sell' ? 'bg-[#FACC15] text-[#1C1917]' : 'bg-white border border-stone-200 text-stone-600'}`}
                >
                  Bán hàng <span className="text-stone-400">({sellCount})</span>
                </button>
                <button
                  onClick={() => setFilter('unread')}
                  className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1 ${filter === 'unread' ? 'bg-[#FACC15] text-[#1C1917]' : 'bg-white border border-stone-200 text-stone-600'}`}
                >
                  <span className="w-1.5 h-1.5 bg-[#EA580C] rounded-full"></span> Chưa đọc{' '}
                  {unreadTotal > 0 && <span className="text-[#EA580C]">({unreadTotal})</span>}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar relative">
              {loading ? (
                <div className="flex justify-center py-10">
                  <div className="w-6 h-6 border-2 border-stone-200 border-t-[#FACC15] rounded-full animate-spin"></div>
                </div>
              ) : filteredInbox.length === 0 ? (
                <div className="text-center py-10 px-4 text-xs text-stone-400">
                  Không có cuộc hội thoại nào phù hợp.
                </div>
              ) : (
                filteredInbox.map((item, idx) => {
                  const isSelected = String(selectedReceiver?._id) === String(item.otherUser?._id);
                  const isUnread = item.unreadCount > 0;
                  const lastTime = item.lastMessage?.createdAt || item.lastMessage?.timestamp || item.timestamp;
                  const isMine = String(item.lastMessage?.sender?._id || item.lastMessage?.sender) === String(user?._id);
                  const previewText =
                    item.lastMessage?.content ||
                    (item.lastMessage?.images?.length ? '📷 Hình ảnh' : item.lastMessage?.post ? '📦 Sản phẩm' : 'Đã gửi đính kèm');

                  return (
                    <div
                      key={item.otherUser?._id || idx}
                      onClick={() => handleSelectConversation(item.otherUser)}
                      className={`p-4 border-b border-stone-100 cursor-pointer transition-colors relative flex items-start gap-3 ${isSelected ? 'bg-[#FFFBEB]' : 'hover:bg-stone-100'}`}
                    >
                      {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#FACC15]"></div>}

                      <div className="relative shrink-0">
                        <img
                          src={getImageUrl(item.otherUser?.avatar, DEFAULT_AVATAR_PLACEHOLDER)}
                          className="w-12 h-12 rounded-full object-cover border border-stone-200"
                          alt="avt"
                          onError={(e) => {
                            e.currentTarget.src = DEFAULT_AVATAR_PLACEHOLDER;
                          }}
                        />
                        {onlineUsers.includes(String(item.otherUser?._id)) && (
                          <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full"></span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-0.5">
                          <h4 className={`text-sm truncate pr-2 flex items-center gap-1 ${isUnread ? 'font-black text-[#1C1917]' : 'font-bold text-[#1C1917]'}`}>
                            {item.otherUser?.name}
                            {(item.otherUser?.verified || item.otherUser?.isVerified) && (
                              <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                            )}
                            {item.otherUser?.badge && (
                              <span className="text-[9px] bg-stone-200 text-stone-600 px-1 rounded">
                                {item.otherUser.badge}
                              </span>
                            )}
                          </h4>
                          <span className={`text-[10px] shrink-0 ${isUnread ? 'font-bold text-[#EA580C]' : 'text-stone-400'}`}>
                            {formatTimeAgo(lastTime)}
                          </span>
                        </div>
                        {item.lastMessage?.post && (
                          <div className="flex items-center gap-1 text-[10px] text-stone-500 mb-1 truncate">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                            {item.lastMessage.post.title || item.lastMessage.post.name || 'Bài đăng'}
                          </div>
                        )}
                        <p className={`text-xs truncate ${isUnread ? 'font-bold text-[#1C1917]' : 'text-stone-500'}`}>
                          {isMine ? 'Bạn: ' : ''}
                          {previewText}
                        </p>
                      </div>

                      {isUnread && (
                        <div className="flex flex-col justify-center items-end shrink-0 pt-1">
                          <span className="bg-[#EA580C] text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
                            {item.unreadCount}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              <div className="m-4 bg-orange-50 rounded-xl border border-orange-100 p-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 text-orange-200 opacity-50">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h4 className="font-bold text-[#EA580C] text-xs flex items-center gap-1.5 mb-2 relative z-10">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#EA580C]"></span> Mẹo mua đồ công nghệ an toàn
                </h4>
                <p className="text-[10px] text-orange-800 leading-relaxed relative z-10">
                  Luôn yêu cầu người bán test trực tiếp pin, iCloud. Khuyến khích thanh toán qua VNPay, Ví HaiPay hoặc giao dịch COD có đồng kiểm.
                </p>
              </div>
            </div>
          </div>

          {/* Right Pane - Chat Window */}
          <div className="flex-1 flex flex-col min-w-0 bg-stone-50/30">
            {selectedReceiver ? (
              <>
                {/* Chat Header */}
                <div className="px-5 py-3 border-b border-stone-200 bg-white flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <div
                      className="relative cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => navigate(`/public-profile/${selectedReceiver._id}`)}
                    >
                      <img
                        src={getImageUrl(selectedReceiver.avatar, DEFAULT_AVATAR_PLACEHOLDER)}
                        className="w-12 h-12 rounded-full object-cover border border-stone-200"
                        alt="avt"
                        onError={(e) => {
                          e.currentTarget.src = DEFAULT_AVATAR_PLACEHOLDER;
                        }}
                      />
                      {onlineUsers.includes(String(selectedReceiver._id)) && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></span>
                      )}
                    </div>
                    <div>
                      <h3
                        className="font-bold text-[#1C1917] flex items-center gap-2 cursor-pointer hover:underline"
                        onClick={() => navigate(`/public-profile/${selectedReceiver._id}`)}
                      >
                        {selectedReceiver.name}
                        {onlineUsers.includes(String(selectedReceiver._id)) && (
                          <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full font-bold no-underline">
                            Đang trực tuyến
                          </span>
                        )}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-stone-500 font-medium mt-0.5">
                        <span className="text-[#EA580C]">
                          ★ {selectedReceiver.rating || 0}{' '}
                          <span className="text-stone-400">({selectedReceiver.reviews || 0} phản hồi)</span>
                        </span>
                        <span>•</span>
                        <span>{selectedReceiver.address || 'Chưa cập nhật địa chỉ'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate(`/public-profile/${selectedReceiver._id}`)}
                      className="px-3 py-1.5 bg-stone-100 text-stone-700 rounded-lg text-sm font-bold hover:bg-stone-200 flex items-center gap-1 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>{' '}
                      Xem hồ sơ
                    </button>
                  </div>
                </div>

                {/* Linked Post Card */}
                {linkedPost && (
                  <div className="px-5 py-3 border-b border-stone-200 bg-white flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                      <img
                        src={getImageUrl(linkedPost.image || linkedPost.images?.[0])}
                        className="w-14 h-14 rounded-lg object-cover border border-stone-200"
                        alt="product"
                      />
                      <div>
                        <h4 className="font-bold text-sm text-[#1C1917] flex items-center gap-2 mb-0.5">
                          {linkedPost.title || linkedPost.name}
                          {linkedPost.condition && (
                            <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded text-[10px]">
                              {linkedPost.condition}
                            </span>
                          )}
                        </h4>
                        <div className="flex items-baseline gap-2">
                          <span className="font-black text-[#EA580C] text-sm">
                            {new Intl.NumberFormat('vi-VN').format(linkedPost.price || 0)} đ
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/post/${linkedPost._id}`)}
                        className="px-4 py-1.5 bg-[#FACC15] text-[#1C1917] font-bold text-xs rounded-lg flex items-center gap-1 hover:bg-[#EAB308]"
                      >
                        Xem sản phẩm
                      </button>
                    </div>
                  </div>
                )}

                {/* Safety Notice in Chat */}
                <div className="px-5 pt-4 shrink-0">
                  <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 flex gap-3 max-w-2xl mx-auto">
                    <div className="text-[#EA580C] shrink-0 mt-0.5">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-orange-900 mb-1">LƯU Ý AN TOÀN HAIHAND:</h4>
                      <p className="text-[11px] text-orange-800 leading-relaxed">
                        Không chuyển tiền đặt cọc trước vào tài khoản lạ. Ưu tiên gặp trực tiếp nơi công cộng hoặc thanh toán qua VNPay, Ví HaiPay hoặc dịch vụ COD đồng kiểm khi nhận hàng.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Message List */}
                <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
                  {messages.map((m, idx) => {
                    if (m.isDateMarker) {
                      return (
                        <div key={idx} className="flex justify-center my-2">
                          <span className="bg-stone-100 text-stone-500 text-[10px] font-bold px-3 py-1 rounded-full">
                            {m.isDateMarker}
                          </span>
                        </div>
                      );
                    }

                    const isMe = String(m.sender?._id || m.sender) === String(user?._id);
                    const msgTime = m.createdAt || m.timestamp;

                    return (
                      <div
                        key={m._id || m.clientId || idx}
                        className={`flex ${isMe ? 'justify-end' : 'justify-start'} gap-2`}
                        ref={idx === messages.length - 1 ? scrollRef : null}
                      >
                        {!isMe && (
                          <img
                            src={getImageUrl(selectedReceiver.avatar, DEFAULT_AVATAR_PLACEHOLDER)}
                            className="w-8 h-8 rounded-full object-cover shrink-0 mt-auto"
                            alt="avt"
                            onError={(e) => {
                              e.currentTarget.src = DEFAULT_AVATAR_PLACEHOLDER;
                            }}
                          />
                        )}

                        <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[70%]`}>
                          {!isMe && (
                            <span className="text-[10px] text-stone-400 mb-1 ml-1">
                              {selectedReceiver.name} • {formatTime(msgTime)}
                            </span>
                          )}

                          {m.content && (
                            <div
                              className={`px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                                isMe
                                  ? m.status === 'failed'
                                    ? 'bg-red-50 border border-red-200 text-red-900 rounded-br-sm'
                                    : 'bg-[#FEF3C7] text-[#1C1917] rounded-br-sm'
                                  : 'bg-white border border-stone-200 text-[#1C1917] rounded-bl-sm'
                              } shadow-sm`}
                            >
                              {renderTextWithLinks(m.content)}
                            </div>
                          )}

                          {m.post && (
                            <div
                              onClick={() => m.post._id && navigate(`/post/${m.post._id}`)}
                              className={`mt-1 p-2 w-[240px] rounded-xl border border-stone-200 cursor-pointer hover:bg-stone-50 transition-colors shadow-sm ${isMe ? 'bg-orange-50/50' : 'bg-white'}`}
                            >
                              <div className="flex gap-2 items-center">
                                <img
                                  src={getImageUrl(m.post.image || (m.post.images && m.post.images[0]))}
                                  className="w-12 h-12 rounded-lg object-cover border border-stone-200"
                                  alt="product"
                                />
                                <div className="flex-1 min-w-0">
                                  <h5 className="font-bold text-[11px] text-[#1C1917] truncate">
                                    {m.post.title || m.post.name || 'Sản phẩm'}
                                  </h5>
                                  <p className="text-[#EA580C] font-black text-xs mt-0.5">
                                    {m.post.price ? new Intl.NumberFormat('vi-VN').format(m.post.price) : '0'} đ
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          {m.images &&
                            m.images.map((img, i) => (
                              <div key={i} className="relative mt-1">
                                <img
                                  src={getImageUrl(img)}
                                  alt="attached"
                                  className="rounded-xl border border-stone-200 shadow-sm max-h-[160px] object-cover"
                                />
                              </div>
                            ))}

                          {isMe && (
                            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-stone-400 font-medium mr-1">
                              {m.status === 'failed' ? (
                                <>
                                  <span className="text-red-600 font-bold">Gửi thất bại</span>
                                  {m.retryPayload && (
                                    <button
                                      type="button"
                                      onClick={() => handleRetryMessage(m)}
                                      className="text-[#EA580C] underline font-bold bg-transparent border-0 p-0 cursor-pointer"
                                    >
                                      Gửi lại
                                    </button>
                                  )}
                                </>
                              ) : (
                                <>
                                  <span>{m.status === 'Đang gửi' ? 'Đang gửi' : m.isRead ? 'Đã xem' : 'Đã gửi'}</span>
                                  <span>• {formatTime(msgTime)}</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Input Area */}
                <div className="px-5 pb-5 shrink-0 bg-stone-50/30">
                  <div className="flex gap-2 overflow-x-auto custom-scrollbar mb-3">
                    <button
                      type="button"
                      className="px-3 py-1.5 bg-white border border-stone-200 text-stone-600 text-xs font-bold rounded-full hover:bg-stone-50 shadow-sm whitespace-nowrap"
                      onClick={() => setNewMessage('Sản phẩm còn không bạn?')}
                    >
                      Sản phẩm còn không bạn?
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 bg-white border border-stone-200 text-stone-600 text-xs font-bold rounded-full hover:bg-stone-50 shadow-sm whitespace-nowrap"
                      onClick={() => setNewMessage('Cho mình xin thêm ảnh góc cạnh?')}
                    >
                      Cho mình xin thêm ảnh góc cạnh?
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 bg-white border border-stone-200 text-stone-600 text-xs font-bold rounded-full hover:bg-stone-50 shadow-sm whitespace-nowrap"
                      onClick={() => setNewMessage('Có hỗ trợ ship COD kiểm tra hàng không?')}
                    >
                      Có hỗ trợ ship COD kiểm tra hàng không?
                    </button>
                  </div>

                  <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/*"
                      multiple
                      onChange={handleImageUpload}
                    />
                    <button
                      type="button"
                      aria-label="Gửi hình ảnh"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 text-stone-500 hover:text-stone-700 hover:bg-stone-200 rounded-full transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      aria-label="Gửi vị trí"
                      onClick={handleSendLocation}
                      className="p-2 text-stone-500 hover:text-stone-700 hover:bg-stone-200 rounded-full transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      aria-label="Hỏi về sản phẩm"
                      onClick={handleSharePost}
                      className="p-2 text-stone-500 hover:text-stone-700 hover:bg-stone-200 rounded-full transition-colors mr-1"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                    </button>

                    <div className="flex-1 relative">
                      <input
                        type="text"
                        className="w-full bg-stone-200 border-none h-11 pl-4 pr-10 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-[#FACC15]"
                        placeholder="Nhập tin nhắn... (Không gửi mã OTP hoặc thông tin ngân hàng nhạy cảm)"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                      />
                      <button
                        type="button"
                        aria-label="Chọn biểu tượng cảm xúc"
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className="absolute right-3 top-2.5 text-stone-400 hover:text-stone-600"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                      {showEmojiPicker && (
                        <div className="absolute bottom-12 right-0 bg-white border border-stone-200 shadow-lg rounded-xl p-3 grid grid-cols-5 gap-2 z-50">
                          {emojis.map((em) => (
                            <button
                              key={em}
                              type="button"
                              onClick={() => {
                                setNewMessage((prev) => prev + em);
                                setShowEmojiPicker(false);
                              }}
                              className="text-xl hover:bg-stone-100 p-1 rounded transition-colors"
                            >
                              {em}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      aria-label="Gửi tin nhắn"
                      disabled={!newMessage.trim() && !linkedPost}
                      className="w-11 h-11 bg-[#FACC15] text-[#1C1917] flex items-center justify-center rounded-full shadow-sm hover:bg-[#EAB308] disabled:bg-stone-200 disabled:text-stone-400 ml-1 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transform rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </button>
                  </form>

                  <div className="flex justify-between items-center mt-3 text-[10px]">
                    <span className="flex items-center gap-1 text-emerald-600 font-bold">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>{' '}
                      Tin nhắn được giám sát bởi hệ thống chống gian lận HaiHand Guard.
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col justify-center items-center text-center p-8">
                <div className="w-24 h-24 bg-stone-100 rounded-full flex items-center justify-center mb-4 border-4 border-white shadow-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-stone-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-[#1C1917] mb-2">Chào mừng đến với HaiHand Chat!</h2>
                <p className="text-sm text-stone-500 max-w-sm">
                  Chọn một người từ danh sách bên trái hoặc sử dụng thanh tìm kiếm để bắt đầu trò chuyện trực tiếp.
                </p>
              </div>
            )}
          </div>
        </div>

        {forwardingMessage && (
          <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={() => !forwarding && setForwardingMessage(null)}>
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="forward-title" onClick={event => event.stopPropagation()}>
              <div className="p-4 border-b border-stone-200 flex items-center justify-between">
                <div>
                  <h3 id="forward-title" className="font-black text-lg">Chuyển tiếp tin nhắn</h3>
                  <p className="text-xs text-stone-500 mt-0.5">Chọn cuộc trò chuyện để gửi nội dung này</p>
                </div>
                <button type="button" disabled={forwarding} aria-label="Đóng" onClick={() => setForwardingMessage(null)} className="w-8 h-8 rounded-full hover:bg-stone-100 text-stone-500">✕</button>
              </div>
              <div className="p-3 bg-stone-50 border-b border-stone-200 text-sm text-stone-600 max-h-24 overflow-hidden">
                {forwardingMessage.content || (forwardingMessage.images?.length ? 'Hình ảnh đính kèm' : 'Sản phẩm đính kèm')}
              </div>
              <div className="max-h-80 overflow-y-auto p-2">
                {inboxList.length ? inboxList.map(item => (
                  <button key={item.otherUser._id} type="button" disabled={forwarding} onClick={() => handleForwardMessage(item.otherUser)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#FFFBEB] disabled:opacity-50 text-left">
                    <img src={item.otherUser.avatar || 'https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png'} alt="" className="w-10 h-10 rounded-full object-cover border border-stone-200" />
                    <span className="font-bold text-sm flex-1">{item.otherUser.name}</span>
                    <span className="text-xs font-bold text-[#EA580C]">{forwarding ? 'Đang gửi...' : 'Gửi'}</span>
                  </button>
                )) : <p className="p-6 text-center text-sm text-stone-500">Bạn chưa có cuộc trò chuyện nào để chuyển tiếp.</p>}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
