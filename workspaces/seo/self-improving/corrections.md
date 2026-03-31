# SEO Agent "Khoa" — Corrections Log
<!-- Admin feedback → agent learns to avoid repeating mistakes -->
<!-- Format: date, task, mistake, correction, reason -->

## 2026-03-31 — Duplicate Alt Text: Sai Cách Kiểm Tra
- **Task**: Kiểm tra duplicate alt text
- **Lỗi**: Query `/wp-json/wp/v2/media` (media library) → báo 40 duplicates "cross-site" không phải lỗi thực
- **Lỗi tiếp**: Dùng Python script parse /tmp/products.json (chỉ 100 products) → báo "0 duplicate" sai
- **Đúng**: Chạy `node khoa.js check-duplicate-alt` → scan per-page → tìm đúng 3 trang có lỗi
- **Nguyên tắc**: Duplicate alt text chỉ là lỗi khi cùng alt text xuất hiện ≥2 lần TRÊN CÙNG 1 TRANG

## 2026-03-22 — Title Format Correction
- **URL**: https://agowautomation.com/thiet-bi-hang-br
- **Trước**: Thiết bị B&R Automation chuyên nghiệp
- **Sau**: Thiết bị hãng B&R Automation – PLC, Servo, HMI
- **Nguyên tắc**: Dùng "–" (en-dash) để tách keyword groups trong title
