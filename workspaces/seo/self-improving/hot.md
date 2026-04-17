# SEO Agent "Khoa" — HOT Memory
<!-- Rules applied EVERY session. Max 50 rules. Promote from WARM after 3x in 7 days. -->
<!-- Source: Seeded from production 28-auditwebagow + lessons from 2026-03-31 to 2026-04-02 -->

## Site Config
- **Domain**: agowautomation.com
- **Platform**: WordPress + WooCommerce + RankMath SEO + Flatsome theme
- **Cache**: **WP Rocket** (KHÔNG phải LiteSpeed) — purge qua WP Admin hoặc admin bar, không có REST API
- **Container**: `agow-openclaw` | Scripts: `node //home/node/.openclaw/workspaces/seo/scripts/khoa.js [cmd]`
- **Auth**: `printenv WP_USERNAME WP_APP_PASSWORD WC_CONSUMER_KEY WC_CONSUMER_SECRET`

## Cache Rule (CRITICAL)
- Sau MỌI thay đổi content → purge WP Rocket cache qua WP Admin → "Clear Cache"
- `purge-cache.js` chỉ purge LiteSpeed API — nếu WP Rocket đang active, phải purge manual
- Verify sau purge: fetch page và check không còn `<!-- cached@ -->` comment

## Schema Rules (learned 2026-04-02)
- **Product schema**: WPCode snippet `product-schema.php` đang active — inject vào tất cả WC product pages
  - Fields: `@type:Product`, `name`, `sku`, `mpn`, `brand`, `offers` (InStock/OutOfStock), `image`, `category`
  - Brand auto-detect: Bachmann nếu category slug `hang-bachmann`/`plc-bachmann`, còn lại = `B&R Automation`
- **Organization schema**: WPCode snippet `fix-organization-type.php` đang active — đã xóa `Electrician`
- **2 JSON-LD blocks** trên product page là bình thường (RankMath + snippet) — không phải lỗi

## SKU/MPN Rules (learned 2026-04-02)
- **SKU format**: lowercase mã B&R (vd: `x20cp1483-1`, `8v1640.00-2`)
- **MPN format**: UPPERCASE (vd: `X20CP1483-1`, `8V1640.00-2`)
- **Coverage hiện tại**: 587/590 SP (99%) đã có SKU — 3 còn lại là bản cũ 2021 đã set draft
- **Khi thêm SP mới**: bắt buộc điền SKU ngay — nếu quên, extract từ product name bằng B&R regex
- **B&R regex patterns**: `X20xxx`, `X67xxx`, `X90xxx`, `3xx`, `8Vxxx`, `5APCxxx`, `5PCxxx`, `5LSxxx`, `5APxxx`, `8BACxxx`, `4IFxxx`, `MXxxx`, `PPxxx`, `7AIxxx`, `7DOxxx`
- **Duplicate SKU**: nếu WC API trả 400 `product_invalid_sku` → kiểm tra SP trùng SKU → compare cũ/mới → set bản cũ hơn về draft

## Critical Rules (from production)
1. **LiteSpeed/WP Rocket**: Purge cache sau MỌI thay đổi — không check LiteSpeed nếu WP Rocket active
2. **register_term_meta**: WP REST API không expose RankMath meta cho category/tag nếu không có PHP snippet
3. **Alt text**: Không duplicate alt trên cùng 1 trang. agowautomation.com: 100% coverage OK — tập trung duplicate
4. **Crawl staleness**: Không dùng data >24h để apply fix
5. **WC credentials**: `/wc/v3/` endpoint dùng `WC_CONSUMER_KEY:WC_CONSUMER_SECRET` (Basic Auth), KHÔNG phải WP App Password
6. **GSC format**: `sc-domain:agowautomation.com` (no www, no https)
7. **wp_filter_kses**: WordPress strip `<h2>/<ul>/<li>` trong taxonomy description — cần WPCode snippet để allow HTML
8. **Windows docker**: Bắt buộc `MSYS_NO_PATHCONV=1` và `//home/...` (double slash) trên Git Bash
9. **Citation preservation**: Giữ `(data sheet, trang X)` trong long desc — E-E-A-T signal cho B2B industrial
10. **Meta desc**: THIN = <140c → extend bản gốc (thêm spec kỹ thuật), KHÔNG replace bằng text ngắn hơn

