---
name: wp-technical-seo
description: Fix technical SEO issues — meta tags, H1, alt text, schema markup, canonical URLs
---

# Skill: WP Technical SEO

## Purpose
Handle technical SEO fixes: meta tags, schema markup, H1 tags, canonical URLs, alt text, and other on-page technical elements.

## Trigger
- User request: "sửa meta", "thêm schema", "fix H1", "canonical", "technical SEO"
- Auto-triggered by wp-daily-check T05 for specific issue codes
- Auto-triggered by wp-audit for technical issues

## Approval Tiers by Action

### Tier 1 — Auto-Execute (read-only)
- Analyze current meta/schema/H1 status of any page
- Generate fix recommendations
- Check canonical URL correctness
- Validate schema markup

### Tier 2 — Notify-Then-Do
- Update meta title/description (rank_math_title, rank_math_description)
- Add/fix alt text on images
- Add/update JSON-LD schema markup
- Fix missing H1 (for non-PageBuilder pages)
- Update focus keyword (rank_math_focus_keyword)
- Add internal links to orphaned pages

### Tier 3 — Require Approval
- Modify canonical URLs
- Change robots meta (rank_math_robots)
- Modify sitemap inclusion/exclusion
- Bulk technical fixes (>10 pages)

## Fix Procedures

### MISSING_TITLE / SHORT_TITLE / LONG_TITLE
```
1. Read current title and content
2. Generate SEO title: {Primary Keyword} - {Secondary Info} | Agow Automation
3. Ensure ≤60 characters
4. PUT /wp-json/wp/v2/{type}/{id} with meta.rank_math_title
5. Purge LiteSpeed cache
6. Verify via re-crawl
```

### NO_META_DESC / THIN_META_DESC
```
1. Read page content (first 500 words)
2. Generate description: summarize value proposition + call to action
3. Ensure 120-160 characters, include focus keyword
4. PUT meta.rank_math_description
5. Purge cache + verify
```

### NO_H1
Two scenarios:
- **Regular page**: Add H1 at content start via content update
- **PageBuilder page**: Cannot add via REST API — log and notify admin
  - Reason: PageBuilder renders H1 from its own data structure
  - Solution: PHP filter via WPCode (already installed) injects H1
  - Just verify the PHP filter is working

### MULTIPLE_H1
```
1. Identify all H1 tags in content
2. Keep the most relevant H1 (matches title/keyword)
3. Demote others to H2
4. Update content via PUT
5. Purge cache + verify
```

### MISSING_ALT
```
1. List all images without alt text
2. For each image:
   a. Analyze image context (surrounding text, page topic)
   b. Generate descriptive alt text (5-15 words)
   c. CRITICAL: Check for duplicate alt text — no two images on same page should have identical alt
   d. PUT /wp-json/wp/v2/media/{id} with { "alt_text": "..." }
3. Purge cache + verify
```

### NO_SCHEMA
```
1. Determine page type:
   - Product page → Product schema
   - Blog post → Article schema
   - Category → CollectionPage schema
   - Company page → Organization schema
2. Generate JSON-LD schema
3. Inject via content filter (WPCode PHP snippet handles this)
4. Validate at schema.org/validator (or structured data testing tool)
5. Purge cache + verify
```

### NO_CANONICAL
```
1. Determine correct canonical URL:
   - Self-referencing for unique pages
   - Point to main product for variant pages
   - HTTPS version always
2. This is Tier 3 if changing existing canonical
3. Set via rank_math_robots or header injection
4. Purge cache + verify
```

## Backup Before Fix
Before ANY write operation:
```
1. GET current state of the resource
2. Save to backup: {
     url, post_id, type,
     old_title, old_description, old_content_excerpt,
     old_alt_texts, old_schema,
     timestamp, fix_type
   }
3. Backup stored in shared-knowledge/backups/{date}/{post_id}.json
4. Retention: 30 days
```

## Undo Capability
For every Tier 2 fix, provide undo:
```
Telegram message format:
"Đã sửa {ISSUE_CODE} cho {URL}:
  Trước: {old_value}
  Sau: {new_value}

Nhấn UNDO-{task_id} để hoàn tác."
```
On UNDO command → restore from backup → purge cache → verify → confirm

## WordPress API Specifics

### Reading RankMath meta:
```
GET /wp-json/wp/v2/posts/{id}?_fields=id,title,meta
→ response.meta.rank_math_title
→ response.meta.rank_math_description
→ response.meta.rank_math_focus_keyword
```
NOTE: Only works if register_post_meta() PHP snippet is active.

### For categories/tags:
```
GET /wp-json/wp/v2/categories/{id}?_fields=id,name,meta
→ response.meta.rank_math_title
```
NOTE: Only works if register_term_meta() PHP snippet is active.

### Updating meta:
```
PUT /wp-json/wp/v2/posts/{id}
Headers: Authorization: Basic {base64(user:app_password)}
Body: { "meta": { "rank_math_title": "New Title | Agow" } }
```

## Error Handling
- Meta field not writable → PHP snippet likely missing → alert admin with instructions
- Schema validation fails → retry generation, if still fails → log for manual fix
- Image 404 when updating alt → skip, log broken image
- Bulk fix hitting rate limit → pause 60s, resume with remaining items
