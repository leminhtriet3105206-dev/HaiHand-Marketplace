from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.section import WD_SECTION
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.style import WD_STYLE_TYPE
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "output" / "chuyen-de-cosine-va-tim-kiem-anh.docx"

doc = Document()
sec = doc.sections[0]
sec.top_margin = Inches(0.72)
sec.bottom_margin = Inches(0.68)
sec.left_margin = Inches(0.85)
sec.right_margin = Inches(0.85)

styles = doc.styles
normal = styles['Normal']
normal.font.name = 'Aptos'
normal.font.size = Pt(10.5)
normal._element.rPr.rFonts.set(qn('w:eastAsia'), 'Aptos')
normal.paragraph_format.space_after = Pt(5)
normal.paragraph_format.line_spacing = 1.12

for name, size, before, after in [('Title', 25, 0, 15), ('Heading 1', 17, 13, 6), ('Heading 2', 13, 9, 4), ('Heading 3', 11, 7, 3)]:
    st = styles[name]
    st.font.name = 'Aptos Display' if name != 'Normal' else 'Aptos'
    st.font.size = Pt(size)
    st.font.color.rgb = RGBColor(0, 0, 0)
    st.font.bold = name != 'Title'
    st._element.rPr.rFonts.set(qn('w:eastAsia'), 'Aptos Display')
    st.paragraph_format.space_before = Pt(before)
    st.paragraph_format.space_after = Pt(after)
    st.paragraph_format.keep_with_next = True

def remove_paragraph_borders(element):
    pPr = element.get_or_add_pPr()
    pBdr = pPr.find(qn('w:pBdr'))
    if pBdr is not None:
        pPr.remove(pBdr)

remove_paragraph_borders(styles['Title']._element)

if 'Equation' not in styles:
    eq = styles.add_style('Equation', WD_STYLE_TYPE.PARAGRAPH)
else:
    eq = styles['Equation']
eq.font.name = 'Cambria Math'
eq.font.size = Pt(12)
eq._element.rPr.rFonts.set(qn('w:eastAsia'), 'Cambria Math')
eq.paragraph_format.space_before = Pt(5)
eq.paragraph_format.space_after = Pt(7)

def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn('w:shd'))
    if shd is None:
        shd = OxmlElement('w:shd')
        tc_pr.append(shd)
    shd.set(qn('w:fill'), fill)

def set_cell_margins(cell, top=100, start=120, bottom=100, end=120):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcMar = tcPr.first_child_found_in('w:tcMar')
    if tcMar is None:
        tcMar = OxmlElement('w:tcMar')
        tcPr.append(tcMar)
    for m, v in [('top', top), ('start', start), ('bottom', bottom), ('end', end)]:
        node = tcMar.find(qn(f'w:{m}'))
        if node is None:
            node = OxmlElement(f'w:{m}')
            tcMar.append(node)
        node.set(qn('w:w'), str(v)); node.set(qn('w:type'), 'dxa')

def set_repeat_table_header(row):
    trPr = row._tr.get_or_add_trPr()
    tblHeader = OxmlElement('w:tblHeader')
    tblHeader.set(qn('w:val'), 'true')
    trPr.append(tblHeader)

def table(headers, rows, widths=None):
    t = doc.add_table(rows=1, cols=len(headers))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.style = 'Table Grid'
    t.autofit = False
    hdr = t.rows[0]
    set_repeat_table_header(hdr)
    for i, h in enumerate(headers):
        c = hdr.cells[i]
        set_cell_shading(c, '1F4E78')
        set_cell_margins(c)
        c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        p = c.paragraphs[0]; p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(str(h)); r.bold = True; r.font.color.rgb = RGBColor(255,255,255); r.font.size = Pt(9.5)
        if widths: c.width = Inches(widths[i])
    for ridx, row in enumerate(rows):
        cells = t.add_row().cells
        for i, value in enumerate(row):
            c = cells[i]
            if ridx % 2: set_cell_shading(c, 'EDF3F8')
            set_cell_margins(c)
            c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            p = c.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if i == 0 or len(headers) <= 3 else WD_ALIGN_PARAGRAPH.LEFT
            r = p.add_run(str(value)); r.font.size = Pt(9.2)
            if widths: c.width = Inches(widths[i])
    doc.add_paragraph().paragraph_format.space_after = Pt(1)
    return t

