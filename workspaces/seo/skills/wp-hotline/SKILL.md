---
name: wp-hotline
description: Scan và replace số hotline/điện thoại lỗi thời trong toàn bộ nội dung WordPress/WooCommerce
---

# Skill: wp-hotline — Quản lý thông tin liên hệ

## Mục đích

Khi thông tin liên hệ (số điện thoại, hotline) thay đổi, skill này scan toàn bộ nội dung website và replace tự động. Hỗ trợ 4 content type: WC Products, WP Pages, WP Posts, WC Categories.

## Khi nào dùng

- User báo hotline thay đổi / số cũ không còn dùng
- Trước đợt SEO audit lớn (clean outdated contact info)
- Sau khi company thay số điện thoại chính thức

## Workflow chuẩn

```
# 1. Scan: xem có bao nhiêu item chứa số cũ
node khoa.js check-hotline

# 2. Review output — xác nhận số lượng và context

# 3. Apply: replace toàn bộ
node khoa.js fix-hotline --apply

# 4. Purge cache
node khoa.js purge-cache
```

## Tùy chọn nâng cao

```bash
# Chỉ scan 1 loại content
node khoa.js check-hotline --type=product
node khoa.js check-hotline --type=page
node khoa.js check-hotline --type=post
node khoa.js check-hotline --type=category

# Test 1 item trước khi apply toàn bộ
node khoa.js fix-hotline --apply --id=2041 --type=product

# Override số cũ/mới (khi số hotline khác với default)
node khoa.js fix-hotline --apply --old="028 6670 9931" --new="0934 795 982"
node khoa.js fix-hotline --apply --old="1900 1234" --new="0934 795 982"
```

## Default config

| Tham số | Giá trị mặc định |
|---------|-----------------|
| `--old` | `028 6670 9931` |
| `--new` | `0934 795 982` |
| Mode    | dry-run (cần `--apply` để ghi) |

## Regex detection

Script tự động match mọi dạng format phổ biến:
- `028 6670 9931` (có khoảng trắng)
- `028.6670.9931` (có dấu chấm)
- `028-6670-9931` (có dấu gạch)
- `0286670 9931` (mix)

## Backup

Trước mỗi lần write, script tạo backup tại:
```
workspaces/seo/backups/hotline-backup-{type}-{id}-{timestamp}.json
```

Backup chứa: ID, type, name, URL, số lần xuất hiện, 1000 ký tự đầu content gốc.

## Lưu ý quan trọng

- Script chỉ đụng vào field `description` / `content` — KHÔNG sửa `title`, `meta_description`, `short_description`
- WP Pages/Posts: fetch với `context=edit` để lấy raw content (không bị filtered bởi Gutenberg)
- Sau khi apply **bắt buộc** purge cache (LiteSpeed aggressive caching che kết quả)
- Tier 2 (Notify-then-execute): apply xong báo cáo user, không cần pre-approval

## Báo cáo kết quả

Sau khi chạy check-hotline, báo cáo cho user:
```
Tìm thấy X item chứa hotline cũ "028 6670 9931":
- Products: N
- Pages:    N
- Posts:    N
- Categories: N

→ Chạy fix-hotline --apply để thay thành "0934 795 982"?
```
