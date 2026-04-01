# SEO Agent "Khoa" — Effective Patterns
<!-- Proven strategies that consistently produce good results -->
<!-- Promote to HOT if used 3+ times in 7 days -->
<!-- Source: Seeded from production 28-auditwebagow + lessons from 2026-03-31 + 2026-04-01 -->

## Content Strategy
- Thin content (<300 words): full AI rewrite with product-specific keywords
- Medium content (300-600 words): enhance existing, add technical specs + use cases
- Product pages: include B&R part number, Vietnamese description, technical specs, application scenarios

## Meta Optimization
- Title: ≤60 chars, primary keyword first, brand last, dash separator
- Description: ≤160 chars, include call-to-action in Vietnamese
- Focus keyword: match main H1 keyword

## Semantic SEO Title Formula — B&R Products (learned 2026-04-01)

### Nguyên tắc cốt lõi
- **Keyword NGƯỜI DÙNG SEARCH phải ở đầu** — kỹ sư search theo: part number, chức năng, dòng sản phẩm
- **Không truncate cơ học** — phải hiểu nội dung sản phẩm trước, đọc `short_description`
- **Workflow bắt buộc**: `check-title` → fetch description → đề xuất → admin duyệt → apply

### Format chuẩn
```
[Mã SP] [Loại thiết bị] [Đặc điểm kỹ thuật] [Dòng SP] B&R
```
- Mã SP đầu tiên: kỹ sư search theo part number → match ngay
- Đặc điểm kỹ thuật: số kênh, giao thức, kết nối (M8/M12, RS422, Profibus, EtherNet/IP...)
- Dòng SP: 2003/2005/X20/X67 — giúp Google hiểu taxonomy
- Kết thúc bằng "B&R" (không cần "B&R Automation" — tiết kiệm 10 ký tự)

### Ví dụ đã proven (2026-04-01)
| Loại | Trước (sai) | Sau (đúng) |
|------|------------|-----------|
| I/O module | `Module Đầu Vào Số X67DI1371.L12 của B&R Automation Hãng B&R` (67) | `X67DI1371.L12 Module Đầu Vào Số 16 Kênh M12 B&R` (50) |
| Bus controller | `Module Bus Controller EtherNet/IP X67BCD321.L12-1 Hãng B&R` (62) | `X67BCD321.L12-1 Module Bus Controller EtherNet/IP B&R` (54) |
| PLC | `X20CP1483-1 \| Bộ điều khiển lập trình PLC X20CP1483-1 B&R` (61) | `X20CP1483-1 PLC B&R X20 Hiệu Suất Cao Nhiều RAM` (50) |
| Analog input | `7AI261.7 \| Module tín hiệu đầu vào tương tự AI261 Hãng B&R` (62) | `7AI261.7 Module Đo Biến Dạng Ứng Suất B&R 2003` (47) |

### Pattern chống chỉ định — KHÔNG dùng
- ❌ `"...của B&R Automation Hãng B&R"` — double brand, thừa ~20 ký tự
- ❌ `"...Hãng B&R"` ở cuối — "Hãng" là từ tiếng Việt không cần thiết trong title
- ❌ `"| B&R Automation"` suffix chung chung — không có semantic keyword
- ❌ Truncate tại ranh giới từ ngẫu nhiên — tạo title vô nghĩa ("kết nối CAN bus đa năng của")

### Template theo dòng sản phẩm B&R
| Dòng | Template | Ví dụ keyword |
|------|----------|---------------|
| X67 System | `[Mã] Module [Chức năng] [Kênh/Protocol] X67 B&R` | Đầu vào số, Bus controller, Resolver |
| X20 System | `[Mã] [Loại] B&R X20 [Đặc điểm nổi bật]` | PLC, Module encoder, I/O |
| 2003 System | `[Mã] Module [Chức năng] B&R 2003 System` | Tín hiệu nhiệt độ, Truyền thông, Tương tự |
| 2005 System | `[Mã] Module [Chức năng] B&R 2005 System` | Tín hiệu nhiệt độ |
| Panel/HMI | `[Mã] [Loại panel] [Đặc điểm] B&R` | Power Panel, Automation Panel, HMI |

## Batch Processing
- Always crawl fresh before batch fixes (never use data >24h old)
- Process in priority order: Critical → High → Medium → Low
- Max 30 WP API writes/hour to avoid rate limiting
- Deduplicate issues before counting (alt text inflates counts)

## Cost Efficiency
- Use Haiku for: meta fixes, alt text, schema generation, daily checks
- Use Sonnet for: long-form content creation, complex rewrites, content strategy
- Schema markup: template-based generation, no AI call needed
- Expected daily cost: $0.08-0.15/run

## Script Architecture (learned 2026-03-31)
- **Portable scripts**: KHÔNG hardcode hostname — đọc WP_BASE_URL từ env → portable cho mọi site
- **Shared client**: wp-client.js làm HTTP layer chung — tất cả scripts import, không duplicate code
- **Entry point**: khoa.js là dispatcher duy nhất — user/agent chỉ cần nhớ 1 command
- **Dry-run mặc định**: scripts KHÔNG ghi gì nếu không có `--apply` — an toàn để test
- **Verify sau fix**: luôn chạy `verify` sau khi fix để confirm thực sự đã thay đổi trên live site

## Alt Text Strategy (learned 2026-03-31)
- WooCommerce products: alt text lưu ở `images[].alt` trong WC API (không phải WP media)
- Duplicate alt: dùng Set() per page để phát hiện — cùng alt trên 2+ ảnh trong 1 trang = lỗi
- Sau fix alt → LUÔN purge LiteSpeed Cache (dùng `purge-cache` command)
- agowautomation.com: alt text hiện tại 100% coverage — tập trung vào duplicate và quality