def p(text='', bold_lead=None):
    para = doc.add_paragraph()
    if bold_lead and text.startswith(bold_lead):
        para.add_run(bold_lead).bold = True
        para.add_run(text[len(bold_lead):])
    else:
        para.add_run(text)
    return para

def equation(text):
    para = doc.add_paragraph(style='Equation')
    para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    para.add_run(text)
    return para

def bullet(text):
    para = doc.add_paragraph(style='List Bullet')
    para.paragraph_format.space_after = Pt(2)
    para.add_run(text)
    return para

def numbered(text):
    para = doc.add_paragraph(style='List Number')
    para.paragraph_format.space_after = Pt(3)
    para.add_run(text)
    return para

page_break_count = 0
def page_break():
    global page_break_count
    page_break_count += 1
    if page_break_count == 1:
        doc.add_page_break()

# Footer page number
footer = sec.footer.paragraphs[0]
footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = footer.add_run('Trang ')
run.font.size = Pt(9); run.font.color.rgb = RGBColor(90,90,90)
fld = OxmlElement('w:fldSimple'); fld.set(qn('w:instr'), 'PAGE')
footer._p.append(fld)

# Cover
doc.add_paragraph().paragraph_format.space_after = Pt(70)
title = doc.add_paragraph(style='Title')
title.alignment = WD_ALIGN_PARAGRAPH.CENTER
title.add_run('Tìm hiểu sâu về độ tương đồng Cosine trong tìm kiếm hình ảnh')
remove_paragraph_borders(title._p)
sub = doc.add_paragraph()
sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = sub.add_run('Từ trực giác hình học đến SigLIP ENN và MongoDB Atlas Vector Search')
r.font.size = Pt(14); r.font.name = 'Aptos'; r.font.color.rgb = RGBColor(55,55,55)
doc.add_paragraph().paragraph_format.space_after = Pt(55)
p0 = doc.add_paragraph()
p0.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p0.add_run('Chuyên đề kỹ thuật dành cho người học và lập trình viên xây dựng chức năng tìm kiếm sản phẩm bằng hình ảnh')
r.font.size = Pt(11.5)
doc.add_paragraph().paragraph_format.space_after = Pt(110)
meta = doc.add_paragraph(); meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
meta.add_run('HaiHand Marketplace\n').bold = True
meta.add_run('Cập nhật ngày 24 tháng 11 năm 2026')

page_break()
doc.add_heading('Mục tiêu và kết luận chính', level=1)
p('Tài liệu này giải thích vì sao độ tương đồng cosine phù hợp để so sánh embedding ảnh, cách tính toán từ những vector nhỏ, cách áp dụng cho vector SigLIP 768 chiều và cách MongoDB Atlas biến cosine thành điểm tìm kiếm từ 0 đến 1. Sau khi đọc, người học có thể tự tính cosine, phân biệt cosine với khoảng cách Euclidean, hiểu vai trò của ENN và chọn ngưỡng điểm dựa trên dữ liệu thực tế.')
p('Kết luận chính: SigLIP chịu trách nhiệm biến ảnh thành vector; cosine đo mức cùng hướng giữa hai vector; ENN tìm chính xác các vector gần nhất; Atlas chuẩn hóa cosine thành vectorSearchScore để xếp hạng kết quả. Điểm cao không tự động bảo đảm đúng sản phẩm, vì vậy ngưỡng cần được hiệu chỉnh bằng tập ảnh đại diện cho ứng dụng.')

doc.add_heading('Nội dung chuyên đề', level=1)
for item in [
    '1  Trực giác hình học của cosine',
    '2  Công thức và ví dụ tính từng bước',
    '3  Chuẩn hóa L2 và mối liên hệ với tích vô hướng',
    '4  Cosine trong không gian embedding 768 chiều',
    '5  Luồng tìm kiếm ảnh bằng SigLIP ENN và Atlas',
    '6  Điểm cosine gốc và vectorSearchScore của Atlas',
    '7  So sánh cosine dot product và Euclidean',
    '8  Chọn ngưỡng đánh giá và kiểm thử cho HaiHand',
    '9  Hạn chế sai lầm thường gặp và phần thực hành'
]: p(item)

