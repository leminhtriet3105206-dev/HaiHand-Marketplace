"""Build the portable PowerPoint copy of the Claude Slides presentation."""

from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.util import Inches, Pt


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "HaiHand_Phan_tich_chuc_nang_AI.pptx"
NAVY = RGBColor(23, 42, 67)
TEAL = RGBColor(22, 139, 137)
MINT = RGBColor(103, 211, 200)
WHITE = RGBColor(255, 255, 255)
INK = RGBColor(23, 42, 67)
PALE = RGBColor(247, 249, 252)
LINE = RGBColor(216, 224, 235)
MUTED = RGBColor(82, 101, 128)
CREAM = RGBColor(249, 237, 216)

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)


def rect(slide, x, y, w, h, fill, radius=False, line=None):
    shape = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE,
        Inches(x), Inches(y), Inches(w), Inches(h)
    )
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    shape.line.fill.background() if line is None else None
    if line is not None:
        shape.line.color.rgb = line
    return shape


def txt(slide, value, x, y, w, h, size=24, color=INK, bold=False, align=PP_ALIGN.LEFT):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.clear()
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = Inches(0.02)
    tf.margin_top = tf.margin_bottom = Inches(0.02)
    for n, line in enumerate(value.split("\n")):
        p = tf.paragraphs[0] if n == 0 else tf.add_paragraph()
        p.text = line
        p.alignment = align
        p.space_after = Pt(5)
        p.font.name = "Arial"
        p.font.size = Pt(size)
        p.font.bold = bold
        p.font.color.rgb = color
    return box


def base(section, title, number, dark=False):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    rect(slide, 0, 0, 13.333, 7.5, NAVY if dark else PALE)
    txt(slide, section, .75, .52, 11.7, .34, 15, MINT if dark else TEAL, True)
    txt(slide, title, .75, 1.02, 11.85, .85, 34, WHITE if dark else INK, True)
    txt(slide, f"HaiHand Marketplace · {number:02d}", .76, 7.08, 11.8, .28, 12,
        RGBColor(181, 197, 211) if dark else MUTED)
    return slide


def card(slide, title, body, x, y, w, h, dark=False, title_size=21, body_size=17):
    rect(slide, x, y, w, h, RGBColor(36, 64, 92) if dark else WHITE, True,
         None if dark else LINE)
    txt(slide, title, x+.22, y+.20, w-.44, .38, title_size, MINT if dark else TEAL, True)
    txt(slide, body, x+.22, y+.73, w-.44, h-.88, body_size, WHITE if dark else INK)


def banner(slide, body, y, dark=False):
    rect(slide, .75, y, 11.83, .72, CREAM if dark else RGBColor(230, 244, 242), True)
    txt(slide, body, .95, y+.12, 11.4, .52, 18, INK)


# 1. Cover
s = prs.slides.add_slide(prs.slide_layouts[6])
rect(s, 0, 0, 13.333, 7.5, NAVY)
txt(s, "HAIHAND MARKETPLACE · AI INTEGRATION", .85, .8, 11.4, .4, 18, MINT, True)
txt(s, "Phân tích chức năng\ntích hợp AI", .85, 2.1, 11.5, 2.0, 46, WHITE, True)
txt(s, "Chatbot tư vấn sản phẩm và tìm kiếm bằng hình ảnh", .85, 4.65, 11.2, .7, 25, WHITE)
txt(s, "Từ báo cáo phân tích chức năng · 11/2026", .85, 6.75, 11.2, .35, 15,
    RGBColor(181, 197, 211))

# 2. Actors
s = base("01 · PHẠM VI", "Ai sử dụng chức năng AI?", 2)
card(s, "Khách / người mua", "Hỏi chatbot, tải ảnh, nhận tối đa 5 gợi ý và mở trang sản phẩm.", .75, 2.05, 3.78, 2.4)
card(s, "Người bán", "Đăng sản phẩm; backend thử tạo vector cho ảnh đầu tiên.", 4.78, 2.05, 3.78, 2.4)
card(s, "Người vận hành", "Chạy npm run rag:index để tạo lại văn bản và vector sản phẩm.", 8.81, 2.05, 3.77, 2.4)
banner(s, "API chatbot hiện không yêu cầu đăng nhập; history do frontend gửi kèm.", 5.18)

