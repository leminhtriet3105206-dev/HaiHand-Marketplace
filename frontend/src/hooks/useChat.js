import { useState, useEffect, useCallback, useRef } from 'react';
import axiosClient from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../components/Toast';

/**
 * Hook dùng chung cho hệ thống chat (SellerMessages / ChatPage).
 * Quản lý danh sách hội thoại, thread đang mở, tải thêm (cursor), gửi tin optimistic + retry,
 * đánh dấu đã đọc, trạng thái online, typing (throttle 2s) và khử trùng tin nhắn.
 */
export default function useChat({ scope = 'seller', initialWithUserId = null, initialReceiver = null, initialPost = null, initialOrder = null } = {}) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const toast = useToast();

  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const [selectedUser, setSelectedUser] = useState(initialReceiver || null);
  const [activePost, setActivePost] = useState(initialPost || null);
  const [activeOrder, setActiveOrder] = useState(initialOrder || null);

  const [messages, setMessages] = useState([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const [onlineUsers, setOnlineUsers] = useState(() => new Set());
  const [typingUsers, setTypingUsers] = useState({});

  const hasLoadedInitialRef = useRef(false);
  const selectedUserIdRef = useRef(null);
  const lastTypingEmitRef = useRef(0);

  useEffect(() => {
    selectedUserIdRef.current = selectedUser?._id ? String(selectedUser._id) : null;
  }, [selectedUser]);

  // Debounce tìm kiếm 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchConversations = useCallback(async ({ silent = false } = {}) => {
    if (!user?._id) return;
    if (!silent && !hasLoadedInitialRef.current) {
      setLoadingConversations(true);
    }
    try {
      const params = new URLSearchParams({
        as: scope,
        limit: '50'
      });
      if (debouncedQuery) params.set('q', debouncedQuery);
      if (filter === 'unread') params.set('unread', '1');

      const { data } = await axiosClient.get(`/api/messages/conversations?${params.toString()}`);
      const list = Array.isArray(data) ? data : (data?.conversations || []);
      setConversations(list);
      hasLoadedInitialRef.current = true;
    } catch (err) {
      if (!silent) {
        toast.error('Không thể tải danh sách hội thoại');
      }
    } finally {
      setLoadingConversations(false);
    }
  }, [user?._id, scope, debouncedQuery, filter, toast]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const markAsRead = useCallback(async (otherId) => {
    if (!otherId || !user?._id) return;
    try {
      await axiosClient.put(`/api/messages/read/${otherId}`);
      setConversations((prev) =>
        prev.map((c) => {
          const cid = c.user?._id || c.otherUser?._id;
          return String(cid) === String(otherId) ? { ...c, unreadCount: 0 } : c;
        })
      );
      window.dispatchEvent(new Event('messageUpdated'));
    } catch (err) {
      // ignore
    }
  }, [user?._id]);

  const loadThread = useCallback(async (otherId) => {
    if (!otherId || !user?._id) return;
    setLoadingThread(true);
    try {
      const { data } = await axiosClient.get(`/api/messages/thread/${otherId}?limit=30`);
      const list = Array.isArray(data) ? data : (data?.messages || []);
      setMessages(list);
      setHasMore(list.length >= 30);
      await markAsRead(otherId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không thể tải nội dung trò chuyện');
    } finally {
      setLoadingThread(false);
    }
  }, [user?._id, markAsRead, toast]);

  const loadMoreMessages = useCallback(async () => {
    const otherId = selectedUserIdRef.current;
    if (!otherId || loadingMore || !hasMore || messages.length === 0) return;
    const oldest = messages[0];
    const cursor = oldest?.createdAt || oldest?.timestamp || oldest?._id;
    if (!cursor) return;

    setLoadingMore(true);
    try {
      const { data } = await axiosClient.get(
        `/api/messages/thread/${otherId}?before=${encodeURIComponent(cursor)}&limit=30`
      );
      const older = Array.isArray(data) ? data : (data?.messages || []);
      if (older.length < 30) setHasMore(false);
      if (older.length > 0) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => String(m._id || m.clientId)));
          const uniqueOlder = older.filter((m) => !seen.has(String(m._id)));
          return [...uniqueOlder, ...prev];
        });
      }
    } catch (err) {
      toast.error('Không thể tải thêm tin nhắn cũ');
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, messages, toast]);

  const selectConversation = useCallback((convOrUser) => {
    if (!convOrUser) return;
    const targetUser = convOrUser.user || convOrUser.otherUser || convOrUser;
    if (!targetUser?._id) return;

    setSelectedUser(targetUser);
    if (convOrUser.lastMessage?.post) {
      setActivePost(convOrUser.lastMessage.post);
    } else if (!initialPost) {
      setActivePost(null);
    }
    if (convOrUser.lastMessage?.order) {
      setActiveOrder(convOrUser.lastMessage.order);
    } else if (!initialOrder) {
      setActiveOrder(null);
    }
    loadThread(targetUser._id);
  }, [loadThread, initialPost, initialOrder]);

  // Mở sẵn hội thoại từ ?with=<userId> hoặc location.state
  useEffect(() => {
    const targetId = initialWithUserId || initialReceiver?._id;
    if (!targetId || !user?._id) return;

    if (initialReceiver && String(initialReceiver._id) === String(targetId)) {
      setSelectedUser(initialReceiver);
      loadThread(targetId);
      return;
    }

    const found = conversations.find((c) => String(c.user?._id || c.otherUser?._id) === String(targetId));
    if (found) {
      selectConversation(found);
    } else if (!loadingConversations) {
      // Vẫn tải thread để backend trả thông tin hoặc tạo ngữ cảnh
      axiosClient
        .get(`/api/users/public-profile/${targetId}`)
        .then(({ data }) => {
          const u = data?.user || data;
          if (u?._id) {
            setSelectedUser(u);
            loadThread(u._id);
          }
        })
        .catch(() => {
          setSelectedUser({ _id: targetId, name: 'Khách hàng' });
          loadThread(targetId);
        });
    }
  }, [initialWithUserId, initialReceiver?._id, user?._id, loadingConversations]); // eslint-disable-line react-hooks/exhaustive-deps

  // Socket.IO listeners
  useEffect(() => {
    if (!socket || !user?._id) return;

    const handlePresenceSync = (ids) => {
      if (Array.isArray(ids)) {
        setOnlineUsers(new Set(ids.map((id) => String(id))));
      }
    };

    const handlePresenceUpdate = ({ userId, online }) => {
      if (!userId) return;
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        if (online) next.add(String(userId));
        else next.delete(String(userId));
        return next;
      });
    };

    const handleNewMessage = (msg) => {
      if (!msg) return;
      const senderId = String(msg.sender?._id || msg.sender || '');
      const receiverId = String(msg.receiver?._id || msg.receiver || '');
      const myId = String(user._id);
      const currentOtherId = selectedUserIdRef.current;

      const belongsToOpenThread =
        currentOtherId &&
        ((senderId === currentOtherId && receiverId === myId) ||
          (senderId === myId && receiverId === currentOtherId));

      if (belongsToOpenThread) {
        setMessages((prev) => {
          const exists = prev.some((m) => m._id && msg._id && String(m._id) === String(msg._id));
          if (exists) return prev;
          return [...prev, msg];
        });
        if (senderId === currentOtherId) {
          markAsRead(currentOtherId);
        }
      }

      fetchConversations({ silent: true });
      window.dispatchEvent(new Event('messageUpdated'));
    };

    const handleInboxUpdate = () => {
      fetchConversations({ silent: true });
    };

    const handleMessagesRead = ({ byUserId }) => {
      if (selectedUserIdRef.current && String(byUserId) === String(selectedUserIdRef.current)) {
        const nowIso = new Date().toISOString();
        setMessages((prev) =>
          prev.map((m) =>
            String(m.sender?._id || m.sender) === String(user._id)
              ? { ...m, isRead: true, readAt: m.readAt || nowIso }
              : m
          )
        );
      }
    };

    const handleTypingStart = ({ fromUserId }) => {
      if (!fromUserId) return;
      setTypingUsers((prev) => ({ ...prev, [String(fromUserId)]: true }));
    };

    const handleTypingStop = ({ fromUserId }) => {
      if (!fromUserId) return;
      setTypingUsers((prev) => {
        const next = { ...prev };
        delete next[String(fromUserId)];
        return next;
      });
    };

    socket.on('presence:sync', handlePresenceSync);
    socket.on('presence:update', handlePresenceUpdate);
    socket.on('message:new', handleNewMessage);
    socket.on('inbox:update', handleInboxUpdate);
    socket.on('messages:read', handleMessagesRead);
    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);

    return () => {
      socket.off('presence:sync', handlePresenceSync);
      socket.off('presence:update', handlePresenceUpdate);
      socket.off('message:new', handleNewMessage);
      socket.off('inbox:update', handleInboxUpdate);
      socket.off('messages:read', handleMessagesRead);
      socket.off('typing:start', handleTypingStart);
      socket.off('typing:stop', handleTypingStop);
    };
  }, [socket, user?._id, fetchConversations, markAsRead]);

  const sendMessage = useCallback(async ({ content = '', files = [], post = null, order = null, retryClientId = null } = {}) => {
    const targetId = selectedUserIdRef.current;
    if (!targetId || !user?._id) return false;

    const trimmed = String(content || '').trim();
    const postObj = post || activePost;
    const orderObj = order || activeOrder;

    if (!trimmed && (!files || files.length === 0) && !postObj && !orderObj) {
      return false;
    }

    const clientId = retryClientId || `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const previewUrls = (files || []).map((f) => URL.createObjectURL(f));

    const optimisticMsg = {
      clientId,
      sender: { _id: user._id, name: user.name, avatar: user.avatar },
      receiver: { _id: targetId },
      content: trimmed,
      images: previewUrls,
      post: postObj || null,
      order: orderObj || null,
      createdAt: new Date().toISOString(),
      isRead: false,
      status: 'sending',
      _rawPayload: { content: trimmed, files, post: postObj, order: orderObj }
    };

    if (retryClientId) {
      setMessages((prev) => prev.map((m) => (m.clientId === retryClientId ? { ...m, status: 'sending' } : m)));
    } else {
      setMessages((prev) => [...prev, optimisticMsg]);
    }

    try {
      const formData = new FormData();
      formData.append('receiverId', targetId);
      if (trimmed) formData.append('content', trimmed);
      if (postObj?._id) formData.append('postId', postObj._id);
      if (orderObj?._id) formData.append('orderId', orderObj._id);
      (files || []).slice(0, 4).forEach((file) => {
        formData.append('images', file);
      });

      const { data: saved } = await axiosClient.post('/api/messages', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      previewUrls.forEach((url) => URL.revokeObjectURL(url));

      setMessages((prev) => {
        const replaced = prev.map((m) => (m.clientId === clientId ? saved : m));
        const seen = new Set();
        return replaced.filter((m) => {
          const key = m._id ? `id:${m._id}` : `c:${m.clientId}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      });

      if (activePost) setActivePost(null);
      if (activeOrder) setActiveOrder(null);
      fetchConversations({ silent: true });
      window.dispatchEvent(new Event('messageUpdated'));
      return true;
    } catch (err) {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
      const errMsg = err.response?.data?.message || 'Không thể gửi tin nhắn';
      toast.error(errMsg);
      setMessages((prev) =>
        prev.map((m) => (m.clientId === clientId ? { ...m, status: 'failed' } : m))
      );
      return false;
    }
  }, [user, activePost, activeOrder, fetchConversations, toast]);

  const retryMessage = useCallback((failedMsg) => {
    if (!failedMsg?._rawPayload) return;
    sendMessage({
      ...failedMsg._rawPayload,
      retryClientId: failedMsg.clientId
    });
  }, [sendMessage]);

  const emitTypingStart = useCallback(() => {
    const targetId = selectedUserIdRef.current;
    if (!socket || !targetId) return;
    const now = Date.now();
    if (now - lastTypingEmitRef.current < 2000) return;
    lastTypingEmitRef.current = now;
    socket.emit('typing:start', { toUserId: targetId });
  }, [socket]);

  const emitTypingStop = useCallback(() => {
    const targetId = selectedUserIdRef.current;
    if (!socket || !targetId) return;
    socket.emit('typing:stop', { toUserId: targetId });
  }, [socket]);

  const blockUser = useCallback(async (targetId) => {
    if (!targetId) return;
    try {
      await axiosClient.post(`/api/messages/block/${targetId}`);
      toast.success('Đã chặn người dùng này');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi khi chặn người dùng');
    }
  }, [toast]);

  return {
    conversations,
    loadingConversations,
    searchQuery,
    setSearchQuery,
    filter,
    setFilter,
    selectedUser,
    setSelectedUser,
    activePost,
    setActivePost,
    activeOrder,
    setActiveOrder,
    messages,
    loadingThread,
    loadingMore,
    hasMore,
    onlineUsers,
    typingUsers,
    fetchConversations,
    selectConversation,
    loadMoreMessages,
    sendMessage,
    retryMessage,
    emitTypingStart,
    emitTypingStop,
    blockUser
  };
}
