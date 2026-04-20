import React from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';

const PrivacyPage = () => {
  return (
    <div className="bg-light min-vh-100 d-flex flex-column">
      <Header />
      
      <div className="container py-5 flex-grow-1">
        <div className="bg-white p-4 p-md-5 rounded-4 shadow-sm">
          <h2 className="fw-bold text-warning mb-4 border-start border-4 border-warning ps-3">Chính Sách Bảo Mật</h2>
          
          <div className="text-secondary" style={{ lineHeight: '1.8' }}>
            <p>Tại <strong>HaiHand Marketplace</strong>, chúng tôi coi trọng quyền riêng tư và bảo mật dữ liệu của bạn. Chính sách này giải thích cách chúng tôi thu thập, sử dụng và bảo vệ thông tin cá nhân của người dùng.</p>
            
            <h5 className="fw-bold text-dark mt-4">1. Thu thập thông tin</h5>
            <p>Chúng tôi thu thập các thông tin sau khi bạn đăng ký và sử dụng dịch vụ:</p>
            <ul>
              <li>Thông tin cá nhân: Họ tên, email, số điện thoại, ảnh đại diện.</li>
              <li>Thông tin giao dịch: Lịch sử đăng tin, tin đã lưu, lịch sử ví HaiPay.</li>
              <li>Thông tin hệ thống: Địa chỉ IP, loại trình duyệt để tối ưu hóa trải nghiệm.</li>
            </ul>

            <h5 className="fw-bold text-dark mt-4">2. Sử dụng thông tin</h5>
            <p>Thông tin của bạn được sử dụng vào các mục đích:</p>
            <ul>
              <li>Xác thực tài khoản và hỗ trợ các tính năng mua bán (Chat, Đăng tin).</li>
              <li>Cải thiện giao diện và tính năng của website.</li>
              <li>Gửi các thông báo quan trọng liên quan đến tài khoản hoặc hệ thống.</li>
            </ul>

            <h5 className="fw-bold text-dark mt-4">3. Chia sẻ dữ liệu</h5>
            <p>HaiHand cam kết <strong>KHÔNG</strong> bán, trao đổi hoặc chia sẻ thông tin cá nhân của bạn cho bất kỳ bên thứ ba nào vì mục đích thương mại. Thông tin chỉ được cung cấp cho cơ quan chức năng khi có yêu cầu hợp pháp theo quy định của pháp luật.</p>

            <h5 className="fw-bold text-dark mt-4">4. Quyền của người dùng</h5>
            <p>Bạn có quyền truy cập, chỉnh sửa hoặc yêu cầu xóa dữ liệu cá nhân của mình bất kỳ lúc nào thông qua mục "Quản lý cá nhân" hoặc liên hệ với bộ phận hỗ trợ của chúng tôi.</p>

            <p className="mt-4 text-muted small"><em>Mọi thắc mắc về chính sách bảo mật, vui lòng liên hệ: trietle@gmail.com.</em></p>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default PrivacyPage;