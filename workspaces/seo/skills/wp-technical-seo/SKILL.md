---
name: wp-technical-seo
description: Fix technical SEO issues — meta tags, H1, alt text, schema markup, canonical URLs
---

# Skill: WP Technical SEO

## Purpose
Handle technical SEO fixes: meta tags, schema markup, H1 tags, canonical URLs, alt text, and other on-page technical elements.

## Trigger
- User request: "sửa meta", "thêm schema", "fix H1", "canonical", "technical SEO"
- Auto-triggered by wp-daily-check T05 for specific issue codes
- Auto-triggered by wp-audit for technical issues

## Approval Tiers by Action

### Tier 1 — Auto-Execute (read-only)
- Analyze current meta/schema/H1 status of any page
- Generate fix recommendations
- Check canonical URL correctness
- Validate schema markup

### Tier 2 — Notify-Then-Do
- Update meta title/description (rank_math_title, rank_math_description)
- Add/fix alt text on images
- Add/update JSON-LD schema markup
- Fix missing H1 (for non-PageBuilder pages)
- Update focus keyword (rank_math_focus_keyword)
- Add internal links to orphaned pages

### Tier 3 — Require Approval
- Modify canonical URLs
- Change robots meta (rank_math_robots)
- Modify sitemap inclusion/exclusion
- Bulk technical fixes (>10 pages)

## Semantic SEO Principles (2026-04-01)

> Áp dụng cho MỌI fix trong skill này. Không viết content cơ học — phải hiểu intent người dùng.

### Nguyên tắc cốt lõi
- **User intent first**: Viết cho người tìm kiếm, không phải cho bot. Hỏi: "Người dùng gõ gì để tìm trang này?"
- **Fetch trước, viết sau**: Luôn đọc `short_description` / `content` / `excerpt` trước khi tạo meta bất kỳ
- **Keyword tự nhiên**: Từ khóa xuất hiện tự nhiên trong context, không nhồi nhét
- **Đặc tả kỹ thuật là keyword**: Với B&R products, thông số (16 kênh, M12, EtherNet/IP, 2003 System) là keyword người kỹ sư search

### Formula Semantic Meta theo loại trang
| Loại trang | Intent người dùng | Formula meta desc |
|------------|------------------|-------------------|
| WC Product (module) | "Tôi cần module [chức năng] cho hệ thống [dòng SP]" | `[Chức năng] [Mã SP] [Thông số kỹ thuật]. Thuộc dòng [X67/X20/2003]. Liên hệ Agow để báo giá.` |
| WC Product (PLC/HMI) | "Tôi cần PLC [đặc điểm] thay thế/mới" | `PLC [Mã] [Đặc điểm nổi bật]. [Ứng dụng phù hợp]. Agow Automation – nhà phân phối B&R tại VN.` |
| Blog post | "Tôi muốn hiểu [chủ đề]" | `[Tóm tắt chủ đề chính]. [Điểm nổi bật bài viết]. [CTA: Đọc thêm / Tìm hiểu].` |
| Service page | "Tôi cần dịch vụ [X]" | `Dịch vụ [tên] cho thiết bị B&R. [Lợi ích chính]. Liên hệ Agow Automation.` |
| Category page | "Tôi tìm [loại sản phẩm] B&R" | `Danh mục [tên] B&R Automation tại Agow. [Số lượng / đặc điểm]. Báo giá nhanh.` |

## Fix Procedures

