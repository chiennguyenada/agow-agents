---
name: wp-daily-check
description: Automated daily SEO health check — 8-task cycle (crawl, score, fix meta, fix content, report)
---

# Skill: WP Daily Check

## Purpose
Automated daily SEO health check — 8-task cycle running every morning at 6:00 AM.

## Source Reference
Based on: `28-auditwebagow/seo_agent.py` (tasks T01-T08)

## Trigger
- Cron: `0 6 * * *` (6:00 AM daily, Asia/Ho_Chi_Minh)
- Manual: Telegram command "RUN"

## Approval Tier
- Tasks T01-T04: Tier 1 (Auto — read/analyze only)
- Tasks T05-T06: Tier 2 (Fix then notify)
- Tasks T07-T08: Tier 1 (Auto — reporting only)

## 8-Task Cycle

### T01: Fresh Crawl
- Re-crawl all URLs from latest url_inventory.json
- Check for new URLs (new posts/products since last crawl)
- Check for removed URLs (404s)
- Update url_inventory.json
- Duration: ~3-5 minutes for 650+ URLs

### T02: Parse & Score
- Re-parse all URLs, calculate SEO scores
- Compare with yesterday's scores
- Identify score changes (improved/declined/unchanged)
- Duration: ~5-10 minutes

### T03: Prioritize Issues
- Rank all pages with score < 70 by:
  1. Page traffic (if GSC data available)
  2. Score severity (lower = higher priority)
  3. Issue fixability (auto-fixable first)
- Create today's fix queue (max 20 pages per day)
- Duration: ~1 minute

### T04: Check Pending Approvals
- Check for any Tier 3 items awaiting admin decision
- If pending > 24 hours → send reminder via Telegram
- If pending > 72 hours → auto-reject with log

### T05: Auto-Fix Meta Issues (Tier 2)
For top priority pages in fix queue:
- Fix MISSING_TITLE → generate from H1 + focus keyword
- Fix NO_META_DESC → generate from content summary
- Fix THIN_META_DESC → expand existing description
- Fix NO_FOCUS_KEYWORD → suggest based on content analysis
- Fix MISSING_ALT → generate descriptive alt text (check for duplicates!)
- Each fix: backup → fix → purge cache → verify → log

Max fixes per run: 10 pages (to stay within API rate limits)

### T06: Auto-Fix Content Issues (Tier 2)
For pages with THIN_CONTENT in fix queue:
- Apply content expansion strategy from wp-content skill
- Max expansions per run: 3 pages (content generation is expensive)
- Each expansion: backup → expand → purge cache → re-score → log

### T07: Daily Summary Report
Send via Telegram to admin:
```
📋 BÁO CÁO SEO HÀNG NGÀY — {date}

Tổng URLs: {total} (mới: +{new}, mất: -{removed})
Điểm trung bình: {avg}/100 ({change} so với hôm qua)

Đã sửa hôm nay: {fix_count} trang
  - Meta fixes: {count}
  - Content fixes: {count}
  - Kết quả: {improved}/{total} cải thiện

Score changes:
  ↑ Cải thiện: {improved_count} trang
  ↓ Giảm: {declined_count} trang
  → Không đổi: {unchanged_count} trang

Top cải thiện: {url} ({old_score} → {new_score})
Cần chú ý: {url} ({score}, issues: {codes})

API cost hôm nay: ${cost}
Pending approvals: {count}
```

### T08: Self-Learning Update
- Review today's fix results:
  - Which fixes improved scores? → strengthen pattern
  - Which fixes didn't improve? → weaken pattern
  - Any new issues discovered? → create new pattern
- Update hot.md with new lessons (if any)
- Update patterns.md with performance data
- Log actions in actions_log.json

## Error Handling
- If T01 fails → skip T02-T06, send alert, try again at next run
- If T05/T06 fails mid-batch → save progress, complete remaining in next run
- If Telegram unavailable → log report locally, retry send every 15 min
- If WP API rate limited → slow down, extend cycle to 2 hours max

## Performance Budget
| Task | Estimated Duration | Estimated Cost |
|------|--------------------|----------------|
| T01-T02 | 8-15 min | $0.01 (Haiku) |
| T03-T04 | 1-2 min | $0.001 |
| T05 | 5-10 min | $0.02 (Haiku) |
| T06 | 10-20 min | $0.05-0.10 (Sonnet for content) |
| T07-T08 | 2-3 min | $0.005 |
| **Total** | **~30-50 min** | **~$0.08-0.15** |
