---
name: wp-audit
description: Full SEO audit of agowautomation.com — crawl all URLs, score 0-100 with 13 issue codes
---

# Skill: WP Audit

## Purpose
Perform comprehensive SEO audit of agowautomation.com. Crawl all URLs, score each page 0-100, identify issues, and generate prioritized report.

## Source Reference
Based on: `28-auditwebagow/sprint1_crawler_v2.py` + `sprint1_parser.py`

## Trigger
- User request: "audit", "kiểm tra SEO", "phân tích website"
- Can scope to: full site, specific category, single URL

## Approval Tier
- Tier 1 (Auto-Execute) — read-only operation

## Process

### Step 1: URL Discovery
Sources (crawl in this order):
1. **Sitemap**: `${WP_BASE_URL}/sitemap_index.xml` → parse all sub-sitemaps
2. **WP REST API**: `/wp-json/wp/v2/posts?per_page=100&page={N}` + `/pages` + `/categories` + `/tags`
3. **WC REST API**: `/wp-json/wc/v3/products?per_page=100&page={N}`
4. Deduplicate by URL, store as `url_inventory.json`

Pagination: Loop until API returns empty array or `X-WP-TotalPages` header reached.

### Step 2: HTML Parse & Score
For each URL, fetch HTML and extract:

| Check | Field | Weight | Issue Code |
|-------|-------|--------|------------|
| Title tag exists | `<title>` | 15 | MISSING_TITLE |
| Title length 30-60 chars | `<title>` | 5 | SHORT_TITLE / LONG_TITLE |
| Meta description exists | `<meta name="description">` | 10 | NO_META_DESC |
| Meta desc 120-160 chars | `<meta name="description">` | 5 | THIN_META_DESC |
| H1 exists | `<h1>` | 10 | NO_H1 |
| Single H1 | `<h1>` count | 5 | MULTIPLE_H1 |
| Content word count > 300 | Body text | 15 | THIN_CONTENT |
| Images have alt text | `<img alt="">` | 10 | MISSING_ALT |
| Duplicate alt on SAME page | `<img alt="">` per page | 5 | DUPLICATE_ALT |
| Schema markup exists | `<script type="application/ld+json">` | 5 | NO_SCHEMA |
| Canonical URL set | `<link rel="canonical">` | 5 | NO_CANONICAL |
| Focus keyword in title | RankMath meta | 5 | NO_FOCUS_KEYWORD |
| No broken internal links | `<a href>` → check 200 | 5 | BROKEN_LINKS |
| Duplicate title check | Cross-page | 5 | DUPLICATE_TITLE |

**Score formula**: Start at 100, subtract weight for each failed check.

### Step 3: Severity Classification
| Score Range | Severity | Action |
|-------------|----------|--------|
| 90-100 | Excellent | No action |
| 70-89 | Good | Monitor |
| 50-69 | Needs Fix | Queue for auto-fix (Tier 2) |
| 30-49 | Poor | Priority fix + admin notification |
| 0-29 | Critical | Immediate fix + admin alert |

### Step 4: Report Generation
Output format:
```
📊 SEO AUDIT REPORT — {scope}
Date: {date}
URLs audited: {count}
Average score: {avg}/100

Score distribution:
  Excellent (90+): {count} ({%})
  Good (70-89): {count} ({%})
  Needs Fix (50-69): {count} ({%})
  Poor (30-49): {count} ({%})
  Critical (<30): {count} ({%})

Top Issues (by frequency):
  1. {ISSUE_CODE}: {count} pages affected
  2. {ISSUE_CODE}: {count} pages affected
  3. {ISSUE_CODE}: {count} pages affected

Priority Fix Queue:
  1. {URL} — Score: {score} — Issues: {codes}
  2. {URL} — Score: {score} — Issues: {codes}
  ...

Estimated fix effort: {hours} hours
Estimated API cost: ${cost}
```

### Step 5: Save Results
- Save full results to `shared-knowledge/audit-results/{date}.json`
- Save summary to Telegram
- Update performance baseline in self-improving memory

## Error Handling
- URL returns 404/500 → log as BROKEN_URL, exclude from scoring
- WP API pagination fails → retry with smaller per_page
- Timeout on HTML fetch → skip URL, continue batch, report at end
- Rate limited (429) → exponential backoff, respect Retry-After header

## Performance Notes
- Use claude-haiku-4-5 for parsing (no AI needed for HTML extraction)
- Batch API calls (100 per page) to minimize requests
- Expected: 646 URLs in ~5-10 minutes, cost ~$0.05
