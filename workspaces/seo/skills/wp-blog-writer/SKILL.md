---
name: wp-blog-writer
description: Tự động viết bài blog SEO semantic cho agowautomation.com — research topic từ GSC, outline, viết bài bằng Gemini, tìm ảnh qua SerpAPI, tạo draft WP, chờ user phê duyệt hoặc lên lịch qua Telegram.
---

# Skill: wp-blog-writer

## Purpose
Tự động hóa toàn bộ quy trình tạo nội dung blog:
1. Research topic từ GSC (hoặc theo yêu cầu user)
2. Classify loại bài + tạo outline SEO semantic (LSI keywords, word targets)
3. Viết bài hoàn chỉnh: 800–1500 từ, HTML, chuẩn semantic SEO — **dùng Gemini**
4. Tìm ảnh minh họa qua SerpAPI (Google Images) — user pick ảnh sau
5. Tạo draft trên WordPress + set RankMath meta
6. Báo cáo qua Telegram với danh sách ảnh để chọn, chờ phê duyệt

## Status: PRODUCTION ✅ (tested 2026-04-16)

## Tier Classification
| Action | Tier |
|--------|------|
| Research topic, tạo outline | Tier 1 (auto) |
| Viết bài, tạo draft | Tier 1 (auto) |
| **Publish bài viết** | **Tier 3 — BẮT BUỘC chờ user OK hoặc SCHEDULE** |
| Xóa draft | Tier 2 (notify sau) |

## Trigger: Tự động hàng ngày (8:00 AM ICT)
Chạy tự động theo cron — không cần user input.

## Trigger: Telegram Manual
```
@khoa viết bài [chủ đề]
@khoa write blog [topic]
@khoa research blog               ← chỉ outline, không viết
```

## Phê duyệt qua Telegram
```
OK [post_id]                       ← publish ngay
REJECT [post_id]                   ← xóa draft
SCHEDULE [post_id] YYYY-MM-DD      ← lên lịch đăng (hỏi giờ)
SCHEDULE [post_id] YYYY-MM-DD HH:MM ← lên lịch đăng giờ cụ thể
```

## Workflow Chi Tiết

### Phase 1: Research
```
Auto: GSC API → top queries (impressions>10, 30 ngày) → score → chọn opportunity
Manual: dùng topic từ Telegram
Fallback: topic pool B&R automation (10 chủ đề preset)
```

### Phase 2: Outline (Claudible/Haiku)
```
Output JSON:
  type: comparison | how-to | use-case | product-intro
  focus_keyword: 3–5 từ
  lsi_keywords: 4 từ/cụm liên quan
  title: ≤60 ký tự
  outline: 5–7 H2 headings (heading cuối = "Kết luận")
  word_target: {total, sections} theo type
  required_sections: bảng so sánh / FAQ / step-by-step / specs
  image_query: English, cụ thể theo topic (5–8 words)
```

### Phase 3: Write (Gemini `gemini-3-flash-preview`)
```
Input: topic + type + focus_keyword + lsi_keywords + outline + word_target + required_sections
Output JSON: html, excerpt, seo_title, meta_desc, focus_keyword, categories, tags
Tiếng Việt; thuật ngữ kỹ thuật giữ tiếng Anh
Cấu trúc: intro ≥100 từ + H2 sections + FAQ (how-to/comparison) + kết luận ≥100 từ
[IMAGE_1] sau H2 đầu, [IMAGE_2] giữa bài → placeholder bị xóa, ảnh gán sau qua pick-image
```

### Phase 4: Tìm ảnh (SerpAPI)
```
Query: outline.image_query + " b&r automation"
SerpAPI Google Images → 10 kết quả → lưu vào pending-images/{draft_id}.json
Hiển thị danh sách cho user chọn:
  1. Title ảnh + URL
  2. ...
→ pick-image: node khoa.js pick-image -- --id={draft_id} --img={1-10}
   Download ảnh → upload WP Media → set featured image + replace placeholder trong content
```

