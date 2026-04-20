import React from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';

const TermsPage = () => {
  return (
    <div className="bg-light min-vh-100 d-flex flex-column">
      <Header />
      
      <div className="container py-5 flex-grow-1">
        <div className="bg-white p-4 p-md-5 rounded-4 shadow-sm">
          <h2 className="fw-bold text-warning mb-4 border-start border-4 border-warning ps-3">Điều Khoản Sử Dụng</h2>
          
          <div className="text-secondary" style={{ lineHeight: '1.8' }}>
            <p>Chào mừng bạn đến với <strong>HaiHand Marketplace</strong>. Khi sử dụng website của chúng tôi, bạn đồng ý tuân thủ các điều khoản dưới đây. Vui lòng đọc kỹ trước khi tham gia mua bán.</p>
            
            <h5 className="fw-bold text-dark mt-4">1. Quy định về tài khoản</h5>
            <ul>
              <li>Người dùng phải cung cấp thông tin chính xác khi đăng ký tài khoản.</li>
              <li>Bạn có trách nhiệm bảo mật thông tin đăng nhập và mật khẩu của mình.</li>
              <li>HaiHand có quyền khóa tài khoản nếu phát hiện hành vi gian lận, lừa đảo.</li>
            </ul>

            <h5 className="fw-bold text-dark mt-4">2. Quy định đăng tin</h5>
            <ul>
              <li>Chỉ đăng bán các sản phẩm hợp pháp, không thuộc danh mục hàng cấm theo quy định của pháp luật Việt Nam.</li>
              <li>Hình ảnh và mô tả sản phẩm phải trung thực, rõ ràng và đúng với tình trạng thực tế.</li>
              <li>Không đăng tin rác, tin trùng lặp hoặc sử dụng ngôn từ phản cảm.</li>
            </ul>

            <h5 className="fw-bold text-dark mt-4">3. Trách nhiệm của các bên</h5>
            <ul>
              <li><strong>Người bán:</strong> Đảm bảo chất lượng sản phẩm và giao hàng đúng như thỏa thuận.</li>
              <li><strong>Người mua:</strong> Kiểm tra kỹ thông tin sản phẩm và uy tín của người bán trước khi giao dịch.</li>
              <li><strong>HaiHand:</strong> Chúng tôi đóng vai trò là nền tảng kết nối. HaiHand không chịu trách nhiệm trực tiếp về chất lượng sản phẩm hay các tranh chấp phát sinh từ giao dịch cá nhân. Tuy nhiên, chúng tôi sẽ hỗ trợ cung cấp thông tin để giải quyết tranh chấp khi cần thiết.</li>
            </ul>

            <p className="mt-4 text-muted small"><em>Lần cập nhật cuối: Tháng 4/2026. HaiHand có quyền thay đổi điều khoản bất kỳ lúc nào mà không cần báo trước.</em></p>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default TermsPage;