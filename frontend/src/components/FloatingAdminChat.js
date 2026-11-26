import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosClient from '../api/axiosClient';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';

const FloatingAdminChat = () => {
  const toast = useToast();
  const navigate = useNavigate();

  const [isHidden, setIsHidden] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [adminUser, setAdminUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);

  const { socket } = useSocket();
  const { user: currentUser } = useAuth();
  const scrollRef = useRef();

  const isEmbedded = window.self !== window.top;
  const isAdmin = currentUser?.role === 'Admin';

  useEffect(() => {
    if (isAdmin || isEmbedded) return;
    const fetchAdmin = async () => {
      try {
        const { data } = await axiosClient.get('/api/admin/contact');
        setAdminUser(data);
      } catch (err) {
        console.error('Chưa có Admin CSKH');
      }
    };
    fetchAdmin();
  }, [isAdmin, isEmbedded]);

  useEffect(() => {
    if (!isOpen || !currentUser?._id || !currentUser?.token || !adminUser?._id || isEmbedded) {
      return;
    }

    axiosClient
      .get(`/api/messages/thread/${adminUser._id}`)
      .then((res) => {
        setMessages(Array.isArray(res.data) ? res.data : []);
        axiosClient.put(`/api/messages/read/${adminUser._id}`).catch(() => {});
      })
      .catch((err) => console.log(err));

    if (!socket) return;

    const handleNewMessage = (msg) => {
      const senderId = String(msg.sender?._id || msg.sender || '');
      const receiverId = String(msg.receiver?._id || msg.receiver || '');
      const myId = String(currentUser._id);
      const adminId = String(adminUser._id);

      const belongsHere =
        (senderId === adminId && receiverId === myId) ||
        (senderId === myId && receiverId === adminId);

      if (!belongsHere) return;

      setMessages((prev) => {
        if (msg._id && prev.some((m) => String(m._id) === String(msg._id))) {
          return prev;
        }
        return [...prev, msg];
      });

      if (senderId === adminId) {
        axiosClient.put(`/api/messages/read/${adminUser._id}`).catch(() => {});
      }
    };

    socket.on('message:new', handleNewMessage);
    return () => {
      socket.off('message:new', handleNewMessage);
    };
  }, [isOpen, currentUser?._id, currentUser?.token, adminUser?._id, isEmbedded, socket]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  if (isAdmin || isEmbedded || isHidden) return null;

  const handleToggle = () => {
    if (!currentUser?._id || !currentUser?.token) {
      toast.warning('Yêu cầu đăng nhập', 'Bác vui lòng đăng nhập để chat với Hỗ trợ viên nhé!');
      navigate('/login');
      return;
    }
    if (!adminUser) {
      toast.info('Thông báo', 'Hệ thống hiện tại chưa có Admin trực ban!');
      return;
    }
    setIsOpen((prev) => !prev);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || sending || !adminUser?._id) return;

    setSending(true);
    try {
      const { data } = await axiosClient.post('/api/messages', {
        receiverId: adminUser._id,
        content: newMessage.trim()
      });
      setMessages((prev) => {
        if (data._id && prev.some((m) => String(m._id) === String(data._id))) {
          return prev;
        }
        return [...prev, data];
      });
      setNewMessage('');
    } catch (err) {
      toast.error('Lỗi gửi tin', err.response?.data?.message || 'Không thể gửi tin nhắn lúc này.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ position: 'fixed', bottom: '30px', right: '30px', zIndex: 9999 }}>
      {isOpen && (
        <div
          className="bg-white shadow-lg rounded-4 overflow-hidden d-flex flex-column mb-3 position-relative"
          style={{ width: '350px', height: '450px', border: '1px solid #ddd', transition: 'opacity 0.3s' }}
        >
          <div className="bg-warning px-3 py-2 d-flex justify-content-between align-items-center shadow-sm">
            <div className="d-flex align-items-center gap-2">
              <div
                className="bg-white rounded-circle d-flex justify-content-center align-items-center fw-bold text-warning"
                style={{ width: '35px', height: '35px' }}
              >
                🎧
              </div>
              <div>
                <h6 className="fw-bold mb-0 text-dark">Hỗ trợ CSKH</h6>
                <small className="text-dark fw-bold" style={{ fontSize: '10px' }}>
                  ● Luôn luôn lắng nghe
                </small>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="btn btn-sm text-dark fs-5 fw-bold">
              ✕
            </button>
          </div>

          <div
            className="flex-grow-1 p-3 overflow-auto d-flex flex-column gap-2"
            style={{ backgroundColor: '#f4f4f4' }}
          >
            <div className="text-center mb-2">
              <small className="bg-secondary text-white px-2 py-1 rounded-pill" style={{ fontSize: '10px' }}>
                Trò chuyện với Admin
              </small>
            </div>
            {!adminUser?._id ? (
              <div className="text-center p-3 bg-white rounded-3 shadow-sm small text-muted">
                <p className="mb-1 fw-bold text-dark">Kênh CSKH chưa có nhân viên trực tuyến</p>
                {adminUser?.supportHotline && <div>Hotline: {adminUser.supportHotline}</div>}
                {adminUser?.supportEmail && <div>Email: {adminUser.supportEmail}</div>}
              </div>
            ) : (
              messages.map((m, idx) => {
                const isMine = String(m.sender?._id || m.sender) === String(currentUser?._id);
                return (
                  <div
                    key={m._id || idx}
                    ref={idx === messages.length - 1 ? scrollRef : null}
                    className={`d-flex ${isMine ? 'justify-content-end' : 'justify-content-start'}`}
                  >
                    <div
                      className={`p-2 rounded-3 shadow-sm ${isMine ? 'bg-warning text-dark' : 'bg-white text-dark'}`}
                      style={{
                        maxWidth: '80%',
                        fontSize: '14px',
                        borderRadius: isMine ? '15px 15px 0 15px' : '15px 15px 15px 0'
                      }}
                    >
                      {m.content}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form onSubmit={handleSendMessage} className="p-2 bg-white border-top d-flex gap-2">
            <input
              type="text"
              className="form-control rounded-pill bg-light border-0"
              placeholder={adminUser?._id ? 'Nhập tin nhắn...' : 'Chưa có nhân viên trực ban'}
              value={newMessage}
              disabled={!adminUser?._id || sending}
              onChange={(e) => setNewMessage(e.target.value)}
              style={{ fontSize: '14px' }}
            />
            <button
              type="submit"
              disabled={!adminUser?._id || sending || !newMessage.trim()}
              className="btn btn-warning rounded-circle fw-bold shadow-sm d-flex justify-content-center align-items-center"
              style={{ width: '40px', height: '40px' }}
            >
              ➤
            </button>
          </form>
        </div>
      )}

      <div className="position-absolute" style={{ bottom: '0', right: '0', width: '60px', height: '60px' }}>
        {!isOpen && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsHidden(true);
            }}
            className="position-absolute bg-white text-danger rounded-circle border shadow-sm d-flex justify-content-center align-items-center hover-scale"
            style={{
              top: '-5px',
              left: '-5px',
              width: '22px',
              height: '22px',
              fontSize: '12px',
              fontWeight: 'black',
              zIndex: 10,
              cursor: 'pointer'
            }}
            title="Tắt bong bóng Chat"
          >
            ✕
          </button>
        )}

        <div
          onClick={handleToggle}
          className="shadow-lg d-flex align-items-center justify-content-center w-100 h-100"
          style={{
            backgroundColor: '#ffc107',
            borderRadius: '50%',
            cursor: 'pointer',
            transition: 'transform 0.2s',
            border: '3px solid white'
          }}
          onMouseOver={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
          onMouseOut={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          title="Tư vấn chăm sóc khách hàng"
        >
          {isOpen ? (
            <span style={{ fontSize: '24px', fontWeight: 'bold' }}>✕</span>
          ) : (
            <span style={{ fontSize: '28px' }}>🎧</span>
          )}

          {!isOpen && (
            <span
              className="position-absolute bg-success border border-2 border-white rounded-circle"
              style={{ top: '2px', right: '2px', width: '15px', height: '15px' }}
            ></span>
          )}
        </div>
      </div>
    </div>
  );
};

export default FloatingAdminChat;
