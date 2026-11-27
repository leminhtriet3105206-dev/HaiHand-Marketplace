import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext({ socket: null, onlineUsers: [] });
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);

  useEffect(() => {
    if (!user?._id || !user?.token) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      setOnlineUsers([]);
      return;
    }

    const newSocket = io(API_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      auth: { token: user.token }
    });

    const handlePresenceSync = ({ onlineUserIds } = {}) => {
      if (Array.isArray(onlineUserIds)) {
        setOnlineUsers(onlineUserIds.map(String));
      }
    };

    const handlePresenceUpdate = ({ userId, online } = {}) => {
      if (!userId) return;
      const uid = String(userId);
      setOnlineUsers((prev) => {
        if (online) {
          return prev.includes(uid) ? prev : [...prev, uid];
        }
        return prev.filter((id) => id !== uid);
      });
    };

    newSocket.on('presence:sync', handlePresenceSync);
    newSocket.on('presence:update', handlePresenceUpdate);

    setSocket(newSocket);

    return () => {
      newSocket.off('presence:sync', handlePresenceSync);
      newSocket.off('presence:update', handlePresenceUpdate);
      newSocket.disconnect();
      setSocket(null);
    };
  }, [user?._id, user?.token]);

  return (
    <SocketContext.Provider value={{ socket, onlineUsers }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  return useContext(SocketContext) || { socket: null, onlineUsers: [] };
};

export default SocketContext;
