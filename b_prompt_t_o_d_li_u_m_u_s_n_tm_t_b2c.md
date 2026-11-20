# Bộ Prompt & Hướng Dẫn Tạo Dữ Liệu Giả Lập Sàn TMĐT B2C

Tài liệu này cung cấp cấu trúc dữ liệu (Schema) và các mẫu Prompt tối ưu để tạo ra bộ dữ liệu thương mại điện tử B2C hoàn chỉnh gồm:
- **200 Tài khoản người dùng** (Người mua & Người bán)
- **1.500 Sản phẩm** (Liên kết chặt chẽ với ID người bán)
- **300 Đơn hàng / Giao dịch** (Liên kết người mua, sản phẩm và tính toán đúng tổng tiền)

> **Lưu ý kỹ thuật về giới hạn của AI:** Các mô hình AI (LLM) thường giới hạn độ dài mỗi lần trả lời (khoảng 30–50 bản ghi JSON/lượt). Do đó, tài liệu này chia làm **2 phương pháp**:
> - **Phương pháp 1 (Khuyên dùng):** Dùng AI viết script Python để sinh toàn bộ 2.000 bản ghi chỉ trong 3 giây, đảm bảo chính xác 100% quan hệ dữ liệu.
> - **Phương pháp 2:** Dùng bộ Prompt chia lô (Batching) để yêu cầu AI sinh trực tiếp từng phần dữ liệu thô.

---

## 1. Cấu trúc dữ liệu chuẩn (Data Schema)

Dữ liệu được thiết kế theo mô hình quan hệ (Relational) để dễ dàng import vào SQL (MySQL, PostgreSQL) hoặc NoSQL (MongoDB) và JSON:

1. **Users (`users.json` - 200 bản ghi):**
   - `user_id`: String (`USR_001` đến `USR_200`)
   - `role`: String (`SELLER` chiếm ~15% [30 tài khoản], `BUYER` chiếm ~85% [170 tài khoản])
   - `full_name`: String (Họ tên tiếng Việt tự nhiên)
   - `email`: String (Duy nhất)
   - `phone`: String (Đầu số Việt Nam: 09x, 03x, 07x, 08x)
   - `address`: Object (`street`, `district`, `city`)
   - `shop_info`: Object hoặc `null` (Chỉ có nếu `role == SELLER`, gồm: `shop_name`, `rating`, `verified`)
   - `created_at`: ISO 8601 Timestamp

2. **Products (`products.json` - 1.500 bản ghi):**
   - `product_id`: String (`PRD_0001` đến `PRD_1500`)
   - `seller_id`: String (Khóa ngoại tham chiếu tới các `user_id` có `role == SELLER`)
   - `name`: String (Tên sản phẩm tiếng Việt thực tế theo ngành hàng)
   - `category`: String (VD: *Điện tử, Thời trang, Gia dụng, Mỹ phẩm, Sách & Văn phòng phẩm, Mẹ & Bé*)
   - `price`: Integer (VNĐ, làm tròn đến hàng nghìn)
   - `original_price`: Integer (Giá gốc >= `price`)
   - `stock`: Integer (0 - 500)
   - `sold_count`: Integer (0 - 2000)
   - `rating`: Float (3.5 - 5.0)
   - `attributes`: Object (Màu sắc, kích thước, thương hiệu, xuất xứ...)
   - `created_at`: ISO 8601 Timestamp

3. **Orders (`orders.json` - 300 bản ghi):**
   - `order_id`: String (`ORD_0001` đến `ORD_0300`)
   - `buyer_id`: String (Khóa ngoại tham chiếu tới `user_id` có `role == BUYER`)
   - `items`: Array of Objects (Mỗi đơn có từ 1–4 sản phẩm, gồm: `product_id`, `seller_id`, `product_name`, `quantity`, `unit_price`)
   - `subtotal`: Integer (Tổng tiền hàng = $\sum (\text{quantity} \times \text{unit\_price})$)
   - `shipping_fee`: Integer (15.000 - 45.000 VNĐ, hoặc 0 nếu miễn phí vận chuyển)
   - `total_amount`: Integer (`subtotal + shipping_fee`)
   - `payment_method`: String (`COD`, `MOMO`, `VNPAY`, `BANK_TRANSFER`, `CREDIT_CARD`)
   - `status`: String (`PENDING`, `PROCESSING`, `SHIPPING`, `DELIVERED`, `CANCELLED`, `RETURNED`)
   - `created_at`: ISO 8601 Timestamp (Phải lớn hơn hoặc bằng `created_at` của buyer và product)

---

## 2. Phương pháp 1: Prompt tạo Script Python sinh dữ liệu tự động (Nhanh & Chuẩn nhất)