### Phase 5: Create Draft
```
POST /wp-json/wp/v2/posts
  status: "draft"
  title: seo_title
  content: <h1>title</h1> + html (IMAGE placeholders đã xóa)
  excerpt: 150–160 ký tự
  categories: [IDs — tìm hoặc tạo mới]
  meta: rank_math_title, rank_math_description, rank_math_focus_keyword
```

### Phase 6: Lên lịch đăng
```
PUT /wp-json/wp/v2/posts/{id}
  status: "future"
  date: "YYYY-MM-DDTHH:MM:SS"   ← giờ Việt Nam (UTC+7), WP tự convert
→ Báo Telegram: "Đã lên lịch đăng lúc HH:MM ngày DD/MM/YYYY"
```

### Phase 7: Lên lịch (sau khi user OK) ← ĐÃ CẬP NHẬT
```
node .../khoa.js schedule-post -- --id={id}
→ Script tự tìm slot trống (quota 2 bài/ngày)
→ Báo Telegram: "Đã lên lịch đăng lúc HH:MM ngày DD/MM/YYYY"
```
**KHÔNG hứa "sẽ nhắc khi bài live"** — không có cơ chế polling tự động.
Admin tự kiểm tra sau giờ đăng, hoặc hỏi Khoa để check trạng thái.

## Article Types
| Type | Từ khóa trigger | Từ số | Bắt buộc |
|------|----------------|-------|----------|
| `comparison` | "vs", "so sánh", "khác nhau", "chọn model" | 1000–1200 | Bảng HTML so sánh, FAQ ≥3 |
| `how-to` | "hướng dẫn", "cách", "tutorial", "cài đặt" | 1200–1500 | `<ol>` step-by-step, FAQ ≥3 |
| `use-case` | "ứng dụng", "giải pháp", "ngành" | 1000–1200 | Ví dụ cụ thể, `<ul>` lợi ích |
| `product-intro` | Mã SP cụ thể, mặc định | 800–1000 | Bảng specs, danh sách tính năng |

## Environment Variables
```
GEMINI_API_KEY       # Google AI Studio
GEMINI_MODEL         # gemini-3-flash-preview
SERPAPI_KEY          # serpapi.com (Google Images)
WP_BASE_URL / WP_USERNAME / WP_APP_PASSWORD
CLAUDIBLE_API_KEY    # cho outline phase
GSC_CLIENT_EMAIL / GSC_PRIVATE_KEY / GSC_SITE_URL   # optional
```

## Cost (per bài)
| Phase | Model | Cost |
|-------|-------|------|
| Outline | Haiku (Claudible) | ~$0.001 |
| Write | Gemini Flash | ~$0.01–0.02 |
| **Total** | | **~$0.01–0.02** |
| 30 bài/tháng | | ~$0.30–0.60 |

## Error Handling
| Lỗi | Xử lý |
|-----|-------|
| GSC không có creds | Dùng topic pool |
| SerpAPI fail | Tiếp tục không ảnh, cảnh báo Telegram |
| Gemini timeout | Streaming — không bị timeout proxy |
| JSON parse fail | Log raw response, throw lỗi rõ ràng |

# Skill: wp-blog-writer

## Purpose
Tự động hóa toàn bộ quy trình tạo nội dung blog:
1. Research topic từ GSC (hoặc theo yêu cầu user)
2. Classify loại bài + tạo outline SEO semantic
3. Viết bài hoàn chỉnh: 800–1500 từ, HTML, đúng chuẩn semantic SEO
4. Upload ảnh minh họa từ Unsplash
5. Tạo draft trên WordPress + set RankMath meta
6. Báo cáo qua Telegram, chờ phê duyệt trước khi publish

