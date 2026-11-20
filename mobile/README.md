# HaiHand Mobile (người mua)

Ứng dụng React Native + Expo SDK 58 chuyển giao diện người mua từ `stitch_haihand/`. Dữ liệu sản phẩm, tài khoản, giỏ hàng, đơn hàng, tin nhắn và thông báo lấy qua API Express hiện có. MongoDB được backend truy cập; ứng dụng không kết nối trực tiếp với database.

## Màn hình

| Nhóm | Route trong `src/app/` |
| --- | --- |
| Khám phá | `index`, `explore`, `product/[id]`, `image-search` |
| Mua hàng | `cart`, `checkout`, `payment-status`, `orders`, `favorites` |
| Trò chuyện | `inbox`, `chat/[userId]`, `notifications` |
| Tài khoản | `account`, `profile/index`, `profile/edit`, `user/[id]`, `following`, `change-password` |
| Xác thực | `login`, `register`, `forgot-password`, `reset-password` |

`src/app/` chứa màn hình và điều hướng. `src/api/client.ts` tập trung địa chỉ API, kiểu dữ liệu và hàm `request`. `src/auth/SessionContext.tsx` lưu phiên đăng nhập bằng SecureStore trên Android/iOS, localStorage khi xem trên web. `src/components/` là các thành phần giao diện dùng chung; `src/screens/` chứa Trang chủ; `src/theme.ts` giữ màu theo Stitch. `assets/` chứa ảnh giao diện và thương hiệu.

`src/components/Header.tsx` có `Header` cho trang có tiêu đề và `HomeHeader` cho thanh tìm kiếm, giỏ hàng, tin nhắn ở Trang chủ. `src/components/Footer.tsx` có `Footer` là thanh điều hướng 5 mục. `Screen` trong `src/components/ui.tsx` tự dùng chúng: truyền `title` để hiện header, truyền `tab` để hiện footer. Trang chủ dùng `HomeHeader` và `Footer` trực tiếp vì bố cục đầu trang khác các trang còn lại.

## Chuẩn bị backend và database

1. Tại thư mục `backend`, cài package bằng `npm install` nếu chưa có. Tạo `backend/.env` theo `backend/.env.example`, điền MongoDB URI và JWT secret. Backend mặc định chạy ở cổng 4000. Chạy `npm start` hoặc lệnh start trong `backend/package.json`.
2. Kiểm tra `http://localhost:4000/api/categories` trả về danh mục. Nếu backend đã chạy từ trước khi thay đổi mã, hãy khởi động lại để nhận bản sửa đăng nhập, OTP và hồ sơ.
   Nếu khi khởi động lại backend báo không kết nối được MongoDB Atlas, kiểm tra `MONGO_URI`, IP được phép trong Atlas và kết nối mạng trước khi kiểm thử đăng nhập hay đặt hàng.
3. Luồng quên mật khẩu dùng email OTP từ backend (`/api/users/send-otp`, `/api/users/reset-password-otp`); phải cấu hình dịch vụ gửi email trong backend để nhận mã thật.
4. Tạo địa chỉ và đặt hàng dùng dữ liệu tỉnh, quận, phường và phí vận chuyển từ backend. Để demo tại máy mà chưa có GHN, đặt `SHIPPING_PROVIDER=mock` trong `backend/.env`. Khi giao hàng thật, đổi sang `SHIPPING_PROVIDER=ghn` và đặt `GHN_TOKEN`, `GHN_SHOP_ID` hợp lệ. Nếu `/api/shipping/provinces` trả 401 thì thông tin GHN đang bị từ chối. Tìm bằng ảnh cần LM Studio chạy với cấu hình backend.

## Chạy trên Android Studio Emulator (Windows)

