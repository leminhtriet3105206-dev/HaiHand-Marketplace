import { useState, useEffect, useCallback } from 'react';
import axiosClient from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

/**
 * Hook nhẹ đếm số tin nhắn chưa đọc theo vai trò ('all' | 'seller' | 'buyer').
 * Tự động đồng bộ qua Socket.IO (inbox:update, message:new, messages:read) và window 'messageUpdated'.
 */
export default function useUnreadMessages(scope = 'all') {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnread = useCallback(async () => {
    if (!user?._id) {
      setUnreadCount(0);
      return;
    }
    try {
      const { data } = await axiosClient.get(`/api/messages/unread-count?as=${encodeURIComponent(scope)}`);
      setUnreadCount(Number(data?.count || 0));
    } catch (err) {
      // Giữ nguyên giá trị hiện tại nếu lỗi mạng tạm thời
    }
  }, [user?._id, scope]);

  useEffect(() => {
    fetchUnread();
  }, [fetchUnread]);

  useEffect(() => {
    const handleUpdate = () => fetchUnread();
    window.addEventListener('messageUpdated', handleUpdate);
    return () => window.removeEventListener('messageUpdated', handleUpdate);
  }, [fetchUnread]);

  useEffect(() => {
    if (!socket) return;
    const handleSocketUpdate = () => fetchUnread();
    socket.on('inbox:update', handleSocketUpdate);
    socket.on('message:new', handleSocketUpdate);
    socket.on('messages:read', handleSocketUpdate);
    return () => {
      socket.off('inbox:update', handleSocketUpdate);
      socket.off('message:new', handleSocketUpdate);
      socket.off('messages:read', handleSocketUpdate);
    };
  }, [socket, fetchUnread]);

  return { unreadCount, refreshUnread: fetchUnread };
}