## Tier Classification
| Action | Tier |
|--------|------|
| Research topic, tạo outline | Tier 1 (auto) |
| Viết bài, upload ảnh, tạo draft | Tier 1 (auto) |
| **Publish bài viết** | **Tier 3 — BẮT BUỘC chờ user OK** |
| Xóa draft | Tier 2 (notify sau) |

## Trigger: Tự động hàng ngày (8:00 AM ICT)
Chạy tự động theo cron — không cần user input.
```
Khoa tự động:
  1. Research topic từ GSC
  2. Viết bài + upload ảnh + tạo draft
  3. Gửi thông báo Telegram với link preview
  4. Chờ user phê duyệt
```

## Trigger: Telegram Manual

### Viết bài theo chủ đề user đề xuất
```
@khoa viết bài [chủ đề]
@khoa write blog [topic]
```
→ Khoa dùng chủ đề từ user, skip GSC research, viết và tạo draft.

### Viết bài với ảnh đính kèm
```
@khoa viết bài [chủ đề] + [đính kèm ảnh]
```
→ Khoa dùng ảnh user cung cấp thay vì search Unsplash.
→ Upload ảnh đó lên WP Media, set làm featured image.

### Chỉ research + outline (không viết)
```
@khoa research blog
@khoa research topic hôm nay
```
→ Khoa trả về topic đề xuất + outline, không tạo draft.

### Phê duyệt — lên lịch đăng
```
OK [post_id]
OK 123
```
→ **KHÔNG publish thẳng.** Chạy `schedule-post` để kiểm tra quota 2 bài/ngày:
```bash
node .../khoa.js schedule-post -- --id=123
```
Script tự tìm slot trống (8:00 hoặc 14:00). Nếu hôm nay đủ 2 bài → tự lên lịch ngày kế tiếp + thông báo admin.

### Từ chối / xóa draft
```
REJECT [post_id]
REJECT 123
```
→ Khoa xóa draft, ghi log.

## Workflow Chi Tiết

### Phase 1: Research
```
Auto mode:
  → GSC API: fetch top 100 queries (impressions > 10, 30 ngày)
  → Score: position 11-20 (+3pts), impressions > 100 (+2pts), informational intent (+2pts)
  → Chọn query chưa có bài viết tương ứng trên site
  → Fallback: topic pool B&R automation nếu GSC thiếu data

Manual mode:
  → Dùng topic từ Telegram, bỏ qua bước research
```

### Phase 2: Outline
```
Claude Sonnet 4.6:
  → Classify type: comparison | how-to | use-case | product-intro
  → Generate focus_keyword (3–5 từ)
  → Generate title (≤60 ký tự)
  → Generate 5–7 H2 headings
  → Generate Unsplash search query (English)
```

### Phase 3: Write
```
Claude Sonnet 4.6:
  → Full HTML article, tiếng Việt
  → Cấu trúc: H1 + intro (≥100 từ) + H2 sections (≥150 từ/section)
  → FAQ section (bắt buộc cho how-to và comparison)
  → Kết luận ≥100 từ + internal links
  → Semantic SEO: focus keyword tự nhiên 3–5 lần, LSI keywords, entity coverage
  → Placeholder [IMAGE_1], [IMAGE_2] trong bài
```

### Phase 4: Images
```
Auto: Unsplash API → download → upload WP Media
Manual + ảnh: user's image → upload WP Media
→ Replace [IMAGE_1], [IMAGE_2] bằng <figure><img /><figcaption>credit</figcaption></figure>
→ Unsplash credit: "Photo by {photographer} on Unsplash" (bắt buộc theo ToS)
```

### Phase 5: Create Draft
```
POST /wp-json/wp/v2/posts
  status: "draft"
  title: seo_title
  content: <h1>title</h1> + html_with_images
  excerpt: 150–160 ký tự
  featured_media: images[0].id
  categories: [category IDs]
  meta:
    rank_math_title: seo_title (≤60c)
    rank_math_description: meta_desc (140–155c)
    rank_math_focus_keyword: focus_keyword
```