doc.add_heading('Ký hiệu sử dụng', level=2)
table(['Ký hiệu', 'Ý nghĩa'], [
    ('A, B', 'Hai vector cần so sánh'),
    ('A · B', 'Tích vô hướng của A và B'),
    ('||A||', 'Độ dài Euclidean hay chuẩn L2 của A'),
    ('cos(A,B)', 'Cosine similarity gốc trong khoảng từ -1 đến 1'),
    ('AtlasScore', 'Điểm MongoDB Atlas chuẩn hóa trong khoảng từ 0 đến 1')
], [1.35, 5.35])

page_break()
doc.add_heading('1  Trực giác hình học của cosine', level=1)
p('Một vector có thể được hình dung như một mũi tên bắt đầu từ gốc tọa độ. Cosine similarity không hỏi hai đầu mũi tên cách nhau bao xa. Nó hỏi hai mũi tên đang chỉ theo những hướng giống nhau đến mức nào.')
table(['Trường hợp', 'Góc giữa hai vector', 'Cosine gốc', 'Diễn giải'], [
    ('Cùng hướng', '0°', '1', 'Giống nhất theo hướng'),
    ('Khá gần nhau', 'khoảng 37°', '0,8', 'Có mức tương đồng cao'),
    ('Vuông góc', '90°', '0', 'Không có hướng tương đồng tuyến tính'),
    ('Ngược hướng', '180°', '-1', 'Đối lập hoàn toàn theo hướng')
], [1.35, 1.5, 1.25, 2.6])
p('Cosine bỏ qua sự khác nhau về độ lớn. Ví dụ, A = (1, 2) và B = (10, 20) cùng hướng nên cosine bằng 1, mặc dù B dài gấp 10 lần A. Tính chất này hữu ích với embedding vì ta quan tâm mẫu đặc trưng tương đối hơn là độ lớn tuyệt đối của vector.')

doc.add_heading('2  Công thức cosine similarity', level=1)
equation('cos(A, B) = (A · B) / (||A|| × ||B||)')
p('Với A = (a₁, a₂, …, aₙ) và B = (b₁, b₂, …, bₙ), công thức đầy đủ là:')
equation('cos(A, B) = [Σᵢ₌₁ⁿ aᵢbᵢ] / [√(Σᵢ₌₁ⁿ aᵢ²) × √(Σᵢ₌₁ⁿ bᵢ²)]')
p('Tử số đo mức hai vector đồng thuận theo từng chiều. Mẫu số chia cho tích độ dài để loại bỏ ảnh hưởng của quy mô vector. Nếu thiếu mẫu số, vector có giá trị lớn thường nhận điểm cao chỉ vì nó lớn hơn.')

doc.add_heading('Ví dụ tính từng bước', level=2)
p('Giả sử A = (1, 2, 2) và B = (2, 1, 2). Ba chiều ở đây chỉ dùng để minh họa. Trong hệ thống thật, SigLIP tạo 768 chiều.')
table(['Chiều', 'A', 'B', 'aᵢ × bᵢ'], [
    ('1', '1', '2', '2'), ('2', '2', '1', '2'), ('3', '2', '2', '4'), ('Tổng', '', '', '8')
], [1.2, 1.2, 1.2, 2.6])
equation('A · B = 1×2 + 2×1 + 2×2 = 8')
equation('||A|| = √(1² + 2² + 2²) = √9 = 3')
equation('||B|| = √(2² + 1² + 2²) = √9 = 3')
equation('cos(A, B) = 8 / (3×3) = 8/9 ≈ 0,8889')
p('Có thể hiểu trực quan rằng 9 là mức cùng hướng tối đa mà hai vector có độ dài này có thể đạt, còn mức thực tế là 8. Vì vậy chúng đạt 8/9 mức cùng hướng tối đa. Đây là cách hình dung, không nên diễn giải cosine như xác suất chính xác 88,89%.')