Hãy copy đoạn prompt dưới đây dán vào AI (ChatGPT, Claude, Gemini) để nhận về một file code Python hoàn chỉnh. Khi chạy code, bạn sẽ có ngay 3 file dữ liệu chuẩn xác 100%.

~~~~text
Bạn là một Kỹ sư Dữ liệu (Data Engineer). Hãy viết cho tôi một script Python hoàn chỉnh, sạch sẽ và có thể chạy ngay (sử dụng thư viện `faker` với locale `vi_VN` kết hợp từ điển dữ liệu tiếng Việt tự định nghĩa để tên sản phẩm tự nhiên nhất) nhằm sinh ra bộ dữ liệu giả lập cho một sàn thương mại điện tử B2C.

Yêu cầu số lượng chính xác:
1. 200 tài khoản người dùng (`users.json` và `users.csv`):
   - 30 tài khoản có role = "SELLER" (kèm thông tin `shop_name`, `shop_rating`, `is_verified`).
   - 170 tài khoản có role = "BUYER".
   - Dữ liệu địa chỉ, số điện thoại, email, họ tên chuẩn Việt Nam, không trùng lặp email/số điện thoại.

2. 1.500 sản phẩm (`products.json` và `products.csv`):
   - Mỗi sản phẩm phải gắn với một `seller_id` hợp lệ từ danh sách 30 SELLER ở trên.
   - Tên sản phẩm phải đa dạng, thực tế theo 6 ngành hàng: Thời trang, Điện tử & Phụ kiện, Nhà cửa & Đời sống, Sức khỏe & Làm đẹp, Mẹ & Bé, Thể thao & Du lịch (hãy tạo danh sách từ khóa/mẫu tên phong phú để ghép tên tự nhiên, tránh lặp nhàm chán).
   - Giá bán (`price`) tính bằng VNĐ (bội số của 1.000), `original_price` >= `price`.

3. 300 đơn hàng/giao dịch (`orders.json` và `orders.csv`):
   - Mỗi đơn hàng gắn với một `buyer_id` hợp lệ từ danh sách 170 BUYER.
   - Mỗi đơn hàng chứa từ 1 đến 4 sản phẩm ngẫu nhiên từ danh sách 1.500 sản phẩm.
   - Tính toán chính xác `subtotal`, `shipping_fee`, và `total_amount` dựa trên giá và số lượng sản phẩm trong đơn.
   - Trạng thái đơn hàng phân bổ thực tế (ví dụ: 65% DELIVERED, 15% SHIPPING, 10% PROCESSING, 7% CANCELLED, 3% RETURNED).
   - Đảm bảo tính logic về thời gian: `created_at` của đơn hàng luôn diễn ra sau ngày tạo tài khoản của người mua và ngày đăng sản phẩm.

Yêu cầu đầu ra của code:
- Không cần gọi API bên ngoài, chạy hoàn toàn offline với Python 3.
- Xuất ra cả định dạng `.json` (UTF-8, indent=2) và `.csv` trong thư mục `./output_data/`.
- In ra màn hình thống kê kiểm tra tính toàn vẹn dữ liệu sau khi chạy xong (xác nhận không có khóa ngoại mồ côi, tổng số bản ghi khớp 200 - 1500 - 300).
~~~~

---

## 3. Phương pháp 2: Bộ Prompt sinh dữ liệu trực tiếp theo từng Lô (Batching)

Nếu bạn không muốn chạy code Python mà muốn AI trả trực tiếp dữ liệu JSON ngay trong khung chat, hãy chạy lần lượt các Prompt sau theo từng lô (mỗi lô 50 bản ghi để tránh bị ngắt giữa chừng).

### Bước 1: Sinh 200 Tài khoản (Chạy 4 lần, thay đổi `[X]` và `[Y]`)

* **Lần 1:** Tạo `USR_001` đến `USR_050` (trong đó có 30 SELLER từ `USR_001` đến `USR_030`, còn lại là BUYER).
* **Lần 2, 3, 4:** Tạo từ `USR_051` đến `USR_200` (100% là BUYER).

~~~~text
Hãy đóng vai trình tạo dữ liệu JSON. Hãy tạo giúp tôi danh sách 50 tài khoản người dùng B2C Việt Nam dưới định dạng JSON Array thuần túy (không kèm giải thích thừa), bắt đầu từ ID `USR_[X]` đến `USR_[Y]`.

Quy tắc:
- Nếu ID nằm trong khoảng `USR_001` đến `USR_030`: đặt `"role": "SELLER"` và thêm object `"shop_info": {"shop_name": "...", "rating": 4.8, "verified": true}`.
- Nếu ID từ `USR_031` trở đi: đặt `"role": "BUYER"` và `"shop_info": null`.
- Tên người Việt tự nhiên, địa chỉ tại các tỉnh thành Việt Nam (Hà Nội, TP.HCM, Đà Nẵng, Cần Thơ, Hải Phòng...), số điện thoại 10 số hợp lệ, email duy nhất.
- Định dạng trường: `user_id`, `role`, `full_name`, `email`, `phone`, `address` (`street`, `district`, `city`), `shop_info`, `created_at` (trong năm 2025).
~~~~