# 3. Text search specification
s = base("02 · ĐẶC TẢ CHỨC NĂNG", "Tư vấn và tìm bằng văn bản", 3)
card(s, "Đầu vào", "message: câu hỏi\nhistory: backend dùng tối đa 6 tin gần nhất", .75, 2.05, 4.1, 3.4)
card(s, "Luồng chính", "1. Qwen phân tích ý định và bộ lọc.\n2. BGE M3 tạo vector; Atlas trả tối đa 20 ứng viên.\n3. Qwen lọc còn tối đa 5 và soạn câu trả lời.", 5.1, 2.05, 7.48, 3.4)
banner(s, "Vector lỗi → tìm theo từ khóa; không có ứng viên → báo chưa tìm thấy.", 5.8)

# 4. Image search specification
s = base("03 · ĐẶC TẢ CHỨC NĂNG", "Tìm sản phẩm bằng hình ảnh", 4, True)
items = [
    ("01 · Nhận ảnh", "JPEG, PNG, WebP; frontend ≤ 5 MiB; API nhận data URL."),
    ("02 · Hiểu ảnh", "Qwen mô tả ảnh, trích xuất ý định và bộ lọc."),
    ("03 · Truy xuất", "SigLIP tạo vector; Atlas tìm trên imageEmbedding."),
    ("04 · Trả lời", "Qwen lọc ứng viên, tạo reply và thẻ sản phẩm."),
]
for i, (head, body) in enumerate(items):
    card(s, head, body, .75+i*3.02, 2.05, 2.78, 3.25, True, 19, 17)
banner(s, "Vector ảnh lỗi → thử vector chữ từ mô tả ảnh → tìm theo từ khóa.", 5.76, True)

# 5. Data
s = base("04 · COLLECTION VÀ TRƯỜNG DỮ LIỆU", "AI đọc trực tiếp collection posts", 5)
rows = [
    ("title, name, category, condition, location, description, details", "Ghép thành ragText; một phần dùng tìm từ khóa dự phòng."),
    ("ragText, textEmbedding, embeddingModel", "Văn bản tổng hợp, vector ngữ nghĩa và tên mô hình."),
    ("images[0], imageEmbedding, imageEmbeddingModel", "Ảnh đầu tiên và vector tìm kiếm bằng ảnh."),
    ("status, price, location", "Lọc trạng thái, giá và vị trí sau vector search."),
]
for i, (a, b) in enumerate(rows):
    yy = 2.03+i*.91
    rect(s, .75, yy, 11.83, .8, WHITE if i%2==0 else RGBColor(236, 243, 248), True)
    txt(s, a, .96, yy+.13, 4.55, .58, 16, INK, True)
    txt(s, b, 5.7, yy+.13, 6.55, .58, 16, INK)
banner(s, "users và settings phục vụ đăng bán; chatbot không truy vấn chúng lúc người mua hỏi.", 6.07)

# 6. APIs
s = base("05 · API VÀ LỜI GỌI NỘI BỘ", "Một API công khai, nhiều bước xử lý", 6)
api_rows = [
    ("POST /api/chatbot/ask", "message, history, image → reply, products (≤ 5)"),
    ("LM Studio /chat/completions", "Qwen hiểu ảnh, phân tích yêu cầu, lọc và trả lời"),
    ("LM Studio /embeddings", "BGE M3 tạo vector câu hỏi hoặc lô ragText"),
    ("MongoDB $vectorSearch", "numCandidates = 100; tối đa 20 kết quả"),
    ("SigLIP nội bộ", "Tạo vector ảnh ngay trong tiến trình backend"),
]
for i, (a, b) in enumerate(api_rows):
    yy = 1.98+i*.89
    rect(s, .75, yy, 11.83, .78, WHITE if i%2==0 else RGBColor(236, 243, 248), True)
    txt(s, a, .98, yy+.15, 4.0, .5, 16, TEAL, True)
    txt(s, b, 5.0, yy+.15, 7.3, .5, 16, INK)