## Scripts Available
| Command | Tác dụng |
|---------|----------|
| `check-title` | Tìm LONG/SHORT_TITLE |
| `fix-title` | Sửa LONG_TITLE (dry-run mặc định, `--apply` để ghi) |
| `check-meta` | Tìm NO/THIN_META_DESC |
| `fix-meta` | Sửa meta description |
| `check-short-desc` | Tìm short_desc noise/thiếu |
| `fix-short-desc` | Sửa short_desc |
| `missing-alt` | Tìm ảnh thiếu alt text |
| `fix-missing-alt` | Thêm alt text |
| `check-duplicate-alt` | Tìm alt text trùng trên cùng trang |
| `fix-duplicate-alt` | Fix duplicate alt |
| `verify` | Verify alt text live |
| `purge-cache` | Purge LiteSpeed cache (nếu WP Rocket active: dùng WP Admin) |
| `rewrite-product` | AI viết lại title+short+meta WC products (dry-run) |
| `apply-rewrite-product` | Apply AI rewrite |
| `rewrite-desc` | AI viết lại long description |
| `apply-rewrite-desc` | Apply long desc rewrite |
| `ai-rewrite-category` | AI rewrite WC category description + SEO title/meta |
| `research-blog` | Research topic từ GSC + tạo outline (dry-run, không ghi WP) |
| `write-blog` | Viết bài + tìm ảnh SerpAPI + tạo draft WP |
| `publish-blog` | Publish hoặc xóa draft (`--id=N --publish` / `--id=N --reject`) |
| `pick-image` | Gán ảnh đã chọn vào draft (`--id=N --img=1-10`) |
| `help` | Xem tất cả commands |

## Blog Writing Rules (learned 2026-04-16)
- **AI model**: Gemini `gemini-3-flash-preview` (streaming, no proxy timeout) — dùng cho WRITE phase
- **Outline phase**: Claudible/Haiku — nhanh, output nhỏ, không cần Gemini
- **wp-blog-writer**: viết bài SEO chung từ topic pool / GSC — SerpAPI tìm ảnh, user pick-image sau
- **wp-project-post**: viết bài case study dự án — ảnh do admin cung cấp qua Telegram (KHÔNG dùng SerpAPI)
- **Lên lịch đăng**: dùng WP REST API `date` field (ISO 8601, UTC+7) — `PUT /wp-json/wp/v2/posts/{id}` với `{"date": "2026-04-18T08:00:00", "status": "future"}`
- **Image từ Telegram**: lấy `file_id` → `getFile` → download → upload WP Media multipart
- **docker compose restart** KHÔNG reload env vars — phải dùng `docker compose up -d --force-recreate`

## Baseline Metrics (2026-04-02)
- Total products: 590 (422 năm 2025 đã AI rewrite, 133 năm 2021 cần xử lý, 35 khác)
- SKU coverage: 587/590 (99%) ✅
- Product schema: 590/590 (100%) ✅ (WPCode snippet active)
- Organization schema: Fixed ✅ (Electrician removed)
- Alt text: 100% coverage ✅, 0 duplicate ✅
- WC categories: 31/31 description + SEO title/meta ✅
- SEO title LONG_TITLE: 0 ✅
- Meta desc optimal (140-155c): chưa re-audit sau fix

## Known Site Issues (check before assuming)
- PageBuilder (Flatsome) strips H1 tags → cần PHP filter để inject H1 back
- WP Rocket cache rất aggressive — luôn verify sau purge
- WooCommerce product alt text lưu ở `images[].alt` trong WC API (không phải WP media API)
- Duplicate products: 3 cặp OLD(2021)/NEW(2025) đã cleanup — OLD set về draft (IDs: 3201, 3184, 3223)
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
| `check-short-desc` | Tìm short_description có noise / quá ngắn (dry-run) | Không |
| `fix-short-desc` | Strip noise + rebuild short_desc ngắn. --apply, --id=N | Có |
| `check-long-desc` | Tìm long_description có noise (manual refs, metadata) (dry-run) | Không |
| `fix-long-desc` | Strip noise khỏi long_desc (giữ HTML). --apply, --id=N | Có |
| `check-title` | Tìm LONG_TITLE/SHORT_TITLE (dry-run) | Không |
| `fix-title` | Sửa LONG_TITLE tự động (SHORT cần manual) | Có |
| `missing-alt` | Tìm ảnh thiếu alt (dry-run) | Không |
| `fix-missing-alt` | Sửa alt text bị thiếu | Có |
| `check-duplicate-alt` | Tìm duplicate alt (dry-run) | Không |
| `fix-duplicate-alt` | Sửa duplicate alt | Có |
| `verify` | Xác nhận tất cả alt đúng | Không |
| `purge-cache` | Purge LiteSpeed Cache | Không |
| `rewrite-product` | AI viết lại title+short_desc+meta_desc WC products → cache JSON + CSV. --id=N, --limit=N, --resume | Không (dry-run) |
| `apply-rewrite-product` | Đẩy kết quả AI từ cache lên WooCommerce. --id=N apply 1 SP | Có |
| `rewrite-desc` | AI viết lại toàn bộ long desc WC products → cache JSON + CSV để review. --id=N test 1 SP, --limit=N test N SP | Không (dry-run) |
| `apply-rewrite-desc` | Đẩy kết quả AI từ cache lên WooCommerce. --id=N apply 1 SP | Có |

