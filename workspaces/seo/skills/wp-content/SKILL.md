---
name: wp-content
description: Create new content or expand thin content for WordPress pages and posts using AI
---

# Skill: WP Content

## Purpose
Create new content or expand thin content for agowautomation.com pages and posts.

## Approval Tier
- New post/page creation: Tier 3 (create as DRAFT, await PUBLISH approval)
- Content expansion (existing page): Tier 2 (expand then notify with undo option)

---

## Blog Writer — Daily Workflow (Mass Production)

### Trigger
- User: "viết bài hôm nay", "write blog", "tạo blog mới"
- Cron: 6:00 AM daily (from wp-daily-check SKILL.md)

### Step 1 — Generate draft + find images
```
node khoa.js write-blog
# hoặc topic cụ thể:
node khoa.js write-blog -- --topic="Hướng dẫn lập trình B&R X20"
```

Script tự động:
1. Research topic (từ GSC hoặc topic pool)
2. Classify + outline (7 headings, focus keyword, LSI)
3. Gemini viết HTML (~1100 từ)
4. SerpAPI tìm ảnh: 2 slot × top-5 candidates (⭐B&R CDN ưu tiên)
5. Tạo WP draft (giữ placeholder [IMAGE_1]/[IMAGE_2])
6. In Telegram notification

### Step 2 — Telegram notification format (Khoa gửi lên group)
```
✅ Draft bài viết mới — ID {N}
📝 {SEO title}
🔑 {keyword}  |  📊 {type}
🔗 https://agowautomation.com/?p={N}&preview=true

📷 [Ảnh 1] — chèn sau heading đầu tiên:
  1. {title} (WxH) ⭐B&R CDN
     {url}
  2. {title} (WxH)
     {url}
  ...

📷 [Ảnh 2] — chèn giữa bài:
  1. {title} (WxH) ⭐B&R CDN
     {url}
  ...

→ node khoa.js pick-image -- --id={N} --img1=1 --img2=1
→ Publish ngay: node khoa.js publish-blog -- --id={N} --publish
→ Xóa draft:   node khoa.js publish-blog -- --id={N} --reject
```

### Step 3 — User duyệt ảnh qua Telegram
User reply: `img1=1 img2=2` (hoặc lệnh đầy đủ)

Khoa thực thi:
```
node khoa.js pick-image -- --id={N} --img1=1 --img2=2
```

Script tự động:
1. Download ảnh slot1 + slot2
2. Upload lên WP Media Library (filename: `{slug}-img1-1.jpg`)
3. Fetch content draft → replace [IMAGE_1] → [IMAGE_2]
4. Update WP post: content mới + featured_media = ảnh 1
5. Xóa pending JSON

### Step 4 — Publish sau khi duyệt nội dung
```
node khoa.js publish-blog -- --id={N} --publish
```

### Image selection rules (Khoa apply khi filter):
- ⭐ B&R CDN domains (`br-cws-assets.de-fra-1.linodeobjects.com`, `br-automation.com`, `discourse-cdn.com/brcommunity`) → ưu tiên top-3
- Ảnh còn lại (general industrial) → fill đến top-5
- Alt text tự động = section heading (tiếng Việt)
- Filename = `{slug}-img{slot}-{idx}.jpg`

---

### 1. Technical Specifications → from WordPress product pages
- Fetch product page via WooCommerce REST API: `GET /wp-json/wc/v3/products?sku={model_number}`
- Also fetch post content: `GET /wp-json/wp/v2/posts?search={model_number}`
- Extract specs from existing product content — do NOT use extracted PDF text or product-catalog.md as primary source
- If product page has no specs → fall back to product-catalog.md → flag gap to admin

### 2. Product Images → from WordPress Media Library
- Search existing media: `GET /wp-json/wp/v2/media?search={model_number}`
- Use existing product images — do NOT download/re-upload images that already exist
- If no product images in library → use placeholder, flag to admin

### 3. Illustrative/Generic Images → Unsplash → Upload to WordPress
- Use Unsplash API to search for relevant generic images (industrial, automation, factory)
- Download image binary (do NOT embed Unsplash URL in article)
- Rename file descriptively: `br-x20-analog-module-industrial.jpg` (kebab-case, relevant keywords)
- Upload to WordPress Media Library via REST API
- Set alt text: specific to article context (e.g., "Module analog B&R X20AI2222 ứng dụng điều khiển")
- Set title and caption: Vietnamese, no Unsplash attribution required (Unsplash license permits commercial use without credit)
- Use the WordPress media ID in article — not the Unsplash URL

