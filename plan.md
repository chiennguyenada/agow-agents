# Agow Automation — Implementation Plan v2.0

## 1. Overview

Multi-agent system on OpenClaw for Agow Automation (B&R Automation distributor).
Communicates via Telegram, self-learns via Lossless-Claw + Self-Improving, runs in Docker.

### Key Enhancements in v2.0
| Enhancement | Description |
|-------------|-------------|
| Capability Evolution Protocol | Lead Agent detects missing capabilities, self-builds & verifies, presents for approval |
| Tiered SEO Approval | 3 levels: Auto-execute / Notify-then-do / Require approval |
| Self-Improving Guardrails | Confidence scoring, conflict detection, weekly review, max 50 HOT rules |
| Error Handling Matrix | 9 failure scenarios with specific responses |
| Monitoring & Alerting | 15-min health checks, Telegram alerts |
| Backup & DR | Daily backups, tested recovery procedures |
| Cost Optimization | Haiku for routine tasks, Sonnet for complex tasks |
| Abstraction Layer | Reduce OpenClaw vendor lock-in |

---

## 2. System Architecture

### Hybrid Routing Model
```
User (Telegram)
  │
  ├─ "@khoa audit website" ──→ Khoa (SEO) ──→ responds directly to User
  ├─ "@seo fix meta" ────────→ Khoa (SEO) ──→ responds directly to User
  ├─ "@lead status" ─────────→ Lead Agent ──→ responds directly to User
  ├─ "giúp cải thiện web" ──→ Lead Agent ──→ analyzes → delegates to Khoa
  │                                          (Khoa responds directly to User)
  └─ "phân tích backlinks" ─→ Lead Agent ──→ Capability Evolution Protocol
                                             (Lead responds directly to User)

Key: Agents respond DIRECTLY to User on Telegram. Lead is NOT a relay.
     Lead only routes ambiguous requests and monitors via logs.
```

### Components
```
Lead Agent ("lead")
├── Smart router for ambiguous requests
├── Monitors agent health (passive, via logs)
└── Capability Evolution Protocol (detect gap → build → verify → present)

SEO Agent "Khoa" ("seo")
├── WordPress REST API (agowautomation.com)
├── Google Search Console (Phase 1f)
├── Direct Telegram access (responds to @khoa/@seo tags)
└── Self-Improving memory (HOT/WARM/COLD)

Memory & Learning Layer
├── L1: Lossless-Claw (SQLite + DAG, infinite memory)
├── L2: Self-Improving (tiered learning, auto promote/demote)
└── L3: Shared Knowledge (git-versioned, cross-agent)
```

---

## 3. Agents

| Agent | ID | Role | Phase | Model |
|-------|----|------|-------|-------|
| Lead Agent | `main` | Dispatch, routing, monitoring, Evolution | 1a | claude-sonnet-4-6 |
| Khoa — SEO | `seo` | SEO audit, content, technical SEO, WordPress | 1a | claude-sonnet-4-6 |
| Warehouse | `warehouse` | Inventory, stock, import/export | 2 | claude-sonnet-4-6 |
| Accounting | `accounting` | Invoices, payments, contracts | 3 | claude-sonnet-4-6 |

Lead Agent also serves as "Evolution Coordinator" — self-detects capability gaps and proposes solutions.

---

## 4. Directory Structure

```
~/agow-agents/
├── CLAUDE.md                           ← Claude instructions (this project)
├── plan.md                             ← This file
├── progress.md                         ← Implementation tracking
├── verification.md                     ← Test protocol
├── changelog.md                        ← Change history
├── docker-compose.yml
├── .env                                ← API keys (NOT committed)
├── .env.example
├── backups/                            ← Automated backup destination
│
└── openclaw-home/                      ← Mounted as ~/.openclaw/
    ├── openclaw.json                   ← Main config
    │
    ├── workspaces/
    │   ├── lead/                       ← Lead Agent
    │   │   ├── AGENTS.md
    │   │   ├── SOUL.md
    │   │   ├── HEARTBEAT.md
    │   │   ├── skills/task-router/SKILL.md
    │   │   └── sandbox/               ← Capability Evolution builds here
    │   │
    │   └── seo/                        ← SEO Agent "Khoa"
    │       ├── AGENTS.md
    │       ├── SOUL.md
    │       ├── HEARTBEAT.md
    │       ├── self-improving/
    │       └── skills/
    │           ├── wp-audit/SKILL.md
    │           ├── wp-content/SKILL.md
    │           ├── wp-daily-check/SKILL.md
    │           └── wp-technical-seo/SKILL.md
    │
    ├── shared-knowledge/               ← Git-versioned
    │   ├── .git/
    │   ├── company-rules.md
    │   ├── product-catalog.md
    │   └── lessons-learned.md
    │
    ├── shared-lib/                     ← Abstraction layer
    │   ├── message-bus.ts
    │   ├── memory-provider.ts
    │   └── channel-adapter.ts
    │
    ├── guardrails/
    │   ├── approval-required.yml       ← Actions requiring human approval
    │   └── rate-limits.yml             ← Rate limiting config
    │
    ├── monitoring/
    │   ├── health-check.sh
    │   └── alert-telegram.sh
    │
    └── scripts/
        ├── log-rotation.sh
        ├── db-vacuum.sh
        └── backup.sh
```