1. Cài Android Studio và Android SDK, tạo máy ảo trong **More Actions → Virtual Device Manager → Create virtual device**, rồi bấm **Play** để mở. Đặt `ANDROID_HOME` trỏ đến Android SDK và thêm `platform-tools` vào `Path` nếu `adb --version` chưa chạy được. [Hướng dẫn chính thức của Expo](https://docs.expo.dev/workflow/android-studio-emulator/).
2. Mở PowerShell mới và chạy:

```powershell
cd 'D:\btap hk7\project\HaiHand-Marketplace\mobile'
npm install
npx expo start
```

3. Nhấn **A** trong terminal để Expo mở ứng dụng bằng Expo Go trên emulator. Hoặc chạy `npm run android`. Android emulator thường truy cập backend trên máy host qua `http://10.0.2.2:4000`. [Expo: Start developing](https://docs.expo.dev/get-started/start-developing/).

Nếu Trang chủ báo không kết nối được `10.0.2.2:4000`, dùng cấu hình cục bộ `mobile/.env.local` với `EXPO_PUBLIC_API_URL=http://127.0.0.1:4000`. Trước khi chạy Expo, mở PowerShell và chuyển tiếp cổng bằng `adb reverse tcp:4000 tcp:4000`. Máy ảo sẽ dùng `127.0.0.1:4000` để tới backend trên Windows. Sau khi khởi động lại máy ảo hoặc ADB, chạy lại lệnh `adb reverse`. Đóng Expo cũ bằng Ctrl+C rồi chạy `npx expo start` và nhấn A.

Nếu backend chạy cổng/host khác, tạo `mobile/.env` theo `.env.example`, ví dụ `EXPO_PUBLIC_API_URL=http://10.0.2.2:4000`, rồi khởi động lại Expo. Trên điện thoại Android thật, thay `10.0.2.2` bằng địa chỉ IP LAN của máy tính, bảo đảm điện thoại và máy tính cùng mạng và firewall cho phép cổng backend.

Có thể xem trước bằng `npm run web`; web dùng `http://localhost:4000` khi chưa đặt `EXPO_PUBLIC_API_URL`. Để kiểm tra mã: `npx tsc --noEmit`, `npx expo lint`, `npx expo export --platform android --output-dir dist-android`.

## Những điểm cần kiểm thử bằng tài khoản thật

- Đăng ký, đăng nhập và khôi phục mật khẩu OTP cần email backend hoạt động.
- Checkout hiển thị tiền sản phẩm, phí vận chuyển theo từng người bán và tổng tiền trước khi xác nhận. Nếu không tính được phí, cần thử lại trước khi đặt hàng. COD và VNPAY cần cấu hình vận chuyển/thanh toán tương ứng. HaiPay tạm ẩn vì mobile chưa có luồng kích hoạt ví. Chế độ `mock` giúp xem luồng đặt hàng khi chưa có GHN; nó không tạo vận đơn thật.
- VNPAY mở trình duyệt ngoài. Màn `payment-status` kiểm tra trạng thái đơn hàng từ backend khi quay lại app hoặc bấm kiểm tra lại; chỉ đơn đã chuyển sang `escrow`/`released` mới được báo đã thanh toán. Nếu backend chưa xác nhận, tiếp tục hiển thị chờ xác nhận. Callback vẫn do website/backend hiện có xử lý.
- Tin nhắn dùng REST, chỉ kiểm tra tin chưa đọc mỗi 15 giây khi màn chat đang mở và app ở foreground; lịch sử được tải lại khi cần. Mobile chưa dùng Socket.IO như bản web.
- Bản phát hành bắt buộc `EXPO_PUBLIC_API_URL` trỏ tới máy chủ HTTPS. Địa chỉ HTTP mặc định chỉ dành cho Expo khi phát triển trong mạng nội bộ.
- Bộ canvas có thể chỉnh sửa cho Hộp thư, Chat, Thông báo, Tài khoản: `designs/haihand-buyer-mobile/`.

## Mở máy ảo bằng Quick Boot

Từ thư mục gốc dự án, chạy `.\Start-HaiHand-Mobile.ps1`. Script mở AVD `HaiHand_API33` bằng Quick Boot, chờ Android khởi động xong rồi tự chạy `npx expo start --go --android` trong thư mục `mobile` để mở app bằng Expo Go. Script không chạy Docker hoặc backend; hãy bật chúng riêng khi cần. Giữ cửa sổ PowerShell mở trong lúc dùng app và nhấn Ctrl+C để dừng Expo.

Nếu đáy cửa sổ máy ảo bị thanh taskbar che, kéo một góc cửa sổ vào trong để thu nhỏ. Emulator tự giữ đúng tỉ lệ màn hình điện thoại.
