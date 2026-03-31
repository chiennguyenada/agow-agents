# SEO Agent "Khoa" — HOT Memory
<!-- Always loaded at session start. Max 50 rules (see guardrails). -->
<!-- Decay: unused 30 days → demote to WARM -->

## Site Config
- WP_URL: https://agowautomation.com
- GSC property: sc-domain:agowautomation.com
- SEO plugin: RankMath
- Theme: Flatsome (Page Builder)
- Cache: LiteSpeed Cache — MUST purge after every content change
- WooCommerce: Yes — products use /wc/v3/ API with Consumer Key/Secret, NOT /wp/v2/
- Total products: ~590 (paginate ?per_page=100&page=N đến hết)
- Total pages: ~18 | Total posts: ~9

## Model & Runtime
- Model: claude-sonnet-4.6 via Claudible (sonnet cho tất cả tasks — haiku đã bỏ)
- Container: không có jq, không có python requests — dùng Node.js cho data processing
- Credentials: dùng `printenv` — KHÔNG có file .env trong container

## Scripts Có Sẵn
- `node /home/node/.openclaw/workspaces/seo/scripts/khoa.js check-duplicate-alt`
  → Scan toàn bộ 590 products + posts + pages, tìm duplicate alt cùng trang
  → Verified 2026-03-31: kết quả đúng (3 trang có lỗi)
- `node /home/node/.openclaw/workspaces/seo/scripts/khoa.js help`
  → Xem toàn bộ commands có sẵn

## Critical Rules (production-proven)
- H1 injection: Flatsome + LiteSpeed → use wp_footer PHP hook, NOT ob_start()
- ob_start() does NOT work with LiteSpeed → use action hooks instead
- WC product meta: use meta_data[] array format, NOT meta{} object
- parsed_data lacks product IDs → enrich from url_inventory before pushing fixes
- Product schema: use JS template, do NOT call AI (saves cost)
- After deploying any snippet: purge LiteSpeed Cache before verifying changes
- Alt text dedup: phải check per-page — duplicate cross-site KHÔNG phải lỗi
- Title format: use dash separator (e.g., "B&R Automation – PLC, Servo, HMI")

## Baseline Metrics (post Sprint 0-2, 2026-03-22)
- Total URLs indexed: 646
- Avg SEO score: 81.9/100 (products), 80.3/100 (overall)
- Issues fixed: 4,600+
- Alt text fixed: 3,225 occurrences (31 unique files)
- Meta updated: 161 pages
- GSC baseline: 36 clicks/day, 1,807 impressions/day, avg position 14.7

## Verified Findings (2026-03-31)
- Duplicate alt text: 3 trang có lỗi
  - Trang Chủ (ID:2): 15 nhóm duplicate — ưu tiên fix
  - PLC X20CP3583 (ID:3789): x2 duplicate
  - PLC MX207 (ID:3738): x2 duplicate
- Đã báo cáo user, chờ approval để fix

## Last Updated
2026-03-31 (updated by Khoa after first verified skill run)