---

## 5. Capability Evolution Protocol (6 Steps)

When system receives a request that no skill can handle:

| Step | Action | Details |
|------|--------|---------|
| B1 | DETECT GAP | Agent reports: "I don't have capability X" to Lead |
| B2 | ANALYZE & PROPOSE | Lead analyzes requirements, estimates complexity, drafts solution |
| B3 | SELF-BUILD | Lead writes SKILL.md, scripts, config IN SANDBOX (not production) |
| B4 | SELF-VERIFY | Lead runs automated tests: syntax check, dry-run, API connectivity |
| B5 | PRESENT FOR APPROVAL | Send summary to user via Telegram: solution + test results + Approve/Reject |
| B6 | DEPLOY | After approval: copy from sandbox to production, update routing |

### Autonomy Levels
| Level | Lead can do alone | Needs user | Example |
|-------|-------------------|------------|---------|
| Fully auto | Write SKILL.md, create folders, write scripts, update routing | Just Approve at B5 | Add new skill from template |
| Needs admin help | Prepare install commands | Add API key, install Docker package | Register new API (Ahrefs) |
| Needs developer | Analyze and propose | Change Docker architecture, complex integration | Add vector DB |

---

## 6. Tiered SEO Approval (3 Levels)

### Tier 1: AUTO-EXECUTE (no approval needed, ~70% of daily work)
- Read data, run audits, analyze
- Create draft posts (NOT publish)
- Generate reports, statistics
- Search memory (lcm_grep)
- Self-learn (write corrections.md)

### Tier 2: NOTIFY-THEN-EXECUTE (do first, notify after, Undo within 24h)
- Fix meta title / meta description
- Add alt text to images
- Fix broken internal links
- Optimize images (compress)

### Tier 3: REQUIRE APPROVAL (send preview, wait for Approve/Reject)
- Modify robots.txt
- Change sitemap.xml
- Add/modify schema markup
- Delete WordPress content
- Modify .htaccess / server config
- Publish posts (draft → public)
- Install WordPress plugins

---

## 7. Self-Learning Architecture

### Three Memory Layers
| Layer | Tool | Function | Automatic? |
|-------|------|----------|------------|
| L1 | Lossless-Claw | Store all messages, DAG summarization, recall via lcm_grep | Fully |
| L2 | Self-Improving | Tiered memory (HOT/WARM/COLD), pattern learning | Fully |
| L3 | Shared Knowledge | Cross-agent knowledge, git-versioned | Semi |

### Pattern Lifecycle
Detection → Logged (corrections.md) → WARM (by domain/project) → HOT (if 3x in 7 days) → Auto-applied every session
Demotion: 30 days unused → WARM, 90 days → COLD/Archive

### Guardrails
| Guardrail | Mechanism | Frequency |
|-----------|-----------|-----------|
| Weekly HOT Review | Export HOT rules to Telegram for human review | Sunday 9:00 AM |
| Confidence Scoring | Score 0-1 based on usage frequency and recency | Every promote/demote |
| Conflict Detection | Alert when 2 HOT rules contradict | Real-time |
| Git Versioning | memory.md committed after every change | Every write |
| Max HOT Limit | Hard cap 50 rules per agent | Heartbeat check |
| Correction Validation | Require 2+ occurrences before logging as pattern | On detection |

---

## 8. Error Handling Matrix

| Failure | Detection | Response | Escalation |
|---------|-----------|----------|------------|
| WordPress API down | HTTP 5xx / timeout >30s | Retry 3x (backoff 5s, 15s, 45s), queue task | Alert admin after 3 failures |
| LLM API rate limit | HTTP 429 | Switch to fallback model (GPT-4.1) | Alert admin, pause non-critical |
| LLM API timeout | No response 120s | Retry once, switch fallback | Log and continue |
| Lossless-Claw error | Exception during DAG write | Rollback to last good state | Alert admin |
| Agent stuck | No heartbeat 2 cycles | Lead restarts agent session | Alert if restart fails |
| Docker crash | Health check fail 3x | Docker auto-restart | Alert if restart loop |
| Telegram disconnect | No webhook 15 min | Re-register webhook | Email fallback alert |
| Disk low (<500MB) | Monitoring script | Emergency log rotation | Alert immediately |
| Self-improving conflict | 2 HOT rules contradict | Quarantine new rule | Flag for weekly review |