### Phase 6: Notify Telegram
```
✅ Bài viết mới đã tạo draft:
📝 {seo_title}
🔑 Keyword: {focus_keyword}
📊 Loại: {type}
🔗 Preview: {WP_BASE_URL}/?p={id}&preview=true
🆔 Draft ID: {id}

→ Gõ "OK {id}" để lên lịch đăng, "REJECT {id}" để xóa
```

### Phase 7: Lên lịch (sau khi user OK)
```bash
node .../khoa.js schedule-post -- --id={id}
```
→ Script tự kiểm tra quota 2 bài/ngày
→ Nếu còn slot hôm nay: lên lịch 8:00 hoặc 14:00
→ Nếu hết: lên lịch ngày gần nhất còn slot
→ Thông báo Telegram: "Đã lên lịch {DD/MM HH:MM}"

## Article Types

| Type | Điều kiện | Từ | Đặc điểm bắt buộc |
|------|-----------|----|-------------------|
| `comparison` | "vs", "so sánh", "khác nhau" | 1000–1200 | Bảng HTML so sánh, FAQ |
| `how-to` | "hướng dẫn", "cách", "tutorial" | 1200–1500 | Step-by-step, FAQ ≥3 Q&A |
| `use-case` | "ứng dụng", "giải pháp", "ngành" | 1000–1200 | Pain point + giải pháp B&R |
| `product-intro` | Mã SP cụ thể, mặc định | 800–1000 | Specs + ứng dụng + CTA nội bộ |

## Semantic SEO Requirements (bắt buộc mọi bài)
- Focus keyword xuất hiện tự nhiên 3–5 lần (mật độ ≤ 1.5%)
- LSI keywords: từ đồng nghĩa và biến thể của keyword chính
- ≥3 entity liên quan được đề cập
- Chủ đề chính giải thích đầy đủ trong 200 từ đầu
- Mỗi claim kỹ thuật có context cụ thể
- Internal links ≥2 (đến category hoặc SP liên quan)
- Schema-ready: how-to → HowTo schema, FAQ → FAQPage schema, comparison → Table

## Scripts
```bash
# Dry-run: chỉ research + outline
node khoa.js research-blog

# Viết bài đầy đủ
node khoa.js write-blog

# Viết theo topic cụ thể
node khoa.js write-blog -- --topic="So sánh ACOPOS và ACOPOSmulti"

# Publish draft
node khoa.js publish-blog -- --id=123 --publish

# Xóa draft
node khoa.js publish-blog -- --id=123 --reject
```

## Environment Variables
```bash
# Required
UNSPLASH_ACCESS_KEY=...     # unsplash.com/developers (miễn phí)
WP_BASE_URL=...             # đã có
WP_USERNAME=...             # đã có
WP_APP_PASSWORD=...         # đã có
CLAUDIBLE_API_KEY=...       # đã có

# Optional (GSC research — cần service account)
GSC_CLIENT_EMAIL=...        # service account email
GSC_PRIVATE_KEY=...         # private key (RSA)
GSC_SITE_URL=sc-domain:agowautomation.com
```

## Cost (per bài)
| Phase | Model | Cost |
|-------|-------|------|
| Outline | Sonnet 4.6 | ~$0.01 |
| Write | Sonnet 4.6 | ~$0.05 |
| **Total** | | **~$0.06–0.07** |
| 30 bài/tháng | | ~$2.10 |

## Error Handling
| Lỗi | Xử lý |
|-----|-------|
| GSC API không có creds | Dùng topic pool fallback |
| Unsplash API fail | Tiếp tục không có ảnh, cảnh báo trong thông báo |
| Claude API timeout | Retry 1 lần, báo lỗi nếu fail tiếp |
| WP draft create fail | Throw error, báo qua Telegram |
| Publish fail | Giữ draft, báo lỗi qua Telegram |
