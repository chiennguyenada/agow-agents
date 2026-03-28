---
name: wp-gsc
description: Query Google Search Console data for SEO performance tracking and keyword analysis
---

# Google Search Console Integration Skill

## Purpose
Connect to Google Search Console API to retrieve real search performance data (clicks, impressions, CTR, position) for agowautomation.com. This data feeds into the SEO feedback loop — measure the impact of fixes, identify new opportunities, and track keyword rankings over time.

## Prerequisites
- Google Cloud Project with Search Console API enabled
- Service Account with read access to GSC property
- Service Account JSON key file at path: `${GSC_CREDENTIALS_PATH}`
- GSC property: `${GSC_SITE_URL}` (format: `sc-domain:agowautomation.com`)

## Tier Classification
- All GSC queries: **Tier 1** (read-only, auto-execute)
- No write operations — GSC API is read-only

## API Authentication

### Service Account Setup
```
1. Google Cloud Console → APIs & Services → Credentials
2. Create Service Account → download JSON key
3. In GSC: Settings → Users and permissions → Add service account email as "Full" user
4. Mount JSON key in container at ${GSC_CREDENTIALS_PATH}
```

### Authentication Method
```python
from google.oauth2 import service_account
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly']
credentials = service_account.Credentials.from_service_account_file(
    GSC_CREDENTIALS_PATH, scopes=SCOPES
)
service = build('searchconsole', 'v1', credentials=credentials)
```

## Available Queries

### 1. Site Performance (Daily/Weekly/Monthly)
```
Endpoint: searchAnalytics.query
Parameters:
  siteUrl: sc-domain:agowautomation.com
  startDate: YYYY-MM-DD
  endDate: YYYY-MM-DD
  dimensions: [date, query, page, country, device]
  rowLimit: 1000 (max 25000)
  startRow: 0 (for pagination)

Response fields per row:
  clicks, impressions, ctr, position
```

### 2. Top Keywords
```
Request:
  dimensions: [query]
  startDate: last 28 days
  rowLimit: 100
  orderBy: clicks DESC

Use for: identifying high-performing keywords, finding keyword opportunities
```

### 3. Top Pages
```
Request:
  dimensions: [page]
  startDate: last 28 days
  rowLimit: 100
  orderBy: impressions DESC

Use for: identifying pages that need optimization (high impressions, low CTR)
```

### 4. Page + Query Combination
```
Request:
  dimensions: [page, query]
  startDate: last 7 days
  rowLimit: 500

Use for: understanding which keywords drive traffic to which pages
```

### 5. Device Breakdown
```
Request:
  dimensions: [device]
  startDate: last 28 days

Use for: mobile vs desktop performance comparison
```

## Workflow: Weekly GSC Report

### Step 1: Fetch Current Week Data
```
Query: last 7 days, dimensions=[date], no filters
Output: daily clicks, impressions, CTR, avg position
```

### Step 2: Compare with Previous Week
```
Query: 14 days ago to 7 days ago, same dimensions
Calculate: week-over-week change (%)
```

### Step 3: Top Gaining/Losing Keywords
```
Query both weeks with dimensions=[query]
Compare: find keywords with biggest position improvement/decline
Flag: keywords that dropped >3 positions
```

### Step 4: Top Gaining/Losing Pages
```
Query both weeks with dimensions=[page]
Compare: find pages with biggest CTR/click changes
Cross-reference: with recent SEO fixes from actions_log
```

### Step 5: Generate Report
```
Format (Vietnamese):
📊 **Khoa (SEO)**: Báo cáo GSC tuần [date range]

📈 Tổng quan:
  Clicks: X (↑/↓ Y%)
  Impressions: X (↑/↓ Y%)
  CTR: X% (↑/↓ Y%)
  Vị trí TB: X (↑/↓ Y)

🔑 Keywords tăng mạnh nhất: [top 5]
⚠️ Keywords giảm: [top 5 if any]

🏆 Trang hiệu quả nhất: [top 5 by clicks]
📉 Trang cần cải thiện: [high impressions, low CTR]

💡 Đề xuất: [based on data analysis]
```

## Workflow: SEO Fix Impact Measurement

### Purpose
After applying SEO fixes (meta, content, schema), measure actual impact via GSC.

### Step 1: Record Pre-Fix Baseline
```
Before any fix batch:
  Query: page-level data for affected URLs, last 7 days
  Store: in actions_log with fix_id reference
```

### Step 2: Wait Period
```
GSC data has 2-3 day delay
Check impact: 7 days after fix applied
Full impact: 28 days after fix applied
```

### Step 3: Measure Post-Fix
```
Query: same URLs, last 7 days (after wait period)
Compare: clicks, impressions, CTR, position vs baseline
```

### Step 4: Report Impact
```
Format:
📊 Impact của batch fix [fix_id]:
  URLs fixed: X
  Avg position change: ↑/↓ Y
  CTR change: ↑/↓ Y%
  Click change: ↑/↓ Y

Best performers: [top 3 improved URLs]
No change: [URLs with no measurable impact]
```

### Step 5: Feed Back to Self-Improving
```
If fix type consistently improves metrics → promote pattern to HOT
If fix type shows no impact after 28 days → log in corrections.md
```

## Rate Limits
- GSC API: 1,200 queries/day per property
- Recommended: batch queries, cache results for 24h
- Daily check: ~5-10 queries
- Weekly report: ~15-20 queries

## Error Handling
| Error | Action |
|-------|--------|
| 401 Unauthorized | Check service account credentials, verify GSC access |
| 403 Forbidden | Service account not added to GSC property |
| 429 Rate Limited | Back off, retry after 60s |
| Empty results | Normal for new pages (<3 days in index) |
| Partial data | GSC has 2-3 day processing delay, note in report |

## Data Storage
- Raw GSC data: store in `self-improving/performance.json`
- Weekly snapshots: append to performance history
- Retention: keep 90 days of daily data, 1 year of weekly summaries
- Cross-reference: link GSC data with actions_log entries for impact tracking

## Integration with Other Skills
| Skill | How GSC Data Helps |
|-------|--------------------|
| wp-audit | Prioritize pages by actual search traffic, not just technical score |
| wp-content | Identify pages with high impressions but low CTR → content needs improvement |
| wp-daily-check | Include GSC summary in daily report (T07) |
| wp-technical-seo | Measure impact of technical fixes on rankings |
