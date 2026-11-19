import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

const axiosClient = axios.create({
  baseURL: API_URL
});

axiosClient.interceptors.request.use((config) => {
  try {
    const stored = localStorage.getItem('user');
    const user = stored && stored !== 'undefined' ? JSON.parse(stored) : null;
    const token =
      user?.token ||
      localStorage.getItem('token') ||
      localStorage.getItem('haipay_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (e) { }
  return config;
});

export const persistUser = (user) => {
  if (!user) {
    localStorage.removeItem('user');
    window.dispatchEvent(new Event('userUpdated'));
    return;
  }
  const prev = (() => {
    try {
      const s = localStorage.getItem('user');
      return s && s !== 'undefined' ? JSON.parse(s) : {};
    } catch {
      return {};
    }
  })();
  const next = { ...prev, ...user };
  // M11: Không lưu walletBalance / pendingBalance / walletPin nhạy cảm trong localStorage
  delete next.walletBalance;
  delete next.pendingBalance;
  delete next.walletPin;
  if (user.token) next.token = user.token;
  else if (prev.token) next.token = prev.token;
  localStorage.setItem('user', JSON.stringify(next));
  window.dispatchEvent(new Event('userUpdated'));
  return { ...next, walletBalance: user.walletBalance, pendingBalance: user.pendingBalance };
};

export const getSellerEntryPath = (user) => {
  if (!user) return '/login';
  if (user.isSeller === true && user.sellerStatus === 'approved') return '/seller-channel';
  return '/register-seller';
};

export default axiosClient;