### Bước 2: Sinh 1.500 Sản phẩm (Chạy theo từng lô 50 sản phẩm)

* Lặp lại prompt dưới đây với dải ID tăng dần (`PRD_0001`–`PRD_0050`, `PRD_0051`–`PRD_0100`, ..., `PRD_1451`–`PRD_1500`).

~~~~text
Hãy tạo danh sách 50 sản phẩm thương mại điện tử B2C tại Việt Nam dưới định dạng JSON Array thuần túy, có `product_id` từ `PRD_[XXXX]` đến `PRD_[YYYY]`.

Quy tắc bắt buộc:
- `seller_id`: Chọn ngẫu nhiên từ `USR_001` đến `USR_030`.
- `category`: Phân bổ đều qua các nhóm: Thời trang, Điện tử, Gia dụng, Mỹ phẩm, Mẹ & Bé.
- `name`: Tên sản phẩm tiếng Việt hấp dẫn, thực tế như trên Shopee/Lazada (VD: "Áo Thun Nam Cotton Co Giãn 4 Chiều Form Rộng", "Tai Nghe Bluetooth Chống Ồn Chủ Động ANC Pro"...). Không trùng tên nhau.
- `price`: Số nguyên (VNĐ, chia hết cho 1000, từ 25.000 đến 15.000.000).
- `original_price`: Lớn hơn hoặc bằng `price` từ 10% đến 40%.
- `stock`: Số nguyên từ 0 đến 300.
- `sold_count`: Số nguyên từ 0 đến 1500.
- `rating`: Số thập phân từ 3.8 đến 5.0.
- `attributes`: Object chứa 2-3 thuộc tính phù hợp ngành hàng (VD: `color`, `size`, `brand`, `origin`).
- `created_at`: Timestamp trong khoảng tháng 01/2026 - 06/2026.
~~~~

### Bước 3: Sinh 300 Đơn hàng (Chạy 6 lần, mỗi lần 50 đơn hàng)

* Chạy từ `ORD_0001`–`ORD_0050` cho đến `ORD_0251`–`ORD_0300`.

~~~~text
Hãy tạo danh sách 50 đơn hàng/giao dịch B2C dưới định dạng JSON Array thuần túy, có `order_id` từ `ORD_[XXXX]` đến `ORD_[YYYY]`.

Quy tắc bắt buộc:
- `buyer_id`: Chọn ngẫu nhiên trong khoảng `USR_031` đến `USR_200`.
- `items`: Mảng chứa từ 1 đến 3 sản phẩm. Mỗi phần tử gồm: `product_id` (ngẫu nhiên từ `PRD_0001` đến `PRD_1500`), `seller_id` (từ `USR_001` đến `USR_030`), `product_name` (tên sản phẩm tiếng Việt phù hợp), `quantity` (1 đến 3), `unit_price` (VNĐ, chia hết cho 1000).
- `subtotal`: Phải bằng CHÍNH XÁC tổng của (`quantity` * `unit_price`) của các phần tử trong `items`.
- `shipping_fee`: Chọn một trong các giá trị: `0`, `15000`, `22000`, `30000`.
- `total_amount`: Phải bằng CHÍNH XÁC `subtotal + shipping_fee`.
- `payment_method`: Phân bổ ngẫu nhiên giữa `COD`, `MOMO`, `VNPAY`, `BANK_TRANSFER`.
- `status`: Phân bổ thực tế (đa số là `DELIVERED`, số ít là `SHIPPING`, `PROCESSING`, `CANCELLED`).
- `created_at`: Timestamp trong khoảng tháng 07/2026 - 11/2026.
~~~~

---

## 4. Checklist kiểm tra chất lượng dữ liệu (QA)

Sau khi tổng hợp dữ liệu, bạn nên kiểm tra nhanh 4 tiêu chí sau trước khi đưa vào hệ thống hoặc database:
1. **Tính duy nhất (Uniqueness):** Không có `user_id`, `email`, `product_id`, hoặc `order_id` nào bị trùng lặp.
2. **Toàn vẹn tham chiếu (Referential Integrity):** Mọi `seller_id` đều tồn tại trong bảng Users với vai trò `SELLER`; mọi `buyer_id` đều tồn tại với vai trò `BUYER`.
3. **Chính xác tài chính (Financial Accuracy):** Ở bảng Orders, `total_amount == subtotal + shipping_fee` trên 100% bản ghi.
4. **Định dạng mã hóa (Encoding):** Lưu file ở chuẩn `UTF-8` để không bị lỗi font tiếng Việt khi import vào Excel hoặc Database.