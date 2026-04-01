# SEO Agent "Khoa" — Corrections Log
<!-- Admin feedback → agent learns to avoid repeating mistakes -->
<!-- Format: date, task, mistake, correction, reason -->

## 2026-03-31 — Duplicate Alt Fix: 2 Edge Cases

### Edge Case 1: WC Product có 2 ảnh cùng media ID
- **Tình huống**: Product 3789 (X20CP3583) — image `3790` là gallery image, image `3790` cũng là featured image → cùng media ID
- **Vấn đề**: Sửa alt text qua `/wp-json/wp/v2/media/3790` chỉ đổi 1 record → cả 2 chỗ hiển thị vẫn cùng alt sau khi sửa
- **Đúng**: WC product với 2+ ảnh cùng media ID không thể sửa bằng media endpoint. Cần kiểm tra xem featured image và gallery image có thực sự là cùng 1 file hay không. Nếu đúng → mark as CANNOT_FIX (same image used twice), không phải lỗi Google penalize.

### Edge Case 2: Flatsome Page Builder — cùng ảnh xuất hiện nhiều lần
- **Tình huống**: Trang Chủ — cùng 1 ảnh `module-nguon-24vdc-3ps465-9.jpg` xuất hiện 2+ lần trong các section khác nhau của Flatsome
- **Vấn đề**: Suffix logic (`- mặt sau`, `- chi tiết kết nối`) chỉ phân biệt được 2-3 lần. Nếu cùng ảnh xuất hiện 4 lần → sau fix vẫn có 2 cùng suffix
- **Nguyên tắc**: Cùng ảnh (cùng src URL) xuất hiện nhiều lần trên 1 trang = Page Builder reuse, không phải lỗi SEO thật. Google không penalize vì đây cùng 1 file. Chỉ cần flag INFORMATIONAL, không cần fix.
- **Action**: Bỏ qua Trang Chủ trong check-duplicate-alt nếu src URL trùng nhau (chỉ count duplicate ALT khi SRC khác nhau).


- **Task**: Kiểm tra duplicate alt text
- **Lỗi**: Query `/wp-json/wp/v2/media` (media library) → báo 40 duplicates "cross-site" không phải lỗi thực
- **Lỗi tiếp**: Dùng Python script parse /tmp/products.json (chỉ 100 products) → báo "0 duplicate" sai
- **Đúng**: Chạy `node khoa.js check-duplicate-alt` → scan per-page → tìm đúng 3 trang có lỗi
- **Nguyên tắc**: Duplicate alt text chỉ là lỗi khi cùng alt text xuất hiện ≥2 lần TRÊN CÙNG 1 TRANG

## 2026-04-01 — Meta Description: Append CTA Là Anti-Pattern

- **Task**: Fix 78 THIN_META_DESC products (102–119 chars)
- **Đề xuất sai**: Append "Liên hệ Agow để báo giá và tư vấn." vào cuối tất cả 78 sản phẩm
- **Vấn đề**:
  1. **Boilerplate signal**: 78 trang cùng câu kết giống nhau → Google nhận diện template, giảm uniqueness
  2. **Intent mismatch**: Kỹ sư đang research/compare, chưa sẵn sàng mua → CTA "báo giá" sai giai đoạn
  3. **Thông tin kỹ thuật bị lãng phí**: Thay vì append CTA, dùng ~40 chars còn lại để thêm spec kỹ thuật còn thiếu (resolution, khe PCI, protocol, ứng dụng)
  4. **Google rewrite**: Meta không match search intent → Google tự thay bằng snippet từ content → effort thừa
- **Đúng**: Hoàn thiện thông tin kỹ thuật còn thiếu trong 40 chars còn lại, CỤ THỂ cho từng sản phẩm
- **Ngưỡng đúng**: 140–155 chars (không phải 120). Google hiển thị ~155 chars desktop, ~120 chars mobile.
  - <120 chars: THIN — mất real estate trên SERP
  - 140–155 chars: OPTIMAL — đủ thông tin, không bị cắt trên desktop
  - >160 chars: bị Google cắt giữa chừng

**Ví dụ đúng (ID 3333 Power Panel):**
```
Sai: "...màn hình cảm ứng điện trở. Liên hệ Agow để báo giá và tư vấn." (138, generic CTA)
Đúng: "...màn hình cảm ứng điện trở, 800×600 pixel. Tích hợp PLC, phù hợp điều khiển và giám sát công nghiệp." (155, specific info)
```

## 2026-04-01 — Semantic SEO Title: Truncate Cơ Học Là Sai

- **Task**: Fix LONG_TITLE cho 34 sản phẩm B&R
- **Lỗi lần 1**: Đề xuất title bằng cách chỉ bỏ "Hãng B&R" / "của B&R Automation Hãng B&R" ở cuối
  - Ví dụ sai: `"Module I/O Số X67DM1321.L08 của B&R Automation Hãng B&R"` → `"Module I/O Số X67DM1321.L08 | B&R Automation"` (47 ký tự)
  - Vẫn đúng kỹ thuật nhưng không có semantic keyword → không khác gì truncate cơ học
- **Feedback của admin**: "title chưa tối ưu, cần đặt tiêu đề làm sao cho chuẩn SEO semantic và phù hợp nhất với sản phẩm và nội dung sản phẩm"
- **Lỗi gốc**: Chưa đọc nội dung sản phẩm trước khi đề xuất title — chỉ dựa vào tên sản phẩm
- **Đúng**: Fetch `short_description` → hiểu chức năng thực → đặt keyword người dùng search ở đầu
  - Ví dụ đúng: `"X67DI1371.L12 Module Đầu Vào Số 16 Kênh M12 B&R"` (50 ký tự)
  - Keyword người dùng: "Module Đầu Vào Số" + "16 Kênh" + "M12" → đúng intent kỹ sư tìm kiếm
- **Nguyên tắc**: LONG_TITLE workflow bắt buộc: check-title → fetch description → đề xuất semantic title → admin duyệt → apply. KHÔNG bao giờ auto-truncate rồi apply trực tiếp.

## 2026-03-22 — Title Format Correction
- **URL**: https://agowautomation.com/thiet-bi-hang-br
- **Trước**: Thiết bị B&R Automation chuyên nghiệp
- **Sau**: Thiết bị hãng B&R Automation – PLC, Servo, HMI
- **Nguyên tắc**: Dùng "–" (en-dash) để tách keyword groups trong title
