---
name: wp-project-post
description: Viết bài case study dự án Agow vừa hoàn thành (sửa chữa, lắp đặt, retrofit, bảo trì thiết bị B&R). Admin gửi thông tin + ảnh qua Telegram, Khoa hỏi thêm nếu thiếu, rồi viết bài bằng Gemini và tạo WP draft.
---

# Skill: WP Project Post (Case Study)

## Status: PRODUCTION ✅ (tested 2026-04-16)
Bài test: PLC B&R X20CP3585 sửa chữa tại nhà máy bia — draft ID 5500, lên lịch 18/04/2026 8:00 sáng thành công.

## Trigger
Nhận diện khi user gửi tin nhắn chứa một trong các cụm từ:
- "vừa hoàn thành", "hoàn thành dự án", "hoàn thành đơn hàng"
- "vừa sửa xong", "sửa xong", "sửa chữa xong"
- "thi công xong", "lắp đặt xong", "retrofit xong"
- "vừa bảo trì xong"

---

## Bước 1 — Thu thập thông tin (BẮT BUỘC hỏi trước khi viết)

**KHÔNG viết bài ngay.** Hỏi đủ thông tin trước.

Phân loại `task_type` từ tin nhắn:
| Từ khóa | task_type |
|---------|-----------|
| sửa, sửa chữa, repair | `repair` |
| lắp đặt, lắp, install | `install` |
| retrofit, nâng cấp | `retrofit` |
| bảo trì, maintenance | `maintenance` |

### Thông tin cần thu thập

| Trường | Mô tả | Bắt buộc? |
|--------|-------|-----------|
| `devices` | Tên + model thiết bị (VD: PLC X20CP3585, ACOPOS 1022) | **Có** |
| `factory.industry` | Ngành sản xuất (bia, bao bì, dệt may, thực phẩm...) | **Có** |
| `factory.location` | Tỉnh/vùng (Bình Dương, miền Trung...) | **Có** |
| `factory.name` | Tên nhà máy (chỉ hỏi nếu admin chủ động đề cập) | Không |
| `duration` | Thời gian thực hiện (2 ngày, 1 tuần...) | **Có** |
| `problem` | Sự cố / yêu cầu ban đầu (thiết bị hỏng gì, làm gì) | **Có** |
| `solution` | Giải pháp Agow đã thực hiện (thay gì, cài gì, chỉnh gì) | **Có** |
| `result` | Kết quả (máy chạy lại, năng suất tăng, thời gian downtime giảm...) | **Có** |
| ảnh | Hình ảnh quá trình/kết quả | Không bắt buộc nhưng rất tốt |

### Câu hỏi mẫu theo task_type

**repair:**
> "Để viết bài hay, mình cần thêm vài thông tin:
> 1. Model thiết bị cụ thể là gì? (VD: X20CP3585, ACOPOS 1022...)
> 2. Thiết bị bị lỗi/hư gì trước khi sửa?
> 3. Thời gian sửa mất bao lâu?
> 4. Kết quả sau sửa (máy chạy ổn? có cải thiện gì không?)
> 5. Bạn có ảnh quá trình sửa hoặc kết quả không? (Nếu có thì gửi thêm)"

**install:**
> "Mình cần thêm thông tin để viết bài:
> 1. Thiết bị lắp đặt gồm những gì? Model cụ thể?
> 2. Hệ thống này dùng cho dây chuyền/ứng dụng gì?
> 3. Thời gian thi công mất bao lâu?
> 4. Kết quả / lợi ích đạt được sau khi lắp đặt?
> 5. Có ảnh thi công hoặc kết quả không?"

**retrofit:**
> "Để viết bài retrofit hay:
> 1. Nâng cấp từ thiết bị cũ nào lên thiết bị mới nào?
> 2. Lý do nâng cấp (thiết bị cũ EOL, cần tăng hiệu suất...)?
> 3. Thời gian thực hiện?
> 4. Lợi ích đạt được sau nâng cấp?
> 5. Có ảnh trước/sau không?"

**maintenance:**
> "Mình cần thêm thông tin:
> 1. Thiết bị được bảo trì là gì?
> 2. Bảo trì định kỳ hay xử lý sự cố?
> 3. Nội dung bảo trì gồm những gì?
> 4. Kết quả (thiết bị hoạt động ra sao sau bảo trì)?
> 5. Có ảnh không?"

---

## Bước 2 — Xử lý ảnh từ Telegram

Nếu admin gửi ảnh kèm tin nhắn Telegram:
1. Lấy `file_id` từ message
2. Tải ảnh qua Telegram Bot API:
   ```
   GET https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getFile?file_id={file_id}
   → lấy file_path
   GET https://api.telegram.org/file/bot{TELEGRAM_BOT_TOKEN}/{file_path}
   → download binary
   ```