### MISSING_TITLE / SHORT_TITLE / LONG_TITLE
```
BƯỚC 0 — Fetch nội dung trước:
  - WC product: GET /wp-json/wc/v3/products/{id} → đọc name, short_description, categories
  - WP post/page: GET /wp-json/wp/v2/{type}/{id} → đọc title, excerpt, content (500 từ đầu)

BƯỚC 1 — Xác định intent: người dùng search gì để tìm trang này?
  - B&R product: [Mã SP] + [Chức năng] + [Thông số kỹ thuật] + [Dòng SP]
  - Blog: [Chủ đề chính] + [Lợi ích độc giả]

BƯỚC 2 — Viết title semantic (KHÔNG truncate cơ học):
  Format chuẩn B&R: [Mã SP] [Loại thiết bị] [Đặc điểm kỹ thuật] [Dòng SP] B&R
  - ≤60 chars | mã SP đầu tiên | brand cuối | KHÔNG "Hãng B&R" / "của B&R Automation Hãng B&R"

BƯỚC 3 — Đề xuất cho admin duyệt (KHÔNG tự apply khi batch >10 items)

BƯỚC 4 — PUT /wp-json/wp/v2/{type}/{id} với meta.rank_math_title
BƯỚC 5 — Purge LiteSpeed cache
BƯỚC 6 — Verify via re-crawl

Script: node khoa.js check-title / fix-title [--apply] [--id=N]
```

### NO_META_DESC / THIN_META_DESC
```
BƯỚC 0 — Fetch nội dung trước:
  - WC product: name + short_description + categories[].name
  - WP post/page: excerpt.rendered + content (200 từ đầu) + title

BƯỚC 1 — Xác định intent và USP (Unique Selling Point) của trang
  - Product: đặc điểm kỹ thuật chính + ứng dụng + dòng sản phẩm
  - Post: giá trị bài viết mang lại cho người đọc
  - Service: lợi ích dịch vụ + phạm vi

BƯỚC 2 — Viết meta description semantic:
  Formula: [Chức năng/Chủ đề] [Thông số/Điểm nổi bật]. [CTA bằng tiếng Việt]
  - 120–160 chars | focus keyword tự nhiên | CTA cuối ("Liên hệ", "Xem ngay", "Báo giá")
  - KHÔNG: "Trang này nói về..." / "Đây là..." / keyword nhồi nhét

BƯỚC 3 — Đề xuất cho admin duyệt (Tier 2: áp dụng rồi notify, undo trong 24h)

BƯỚC 4 — PUT meta.rank_math_description
BƯỚC 5 — Purge cache + verify

Script: node khoa.js check-meta / fix-meta [--apply] [--id=N]
```

### NO_H1
Two scenarios:
- **Regular page**: Add H1 at content start via content update
- **PageBuilder page**: Cannot add via REST API — log and notify admin
  - Reason: PageBuilder renders H1 from its own data structure
  - Solution: PHP filter via WPCode (already installed) injects H1
  - Just verify the PHP filter is working

### MULTIPLE_H1
```
1. Identify all H1 tags in content
2. Keep the most relevant H1 (matches title/keyword)
3. Demote others to H2
4. Update content via PUT
5. Purge cache + verify
```

### MISSING_ALT
```
1. List all images without alt text via WP REST API:
   GET /wp-json/wp/v2/media?per_page=100&_fields=id,alt_text,source_url
2. For each image:
   a. Analyze image context (surrounding text, page topic)
   b. Generate descriptive alt text (5-15 words, include product model/name)
   c. PUT /wp-json/wp/v2/media/{id} with { "alt_text": "..." }
3. Purge cache + verify

CRITICAL — ĐÚNG ĐỊNH NGHĨA DUPLICATE ALT:
- Duplicate alt text CHỈ là vấn đề khi nhiều ảnh có cùng alt text TRÊN CÙNG MỘT TRANG
- Duplicate alt text KHÁC TRANG → KHÔNG phải lỗi (bình thường với product catalog)
- ĐỪNG report duplicate dựa trên media library toàn site — phải check per-page

Cách kiểm tra duplicate alt đúng:
  a. Fetch nội dung từng trang (HTML rendered)
  b. Extract tất cả <img alt="..."> trên trang đó
  c. Tìm alt text xuất hiện >= 2 lần TRONG CÙNG TRANG ĐÓ
  d. Chỉ report/fix những trang đó
```

### DUPLICATE_ALT (ảnh trùng alt trên cùng 1 trang)

**BƯỚC 1 — Chạy script có sẵn (LUÔN dùng cách này, không tự viết lại):**
```bash
node /home/node/.openclaw/workspaces/seo/scripts/check-duplicate-alt.js
```
Script này đã được test và cho kết quả đúng. Đọc output, báo cáo cho user.

