# Agow Automation — Product Catalog Reference

> This file is used by SEO Agent for accurate product naming and categorization.
> Update when new products are added to the website.

## Product Categories

### Motion Control
- **ACOPOS P3** — High-performance servo drives
- **ACOPOS micro** — Compact servo drives
- **ACOPOS multi** — Multi-axis servo system
- **ACOPOStrak** — Intelligent track transport system
- **ACOPOSmotor** — Integrated motor-drive units

### PLC / Control Systems
- **X20** — Compact I/O and CPU system
- **X67** — IP67-rated I/O for harsh environments
- **X90** — Mobile automation controllers
- **Automation PC** — Industrial PCs
- **Automation Panel** — HMI touch panels

### Industrial PCs
- **Automation PC 910** — Box PC
- **Automation PC 2100** — Modular PC
- **Automation PC 3100** — High-performance PC
- **Panel PC** — All-in-one PC with display

### HMI
- **T-series Panels** — Touch screen HMI
- **Power Panel T-series** — HMI + PLC combined
- **Power Panel C-series** — Compact HMI controllers

### Software
- **Automation Studio** — Integrated development environment
- **mapp Technology** — Pre-built software components
- **APROL** — Process automation platform

### Safety Technology
- **SafeLOGIC** — Safety controller
- **SafeIO** — Safety I/O modules
- **SafeMOTION** — Safe motion control
- **openSAFETY** — Safety communication protocol

## Naming Conventions
- Product family: ALL CAPS (e.g., ACOPOS, X20)
- Model numbers: exact case (e.g., 8V1045.001-2, X20CP1586)
- Software: CamelCase (e.g., Automation Studio, mapp Technology)
- When uncertain about a model number: flag for admin verification, do NOT guess

## URL Structure on agowautomation.com
- Products: `/san-pham/{category-slug}/{product-slug}/`
- Categories: `/{category-slug}/` — WooCommerce dùng direct slug (NOT `/danh-muc-san-pham/` prefix)
- Blog posts: `/tin-tuc/{post-slug}/`
- Pages: `/{page-slug}/`

---

## B&R Product Lines — SEO Title Templates (learned 2026-04-01, Khoa)

> Dùng khi Tong hoặc Khoa cần đặt SEO title cho product/category pages.

### Format chuẩn cho product pages
```
[Mã SP] [Loại thiết bị] [Thông số kỹ thuật] [Dòng SP] B&R
```
**Nguyên tắc**: Mã SP đứng đầu vì kỹ sư B2B search theo part number trước.

### Templates theo dòng sản phẩm
| Dòng | Template | Ví dụ |
|------|----------|-------|
| X20 System | `[Mã] [Loại] B&R X20 [Đặc điểm]` | `X20CP1483-1 PLC B&R X20 Hiệu Suất Cao` |
| X67 System | `[Mã] Module [Chức năng] [Kênh/Protocol] X67 B&R` | `X67DI1371.L12 Module Đầu Vào Số 16 Kênh M12 B&R` |
| 2003 System | `[Mã] Module [Chức năng] B&R 2003 System` | `7AI261.7 Module Đo Biến Dạng Ứng Suất B&R 2003` |
| 2005 System | `[Mã] Module [Chức năng] B&R 2005 System` | `X20DO4633 Module Đầu Ra Số B&R 2005` |
| Panel / HMI | `[Mã] [Loại panel] [Đặc điểm] B&R` | `PP420 Power Panel HMI Công Nghiệp B&R` |
| IPC | `Máy Tính Công Nghiệp B&R [Model] [Đặc điểm]` | `Máy Tính Công Nghiệp B&R APC910 Fanless` |

### Anti-patterns (KHÔNG dùng)
- ❌ `"...của B&R Automation Hãng B&R"` — double brand
- ❌ `"...Hãng B&R"` ở cuối — từ "Hãng" thừa
- ❌ Truncate cơ học tại ranh giới từ ngẫu nhiên
- ❌ Chỉ có `"| B&R Automation"` suffix — không có semantic keyword

### WooCommerce Category SEO Title Format
```
[Tên danh mục] B&R | [Lợi ích/spec chính] | Agow Automation
```
Ví dụ: `X20 Safety Technology B&R | Module SIL3 PLe Cat4 | Agow Automation`

---

## WooCommerce Category Map (31 danh mục đã SEO — 2026-04-05)

| ID | Tên | Slug | Dòng SP | SP |
|----|-----|------|---------|-----|
| 134 | Hãng B&R | hang-br | Tổng | ~590 |
| 135 | Acopos Single | acopos-single | Motion | - |
| 136 | Acopos Multi | acopos-multi | Motion | - |
| 137 | Motion control | motion-control-acopos | Motion | - |
| 185 | Bộ điều khiển PLC | bo-dieu-khien-plc | PLC | 43 |
| 186 | PLC 2003 | plc-2003 | PLC | - |
| 187 | PLC 2005 | plc-2005 | PLC | - |
| 188 | PLC X20 | plc-x20 | PLC | - |
| 381 | 2003 System | 2003-system | I/O | 37 |
| 382 | X20 System (I/O) | x20-system | I/O | 215+ |
| 383 | 2005 System | 2005-system | I/O | 43 |
| 502 | Máy tính công nghiệp | may-tinh-cong-nghiep | IPC | 29 |
| 503 | Automation PC 910 | automation-pc-910 | IPC | - |
| 509 | Automation PC 810 | automation-pc-810 | IPC | - |
| 511 | Automation PC 620 | automation-pc-620 | IPC | - |
| 569 | Power Panel PP065 | power-panel-pp065 | HMI | - |
| 580 | Power Panel PP420 | power-panel-pp420 | HMI | - |
| 581 | Automation Panel AP920 | automation-panel-ap920 | HMI | - |
| 598 | HMI (Panel) | hmi-panel | HMI | 31 |
| 608 | Power Panel PP120 | power-panel-pp120 | HMI | - |
| 611 | Power Panel PP220 | power-panel-pp220 | HMI | - |
| 672 | Hãng Bachmann | hang-bachmann | Bachmann | - |
| 673 | PLC Bachmann | plc-bachmann | Bachmann | - |
| 674 | Automation PC 2100 | automation-pc-2100 | IPC | - |
| 675 | Automation PC 2200 | automation-pc-2200 | IPC | - |
| 676 | Automation PC 3100 | automation-pc-3100 | IPC | - |
| 677 | Safety technology | safety-technology | Safety | 41 |
| 678 | X20 System Safety | x20-system-safety-technology | Safety | 39 |
| 679 | X67 System Safety | x67-system-safety-technology | Safety | 2 |
| 680 | I/O System | io-system | I/O | 355 |
| 681 | X67 System (I/O) | x67-system | I/O | - |
| 728 | Automation PC 4100 | automation-pc-4100 | IPC | - |
