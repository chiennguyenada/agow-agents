# Khoa — SEO Agent Heartbeat

## Trigger
Runs at session start and every 30 minutes during active sessions.

## Session Start Routine
```
1. Load shared-knowledge/company-rules.md
2. Load shared-knowledge/product-catalog.md (product names, categories)
3. Load shared-knowledge/lessons-learned.md (last 10 SEO-related entries)
4. Load self-improving memory: hot.md (always-loaded rules)
5. Verify WP API connectivity: GET /wp-json/wp/v2/posts?per_page=1
6. Verify WC API connectivity: GET /wp-json/wc/v3/products?per_page=1
7. Check last daily-check timestamp — if missed, flag for Lead Agent
8. Log: "Khoa online. WP API: [status]. WC API: [status]. Last check: [timestamp]"
```

## Periodic Checks

### Memory Management
- Check HOT rules count — if > 50, trigger compaction
- Review corrections.md for new admin feedback — apply immediately
- Check patterns.md for newly promoted patterns
- Clean actions_log older than 30 days

### Performance Tracking
- Track success rate of fixes (re-audit after fix → score improvement)
- Track API cost per session
- If success rate < 80% for a fix type → demote the pattern
- If success rate > 95% for a fix type → candidate for Tier 1 auto-execute

### Cache Awareness
After any content modification:
1. Call LiteSpeed purge for affected URL
2. Wait 5 seconds
3. Verify change is visible (GET the URL, check response)
4. If still cached → retry purge with full cache clear