page_break()
doc.add_heading('3  Chuẩn hóa L2', level=1)
p('Chuẩn hóa L2 biến vector thành vector đơn vị có độ dài bằng 1 nhưng giữ nguyên hướng. Với vector A, ta tính:')
equation('Â = A / ||A||')
equation('||Â|| = 1')
p('Khi cả A và B đều đã chuẩn hóa L2, mẫu số của công thức cosine bằng 1. Khi đó:')
equation('cos(Â, B̂) = Â · B̂')
p('Dự án HaiHand chuẩn hóa vector SigLIP ngay sau khi mô hình tạo embedding. Điều này bảo đảm vector lưu trong Atlas có độ dài xấp xỉ 1 và làm phép so sánh ổn định hơn.')

doc.add_heading('Ví dụ chuẩn hóa', level=2)
p('Với A = (1, 2, 2) và ||A|| = 3:')
equation('Â = (1/3, 2/3, 2/3)')
p('Với B = (2, 1, 2) và ||B|| = 3:')
equation('B̂ = (2/3, 1/3, 2/3)')
p('Tích vô hướng của hai vector đơn vị là:')
equation('Â · B̂ = 2/9 + 2/9 + 4/9 = 8/9 ≈ 0,8889')

doc.add_heading('4  Cosine trong embedding ảnh SigLIP', level=1)
p('SigLIP không lưu các nhãn dễ đọc như “màu đỏ”, “xe máy” hoặc “đôi giày” vào từng vị trí cố định. Mỗi ảnh được biểu diễn bằng một vector 768 chiều, và ý nghĩa nằm trong mẫu phối hợp của toàn bộ vector. Một chiều riêng lẻ thường không có ý nghĩa trực quan ổn định.')
p('Hai ảnh có nội dung thị giác hoặc ngữ nghĩa gần nhau thường tạo ra vector hướng gần nhau. Cosine giúp đo mức gần nhau đó mà không phụ thuộc vào độ lớn ban đầu của đầu ra mô hình.')
table(['Thành phần', 'Vai trò trong HaiHand'], [
    ('SigLIP', 'Biến ảnh tải lên và ảnh sản phẩm thành vector 768 chiều'),
    ('Chuẩn hóa L2', 'Đưa mỗi vector về độ dài 1'),
    ('Cosine', 'Đo mức cùng hướng giữa vector truy vấn và vector sản phẩm'),
    ('ENN', 'So sánh chính xác với các vector đủ điều kiện để lấy hàng xóm gần nhất'),
    ('Atlas Vector Search', 'Thực hiện truy vấn, chuẩn hóa điểm và trả kết quả xếp hạng')
], [1.65, 5.05])

page_break()
doc.add_heading('5  Luồng tìm kiếm hình ảnh trong HaiHand', level=1)
for text in [
    'Người dùng chọn và tải một ảnh tại chức năng tìm kiếm bằng hình ảnh.',
    'Backend kiểm tra ảnh, xoay đúng hướng, giới hạn kích thước và chuẩn hóa định dạng.',
    'SigLIP chuyển ảnh truy vấn thành vector 768 chiều.',
    'Vector được chuẩn hóa L2 về độ dài 1.',
    'Atlas ENN so sánh vector truy vấn với imageVector0 đến imageVector4 của sản phẩm.',
    'Atlas tính cosine và chuyển thành vectorSearchScore từ 0 đến 1.',
    'Hệ thống giữ điểm cao nhất trong các ảnh của cùng một sản phẩm.',
    'Các kết quả dưới ngưỡng bị loại; phần còn lại được sắp xếp giảm dần và hiển thị.'
]: numbered(text)

doc.add_heading('Vì sao lưu tối đa năm vector ảnh', level=2)
p('Một sản phẩm có thể có ảnh chính diện, mặt bên, chi tiết hoặc ảnh sử dụng thực tế. Nếu chỉ lấy vector trung bình, đặc điểm của từng ảnh có thể bị pha trộn. HaiHand lưu imageVector0 đến imageVector4 và lấy điểm tốt nhất, nhờ đó ảnh truy vấn chỉ cần gần với một ảnh đại diện của sản phẩm.')
table(['Ảnh sản phẩm', 'Cosine gốc', 'Điểm Atlas'], [
    ('imageVector0', '0,52', '0,76'),
    ('imageVector1', '0,84', '0,92'),
    ('imageVector2', '0,66', '0,83'),
    ('Điểm cuối', 'Giá trị tốt nhất', '0,92')
], [2.1, 2.2, 2.2])

