import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage'; 
import CreatePostPage from './pages/CreatePostPage';
import ProductDetailPage from './pages/ProductDetailPage';
import ProfilePage from './pages/ProfilePage';
import ChatPage from './pages/ChatPage'; 
import InboxPage from './pages/InboxPage'; 
import FavoritesPage from './pages/FavoritesPage';
import CartPage from './pages/CartPage';
import EditPostPage from './pages/EditPostPage';
import PaymentResultPage from './pages/PaymentResultPage';
import HaiPayPage from './pages/HaiPayPage';
import HaiPayResult from './pages/HaiPayResult';
import PublicProfile from './pages/PublicProfile';
import FollowPage from './pages/FollowPage';
import ProductListPage from './pages/ProductListPage';
import FloatingAdminChat from './components/FloatingAdminChat';
import TermsPage from './pages/TermsPage';
import PrivacyPage from './pages/PrivacyPage';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/create-post" element={<CreatePostPage />} />
          <Route path="/post/:id" element={<ProductDetailPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/edit-post/:id" element={<EditPostPage />} />
          <Route path="/payment-result" element={<PaymentResultPage />} />
          <Route path="/haipay" element={<HaiPayPage />} />
          <Route path="/haipay-result" element={<HaiPayResult />} />
          <Route path="/public-profile/:userId" element={<PublicProfile />} />
          <Route path="/products" element={<ProductListPage />} />
          <Route path="/followed/followed" element={<FollowPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
        </Routes>

        
        <FloatingAdminChat />
      </div>
    </Router>
  );
}

export default App;