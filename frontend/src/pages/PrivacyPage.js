import React from 'react';
import { AppHeader } from '../components/AppHeader';
import { AppFooter } from '../components/AppFooter';

const PrivacyPage = () => {
  return (
    <div className="flex flex-col min-h-screen bg-[#FFFBEB] font-sans text-[#1C1917]">
      <AppHeader />
      
      <div className="flex-1 w-full max-w-[900px] mx-auto px-4 py-12">
        <div className="bg-white p-8 md:p-12 rounded-3xl shadow-sm border border-stone-100">
          <div className="mb-10 text-center">
            <h1 className="text-3xl md:text-4xl font-black text-[#1C1917] mb-4">Chính sách bảo mật</h1>
            <div className="w-16 h-1 bg-[#EA580C] mx-auto rounded-full"></div>
          </div>
          
          <div className="space-y-8 text-stone-600 leading-relaxed text-sm md:text-base">
            <section>
              <p>
                Sự riêng tư của bạn là ưu tiên hàng đầu tại <strong className="text-[#EA580C]">HaiHand Marketplace</strong>. Chính sách bảo mật này giải thích cách chúng tôi thu thập, sử dụng và bảo vệ thông tin cá nhân của bạn khi bạn sử dụng nền tảng của chúng tôi.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#1C1917] mb-3 flex items-center gap-2">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-100 text-[#EA580C] text-sm">1</span>
                Thu thập thông tin
              </h2>
              <p className="mb-2">Chúng tôi có thể thu thập các thông tin sau từ bạn:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Thông tin cá nhân: Họ tên, số điện thoại, địa chỉ email, ảnh đại diện, địa chỉ nhận hàng.</li>
                <li>Thông tin giao dịch: Lịch sử mua bán, chi tiết đơn hàng, lịch sử nạp/rút tiền ví HaiPay.</li>
                <li>Thông tin thiết bị và cookie: Địa chỉ IP, loại trình duyệt, để cải thiện trải nghiệm người dùng.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#1C1917] mb-3 flex items-center gap-2">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-100 text-[#EA580C] text-sm">2</span>
                Sử dụng thông tin
              </h2>
              <p className="mb-2">Thông tin của bạn được sử dụng vào các mục đích:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Xác thực tài khoản và đảm bảo an toàn cho các giao dịch trên sàn.</li>
                <li>Hỗ trợ người mua và người bán kết nối, giao tiếp qua hệ thống chat nội bộ.</li>
                <li>Gửi thông báo về đơn hàng, tin nhắn mới, hoặc các chương trình khuyến mãi (nếu bạn đồng ý).</li>
                <li>Giải quyết tranh chấp và ngăn chặn các hành vi gian lận.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#1C1917] mb-3 flex items-center gap-2">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-100 text-[#EA580C] text-sm">3</span>
                Bảo vệ và chia sẻ thông tin
              </h2>
              <div className="space-y-4">
                <div className="bg-stone-50 p-4 rounded-xl border border-stone-200">
                  <h3 className="font-bold text-[#1C1917] mb-1">Cam kết bảo mật</h3>
                  <p>Chúng tôi áp dụng các biện pháp kỹ thuật và tổ chức nghiêm ngặt để bảo vệ dữ liệu của bạn khỏi việc truy cập trái phép, mất mát hoặc phá hủy.</p>
                </div>
                <div className="bg-stone-50 p-4 rounded-xl border border-stone-200">
                  <h3 className="font-bold text-[#1C1917] mb-1">Chia sẻ cho bên thứ ba</h3>
                  <p>HaiHand KHÔNG bán, trao đổi hoặc cho thuê thông tin cá nhân của bạn cho bất kỳ bên thứ ba nào vì mục đích tiếp thị. Chúng tôi chỉ chia sẻ thông tin (như địa chỉ, số điện thoại) với các đối tác vận chuyển và thanh toán để thực hiện đơn hàng, hoặc khi có yêu cầu hợp pháp từ cơ quan pháp luật.</p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#1C1917] mb-3 flex items-center gap-2">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-100 text-[#EA580C] text-sm">4</span>
                Quyền lợi của bạn
              </h2>
              <p>Bạn có quyền truy cập, chỉnh sửa, hoặc yêu cầu xóa dữ liệu cá nhân của mình bất kỳ lúc nào thông qua phần "Chỉnh sửa hồ sơ" trong trang cá nhân, hoặc liên hệ trực tiếp với đội ngũ hỗ trợ của chúng tôi.</p>
            </section>

            <div className="pt-8 mt-8 border-t border-stone-100 text-sm text-stone-400 italic text-center">
              Lần cập nhật cuối: Tháng 10/2026. Bằng việc tiếp tục sử dụng dịch vụ, bạn đồng ý với chính sách bảo mật này.
            </div>
          </div>
        </div>
      </div>

      <AppFooter />
    </div>
  );
};

export default PrivacyPage;