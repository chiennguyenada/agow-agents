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

### LESSON-007: WordPress Strips HTML Tags in Taxonomy Descriptions
- **Date**: 2026-04-05
- **Agent**: Khoa (SEO)
- **Category**: WordPress API
- **Issue**: `<h2>`, `<ul>`, `<li>`, `<p>` tags stripped when saving WooCommerce category description via REST API. Only `<strong>`, `<em>`, `<a>` survive.
- **Root Cause**: WordPress applies `wp_filter_kses` filter via `pre_term_description` hook, which only allows basic inline tags in taxonomy term descriptions.
- **Solution**: Add PHP snippet via WPCode (active on agowautomation.com):
  ```php
  remove_filter( 'pre_term_description', 'wp_filter_kses' );
  add_filter( 'pre_term_description', 'wp_kses_post' );
  remove_filter( 'term_description', 'wp_kses_data' );
  ```
- **Prevention**: Before any taxonomy description write operation, verify snippet is active. Test by saving `<h2>test</h2>` and reading back — if `<h2>` survives, snippet is active. **Re-apply all descriptions after activating snippet** (data already in DB was stripped).
- **Applies to**: All taxonomy types — product_cat, category, tag, custom taxonomies

### LESSON-008: Windows Git Bash + Docker Exec Path Mangling
- **Date**: 2026-04-02
- **Agent**: Khoa (SEO)
- **Category**: Infrastructure / DevOps
- **Issue**: `docker exec agow-openclaw node /home/node/...` fails on Windows Git Bash — path gets mangled to `C:/Program Files/Git/home/node/...`
- **Root Cause**: Git Bash auto-converts Unix paths starting with `/` to Windows paths
- **Solution**: Always use `MSYS_NO_PATHCONV=1` prefix AND double-slash `//home/...`:
  ```bash
  MSYS_NO_PATHCONV=1 docker exec agow-openclaw node //home/node/.openclaw/workspaces/seo/scripts/khoa.js help
  ```
- **Prevention**: Any script or instruction involving `docker exec` + Unix path on Windows must include both `MSYS_NO_PATHCONV=1` and `//` prefix.

### LESSON-009: AI Response Parsing — Defensive Approach Required
- **Date**: 2026-04-05
- **Agent**: Khoa (SEO)
- **Category**: AI Integration
- **Issue**: AI (Claude) output format is inconsistent even with strict prompting. Same prompt may return `**LABEL:**`, `## LABEL:`, ` ```LABEL``` `, or plain `LABEL:` across different calls.
- **Root Cause**: LLM non-determinism — formatting instructions are suggestions, not guarantees.
- **Solution**: Use position-based parsing (find label positions via regex, extract blocks between labels) instead of line-by-line parsing. Add `meaningful()` filter to skip lines containing only `**`, ` ``` `, `---`:
  ```js
  const meaningful = l => l.replace(/^[`*\-\s]+|[`*\-\s]+$/g,'').length > 5 && /[a-zA-ZÀ-ỹ0-9]/.test(l);
  ```
- **Prevention**: Always save raw AI response (`rawResponse`) in cache alongside parsed result — enables free reparse when parser is improved, no extra API cost.
- **Key edge cases**: `**\n` before code fence (strip `^\s*\*{1,2}\s*\n` before fence strip); `**` as standalone line before content (filter with `meaningful()`).

### LESSON-010: B2B SEO — Citation References Are E-E-A-T Signals
- **Date**: 2026-04-02
- **Agent**: Khoa (SEO)
- **Category**: SEO Content Strategy
- **Issue**: Auto-fix scripts incorrectly removed `(data sheet, trang X)` and `(manual, trang X)` from product descriptions, treating them as noise.
- **Root Cause**: Pattern matching too aggressive — noise cleanup script didn't distinguish between actual noise (phone numbers, email, metadata block) and technical citations.
- **Finding**: 367/590 products (62%) have these citation patterns. For B2B industrial buyers, citations prove content is sourced from official B&R documentation — increases trust and dwell time.
- **Solution**: Only remove true noise: phone (028...), email addresses, metadata blocks (Mã SP / Thương hiệu / Xuất xứ), generic CTA boilerplate. KEEP all citation patterns.
- **Prevention**: For B2B technical content, citation = credibility signal. Different from B2C where citations may look academic/off-putting.

### LESSON-011: Meta Description — Extend, Never Replace When Partially Good
- **Date**: 2026-04-02
- **Agent**: Khoa (SEO)
- **Category**: SEO Content Strategy
- **Issue**: Fix script for THIN_META_DESC (102–119 chars) replaced existing content with shorter AI-generated text — making things worse.
- **Root Cause**: Script called `generateProductDesc()` (build from scratch) instead of `extendProductDesc()` (extend existing). Result: original 138-char desc → new 90-char desc.
- **Solution**:
  - `NO_META_DESC` → build from scratch
  - `THIN_META_DESC` → extend existing with specific technical specs (resolution, protocol, channels, application)
  - Safety check: `if (newDesc.length < currentDesc.length) → keep original, flag needsManual`
- **Rule**: Optimal meta desc = 140–155 chars. Never append generic CTA ("Liên hệ Agow...") to 78+ pages — boilerplate signal kills uniqueness. Use remaining chars for product-specific technical info instead.

### LESSON-012: WooCommerce Category URL Structure
- **Date**: 2026-04-05
- **Agent**: Khoa (SEO)
- **Category**: WordPress / WooCommerce
- **Finding**: WooCommerce product categories are accessible via two REST API endpoints:
  - `GET /wp-json/wp/v2/product_cat/{id}` — WordPress REST API (for description + RankMath meta)
  - `GET /wp-json/wc/v3/products/categories/{id}` — WooCommerce REST API (for product count, image, display settings)
- **For SEO updates**: Use `/wp/v2/product_cat` (WP REST API + Basic Auth). Supports `meta` field for RankMath.
- **URL pattern**: `https://agowautomation.com/{slug}` — categories use direct slug, NOT `/danh-muc-san-pham/` prefix (WooCommerce default).
