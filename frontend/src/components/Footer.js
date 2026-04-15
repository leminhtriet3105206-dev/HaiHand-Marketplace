import React from 'react';
import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="bg-dark text-white pt-5 pb-3 mt-auto">
      <div className="container">
        <div className="row g-4">
          {/* Cột 1: Giới thiệu & Thương hiệu */}
          <div className="col-lg-4 col-md-6">
            <h3 className="fw-bold text-warning mb-3">HaiHand</h3>
            <p className="text-secondary small" style={{ lineHeight: '1.8' }}>
              Hệ thống Marketplace hàng đầu dành cho cộng đồng mua bán đồ cũ. 
              Chúng tôi kết nối người bán và người mua một cách an toàn, nhanh chóng và tin cậy.
            </p>
            <div className="d-flex gap-3 mt-4">
              <span className="fs-4 cursor-pointer">🔵</span> {/* Facebook Icon */}
              <span className="fs-4 cursor-pointer">🔴</span> {/* YouTube Icon */}
              <span className="fs-4 cursor-pointer">🟣</span> {/* Instagram Icon */}
            </div>
          </div>

          {/* Cột 2: Liên kết nhanh */}
          <div className="col-lg-2 col-md-6">
            <h6 className="fw-bold mb-4 text-uppercase" style={{ letterSpacing: '1px' }}>Khám phá</h6>
            <ul className="list-unstyled">
              <li className="mb-2"><Link to="/" className="text-secondary text-decoration-none hover-text-warning">Trang chủ</Link></li>
              <li className="mb-2"><Link to="/categories" className="text-secondary text-decoration-none hover-text-warning">Danh mục</Link></li>
              <li className="mb-2"><Link to="/create-post" className="text-secondary text-decoration-none hover-text-warning">Đăng tin ngay</Link></li>
              <li className="mb-2"><Link to="/faq" className="text-secondary text-decoration-none hover-text-warning">Câu hỏi thường gặp</Link></li>
            </ul>
          </div>

          {/* Cột 3: Thông tin liên hệ (Dữ liệu từ ảnh của bác) */}
          <div className="col-lg-3 col-md-6">
            <h6 className="fw-bold mb-4 text-uppercase" style={{ letterSpacing: '1px' }}>Liên hệ hỗ trợ</h6>
            <ul className="list-unstyled">
              <li className="mb-3 d-flex align-items-start gap-2">
                <span className="text-warning">📞</span>
                <span className="text-secondary">(+84) 934 332 300</span> {/* */}
              </li>
              <li className="mb-3 d-flex align-items-start gap-2">
                <span className="text-warning">✉️</span>
                <span className="text-secondary">trietle@gmail.com</span> {/* */}
              </li>
              <li className="mb-3 d-flex align-items-start gap-2">
                <span className="text-warning">📍</span>
                <span className="text-secondary">123 Đường 3/2, Q.10, TP.HCM</span> {/* */}
              </li>
            </ul>
          </div>

          {/* Cột 4: Chứng nhận uy tín */}
          <div className="col-lg-3 col-md-6 text-center text-lg-start">
            <h6 className="fw-bold mb-4 text-uppercase" style={{ letterSpacing: '1px' }}>Chứng nhận</h6>
            <div className="bg-secondary bg-opacity-10 p-3 rounded-3 border border-secondary border-opacity-25">
               <div className="fw-bold text-warning mb-1">HAIHAND TRUSTED</div>
               <div className="small text-secondary mb-3">Sàn thương mại điện tử đã được xác thực uy tín 100%</div>
               <img 
                 src="https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/Logo_bo_cong_thuong.svg/1200px-Logo_bo_cong_thuong.svg.png" 
                 alt="Bộ Công Thương" 
                 style={{ height: '45px', filter: 'brightness(0) invert(1)' }}
               />
            </div>
          </div>
        </div>

        <hr className="my-5 border-secondary opacity-25" />

        {/* Bottom Strip */}
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-center gap-3">
          <p className="text-secondary small mb-0">© 2026 HaiHand Marketplace. Bản quyền thuộc về Lê Minh Triết.</p>
          <div className="d-flex gap-4 small">
            <Link to="/terms" className="text-secondary text-decoration-none">Điều khoản</Link>
            <Link to="/privacy" className="text-secondary text-decoration-none">Bảo mật</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;