**Unsplash → WordPress upload flow:**
```
1. GET https://api.unsplash.com/search/photos?query={topic}&orientation=landscape
2. Choose best match (check: not branded, not person-focused, industrial/technical context)
3. Download: GET {photo.urls.regular} → binary
4. POST /wp-json/wp/v2/media
   Headers: Content-Disposition: attachment; filename="{custom-name}.jpg"
   Body: image binary
5. PATCH /wp-json/wp/v2/media/{id}
   Body: {"alt_text": "{contextual alt}", "title": "{vi title}", "caption": ""}
6. Use media ID in post content
```

---

## Project Post — Case Study Workflow

### Trigger (từ Telegram)
User gửi tin nhắn dạng:
- "@khoa vừa hoàn thành sửa ACOPOS..."
- "@khoa viết bài về dự án lắp đặt X20 tại nhà máy..."
- "@khoa hôm qua thi công xong..."

Kèm hoặc không kèm ảnh.

### Thông tin Khoa cần thu thập (hỏi từng bước nếu thiếu)

| Trường | Mô tả | Bắt buộc? |
|--------|-------|-----------|
| `task_type` | repair / install / retrofit / maintenance | Có |
| `devices` | Tên + model thiết bị (VD: ACOPOS 1022, X20CP3484) | Có |
| `factory.industry` | Ngành sản xuất (bao bì, thực phẩm, dệt may...) | Có |
| `factory.location` | Tỉnh/thành (không cần tên cụ thể nếu khách không muốn) | Có |
| `factory.name` | Tên nhà máy (tùy chọn — nếu khách cho phép công khai) | Không |
| `duration` | Thời gian thực hiện (VD: 2 ngày, 1 tuần) | Có |
| `problem` | Sự cố / yêu cầu ban đầu | Có |
| `solution` | Giải pháp đã thực hiện | Có |
| `result` | Kết quả đạt được | Có |
| `extra` | Thông tin bổ sung (tùy chọn) | Không |

**Câu hỏi theo task_type:**
- **repair**: "Thiết bị bị lỗi gì? Triệu chứng như thế nào trước khi sửa?"
- **install**: "Hệ thống lắp đặt dùng cho dây chuyền gì? Quy mô bao nhiêu I/O?"
- **retrofit**: "Thiết bị cũ là gì? Nâng cấp lên gì? Lý do nâng cấp?"
- **maintenance**: "Bảo trì định kỳ hay bảo trì khẩn cấp? Nội dung gồm những gì?"

### Xử lý ảnh từ Telegram

Khi admin gửi ảnh kèm tin nhắn Telegram:
1. Khoa nhận `file_id` từ Telegram message
2. Khoa tải ảnh về qua Telegram Bot API:
   ```
   GET https://api.telegram.org/bot{TOKEN}/getFile?file_id={file_id}
   → lấy file_path
   GET https://api.telegram.org/file/bot{TOKEN}/{file_path}
   → download binary
   ```
3. Upload lên WP Media qua REST API (multipart):
   - filename: `project-{task_type}-{device-slug}-{n}.jpg`
   - alt_text: mô tả ngắn (VD: "Sửa chữa ACOPOS 1022 tại nhà máy bao bì")
4. Lưu media IDs để truyền vào script

**Nếu không có ảnh** → Khoa hỏi:
> "Bạn có ảnh quá trình thực hiện hoặc kết quả không? Gửi cho mình để đính kèm vào bài nhé. (Nếu không có thì mình vẫn viết được bài)"

### Conversation flow (Khoa thực hiện)

```
[User gửi: "@khoa vừa sửa xong ACOPOS tại nhà máy bao bì"]

Bước 1 — Khoa phân loại & hỏi thông tin còn thiếu:
  "Mình hiểu rồi! Để viết bài hay mình cần thêm vài thông tin:
   1. Thiết bị model cụ thể là gì? (VD: ACOPOS 1022, 1090...)
   2. Nhà máy ở tỉnh/thành nào?
   3. Sự cố ban đầu là gì? Triệu chứng như thế nào?
   4. Thời gian sửa chữa mất bao lâu?
   5. Kết quả sau sửa chữa (máy chạy lại bình thường? cải thiện gì?)"

Bước 2 — Sau khi user trả lời:
  Khoa xác nhận lại và hỏi ảnh nếu chưa có.

Bước 3 — Khi đủ thông tin:
  Khoa build project info JSON và chạy script:
  node khoa.js write-project -- \
    --info='{"task_type":"repair","devices":["ACOPOS 1022"],...}' \
    --img-ids=5490,5491 \
    --schedule=2026-04-18
```