doc.add_heading('6  ENN và ANN', level=1)
p('ENN là Exact Nearest Neighbor. Khi truy vấn dùng exact: true, Atlas tìm hàng xóm gần nhất bằng cách so sánh chính xác trong tập vector đủ điều kiện. Kết quả có độ chính xác truy hồi cao nhưng chi phí tính toán tăng khi dữ liệu lớn.')
p('ANN là Approximate Nearest Neighbor. ANN dùng cấu trúc chỉ mục để giảm số phép so sánh, đổi lại có khả năng bỏ sót một số hàng xóm thực sự gần nhất. ANN thường phù hợp hơn khi dữ liệu tăng lớn hoặc lưu lượng truy vấn cao.')
table(['Tiêu chí', 'ENN', 'ANN'], [
    ('Cách tìm', 'So sánh chính xác', 'Tìm gần đúng qua chỉ mục'),
    ('Độ chính xác truy hồi', 'Cao nhất', 'Phụ thuộc cấu hình'),
    ('Tốc độ trên dữ liệu lớn', 'Chậm hơn', 'Nhanh hơn'),
    ('Phù hợp', 'Demo, kiểm chứng, tập dữ liệu vừa', 'Hệ thống lớn, nhiều truy vấn')
], [1.65, 2.45, 2.45])

page_break()
doc.add_heading('7  Điểm cosine gốc và điểm Atlas', level=1)
p('Cosine gốc nằm trong khoảng từ -1 đến 1. MongoDB Atlas chuyển nó thành vectorSearchScore từ 0 đến 1 bằng công thức:')
equation('AtlasScore = (1 + cos(A, B)) / 2')
p('Công thức đảo để lấy cosine gốc từ điểm Atlas:')
equation('cos(A, B) = 2 × AtlasScore − 1')
table(['Cosine gốc', 'Điểm Atlas', 'Diễn giải hướng'], [
    ('1,0', '1,0', 'Cùng hướng hoàn toàn'),
    ('0,8', '0,9', 'Rất gần theo hướng'),
    ('0,6', '0,8', 'Khá gần theo hướng'),
    ('0,4', '0,7', 'Tương đồng vừa'),
    ('0', '0,5', 'Vuông góc'),
    ('-1', '0', 'Ngược hướng')
], [1.7, 1.7, 3.15])
p('Ví dụ cosine gốc 0,8889 được Atlas chuyển thành (1 + 0,8889) / 2 = 0,94445. Vì vậy khi ứng dụng đặt minScore = 0,8, ngưỡng cosine gốc tương ứng là 0,6, không phải 0,8.')

doc.add_heading('8  So sánh các thước đo', level=1)
table(['Thước đo', 'Điều đo lường', 'Ảnh hưởng độ lớn', 'Điều kiện phù hợp'], [
    ('Cosine', 'Góc giữa vector', 'Gần như bỏ qua', 'Embedding ngữ nghĩa, ảnh, văn bản'),
    ('Dot product', 'Mức thẳng hàng và độ lớn', 'Có', 'Vector đã chuẩn hóa hoặc độ lớn có ý nghĩa'),
    ('Euclidean', 'Khoảng cách đầu mút', 'Có', 'Không gian mà khoảng cách tuyệt đối có ý nghĩa')
], [1.25, 1.8, 1.45, 2.45])
p('Nếu vector đã chuẩn hóa L2, cosine và dot product cho cùng thứ tự xếp hạng. Với vector chưa chuẩn hóa, dot product có thể ưu tiên vector có độ lớn cao. Euclidean trên các vector đơn vị cũng liên hệ trực tiếp với cosine:')
equation('||Â − B̂||² = 2 − 2cos(Â, B̂)')

page_break()
doc.add_heading('9  Chọn ngưỡng cho HaiHand', level=1)
p('Không nên chọn ngưỡng chỉ bằng trực giác hoặc sao chép từ hệ thống khác. Ngưỡng phụ thuộc model, cách xử lý ảnh, dữ liệu sản phẩm và mục tiêu trải nghiệm người dùng.')
doc.add_heading('Tạo tập đánh giá', level=2)
for text in [
    'Ảnh đúng cùng sản phẩm: ảnh truy vấn và sản phẩm thực sự là một mặt hàng.',
    'Ảnh cùng loại nhưng khác sản phẩm: hai đôi giày khác mẫu hoặc hai điện thoại khác model.',
    'Ảnh liên quan yếu: cùng bối cảnh hoặc màu sắc nhưng khác loại vật thể.',
    'Ảnh không liên quan: sản phẩm thuộc nhóm hoàn toàn khác.',
    'Ảnh thực tế: ảnh chụp bằng điện thoại, nền phức tạp, ánh sáng xấu và vật thể bị che.'
]: bullet(text)

