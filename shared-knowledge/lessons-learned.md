# Lessons Learned

> Auto-updated by Lead Agent and SEO Agent after each task cycle.
> Seeded with critical lessons from production project 28-auditwebagow.

---

## Critical Lessons (from production — 2026-03-24)

### LESSON-001: LiteSpeed Cache Aggressive Caching
- **Date**: 2026-03-24
- **Category**: Infrastructure
- **Issue**: Content changes not visible after WP API update
- **Root Cause**: LiteSpeed Cache plugin aggressively caches pages, including REST API responses
- **Solution**: Must call LiteSpeed purge API after every content modification. Wait 5s then verify.
- **Prevention**: Always include cache purge step in any write operation workflow

### LESSON-002: WordPress register_term_meta Required
- **Date**: 2026-03-24
- **Category**: WordPress API
- **Issue**: RankMath meta fields (rank_math_title, etc.) not accessible via REST API for categories/tags
- **Root Cause**: WordPress REST API only exposes meta fields that are explicitly registered via register_term_meta() and register_post_meta()
- **Solution**: Install PHP snippet via WPCode plugin that calls register_term_meta and register_post_meta for all RankMath fields
- **Prevention**: Before building any meta-editing skill, verify PHP snippets are installed. Check with: GET /wp-json/wp/v2/categories/1?_fields=meta — if rank_math_title is missing, PHP snippet not active

### LESSON-003: Alt Text Inflation Trap
- **Date**: 2026-03-25
- **Category**: SEO
- **Issue**: Google may penalize pages where multiple images have identical alt text
- **Root Cause**: Auto-fix script set all product images to the same alt = product name
- **Solution**: Generate unique, descriptive alt text per image. Include context (angle, detail shown, use case)
- **Prevention**: Before fixing alt text, check existing alt texts on the page. Ensure no duplicates.

### LESSON-004: Crawl Data Staleness
- **Date**: 2026-03-25
- **Category**: Data Quality
- **Issue**: Fixes applied based on outdated crawl data caused incorrect changes
- **Root Cause**: Using crawl data from 2+ days ago, page content had changed since then
- **Solution**: Always re-crawl target URLs immediately before applying any fix
- **Prevention**: Add staleness check: if crawl_timestamp > 24 hours → re-crawl first

### LESSON-005: WooCommerce Separate Credentials
- **Date**: 2026-03-24
- **Category**: Authentication
- **Issue**: WooCommerce API returns 401 with WordPress Application Password
- **Root Cause**: WC REST API uses its own Consumer Key/Secret authentication, separate from WP
- **Solution**: Generate credentials in WP Admin > WooCommerce > Settings > Advanced > REST API
- **Prevention**: Always use WC_CONSUMER_KEY/WC_CONSUMER_SECRET for /wc/v3/ endpoints

### LESSON-006: GSC Domain Property Format
- **Date**: 2026-03-26
- **Category**: Google Search Console
- **Issue**: GSC API returns "not found" for the site
- **Root Cause**: Using "https://agowautomation.com" instead of domain property format
- **Solution**: Use `sc-domain:agowautomation.com` (no protocol, no www)
- **Prevention**: Always use sc-domain: prefix for domain-level properties

---

## Operational Lessons

_New lessons will be appended here by the agents during operation._