**BƯỚC 2 — Phân loại kết quả từ script:**
- Cùng 1 ảnh (same src) dùng 2 lần → bình thường, KHÔNG báo lỗi
- 2 ảnh KHÁC NHAU có cùng alt text → LỖI THỰC SỰ, cần sửa (Tier 2)

**BƯỚC 3 — Cách sửa (Tier 2, sửa rồi notify):**
```
Giữ ảnh đầu tiên (index 0), sửa các ảnh còn lại:
- Ảnh góc khác cùng sản phẩm:
    "PLC X20CP3583" → "PLC X20CP3583 mặt sau" / "PLC X20CP3583 chi tiết kết nối"
- Ảnh minh họa nội dung:
    Mô tả cụ thể hơn những gì đang thấy trong ảnh đó

WC Products: PUT /wp-json/wc/v3/products/{id}  body: {"images": [...updated images array...]}
WP Media   : PUT /wp-json/wp/v2/media/{id}      body: {"alt_text": "new alt"}
```

⚠️ **Các lỗi Khoa hay mắc — TRÁNH:**
- ❌ Dùng `_links.wp:featuredmedia` để check duplicate → chỉ thấy featured image, bỏ sót 117 ảnh trong content
- ❌ Tự viết bash/curl script để parse HTML → curl không có jq, timeout, kết quả sai
- ❌ Query `/wp-json/wp/v2/media` (media library) → báo duplicate cross-site, không phải same-page
- ❌ Chỉ check 10 items rồi báo "không có lỗi" → phải pagination qua toàn bộ (script có sẵn đã xử lý)

### NO_SCHEMA
```
1. Determine page type:
   - Product page → Product schema
   - Blog post → Article schema
   - Category → CollectionPage schema
   - Company page → Organization schema
2. Generate JSON-LD schema
3. Inject via content filter (WPCode PHP snippet handles this)
4. Validate at schema.org/validator (or structured data testing tool)
5. Purge cache + verify
```

### NO_CANONICAL
```
1. Determine correct canonical URL:
   - Self-referencing for unique pages
   - Point to main product for variant pages
   - HTTPS version always
2. This is Tier 3 if changing existing canonical
3. Set via rank_math_robots or header injection
4. Purge cache + verify
```

## Backup Before Fix
Before ANY write operation:
```
1. GET current state of the resource
2. Save to backup: {
     url, post_id, type,
     old_title, old_description, old_content_excerpt,
     old_alt_texts, old_schema,
     timestamp, fix_type
   }
3. Backup stored in shared-knowledge/backups/{date}/{post_id}.json
4. Retention: 30 days
```

## Undo Capability
For every Tier 2 fix, provide undo:
```
Telegram message format:
"Đã sửa {ISSUE_CODE} cho {URL}:
  Trước: {old_value}
  Sau: {new_value}

Nhấn UNDO-{task_id} để hoàn tác."
```
On UNDO command → restore from backup → purge cache → verify → confirm

## WordPress API Specifics

### Reading RankMath meta:
```
GET /wp-json/wp/v2/posts/{id}?_fields=id,title,meta
→ response.meta.rank_math_title
→ response.meta.rank_math_description
→ response.meta.rank_math_focus_keyword
```
NOTE: Only works if register_post_meta() PHP snippet is active.

### For categories/tags:
```
GET /wp-json/wp/v2/categories/{id}?_fields=id,name,meta
→ response.meta.rank_math_title
```
NOTE: Only works if register_term_meta() PHP snippet is active.

### Updating meta:
```
PUT /wp-json/wp/v2/posts/{id}
Headers: Authorization: Basic {base64(user:app_password)}
Body: { "meta": { "rank_math_title": "New Title | Agow" } }
```

## Error Handling
- Meta field not writable → PHP snippet likely missing → alert admin with instructions
- Schema validation fails → retry generation, if still fails → log for manual fix
- Image 404 when updating alt → skip, log broken image
- Bulk fix hitting rate limit → pause 60s, resume with remaining items