3. Upload lên WP Media (`POST /wp-json/wp/v2/media`):
   - filename: `project-{task_type}-{slug}-{n}.jpg`
   - alt_text: mô tả ngắn theo context (VD: "Sửa chữa PLC B&R X20CP3585 tại nhà máy bia miền Trung")
4. Ghi lại media IDs

Nếu **không có ảnh**, hỏi:
> "Bạn có ảnh quá trình thực hiện hoặc kết quả không? Gửi mình để đính kèm vào bài. (Nếu không có mình vẫn viết được)"

---

## Bước 3 — Chạy script viết bài

Khi đã đủ thông tin, build JSON và chạy:

```bash
node /home/node/.openclaw/workspaces/seo/scripts/khoa.js write-project -- \
  --info='{"task_type":"repair","devices":["PLC X20CP3585"],"factory":{"industry":"sản xuất bia","location":"miền Trung"},"duration":"2 ngày","problem":"PLC bị lỗi không khởi động được sau sự cố điện","solution":"Chẩn đoán lỗi firmware, flash lại OS, kiểm tra I/O modules","result":"Dây chuyền hoạt động trở lại bình thường, downtime 0 sau khi sửa"}' \
  --img-ids=5490,5491
```

Quy tắc build JSON:
- `task_type`: repair / install / retrofit / maintenance
- `devices`: mảng string, tên đầy đủ
- `factory.name`: chỉ thêm nếu admin cho phép công khai
- `factory.industry` + `factory.location`: bắt buộc
- `duration`, `problem`, `solution`, `result`: tóm tắt ngắn gọn nhưng đủ thông tin
- `img-ids`: danh sách WP Media ID đã upload, cách nhau dấu phẩy

---

## Bước 4 — Gửi kết quả lên Telegram

Sau khi script chạy xong, gửi:

```
✅ Draft bài case study — ID {N}
📝 {seo_title}
🔑 {focus_keyword}
🔗 Preview: https://agowautomation.com/?p={N}&preview=true

→ Duyệt xong gõ: OK {N} để lên lịch tự động
→ Xóa draft: REJECT {N}
```

---

## Bước 5 — Khi admin duyệt (gõ "OK {N}")

**KHÔNG publish thẳng.** Luôn dùng `schedule-post` để kiểm tra quota 2 bài/ngày:

```bash
node /home/node/.openclaw/workspaces/seo/scripts/khoa.js schedule-post -- --id={N}
```

Script sẽ tự:
1. Đếm số bài đã publish + future **hôm nay**
2. Nếu **< 2 bài** → lên lịch slot sớm nhất còn trống hôm nay (8:00 hoặc 14:00)
3. Nếu **≥ 2 bài** → tự tìm ngày gần nhất còn slot, lên lịch ngày đó

Sau khi script chạy, **thông báo lại admin**:

```
📅 Đã lên lịch đăng bài ID {N}:
   {DD/MM/YYYY HH:MM} — Slot {1/2}
```

Nếu bị đẩy sang ngày khác, nói rõ lý do:
```
📅 Hôm nay đã đủ 2 bài. Đã lên lịch cho bài ID {N}:
   {DD/MM/YYYY HH:MM}
```

Nếu admin muốn **chỉ định ngày cụ thể**:
```bash
node ... schedule-post -- --id={N} --from=2026-04-22
```

---

## Lưu ý quan trọng

- **KHÔNG tự bịa thông tin** không có trong input. Nếu thiếu thì hỏi thêm.
- Bài case study **KHÔNG cần tìm ảnh** — ảnh do admin cung cấp. KHÔNG gọi SerpAPI.
- Luôn tạo **DRAFT** — không publish thẳng.
- Sau khi tạo draft, **KHÔNG purge cache** (chưa cần, chỉ purge sau khi publish).
- Nếu `GEMINI_API_KEY` không có → báo lỗi và yêu cầu admin kiểm tra `.env`, KHÔNG tự viết thay.
- **Tên nhà máy**: chỉ hỏi nếu admin chưa nói — nhiều khách không muốn public. Nếu không có tên, dùng dạng "nhà máy [ngành] [vùng]" (VD: "nhà máy bia miền Trung") — đủ tin tưởng và bảo mật khách hàng.
- **Lên lịch đăng**: LUÔN dùng `schedule-post` khi admin gõ "OK" — KHÔNG dùng publish thẳng. Script tự kiểm tra quota 2 bài/ngày và tìm slot trống.
- **docker compose restart** KHÔNG reload env — nếu thêm env var mới phải `docker compose up -d --force-recreate`.