---

## 9. Monitoring & Alerting

Health check every 15 minutes via cron:

| Check | Threshold | Level | Action |
|-------|-----------|-------|--------|
| Container status | Not running | Critical | Restart, alert |
| Disk usage | >80% | Warning | Emergency log rotation |
| RAM usage | >85% | Warning | Restart if >95% |
| SQLite DB size | >500MB | Info | Schedule VACUUM |
| Daily check completion | Not done by 7:00 AM | Warning | Re-trigger cron |
| Agent response time | >60s average | Warning | Check LLM API |
| HOT rules count | >50 per agent | Info | Trigger compaction |
| Failed API calls | >5 in 1 hour | Critical | Switch fallback, alert |

Weekly report: Monday 8:00 AM — tasks completed, errors, patterns learned, API cost, website health.

---

## 10. Security

### WordPress API
- Scope-limited API key (Posts + Media only)
- Rate limiting: 100 calls/hour per IP
- IP whitelist in production
- HTTPS enforced
- Credential rotation every 90 days

### Telegram
- Allowlist only (specific user IDs)
- Rate limit: 10 messages/minute per user
- Session timeout: 90 minutes idle

---

## 11. Backup & Disaster Recovery

| Data | Frequency | Retention | Destination |
|------|-----------|-----------|-------------|
| openclaw-home/ (full) | Daily 2:00 AM | 7 daily + 4 weekly | Local + Cloud |
| shared-knowledge/ (git) | Every write | Full git history | Git remote |
| SQLite DB (lcm.db) | Daily 2:00 AM | 7 snapshots | Local + Cloud |
| .env (secrets) | Manual on change | Encrypted copy | Password manager |

### Recovery
| Scenario | RTO | RPO | Procedure |
|----------|-----|-----|-----------|
| Container crash | <5 min | 0 | Docker auto-restart |
| SQLite DB corrupt | <30 min | <24h | Restore from backup |
| VPS failure | <2 hours | <24h | New VPS + cloud backup |
| Wrong self-improving rule | <10 min | 0 | Git revert memory.md |

---

## 12. Cost Optimization

| Task Type | Model | Est. Cost/Call |
|-----------|-------|----------------|
| Complex/Creative | claude-sonnet-4-6 | $0.01-0.05 |
| Routine/Monitoring | claude-haiku-4-5 | $0.001-0.005 |
| Fallback | gpt-4.1 | Varies |

Session idle timeout: 90 minutes (down from 240).

---

## 13. Lessons from Existing SEO Audit Project (28-auditwebagow)

> Production-deployed since 2026-03-24. 646 URLs audited, 4,600+ issues fixed at $0.29.
> These lessons MUST be incorporated into OpenClaw skills to avoid re-learning them.

### WordPress & WooCommerce API Specifics

| Endpoint | Auth | Notes |
|----------|------|-------|
| `/wp-json/wp/v2/posts` | Application Password | Read/write posts. Pagination via `?per_page=100&page=N` |
| `/wp-json/wp/v2/pages` | Application Password | Same as posts |
| `/wp-json/wp/v2/media` | Application Password | Image upload, alt text update |
| `/wp-json/wp/v2/categories`, `/tags` | Application Password | Taxonomy endpoints |
| `/wp-json/wc/v3/products` | WC Consumer Key/Secret | **Separate credentials from WP** |
| RankMath meta fields | Via post meta | `rank_math_title`, `rank_math_description`, `rank_math_focus_keyword` |

### Critical Lessons (DO NOT skip)

