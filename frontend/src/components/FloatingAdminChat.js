import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';

const FloatingAdminChat = () => {
    const navigate = useNavigate();
    
    
    const [isHidden, setIsHidden] = useState(false); 
    const [pos, setPos] = useState({ right: 30, bottom: 30 }); 
    const [isDragging, setIsDragging] = useState(false);
    
    const [isOpen, setIsOpen] = useState(false);
    const [adminUser, setAdminUser] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    
    const socket = useRef();
    const scrollRef = useRef();
    const dragInfo = useRef({ isDragging: false, startX: 0, startY: 0, startRight: 0, startBottom: 0, isClick: true });
    
    const currentUser = JSON.parse(localStorage.getItem('user'));
    const API_URL = process.env.REACT_APP_API_URL || 'https://haihand-marketplace.onrender.com';

    const isEmbedded = window.self !== window.top;
    const isAdmin = currentUser?.role === 'Admin';

    
    
    
    const handleMouseDown = (e) => {
        dragInfo.current = {
            isDragging: true,
            startX: e.clientX,
            startY: e.clientY,
            startRight: pos.right,
            startBottom: pos.bottom,
            isClick: true
        };
        setIsDragging(true);
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!dragInfo.current.isDragging) return;
            const deltaX = e.clientX - dragInfo.current.startX;
            const deltaY = e.clientY - dragInfo.current.startY;

            
            if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
                dragInfo.current.isClick = false;
            }

            
            let newRight = dragInfo.current.startRight - deltaX;
            let newBottom = dragInfo.current.startBottom - deltaY;

            
            if (newRight < 10) newRight = 10;
            if (newBottom < 10) newBottom = 10;
            
            if (newRight > window.innerWidth - 360) newRight = window.innerWidth - 360;
            if (newBottom > window.innerHeight - 500) newBottom = window.innerHeight - 500;

            setPos({ right: newRight, bottom: newBottom });
        };

        const handleMouseUp = () => {
            dragInfo.current.isDragging = false;
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    
    
    
    useEffect(() => {
        if (isAdmin || isEmbedded) return; 
        const fetchAdmin = async () => {
            try {
                const { data } = await axios.get(`${API_URL}/api/admin/contact`);
                setAdminUser(data);
            } catch (err) { console.error("Chưa có Admin CSKH"); }
        };
        fetchAdmin();
    }, [isAdmin, isEmbedded]);

    useEffect(() => {
        if (isOpen && currentUser && adminUser && !isEmbedded) {
            axios.get(`${API_URL}/api/messages/${currentUser._id}/${adminUser._id}`)
                .then(res => setMessages(res.data))
                .catch(err => console.log(err));

            socket.current = io(API_URL, { transports: ["websocket", "polling"] });
            socket.current.emit('addUser', currentUser._id);

            socket.current.on('getMessage', (data) => {
                if (data.senderId === adminUser._id) {
                    setMessages(prev => [...prev, { sender: data.senderId, content: data.text, createdAt: Date.now() }]);
                }
            });

            return () => socket.current.disconnect();
        }
    }, [isOpen, currentUser, adminUser, isEmbedded]);

    useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isOpen]);

    
    if (isAdmin || isEmbedded || isHidden) return null;

    const handleToggle = (e) => {
        if (!dragInfo.current.isClick) return; 

        if (!currentUser) {
            alert("Bác vui lòng đăng nhập để chat với Hỗ trợ viên nhé!");
            navigate('/login');
            return;
        }
        if (!adminUser) {
            alert("Hệ thống hiện tại chưa có Admin trực ban!");
            return;
        }
        setIsOpen(!isOpen);
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        const messageData = new FormData();
        messageData.append('senderId', currentUser._id);
        messageData.append('receiverId', adminUser._id);
        messageData.append('text', newMessage);

        try {
            const { data } = await axios.post(`${API_URL}/api/messages`, messageData);
            socket.current.emit('sendMessage', { senderId: currentUser._id, receiverId: adminUser._id, text: newMessage });
            setMessages(prev => [...prev, data]);
            setNewMessage('');
        } catch (err) { console.error("Lỗi gửi tin:", err); }
    };

    return (
        
        <div style={{ position: 'fixed', bottom: `${pos.bottom}px`, right: `${pos.right}px`, zIndex: 9999 }}>
            
            
            {isOpen && (
                <div className="bg-white shadow-lg rounded-4 overflow-hidden d-flex flex-column mb-3 position-relative" 
                     style={{ width: '350px', height: '450px', border: '1px solid #ddd', transition: 'opacity 0.3s' }}>
                    
                    <div className="bg-warning px-3 py-2 d-flex justify-content-between align-items-center shadow-sm">
                        <div className="d-flex align-items-center gap-2">
                            <div className="bg-white rounded-circle d-flex justify-content-center align-items-center fw-bold text-warning" style={{width:'35px', height:'35px'}}>🎧</div>
                            <div>
                                <h6 className="fw-bold mb-0 text-dark">Hỗ trợ CSKH</h6>
                                <small className="text-dark fw-bold" style={{fontSize: '10px'}}>● Luôn luôn lắng nghe</small>
                            </div>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="btn btn-sm text-dark fs-5 fw-bold">✕</button>
                    </div>

                    <div className="flex-grow-1 p-3 overflow-auto d-flex flex-column gap-2" style={{ backgroundColor: '#f4f4f4' }}>
                        <div className="text-center mb-2"><small className="bg-secondary text-white px-2 py-1 rounded-pill" style={{fontSize: '10px'}}>Trò chuyện với Admin</small></div>
                        {messages.map((m, idx) => (
                            <div key={idx} ref={scrollRef} className={`d-flex ${m.sender === currentUser._id ? 'justify-content-end' : 'justify-content-start'}`}>
                                <div className={`p-2 rounded-3 shadow-sm ${m.sender === currentUser._id ? 'bg-warning text-dark' : 'bg-white text-dark'}`} style={{ maxWidth: '80%', fontSize: '14px', borderRadius: m.sender === currentUser._id ? '15px 15px 0 15px' : '15px 15px 15px 0' }}>
                                    {m.content}
                                </div>
                            </div>
                        ))}
                    </div>

                    <form onSubmit={handleSendMessage} className="p-2 bg-white border-top d-flex gap-2">
                        <input type="text" className="form-control rounded-pill bg-light border-0" placeholder="Nhập tin nhắn..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)} style={{ fontSize: '14px' }} />
                        <button type="submit" className="btn btn-warning rounded-circle fw-bold shadow-sm d-flex justify-content-center align-items-center" style={{width: '40px', height: '40px'}}>➤</button>
                    </form>
                </div>
            )}

            
            <div className="position-absolute" style={{ bottom: '0', right: '0', width: '60px', height: '60px' }}>
                
                
                {!isOpen && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); setIsHidden(true); }}
                        className="position-absolute bg-white text-danger rounded-circle border shadow-sm d-flex justify-content-center align-items-center hover-scale"
                        style={{ 
                            top: '-5px', left: '-5px', width: '22px', height: '22px', 
                            fontSize: '12px', fontWeight: 'black', zIndex: 10, cursor: 'pointer' 
                        }}
                        title="Tắt bong bóng Chat"
                    >
                        ✕
                    </button>
                )}

                
                <div 
                    onMouseDown={handleMouseDown}
                    onClick={handleToggle}
                    className="shadow-lg d-flex align-items-center justify-content-center w-100 h-100"
                    style={{
                        backgroundColor: '#ffc107', 
                        borderRadius: '50%',
                        cursor: isDragging ? 'grabbing' : 'grab', 
                        transition: isDragging ? 'none' : 'transform 0.2s', 
                        border: '3px solid white'
                    }}
                    onMouseOver={(e) => !isDragging && (e.currentTarget.style.transform = 'scale(1.1)')}
                    onMouseOut={(e) => !isDragging && (e.currentTarget.style.transform = 'scale(1)')}
                    title="Kéo thả để di chuyển, click để Chat"
                >
                    {isOpen ? <span style={{ fontSize: '24px', fontWeight: 'bold' }}>✕</span> : <span style={{ fontSize: '28px' }}>🎧</span>}
                    
                    {!isOpen && <span className="position-absolute bg-success border border-2 border-white rounded-circle" style={{ top: '2px', right: '2px', width: '15px', height: '15px' }}></span>}
                </div>
            </div>

        </div>
    );
};

export default FloatingAdminChat;