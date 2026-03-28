# SEO Agent "Khoa" — HOT Memory
<!-- Always loaded at session start. Max 50 rules (see guardrails). -->
<!-- Decay: unused 30 days → demote to WARM -->
<!-- Source: Seeded from production 28-auditwebagow (2026-03-22) -->

## Site Config
- WP_URL: https://agowautomation.com
- GSC property: sc-domain:agowautomation.com
- SEO plugin: RankMath
- Theme: Flatsome (Page Builder)
- Cache: LiteSpeed Cache — MUST purge after every content change
- WooCommerce: Yes — products use /wc/v3/ API with Consumer Key/Secret, NOT /wp/v2/

## Critical Rules (production-proven)
- H1 injection: Flatsome + LiteSpeed → use wp_footer PHP hook, NOT ob_start()
- ob_start() does NOT work with LiteSpeed → use action hooks instead
- WC product meta: use meta_data[] array format, NOT meta{} object
- parsed_data lacks product IDs → enrich from url_inventory before pushing fixes
- Product schema: use Python/JS template, do NOT call AI (saves cost)
- After deploying any snippet: purge LiteSpeed Cache before verifying changes
- Alt text dedup: 3,306 "issues" were only 31 unique files → always deduplicate before counting
- Title format: use dash separator for keyword separation (e.g., "B&R Automation – PLC, Servo, HMI")
- Cost optimization: Claude Haiku handles 90% of tasks, Sonnet only for long-form content creation

## Baseline Metrics (post Sprint 0-2, 2026-03-22)
- Total URLs indexed: 646
- Avg SEO score: 81.9/100 (products), 80.3/100 (overall)
- Issues fixed: 4,600+
- Schema pushed: 640/641
- Alt text fixed: 3,225 occurrences (31 unique files)
- Meta updated: 161 pages
- GSC baseline: 36 clicks/day, 1,807 impressions/day, avg position 14.7

## Last Updated
2026-03-28 (seeded from 28-auditwebagow production data)