doc.add_heading('Các chỉ số nên theo dõi', level=2)
table(['Chỉ số', 'Câu hỏi trả lời'], [
    ('Precision@K', 'Trong K kết quả đầu, bao nhiêu kết quả thực sự phù hợp'),
    ('Recall@K', 'Trong các sản phẩm phù hợp, hệ thống tìm được bao nhiêu ở K vị trí đầu'),
    ('Top 1 accuracy', 'Kết quả đầu tiên có đúng sản phẩm hoặc đúng loại mong muốn không'),
    ('False positive rate', 'Bao nhiêu ảnh khác loại vẫn vượt ngưỡng'),
    ('Latency', 'Một truy vấn mất bao lâu từ lúc tải ảnh đến khi nhận kết quả')
], [1.65, 5.0])
p('Cách chọn thực tế: chạy nhiều ngưỡng, ví dụ 0,65; 0,70; 0,75; 0,80; 0,85 theo điểm Atlas. Với mỗi ngưỡng, đo precision, recall và số truy vấn không có kết quả. Chọn mức phù hợp với mục tiêu demo hoặc sản phẩm thật.')

doc.add_heading('Ví dụ bảng đánh giá giả định', level=2)
table(['Ngưỡng Atlas', 'Precision@5', 'Recall@5', 'Không có kết quả'], [
    ('0,70', '72%', '94%', '2%'),
    ('0,75', '81%', '88%', '6%'),
    ('0,80', '89%', '75%', '14%'),
    ('0,85', '95%', '58%', '29%')
], [1.55, 1.55, 1.55, 1.85])
p('Bảng trên chỉ minh họa phương pháp, không phải kết quả đo của HaiHand. Cần chạy bộ kiểm thử thật trước khi chọn ngưỡng sản xuất.')

page_break()
doc.add_heading('10  Hạn chế và sai lầm thường gặp', level=1)
for lead, body in [
    ('Nhầm điểm Atlas với cosine gốc. ', 'AtlasScore 0,8 tương ứng cosine gốc 0,6.'),
    ('Coi điểm là xác suất. ', 'Điểm 0,9 không có nghĩa chắc chắn 90% là cùng sản phẩm.'),
    ('Đặt ngưỡng trước khi đo. ', 'Một ngưỡng tốt cho ảnh studio có thể kém với ảnh chụp điện thoại.'),
    ('Dùng vector từ hai model khác nhau. ', 'Vector truy vấn và vector sản phẩm phải được tạo bởi cùng model và cùng quy trình xử lý.'),
    ('Bỏ qua vector rỗng. ', 'Cosine không xác định khi một vector có độ dài bằng 0.'),
    ('Chỉ kiểm tra bằng chính ảnh đã lập chỉ mục. ', 'Kết quả score = 1 chỉ chứng minh lưu và truy xuất đúng, không đánh giá khả năng tổng quát hóa.'),
    ('Ảnh có nhiều vật thể. ', 'Embedding có thể pha trộn đặc trưng và làm kết quả kém chính xác.'),
    ('Tin rằng chiều embedding có nhãn rõ ràng. ', 'Các chiều là đặc trưng ẩn và chỉ có ý nghĩa khi kết hợp.')
]: p(lead + body, bold_lead=lead)

