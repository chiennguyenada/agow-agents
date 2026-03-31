# TOOLS — Khoa SEO Agent

## ⚡ Entry Point Duy Nhất Cho Mọi Task

```bash
node /home/node/.openclaw/workspaces/seo/scripts/khoa.js <command>
```

Xem tất cả commands có sẵn:
```bash
node /home/node/.openclaw/workspaces/seo/scripts/khoa.js help
```

### Commands hiện có

| Command | Mục đích |
|---|---|
| `check-duplicate-alt` | Tìm duplicate alt text trên cùng 1 trang — scan toàn bộ posts/pages/590 products |
| `missing-alt` | Tìm ảnh chưa có alt text |

**Quy tắc số 1**: Trước khi viết bất kỳ dòng code nào, chạy `khoa.js help` để xem command có sẵn.

---

## Credentials

```bash
printenv WP_USERNAME WP_APP_PASSWORD WC_CONSUMER_KEY WC_CONSUMER_SECRET
```

- **WP API**: Basic Auth = base64(`WP_USERNAME:WP_APP_PASSWORD`)
- **WC API**: Query params `?consumer_key=...&consumer_secret=...`
- **Base URL**: `https://agowautomation.com`

## Công Cụ Được Phép

| ✅ Dùng | ❌ Cấm |
|---|---|
| `node khoa.js <cmd>` | Tự viết script curl/bash/awk/sed để parse |
| `node script.js` custom nếu chưa có command | `python requests` (không cài sẵn) |
| `curl` test API nhanh (1 request, không parse) | `jq` (không có trong container) |
| `printenv VAR` | Tìm file `.env` |
