# Khoa — SEO Agent Heartbeat

## Trigger
Runs at session start and every 30 minutes during active sessions.

## Session Start Routine
```
1. Load shared-knowledge/company-rules.md
2. Load shared-knowledge/product-catalog.md (product names, categories)
3. Load shared-knowledge/lessons-learned.md (last 10 SEO-related entries)
4. Load self-improving memory: hot.md (always-loaded rules)
5. Lấy credentials bằng exec: printenv WP_USERNAME WP_APP_PASSWORD WC_CONSUMER_KEY WC_CONSUMER_SECRET
   (KHÔNG tìm file .env — không tồn tại trong container)
6. Verify WP API: GET https://agowautomation.com/wp-json/wp/v2/posts?per_page=1
7. Verify WC API: GET https://agowautomation.com/wp-json/wc/v3/products?per_page=1
8. Check last daily-check timestamp — if missed, flag for Lead Agent
9. Check scheduled posts that went live since last session (xem mục "Check Scheduled Posts" bên dưới)
10. Log: "Khoa online. WP API: [status]. WC API: [status]. Last check: [timestamp]"
```

## Check Scheduled Posts — Thực hiện ở bước 9 Session Start

**Mục đích**: thông báo admin khi bài đã live (thay vì hứa "sẽ nhắc" mà không làm được).

**Cách thực hiện**: Query WP API, lấy bài `status=publish` có `date` trong 24 giờ qua:
```
GET /wp-json/wp/v2/posts?status=publish&after={24h_ago}&per_page=20&_fields=id,title,link,date
```

Nếu tìm thấy bài nào có `date` trong 24 giờ qua:
- Kiểm tra xem bài đó có phải bài đã lên lịch (không phải bài publish thủ công) không
  → Nếu `date` là **quá khứ gần** (< 24h) và **không phải draft** → có thể là bài đã scheduled xong
- Gửi thông báo Telegram:
  ```
  📢 Bài đã đăng tự động:
  📝 {title}
  🔗 {link}
  📅 Đăng lúc: {date giờ VN}
  ```

**Lưu ý**: OpenClaw không có background polling — check này chỉ chạy khi Khoa được gọi. Nếu không có ai nhắn tin sau giờ bài live, Khoa sẽ không chủ động báo được. **KHÔNG hứa "sẽ nhắc ngay khi live"** — chỉ báo vào lần tiếp theo admin mở chat với Khoa.

## Scripts Có Sẵn — Dùng cho task crawl/phân tích dữ liệu

Khi nhận task crawl hoặc phân tích, kiểm tra bảng này trước:

| Task | Command |
|---|---|
| Duplicate alt text trên cùng 1 trang | `node /home/node/.openclaw/workspaces/seo/scripts/khoa.js check-duplicate-alt` |
| Ảnh thiếu alt text | `node /home/node/.openclaw/workspaces/seo/scripts/khoa.js missing-alt` |

Các task còn lại (sửa meta, fix H1, viết content...) → dùng WP/WC REST API trực tiếp.

## Periodic Checks

### Memory Management
- Check HOT rules count — if > 50, trigger compaction
- Review corrections.md for new admin feedback — apply immediately
- Check patterns.md for newly promoted patterns
- Clean actions_log older than 30 days

### Performance Tracking
- Track success rate of fixes (re-audit after fix → score improvement)
- Track API cost per session
- If success rate < 80% for a fix type → demote the pattern
- If success rate > 95% for a fix type → candidate for Tier 1 auto-execute

### Cache Awareness
After any content modification:
1. Call LiteSpeed purge for affected URL
2. Wait 5 seconds
3. Verify change is visible (GET the URL, check response)
4. If still cached → retry purge with full cache clear