doc.add_heading('11  Ví dụ mã JavaScript', level=1)
p('Hàm dưới đây tính cosine gốc. Nó kiểm tra chiều vector và vector rỗng trước khi chia:')
code = [
    'function cosineSimilarity(a, b) {',
    '  if (a.length !== b.length || a.length === 0) {',
    "    throw new Error('Hai vector phải cùng chiều và không rỗng');",
    '  }',
    '  let dot = 0, normA = 0, normB = 0;',
    '  for (let i = 0; i < a.length; i++) {',
    '    dot += a[i] * b[i];',
    '    normA += a[i] * a[i];',
    '    normB += b[i] * b[i];',
    '  }',
    "  if (normA === 0 || normB === 0) throw new Error('Vector rỗng');",
    '  return dot / (Math.sqrt(normA) * Math.sqrt(normB));',
    '}'
]
for line in code:
    para = doc.add_paragraph(); para.paragraph_format.space_after = Pt(0)
    r = para.add_run(line); r.font.name = 'Cascadia Mono'; r.font.size = Pt(9)

doc.add_heading('12  Bài tập tự kiểm tra', level=1)
for q in [
    'Tính cosine của A = (1, 0) và B = (0, 1). Hai vector tạo góc bao nhiêu?',
    'Tính cosine của A = (1, 2) và B = (10, 20). Vì sao kết quả bằng 1?',
    'Atlas trả score = 0,82. Hãy đổi về cosine gốc.',
    'Vì sao kiểm tra tìm lại chính ảnh thường trả score gần 1 nhưng chưa đủ để chứng minh hệ thống tìm ảnh tốt?',
    'Nếu tăng minScore, precision và recall thường thay đổi theo hướng nào?'
]: numbered(q)

doc.add_heading('Đáp án ngắn', level=2)
p('1) Cosine bằng 0, góc 90°. 2) Cosine bằng 1 vì hai vector cùng hướng. 3) Cosine gốc = 2×0,82−1 = 0,64. 4) Đây chỉ là kiểm tra lưu và truy xuất; ảnh mới có góc chụp khác mới đánh giá khả năng tổng quát hóa. 5) Precision thường tăng còn recall thường giảm, nhưng cần đo trên dữ liệu thật.')

page_break()
doc.add_heading('13  Tóm tắt', level=1)
for text in [
    'Cosine similarity đo góc giữa hai vector và có giá trị gốc từ -1 đến 1.',
    'Chuẩn hóa L2 đưa vector về độ dài 1; khi đó cosine bằng dot product.',
    'SigLIP biểu diễn mỗi ảnh HaiHand bằng vector 768 chiều.',
    'ENN tìm chính xác các vector gần nhất trong tập đủ điều kiện.',
    'MongoDB Atlas dùng AtlasScore = (1 + cosine) / 2 để đưa điểm về khoảng 0 đến 1.',
    'Một sản phẩm có nhiều ảnh được chấm từng vector và giữ điểm cao nhất.',
    'Ngưỡng tìm kiếm phải được hiệu chỉnh bằng ảnh thực tế và các chỉ số precision, recall, latency.'
]: bullet(text)

doc.add_heading('Nguồn tham khảo', level=1)
refs = [
    ('MongoDB', 'How to Index Fields for Vector Search', 'https://www.mongodb.com/docs/vector-search/indexes/vector-search-type/'),
    ('MongoDB', 'Run Vector Search ANN and ENN Queries', 'https://www.mongodb.com/docs/vector-search/query/aggregation-stages/vector-search-stage/'),
    ('scikit-learn', 'Cosine similarity', 'https://scikit-learn.org/stable/modules/generated/sklearn.metrics.pairwise.cosine_similarity.html'),
    ('scikit-learn', 'Pairwise metrics and cosine similarity', 'https://scikit-learn.org/stable/modules/metrics.html#cosine-similarity')
]
for index, (org, title, url) in enumerate(refs, 1):
    para = doc.add_paragraph()
    para.add_run(f'{index}. {org}. {title}. ').bold = True
    para.add_run(url)
p('Ngày truy cập tài liệu trực tuyến: 24 tháng 11 năm 2026.')

doc.core_properties.title = 'Tìm hiểu sâu về độ tương đồng Cosine trong tìm kiếm hình ảnh'
doc.core_properties.subject = 'Cosine similarity SigLIP ENN và MongoDB Atlas Vector Search'
doc.core_properties.keywords = 'cosine similarity, SigLIP, ENN, vector search, MongoDB Atlas, HaiHand'
doc.core_properties.author = 'HaiHand Marketplace'
OUT.parent.mkdir(parents=True, exist_ok=True)
doc.save(OUT)
print(OUT)
