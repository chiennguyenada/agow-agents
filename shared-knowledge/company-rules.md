# Agow Automation — Company Rules

## About
- **Company**: Agow Automation Co., Ltd.
- **Business**: Official distributor of B&R Industrial Automation in Vietnam
- **Website**: https://agowautomation.com
- **Market**: Industrial automation — manufacturing, OEM, system integrators
- **Region**: Vietnam (primary), Southeast Asia (secondary)

## Brand Guidelines
- Company name: "Agow Automation" (capital A, no hyphen)
- B&R product names: always use official naming (e.g., "ACOPOS P3", not "Acopos p3")
- Website title suffix: " | Agow Automation"
- Language: Vietnamese primary, technical terms in English

## Content Rules
- All published content must be in Vietnamese
- Technical specifications: use metric system (mm, kg, °C)
- Product model numbers: always exact, verify against product-catalog.md
- Never claim features not officially listed by B&R
- Never compare negatively with competitors by name
- Always include Vietnamese contact info for inquiries

## SEO Rules
- Focus keywords: mix Vietnamese + English (e.g., "biến tần B&R ACOPOS")
- Meta titles: **50–60 characters** (không phải 60), include primary keyword + "Agow Automation" — learned 2026-04-01
- Meta descriptions: **140–155 characters optimal** (Google: ~155 desktop, ~120 mobile; >160 bị cắt) — NOT "≤160"
- Short description (WooCommerce): 200–300 chars — tăng mật độ LSI keyword on-page (khác meta desc)
- One H1 per page, must contain primary keyword
- Internal linking: every product page links to its category and 2-3 related products
- Image alt text: descriptive, include product name, no duplicate alt per page (cross-site duplicates are OK)
- **Title format B&R products**: `[Mã SP] [Loại thiết bị] [Spec kỹ thuật] [Dòng SP] B&R` — mã SP đứng đầu vì kỹ sư B2B search theo part number
- **Citation preservation**: Giữ `(data sheet, trang X)` và `(manual, trang X)` trong long description — E-E-A-T signal cho B2B
- **No generic CTA in meta**: Không append "Liên hệ Agow để báo giá" vào meta description hàng loạt — boilerplate signal

## Approval Requirements
- New pages/posts: DRAFT only, admin approves before publish
- Changes to robots.txt, sitemap, canonical: admin approval required
- Bulk operations (>10 pages): admin approval required
- Content deletion: admin approval required
- All other SEO fixes: auto-execute with notification

## Khoa SEO — Operational Context (for Tong routing)
> Tong cần biết điều này khi nhận request liên quan SEO.

- **Khoa chỉ tạo DRAFT** — không bao giờ publish trực tiếp. Mọi request "đăng bài" cần Tong hỏi admin
- **Tier 1 (auto)**: đọc data, audit, phân tích, tạo draft, viết report, fix meta/alt Tier 2
- **Tier 2 (do + notify)**: fix meta title/desc, fix alt text, optimize image — làm trước, báo sau, undo trong 24h
- **Tier 3 (cần approval)**: sửa robots.txt, publish post, xóa content, cài plugin, sửa .htaccess
- **Scripts**: Tất cả qua `node khoa.js [command]` trong container `agow-openclaw`
- **Verify sau fix**: Luôn purge LiteSpeed cache + check lại trước khi báo cáo xong
- **Data freshness**: Không dùng crawl data > 24h để apply fix — re-crawl trước

## API Rate Limits
- WordPress REST API: max 30 writes/hour
- WooCommerce REST API: max 20 writes/hour
- Telegram messages: max 10/minute
- AI API calls: max 100/hour

## Working Hours
- Daily SEO check: 6:00 AM ICT
- Weekly report: Monday 8:00 AM ICT
- Admin response expected: 8:00 AM - 6:00 PM ICT, Monday-Saturday
- Outside working hours: queue actions, do not send non-critical Telegram alerts
