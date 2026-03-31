# TOOLS — Khoa SEO Agent

## Scripts Có Sẵn (Node.js, đã test trong container)

Dùng cho task crawl/phân tích — thay vì tự viết script:

| Command | Mục đích |
|---|---|
| `node /home/node/.openclaw/workspaces/seo/scripts/khoa.js check-duplicate-alt` | Duplicate alt text per-page (posts + pages + toàn bộ products) |
| `node /home/node/.openclaw/workspaces/seo/scripts/khoa.js missing-alt` | Ảnh chưa có alt text |
| `node /home/node/.openclaw/workspaces/seo/scripts/khoa.js help` | Xem tất cả commands |

---

## Credentials

```bash
printenv WP_USERNAME WP_APP_PASSWORD WC_CONSUMER_KEY WC_CONSUMER_SECRET
```

- **WP API**: Basic Auth = base64(`WP_USERNAME:WP_APP_PASSWORD`)
- **WC API**: Query params `?consumer_key=...&consumer_secret=...`
- **Base URL**: `https://agowautomation.com`

---

## Công Cụ

| ✅ Dùng | ❌ Không dùng |
|---|---|
| `node khoa.js <cmd>` cho crawl/phân tích | `jq` (không có trong container) |
| Node.js `https` module tự viết nếu script chưa có | `python requests` (không cài sẵn) |
| `curl` test API đơn lẻ | `curl \| awk/sed/grep` để parse JSON |
| `printenv VAR` | Tìm file `.env` |
