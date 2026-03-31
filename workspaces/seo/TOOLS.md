# TOOLS — Khoa SEO Agent

## Scripts Có Sẵn (Node.js, đã test, chạy được trong container)

> Luôn tra bảng này trước khi tự viết script. Dùng `node <path>` để chạy.

| Mục đích | Lệnh chạy |
|---|---|
| Kiểm tra duplicate alt text (per-page) | `node /home/node/.openclaw/workspaces/seo/scripts/check-duplicate-alt.js` |

## Công cụ được phép dùng

| ✅ Dùng được | ❌ Không dùng |
|---|---|
| `node script.js` | `curl \| jq` — jq không có trong container |
| Node.js `https` module | `python requests` — không cài sẵn |
| `printenv VAR` để đọc credentials | Tìm file `.env` — không tồn tại trong container |
| `curl` để test API nhanh (GET đơn giản) | `curl \| awk/sed/grep` để parse JSON/HTML |

## Credentials

```bash
# Lấy tất cả một lúc:
printenv WP_USERNAME WP_APP_PASSWORD WC_CONSUMER_KEY WC_CONSUMER_SECRET
```

- **WP API**: Basic Auth = base64(`WP_USERNAME:WP_APP_PASSWORD`)
- **WC API**: Query params `?consumer_key=...&consumer_secret=...`
- **Base URL**: `https://agowautomation.com`

## API Endpoints Nhanh

```
WP Posts   : GET /wp-json/wp/v2/posts?per_page=100&page=N
WP Pages   : GET /wp-json/wp/v2/pages?per_page=100&page=N
WP Media   : GET /wp-json/wp/v2/media?per_page=100&page=N
WC Products: GET /wp-json/wc/v3/products?per_page=100&page=N&consumer_key=...&consumer_secret=...
```

Pagination: loop đến khi response trả về array rỗng hoặc X-WP-TotalPages đạt giới hạn.
