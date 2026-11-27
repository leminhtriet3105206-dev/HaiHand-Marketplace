import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosClient from '../api/axiosClient';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_AVATAR_PLACEHOLDER, getImageUrl } from '../utils/imageUrl';

function formatMessagePreview(lastMessage) {
  if (!lastMessage) return '';
  if (typeof lastMessage === 'string') return lastMessage;
  if (lastMessage.content && lastMessage.content.trim()) return lastMessage.content;
  if (Array.isArray(lastMessage.images) && lastMessage.images.length > 0) return '📷 Hình ảnh';
  if (lastMessage.post) return '📦 Sản phẩm';
  if (lastMessage.order) return '🧾 Đơn hàng';
  return '';
}

const InboxPage = () => {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { socket } = useSocket();
  const { user } = useAuth();

  const fetchConversations = useCallback(async () => {
    if (!user?._id || !user?.token) {
      setConversations([]);
      setLoading(false);
      return;
    }
    try {
      const { data } = await axiosClient.get('/api/messages/conversations');
      setConversations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Lỗi tải danh sách hội thoại:', err);
    } finally {
      setLoading(false);
    }
  }, [user?._id, user?.token]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (!socket) return;
    const handleRefresh = () => fetchConversations();
    socket.on('inbox:update', handleRefresh);
    socket.on('message:new', handleRefresh);
    return () => {
      socket.off('inbox:update', handleRefresh);
      socket.off('message:new', handleRefresh);
    };
  }, [socket, fetchConversations]);

  return (
    <div style={{ backgroundColor: '#fff', minHeight: '100vh' }}>
      <div className="py-3 px-3 shadow-sm d-flex align-items-center" style={{ backgroundColor: '#ffc107' }}>
        <button onClick={() => navigate('/')} className="btn btn-link text-dark p-0 me-3 text-decoration-none">
          <span style={{ fontSize: '24px' }}>←</span>
        </button>
        <h5 className="fw-bold m-0 text-dark">Chat của tôi</h5>
      </div>

      <div className="container mt-2">
        {loading ? (
          <div className="text-center py-5 text-muted">Đang tải hội thoại...</div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-5">
            <p className="text-muted">Chưa có cuộc hội thoại nào</p>
          </div>
        ) : (
          conversations.map((conv, idx) => {
            const other = conv.otherUser || {};
            const msgTime = conv.lastMessage?.createdAt || conv.lastMessage?.timestamp || conv.timestamp;
            return (
              <div
                key={other._id || idx}
                className="d-flex align-items-center p-3 border-bottom"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate('/chat', { state: { receiver: other } })}
              >
                <div className="position-relative">
                  {other.avatar ? (
                    <img
                      src={getImageUrl(other.avatar, DEFAULT_AVATAR_PLACEHOLDER)}
                      alt={other.name || 'Avatar'}
                      className="rounded-circle border"
                      style={{ width: '50px', height: '50px', objectFit: 'cover' }}
                      onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR_PLACEHOLDER; }}
                    />
                  ) : (
                    <div
                      className="rounded-circle bg-warning text-white d-flex align-items-center justify-content-center fw-bold"
                      style={{ width: '50px', height: '50px', fontSize: '18px' }}
                    >
                      {(other.name || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                  {conv.unreadCount > 0 && (
                    <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger border border-white">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>

                <div className="ms-3 flex-grow-1 overflow-hidden">
                  <div className="d-flex justify-content-between align-items-center">
                    <h6 className="fw-bold mb-0 text-dark text-truncate">{other.name || 'Người dùng'}</h6>
                    <small className="text-muted" style={{ fontSize: '11px' }}>
                      {msgTime ? new Date(msgTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </small>
                  </div>
                  <div className="text-muted text-truncate" style={{ maxWidth: '250px', fontSize: '14px' }}>
                    {formatMessagePreview(conv.lastMessage)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default InboxPage;
