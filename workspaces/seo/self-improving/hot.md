# SEO Agent "Khoa" — HOT Memory
<!-- Always loaded at session start. Max 50 rules (see guardrails). -->
<!-- Decay: unused 30 days → demote to WARM -->

## Site Config
- WP_URL: https://agowautomation.com
- GSC property: sc-domain:agowautomation.com
- SEO plugin: RankMath
- Theme: Flatsome (Page Builder)
- Cache: LiteSpeed Cache — MUST purge after every content change
- WooCommerce: Yes — products use /wc/v3/ API with Consumer Key/Secret, NOT /wp/v2/
- Total products: ~590 (paginate ?per_page=100&page=N đến hết)
- Total pages: ~18 | Total posts: ~9

## Model & Runtime
- Model: claude-sonnet-4.6 via Claudible (sonnet cho tất cả tasks — haiku đã bỏ)
- Container: không có jq, không có python requests — dùng Node.js cho data processing
- Credentials: dùng `printenv` — KHÔNG có file .env trong container

## Scripts Có Sẵn
<!-- Entry point duy nhất: khoa.js — LUÔN dùng khoa.js, không gọi scripts trực tiếp -->
- `node /home/node/.openclaw/workspaces/seo/scripts/khoa.js help`
  → Xem toàn bộ commands

### Commands:
| Command | Mô tả | Có --apply? |
|---------|--------|-------------|
| `check-meta` | Tìm NO_META_DESC/THIN_META_DESC + đề xuất semantic (dry-run) | Không |
| `fix-meta` | Ghi meta description. --apply, --id=N, --type=post\|page\|product | Có |
| `check-title` | Tìm LONG_TITLE/SHORT_TITLE (dry-run) | Không |
| `fix-title` | Sửa LONG_TITLE tự động (SHORT cần manual) | Có |
| `missing-alt` | Tìm ảnh thiếu alt (dry-run) | Không |
| `fix-missing-alt` | Sửa alt text bị thiếu | Có |
| `check-duplicate-alt` | Tìm duplicate alt (dry-run) | Không |
| `fix-duplicate-alt` | Sửa duplicate alt | Có |
| `verify` | Xác nhận tất cả alt đúng | Không |
| `purge-cache` | Purge LiteSpeed Cache | Không |

### ⚠️ Script Version Log — ĐỌC TRƯỚC KHI TỰ PHÁN ĐOÁN
> Khi corrections.md ghi "script X sai" — kiểm tra version log dưới đây để biết đã sửa chưa.
> ĐỪNG tự viết lại script khi chưa xác nhận version hiện tại.

| Script | Version | Ngày | Logic chính | Trạng thái |
|--------|---------|------|-------------|------------|
| `fix-meta-desc.js` | v2 | 2026-04-01 | THIN→extend bản gốc; NO→build từ short_desc; KHÔNG CTA product | ✅ ĐÃ SỬA |
| `fix-title.js` | v1 | 2026-04-01 | Fetch short_desc → semantic title [Mã SP][Chức năng][Spec][Dòng] B&R | ✅ OK |
| `fix-missing-alt.js` | v1 | 2026-03-31 | Generate từ product name + context | ✅ OK |
| `fix-duplicate-alt.js` | v1 | 2026-03-31 | Per-page dedup với suffix phân biệt | ✅ OK |

**Cách verify script trước khi dùng**: `node khoa.js check-meta --id=3333 --type=product`
→ Nếu output KHÔNG có "Liên hệ Agow để được báo giá" ở cuối → script v2 đang chạy đúng

### Shared Client:
- `wp-client.js` — shared HTTP module, tất cả scripts đều dùng
- Đọc config từ env vars: `WP_BASE_URL`, `WP_USERNAME`, `WP_APP_PASSWORD`, `WC_CONSUMER_KEY`, `WC_CONSUMER_SECRET`
- KHÔNG hardcode hostname — portable cho bất kỳ WordPress site nào

### Kết quả đã verify (2026-03-31 → 2026-04-02):
- Alt text: **126/126 PASS** ✅
- Duplicate alt: đã fix trên 3 trang ✅
- Title LONG_TITLE: **0 còn lại** ✅ — 42 items fixed
- Meta desc posts: **0 issues** ✅
- Meta desc pages: **9 issues** (8 NO + 1 THIN) — pending fix
- Meta desc products: **~380 THIN_META_DESC** — script v2 sẵn sàng, chờ approval
- SHORT_TITLE system pages: 9 — intentionally skipped

## Critical Rules (production-proven)
- H1 injection: Flatsome + LiteSpeed → use wp_footer PHP hook, NOT ob_start()
- ob_start() does NOT work with LiteSpeed → use action hooks instead
- WC product meta: use meta_data[] array format, NOT meta{} object
- parsed_data lacks product IDs → enrich from url_inventory before pushing fixes
- Product schema: use JS template, do NOT call AI (saves cost)
- After deploying any snippet: purge LiteSpeed Cache before verifying changes
- Alt text dedup: phải check per-page — duplicate cross-site KHÔNG phải lỗi
- **Title KHÔNG truncate cơ học** — LUÔN fetch short_description trước khi đề xuất title mới
- **Title format B&R**: `[Mã SP] [Chức năng] [Thông số kỹ thuật] [Dòng SP] B&R` — mã SP đầu tiên
- **Title double-brand**: xóa "Hãng B&R" và "của B&R Automation Hãng B&R" — thay bằng "B&R" cuối title
- **MISSING_TITLE**: trang /thanh-toan (ID: page) — critical, không có thẻ `<title>` — fix ngay
- **Meta desc ngưỡng đúng**: 140–155 chars (KHÔNG phải 120) — Google hiển thị ~155 desktop, ~120 mobile
- **Meta desc KHÔNG append CTA chung**: "Liên hệ Agow..." vào 78 sản phẩm = boilerplate, giảm uniqueness
- **Meta desc THIN_META_DESC fix đúng**: dùng ~40 chars còn lại để thêm THÔNG SỐ KỸ THUẬT cụ thể (resolution, khe PCI, protocol, ứng dụng) — không phải CTA generic

## Baseline Metrics (post Sprint 0-2, 2026-03-22)
- Total URLs indexed: 646
- Avg SEO score: 81.9/100 (products), 80.3/100 (overall)
- Issues fixed: 4,600+
- Alt text fixed: 3,225 occurrences (31 unique files)
- Meta updated: 161 pages
- GSC baseline: 36 clicks/day, 1,807 impressions/day, avg position 14.7

## Verified Findings (2026-03-31)
- Duplicate alt text: 3 trang có lỗi
  - Trang Chủ (ID:2): 15 nhóm duplicate — ưu tiên fix
  - PLC X20CP3583 (ID:3789): x2 duplicate
  - PLC MX207 (ID:3738): x2 duplicate
- Đã báo cáo user, chờ approval để fix

## Last Updated
2026-04-02 — Thêm Script Version Log vào hot.md để Khoa không tự phán đoán script cũ/mới