txt(s, "similarity chỉ có khi kết quả vector trả về điểm.", .9, 6.65, 11.5, .34, 16, MUTED)

# 7. Indexing
s = base("06 · CHUẨN BỊ DỮ LIỆU CHO RAG", "Lập chỉ mục sản phẩm như thế nào?", 7, True)
steps = [
    ("1. Chọn bài", "Đọc posts active / APPROVED."),
    ("2. Phân tích ảnh", "Qwen mô tả ảnh đầu; SigLIP tạo vector ảnh."),
    ("3. Ghép văn bản", "Tạo ragText từ thuộc tính và mô tả."),
    ("4. Ghi vector", "BGE M3 tạo textEmbedding theo lô; bulkWrite."),
]
for i, (a, b) in enumerate(steps):
    card(s, a, b, .75+i*3.02, 2.05, 2.78, 3.25, True, 19, 17)
banner(s, "Bài mới chỉ thử tạo imageEmbedding; textEmbedding cần chạy npm run rag:index.", 5.76, True)

# 8 and 9. Diagrams from the Word report, with editable draw.io sources alongside.
for number, section, title, filename, ratio, notes in [
    (8, "07 · SƠ ĐỒ HOẠT ĐỘNG", "Từ câu hỏi hoặc ảnh đến kết quả", "So_do_hoat_dong_AI_HaiHand.png", 1400/1680,
     [("Quyết định chính", "Tìm sản phẩm? Có ảnh hay chỉ có văn bản?"),
      ("Truy xuất", "SigLIP hoặc BGE M3 → Atlas ≤ 20 → Qwen ≤ 5."),
      ("Dự phòng", "Vector lỗi: thử vector chữ, rồi tìm theo từ khóa.")]),
    (9, "08 · SƠ ĐỒ TUẦN TỰ", "Trình tự tìm sản phẩm bằng ảnh", "So_do_tuan_tu_tim_kiem_anh_HaiHand.png", 1500/1740,
     [("Frontend → Backend", "Gửi message, history và ảnh dạng data URL."),
      ("Backend → AI / Atlas", "Qwen hiểu ảnh; SigLIP tạo vector; Atlas tìm ứng viên."),
      ("Kết quả", "Qwen lọc; backend trả reply và products.")]),
]:
    s = base(section, title, number)
    pic_h = 4.77
    pic_w = pic_h * ratio
    s.shapes.add_picture(str(ROOT / filename), Inches(.77+(5.22-pic_w)/2), Inches(1.93),
                         width=Inches(pic_w), height=Inches(pic_h))
    for i, (head, body) in enumerate(notes):
        card(s, head, body, 6.42, 1.95+i*1.6, 6.13, 1.43,
             title_size=18, body_size=15)

# 10. Assessment
s = base("09 · ĐÁNH GIÁ HIỆN TRẠNG", "Điểm cần lưu ý khi triển khai", 10, True)
card(s, "Dữ liệu", "Chỉ ảnh đầu tiên được lập vector; bài mới chưa tự có textEmbedding.", .75, 2.05, 3.78, 2.45, True)
card(s, "Chất lượng", "Chưa có ngưỡng similarity cứng; cần đo độ liên quan top 5.", 4.78, 2.05, 3.78, 2.45, True)
card(s, "Vận hành", "API chưa xác thực, chưa giới hạn tần suất; LM Studio cần chạy sẵn.", 8.81, 2.05, 3.77, 2.45, True)
banner(s, "Cần kiểm tra chỉ mục Atlas và status='pending' trong luồng đăng bán.", 5.35, True)

prs.save(OUTPUT)
print(OUTPUT)
