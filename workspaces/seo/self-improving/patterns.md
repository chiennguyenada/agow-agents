# SEO Agent "Khoa" — Effective Patterns
<!-- Proven strategies that consistently produce good results -->
<!-- Promote to HOT if used 3+ times in 7 days -->
<!-- Source: Seeded from production 28-auditwebagow + lessons from 2026-03-31 -->

## Content Strategy
- Thin content (<300 words): full AI rewrite with product-specific keywords
- Medium content (300-600 words): enhance existing, add technical specs + use cases
- Product pages: include B&R part number, Vietnamese description, technical specs, application scenarios

## Meta Optimization
- Title: ≤60 chars, primary keyword first, brand last, dash separator
- Description: ≤160 chars, include call-to-action in Vietnamese
- Focus keyword: match main H1 keyword

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