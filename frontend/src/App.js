import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import { ConfirmProvider } from './components/ConfirmModal';
import RequireAuth from './components/RequireAuth';

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

// Admin Components
import AdminLayout from './pages/admin/AdminLayout';
import AdminProtectedRoute from './components/AdminProtectedRoute';
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminProducts from './pages/admin/AdminProducts';
import AdminOrders from './pages/admin/AdminOrders';

import TermsPage from './pages/TermsPage';
import PrivacyPage from './pages/PrivacyPage';
import HelpCenterPage from './pages/HelpCenterPage';
import SafeBuyingGuidePage from './pages/SafeBuyingGuidePage';
import DisputeResolutionPage from './pages/DisputeResolutionPage';
import FAQPage from './pages/FAQPage';
import AboutPage from './pages/AboutPage';
import CareersPage from './pages/CareersPage';
import CommunityStandardsPage from './pages/CommunityStandardsPage';
import EnvironmentalImpactPage from './pages/EnvironmentalImpactPage';
import FeeStructurePage from './pages/FeeStructurePage';

function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <Router>
          <div className="App">
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/post/:id" element={<ProductDetailPage />} />
            <Route path="/products" element={<ProductListPage />} />
            <Route path="/public-profile/:userId" element={<PublicProfile />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/help-center" element={<HelpCenterPage />} />
            <Route path="/safe-buying-guide" element={<SafeBuyingGuidePage />} />
            <Route path="/dispute-resolution" element={<DisputeResolutionPage />} />
            <Route path="/faq" element={<FAQPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/careers" element={<CareersPage />} />
            <Route path="/community-standards" element={<CommunityStandardsPage />} />
            <Route path="/environmental-impact" element={<EnvironmentalImpactPage />} />
            <Route path="/fee-structure" element={<FeeStructurePage />} />

            {/* Protected routes - require login */}
            <Route path="/create-post" element={<RequireAuth><CreatePostPage /></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
            <Route path="/chat" element={<RequireAuth><ChatPage /></RequireAuth>} />
            <Route path="/inbox" element={<RequireAuth><InboxPage /></RequireAuth>} />
            <Route path="/favorites" element={<RequireAuth><FavoritesPage /></RequireAuth>} />
            <Route path="/cart" element={<RequireAuth><CartPage /></RequireAuth>} />
            <Route path="/edit-post/:id" element={<RequireAuth><EditPostPage /></RequireAuth>} />
            <Route path="/payment-result" element={<RequireAuth><PaymentResultPage /></RequireAuth>} />
            <Route path="/haipay" element={<RequireAuth><HaiPayPage /></RequireAuth>} />
            <Route path="/haipay-result" element={<RequireAuth><HaiPayResult /></RequireAuth>} />
            <Route path="/followed/followed" element={<RequireAuth><FollowPage /></RequireAuth>} />
          </Routes>

          {/* Admin Routes */}
          <Routes>
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminProtectedRoute />}>
                <Route element={<AdminLayout />}>
                    <Route index element={<AdminDashboard />} />
                    <Route path="users" element={<AdminUsers />} />
                    <Route path="products" element={<AdminProducts />} />
                    <Route path="orders" element={<AdminOrders />} />
                </Route>
            </Route>
          </Routes>

          
          <FloatingAdminChat />
        </div>
        </Router>
      </ConfirmProvider>
    </ToastProvider>
  );
}

export default App;