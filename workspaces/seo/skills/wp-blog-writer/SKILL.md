---
name: wp-blog-writer
description: Tự động viết bài blog SEO semantic hàng ngày cho agowautomation.com — research topic từ GSC, viết nội dung, upload ảnh Unsplash, tạo draft WP, chờ user phê duyệt qua Telegram.
---

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

### Phê duyệt publish
```
OK [post_id]
OK 123
```
→ Khoa publish draft → gửi link bài đã live.

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

→ Gõ "OK {id}" để publish, "REJECT {id}" để xóa
```

### Phase 7: Publish (sau khi user OK)
```
PUT /wp-json/wp/v2/posts/{id}
  status: "publish"
→ Purge LiteSpeed cache
→ Gửi Telegram: link bài đã live
```

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