### Sau khi script chạy xong
Khoa gửi lên Telegram:
```
✅ Bài case study đã tạo — ID {N}
📝 {seo_title}
🔑 {focus_keyword}
🔗 Preview: https://agowautomation.com/?p={N}&preview=true
📅 Sẽ đăng: {date} 08:00

→ Duyệt và publish: node khoa.js publish-blog -- --id={N} --publish
→ Đổi lịch:         node khoa.js schedule-blog -- --id={N} --date=YYYY-MM-DD
→ Xóa draft:        node khoa.js publish-blog -- --id={N} --reject
```

---

## Content Strategies

### Strategy 1: Thin Content Fix (< 300 words)
Full rewrite approach:
1. Read existing content and meta
2. Fetch specs from WordPress product page (see Data Sources §1)
3. Fetch/prepare images (see Data Sources §2, §3)
4. Generate comprehensive content (target: 800-1200 words):
   - Introduction: What is this product/category
   - Technical specifications: pulled from product page
   - Applications: real-world use cases in Vietnam manufacturing
   - Comparison: vs similar products in lineup
   - FAQ: 3-5 common questions
5. Set RankMath focus keyword

### Strategy 2: Medium Content Enhancement (300-600 words)
Enhance existing approach:
1. Read and understand current content structure
2. Fetch any missing specs from WordPress product page
3. Identify gaps (missing specs, no applications section, no FAQ)
4. Add missing sections (target: total 800+ words)
5. Improve existing sections with more detail
6. Do NOT rewrite sections that are already good
7. Preserve author voice and style

### Strategy 3: New Content Creation
For completely new posts/pages:
1. Receive topic from user or Lead Agent
2. Fetch specs and images from WordPress (see Data Sources)
3. Research via existing site content
4. Create outline first → confirm with admin if complex
5. Write full article (target: 1000-1500 words)
6. Generate meta title (≤60 chars), description (140–155 chars, thông số kỹ thuật cụ thể, KHÔNG CTA chung), focus keyword
7. Create as DRAFT — never auto-publish

## Content Quality Checks
Before submitting content:
- [ ] Word count meets target
- [ ] Focus keyword appears in: title, first paragraph, H2, meta description
- [ ] No duplicate content with existing pages (check via wp-audit similarity)
- [ ] All product names/model numbers are accurate (verify against product-catalog.md)
- [ ] Vietnamese grammar and spelling check
- [ ] Technical terms are correct (B&R terminology)
- [ ] Internal links to related products/categories included
- [ ] Alt text inflation check: no duplicate alt text in new images

## WordPress API Integration

### Update existing post content:
```
PUT /wp-json/wp/v2/posts/{id}
Body: {
  "content": "{new_content}",
  "meta": {
    "rank_math_title": "{seo_title}",
    "rank_math_description": "{meta_desc}",
    "rank_math_focus_keyword": "{keyword}"
  }
}
```

### Create new draft:
```
POST /wp-json/wp/v2/posts
Body: {
  "title": "{title}",
  "content": "{content}",
  "status": "draft",
  "categories": [{category_ids}],
  "meta": {
    "rank_math_title": "{seo_title}",
    "rank_math_description": "{meta_desc}",
    "rank_math_focus_keyword": "{keyword}"
  }
}
```

### After content update:
1. Call LiteSpeed cache purge for the URL
2. Wait 5 seconds
3. Re-crawl to verify changes are live
4. Re-score the page
5. Log: old_score → new_score, content_change_summary

## Model Selection
- **claude-haiku-4-5**: For content expansion (strategy 2), meta descriptions
- **claude-sonnet-4-6**: For full rewrites (strategy 1), new content creation (strategy 3)
- Cost estimation: ~$0.005 per Haiku call, ~$0.03 per Sonnet call

## Error Handling
- API write fails → retry 3x → save content locally as backup → alert admin
- Content generation quality low → re-generate with more specific prompt
- Duplicate content detected → abort, flag for manual review
- Word count below target after generation → retry with explicit word count instruction