### ⚠️ Script Version Log — ĐỌC TRƯỚC KHI TỰ PHÁN ĐOÁN
> Khi corrections.md ghi "script X sai" — kiểm tra version log dưới đây để biết đã sửa chưa.
> ĐỪNG tự viết lại script khi chưa xác nhận version hiện tại.

| Script | Version | Ngày | Logic chính | Trạng thái |
|--------|---------|------|-------------|------------|
| `ai-rewrite-product.js` | v2 | 2026-04-03 | Filter: 2025 + (title cũ "Hãng B&R" OR short noise). Output: TITLE(50-60c)+SHORT_DESC(220-270c)+META_DESC(140-155c). maxTokens=900. MSYS_NO_PATHCONV=1 required on Windows | ✅ OK |
| `fix-meta-desc.js` | v3 | 2026-04-02 | THIN→extend (short+long fallback); NO→build; splitSentencesSafe (decimal-safe); trim-check | ✅ ĐÃ SỬA |
| `fix-short-desc.js` | v1 | 2026-04-02 | CLEAN_ONLY→strip noise; THIN→extend từ long; SHORT→rebuild; safety checks | ✅ OK |
| `fix-long-desc.js` | v2 | 2026-04-02 | Strip metadata block (Mã SP, Thương hiệu, Xuất xứ) + phone/email. **GIỮ (data sheet/manual, trang X)** — E-E-A-T | ✅ ĐÃ SỬA |
| `ai-rewrite-desc.js` | v2 | 2026-04-02 | cleanNoise() GIỮ citation; system prompt rule 6: PRESERVE citation patterns | ✅ ĐÃ SỬA |
| `claudible-client.js` | v1 | 2026-04-02 | Claudible OpenAI-compat wrapper. Env: CLAUDIBLE_API_KEY, PRIMARY_MODEL | ✅ OK |
| `fix-title.js` | v1 | 2026-04-01 | Fetch short_desc → semantic title [Mã SP][Chức năng][Spec][Dòng] B&R | ✅ OK |
| `fix-missing-alt.js` | v1 | 2026-03-31 | Generate từ product name + context | ✅ OK |
| `fix-duplicate-alt.js` | v1 | 2026-03-31 | Per-page dedup với suffix phân biệt | ✅ OK |

**Windows Note**: Tất cả `docker exec` với Unix path cần `MSYS_NO_PATHCONV=1` và `//home/...` (double slash) để tránh Git Bash path mangling.

### Shared Client:
- `wp-client.js` — shared HTTP module, tất cả scripts đều dùng
- Đọc config từ env vars: `WP_BASE_URL`, `WP_USERNAME`, `WP_APP_PASSWORD`, `WC_CONSUMER_KEY`, `WC_CONSUMER_SECRET`
- KHÔNG hardcode hostname — portable cho bất kỳ WordPress site nào

### Kết quả đã verify (2026-03-31 → 2026-04-04):
- Alt text: **126/126 PASS** ✅
- Duplicate alt: đã fix trên 3 trang ✅
- Title LONG_TITLE: **0 còn lại** ✅ — 42 items fixed
- **AI Rewrite 2025 products: 422/422 DONE** ✅ — title + short_desc + meta_desc cập nhật lên WooCommerce
- Sản phẩm 2021 (viết tay): **133 SP** — title 5 ngắn, short_desc 9 noise, meta_desc OK toàn bộ → cần xử lý tiếp

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
- **Citation preservation**: `(data sheet, trang X)` và `(manual, trang X)` là E-E-A-T signal — KHÔNG xóa trong bất kỳ script nào. 367/590 SP có citation chất lượng cao. Chỉ xóa: phone (028...), email, metadata block (Mã SP/Thương hiệu/Xuất xứ).
- **MISSING_TITLE**: trang /thanh-toan (ID: page) — critical, không có thẻ `<title>` — fix ngay
- **Meta desc ngưỡng đúng**: 140–155 chars — Google hiển thị ~155 desktop, ~120 mobile
- **Short description (WC)**: 200–300 chars — tăng mật độ LSI keyword trên trang product (KHÔNG phải meta desc)
- **Title ngưỡng đúng**: 50–60 chars — khai báo Entity (mã SP + loại thiết bị) + Thương hiệu B&R
- **3 yếu tố phân biệt rõ**: Title (entity/brand) ≠ Meta Desc (CTR/SERP) ≠ Short Desc (LSI/on-page)
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
2026-04-02 — Cập nhật chuẩn SEO semantic: Title 50-60c | Meta Desc 140-155c | Short Desc (WC) 200-300c. 3 yếu tố khác nhau về mục đích: Entity khai báo / CTR SERP / LSI on-page. ai-rewrite-product.js thay ai-rewrite-desc.js.
