import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosClient from '../api/axiosClient';
import { useToast } from './Toast';

const currentAccount = () => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
};

export default function FloatingAdminChat() {
    const navigate = useNavigate();
    const toast = useToast();
    const [user, setUser] = useState(currentAccount);
    const [isOpen, setIsOpen] = useState(false);
    const [hidden, setHidden] = useState(false);
    const [conversation, setConversation] = useState({ status: 'none', messages: [] });
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const endRef = useRef(null);
    const sendVersion = useRef(0);
    const embedded = window.self !== window.top;

    const refresh = useCallback(async () => {
        if (!user?.token) return;
        const version = sendVersion.current;
        try {
            const { data } = await axiosClient.get('/api/support/conversation');
            if (version !== sendVersion.current) return;
            setConversation(data);
            setError('');
        } catch (cause) {
            setError(cause.response?.data?.message || 'Không tải được hội thoại hỗ trợ.');
        }
    }, [user?.token]);

    useEffect(() => {
        const update = () => setUser(currentAccount());
        window.addEventListener('userUpdated', update);
        return () => window.removeEventListener('userUpdated', update);
    }, []);

    useEffect(() => {
        if (!isOpen || !user?.token) return;
        void refresh();
        const timer = setInterval(() => { void refresh(); }, 10000);
        return () => clearInterval(timer);
    }, [isOpen, user?.token, refresh]);

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [conversation.messages, isOpen]);

    const send = useCallback(async (content) => {
        const text = content.trim();
        if (!text || busy) return;
        sendVersion.current += 1;
        setBusy(true); setError('');
        try {
            const { data } = await axiosClient.post('/api/support/messages', { content: text });
            setConversation(data);
            setDraft('');
        } catch (cause) {
            setError(cause.response?.data?.message || 'Chưa gửi được yêu cầu. Vui lòng thử lại.');
            setDraft(text);
        } finally { setBusy(false); }
    }, [busy]);

    useEffect(() => {
        const handoff = (event) => {
            if (!user?.token) {
                toast.warning('Yêu cầu đăng nhập', 'Vui lòng đăng nhập để gửi yêu cầu tư vấn.');
                navigate('/login');
                return;
            }
            setHidden(false);
            setIsOpen(true);
            void send(event.detail?.message || 'Tôi muốn được tư vấn trực tiếp.');
        };
        window.addEventListener('haihand:open-support', handoff);
        return () => window.removeEventListener('haihand:open-support', handoff);
    }, [user?.token, send, navigate, toast]);

    if (embedded || user?.role === 'Admin' || hidden) return null;

    const toggle = () => {
        if (!user?.token) {
            toast.warning('Yêu cầu đăng nhập', 'Vui lòng đăng nhập để xem hội thoại hỗ trợ.');
            navigate('/login');
            return;
        }
        setIsOpen(value => !value);
    };

    return <div style={{ position: 'fixed', bottom: 30, right: 30, zIndex: 9999 }}>
        {isOpen && <div className="bg-white shadow-lg rounded-4 overflow-hidden d-flex flex-column mb-3" style={{ width: 350, maxWidth: 'calc(100vw - 40px)', height: 450, maxHeight: '70vh', border: '1px solid #ddd' }}>
            <div className="bg-warning px-3 py-2 d-flex justify-content-between align-items-center">
                <div><strong>🎧 Hỗ trợ CSKH</strong><div style={{ fontSize: 12 }}>{conversation.status === 'pending' ? 'Đang chờ tư vấn viên phản hồi' : conversation.status === 'active' ? 'Tư vấn viên đã tiếp nhận' : 'Gửi câu hỏi để được tư vấn'}</div></div>
                <button type="button" onClick={() => setIsOpen(false)} className="btn btn-sm" aria-label="Đóng hỗ trợ">✕</button>
            </div>
            <div className="flex-grow-1 p-3 overflow-auto d-flex flex-column gap-2" style={{ background: '#f4f4f4' }}>
                {conversation.messages.map((message, index) => <div key={index} className={`d-flex ${message.sender === 'customer' ? 'justify-content-end' : 'justify-content-start'}`}>
                    <div className={`p-2 rounded-3 shadow-sm ${message.sender === 'customer' ? 'bg-warning' : 'bg-white'}`} style={{ maxWidth: '85%', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.content}</div>
                </div>)}
                <div ref={endRef} />
            </div>
            {error && <div role="alert" className="text-danger small px-3">{error}</div>}
            <form onSubmit={(event) => { event.preventDefault(); void send(draft); }} className="p-2 border-top d-flex gap-2">
                <input className="form-control rounded-pill" value={draft} onChange={event => setDraft(event.target.value)} maxLength={2000} placeholder="Nhập tin nhắn..." />
                <button className="btn btn-warning rounded-circle" disabled={busy || !draft.trim()} aria-label="Gửi tin nhắn">➤</button>
            </form>
        </div>}
        <button type="button" onClick={toggle} className="shadow-lg border border-3 border-white rounded-circle" style={{ width: 60, height: 60, background: '#ffc107', fontSize: 27 }} aria-label="Mở hỗ trợ CSKH">🎧</button>
        {!isOpen && <button type="button" onClick={() => setHidden(true)} className="position-absolute rounded-circle bg-white border" style={{ right: 42, bottom: 42, width: 22, height: 22, fontSize: 12 }} aria-label="Ẩn bong bóng CSKH">✕</button>}
    </div>;
}
