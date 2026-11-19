import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// Tự động gắn Bearer JWT token vào mọi request axios toàn cục
axios.interceptors.request.use((config) => {
  try {
    const stored = localStorage.getItem('user');
    const user = stored && stored !== 'undefined' ? JSON.parse(stored) : null;
    const token =
      user?.token ||
      localStorage.getItem('token') ||
      localStorage.getItem('haipay_token');
    if (token && !config.headers?.Authorization) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (e) {}
  return config;
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);


reportWebVitals();