1. **LiteSpeed Cache**: Aggressive caching. MUST purge after content changes. LiteSpeed Cache plugin has its own API endpoint for purge.
2. **register_term_meta required**: WordPress REST API does NOT expose RankMath meta for categories/tags by default. Must add PHP snippet via WPCode plugin to call `register_term_meta()` and `register_post_meta()`.
3. **Alt text inflation trap**: When fixing image alt text, check for duplicates across same product/page. Google penalizes 10 images with identical alt text.
4. **parsed_data staleness**: Never use crawl data older than 24 hours for making fixes. Always re-crawl before applying changes.
5. **WooCommerce separate credentials**: WC REST API uses Consumer Key/Secret (generated in WooCommerce > Settings > Advanced > REST API), NOT the WordPress Application Password.
6. **GSC domain property format**: Must be `sc-domain:agowautomation.com` (no www, no https://).

### Existing Script → OpenClaw Skill Mapping

| Existing Script | OpenClaw Skill | Key Logic to Preserve |
|-----------------|----------------|----------------------|
| `sprint1_crawler_v2.py` + `sprint1_parser.py` | `wp-audit/SKILL.md` | URL discovery (sitemap + WP API + WC API), SEO scoring 0-100, 13 issue codes (MISSING_TITLE, THIN_CONTENT, NO_H1, etc.) |
| `seo_agent.py` (tasks T01-T08) | `wp-daily-check/SKILL.md` | 8-task daily cycle: crawl → parse → prioritize → fix meta → fix content → verify → report → learn |
| `sprint3_content_fixer.py` | `wp-content/SKILL.md` | AI content expansion: thin (<300 words) = full rewrite, medium (300-600) = enhance existing. Uses Claude Haiku. |
| `seo_backup_rollback.py` | Integrated into backup system | Snapshot before changes, rollback per-URL or batch. Stores in JSON format. |
| `seo_agent_memory.py` | Self-Improving architecture | hot.md (always-loaded), corrections.md (pattern avoidance), patterns.md (proven strategies), actions_log.json, performance.json |
| `telegram_listener.py` | OpenClaw Telegram channel | Commands: OK/APPLY (approve fix), SKIP (reject), STATUS (current state), REPORT (generate report), RUN (trigger manual run) |

### SEO Scoring System (from sprint1_parser.py)

13 issue codes with severity weights:
```
MISSING_TITLE (Critical)     | NO_META_DESC (Critical)    | THIN_CONTENT (High)
NO_H1 (High)                 | MULTIPLE_H1 (Medium)       | MISSING_ALT (Medium)
NO_SCHEMA (Medium)           | BROKEN_LINKS (High)        | SLOW_LOAD (Medium)
NO_CANONICAL (Low)           | DUPLICATE_TITLE (High)     | THIN_META_DESC (Medium)
NO_FOCUS_KEYWORD (Low)
```
Score formula: Start at 100, subtract weighted penalty per issue. Threshold: <70 = needs fix.

### PHP Snippets Required (via WPCode plugin)

These MUST be installed on WordPress before the SEO agent can fully operate:
1. `register_post_meta` for rank_math fields on posts/pages
2. `register_term_meta` for rank_math fields on categories/tags
3. Schema output filter for custom structured data
4. H1 injection for pages using PageBuilder (which strips H1 tags)

---

## 14. Phased Timeline (Updated)

| Phase | Content | Timeline | v2.0 Additions |
|-------|---------|----------|-----------------|
| 1a | Core: Docker + Lead + SEO + Telegram + Security | Week 1-2 | Rate limiting, scoped WP API, 90min session, tiered approval |
| 1b | Lossless-Claw + Backup system | Week 3 | Daily backups, git for shared-knowledge |
| 1c | Self-Improving + Guardrails | Week 4-5 | Confidence scoring, weekly review, conflict detection |
| 1d | Monitoring + Alerting + Log rotation + DB vacuum | Week 6 | Health checks, Telegram alerts, cost tracking |
| 1e | Capability Evolution Protocol + Abstraction Layer | Week 7-8 | Self-build & verify, sandbox, Telegram approval |
| 1f | Google Search Console integration | Week 9-10 | Real SEO data for feedback loop |
| 2 | Warehouse Agent | After Phase 1 | Inherits all frameworks |
| 3 | Accounting Agent | After Phase 2 | Inherits all frameworks |

---

## 15. Verification Plan

| # | Test | Expected Result | Phase |
|---|------|-----------------|-------|
| 1 | docker compose up -d | Container running, port 18789, health check pass | 1a |
| 2 | Telegram "Xin chao" | Lead responds in Vietnamese | 1a |
| 3 | "Audit website agowautomation.com" | Lead → Khoa → structured report | 1a |
| 4 | "Viet bai ve servo drive B&R" | Khoa creates WP draft (NOT published) | 1a |
| 5 | Request robots.txt change | Tier 3: send diff, wait Approve | 1a |
| 6 | Cron daily check 6:00 AM | Auto-run, log, Telegram summary | 1a |
| 7 | Fix meta description (Tier 2) | Fix then notify + Undo button | 1a |
| 8 | lcm_grep "audit" | Returns past audit results | 1b |
| 9 | User correction → self-reflect | Correction logged, applied next time | 1c |
| 10 | Create 2 conflicting HOT rules | Conflict detected, newer quarantined | 1c |
| 11 | Kill container forcefully | Docker auto-restart, Telegram alert | 1d |
| 12 | Spam 50 messages/minute | Rate limiter blocks, user warned | 1a |
| 13 | Simulate WP API down | Retry 3x, fallback, alert admin | 1d |
| 14 | "Analyze backlinks" (no skill) | Evolution: detect → build → verify → present | 1e |
| 15 | Corrupt SQLite DB | Backup restore, data loss <24h | 1b |
| 16 | Weekly summary auto-generate | Report with tasks, errors, cost, health | 1d |
| 17 | File isolation test | Container can't see files outside openclaw-home/ | 1a |
