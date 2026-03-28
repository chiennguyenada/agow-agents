# Agow Automation — Changelog

> Log EVERY code change here. Purpose: prevent regression by knowing what changed and why.
> Format: newest entries at top.
> Claude MUST read this file before editing any existing file to understand recent context.

---

## How to Log

```
### [Date] — [Short Description]
**Phase**: [Phase ID]
**Files changed**:
- `path/to/file` — [created/modified/deleted] — [what changed]

**Why**: [reason for the change]
**Tests**: [Layer 1: X/X | Layer 2: X/X | Layer 3: X/X | Layer 4: X/X]
**Dependencies affected**: [list files that depend on changed files]
**Notes**: [anything important for future reference]
```

---

## Entries

### 2026-03-28 — Self-Improving Memory Seed + GSC Skill
**Phase**: 1c + 1f
**Files changed**:
- `workspaces/seo/self-improving/hot.md` — created — Seeded from production 28-auditwebagow hot.md. Contains site config, 9 critical rules, baseline metrics (646 URLs, 81.9 avg score, 4600+ fixes), GSC baseline (36 clicks/day).
- `workspaces/seo/self-improving/corrections.md` — created — Seeded with 1 title format correction from production.
- `workspaces/seo/self-improving/patterns.md` — created — Seeded with proven content strategy, meta optimization, batch processing, and cost efficiency patterns.
- `workspaces/seo/self-improving/actions_log.json` — created — Empty log structure for future action tracking.
- `workspaces/seo/skills/wp-gsc/SKILL.md` — created — Google Search Console integration skill: 5 query types, weekly report workflow, SEO fix impact measurement workflow, rate limits, error handling.
- `progress.md` — modified — Marked seed HOT rules and GSC skill as done. Git init blocked (Windows filesystem). Updated summary: 60/92 done.
- `changelog.md` — modified — This entry.

**Why**: (1) Seed self-improving memory so Khoa starts with production-proven knowledge instead of learning from scratch. (2) Create GSC skill for Phase 1f to enable real search data feedback loop. (3) Git init failed on mounted filesystem — noted as manual Windows task.
**Tests**: Layer 1: 2/2 PASS (actions_log.json valid JSON, SKILL.md frontmatter valid) | Layer 2: PASS (all files created, cross-refs valid) | Layer 3: DEFERRED | Layer 4: N/A (new files)
**Dependencies affected**: SEO agent session start (will load hot.md), wp-daily-check (will log to actions_log.json), future GSC integration
**Notes**: Git init for shared-knowledge/ must be done directly on Windows (`cd shared-knowledge && git init`). Mounted FUSE filesystem corrupts .git internal files.

---

### 2026-03-28 — Telegram Group Chat + Role-Based Access Control
**Phase**: Architecture enhancement
**Files changed**:
- `openclaw.json` — modified — Changed from DM to group chat (`chatMode: "group"`, `privacyMode: false`). Replaced single `allowList` with role-based `authorization` (admin + operators). Added `contextAware` config for proactive suggestions with keyword triggers.
- `.env.example` — modified — Removed `TELEGRAM_CHANNEL_NAME`, `TELEGRAM_ADMIN_CHAT_ID`. Added `TELEGRAM_GROUP_CHAT_ID`, `TELEGRAM_ADMIN_USER_ID`, `TELEGRAM_OPERATOR_USER_IDS` with setup instructions.
- `workspaces/lead/AGENTS.md` — modified — Added "Group Chat Behavior" section: message processing rules, context-aware proactive suggestions (max 1/30min), user authorization table (admin/operator/unauthorized), Tier 3 approval rules in group.
- `workspaces/seo/AGENTS.md` — modified — Rewrote "Telegram Direct Access" to "Telegram Direct Access (Group Chat)". Added authorization check flow, tier handling per role table, concise response guidance for group context.
- `shared-lib/channel-adapter.md` — modified — Rewrote routing model to include authorization check step, privacy mode docs, user roles table.
- `guardrails/approval-required.yml` — modified — Added `role_permissions` section (admin: all tiers + approve, operator: tier 1+2 only, tier3_behavior: request_admin_approval). Bumped version to 1.1.

**Why**: User wants bot in Telegram Group where real employees also chat. Requires: (1) role-based access so only authorized users can command bot, (2) privacy mode off so bot reads all messages for context-aware suggestions, (3) unauthorized users silently ignored.
**Tests**: Layer 1: 3/3 PASS (openclaw.json, approval-required.yml valid, bash scripts unchanged) | Layer 2: PASS (cross-refs valid) | Layer 3: DEFERRED | Layer 4: Checked all 6 modified files for consistency
**Dependencies affected**: Telegram channel behavior, all agents' message handling, guardrails enforcement
**Notes**: Setup requires: (1) Disable privacy mode via BotFather, (2) Get group chat ID (negative number), (3) Get user IDs via @userinfobot.

---

### 2026-03-28 — Hybrid Routing Model (agents respond directly to Telegram)
**Phase**: Architecture redesign
**Files changed**:
- `openclaw.json` — modified — All agents now have `allowedChannels: ["telegram"]`. Added `routing.mode: "hybrid"` with `directTags` mapping (@khoa→seo, @seo→seo, @lead→lead) and fallback to Lead.
- `workspaces/lead/AGENTS.md` — rewritten — Changed from mandatory gateway to smart router + passive monitor. Added hybrid routing flow diagram. Lead only handles: ambiguous intent, multi-agent coordination, capability evolution, error escalation. Does NOT relay agent responses.
- `workspaces/seo/AGENTS.md` — modified — Added "Telegram Direct Access" section. Khoa responds directly to user, prefixed with agent identity. Khoa only notifies Lead on: 24h pending Tier 3, error threshold, capability gap.
- `shared-lib/channel-adapter.md` — modified — Added hybrid routing model documentation and agent identity prefixes.
- `plan.md` — modified — Rewrote §2 architecture diagram to show hybrid routing with @tag direct access vs Lead routing for ambiguous requests.

**Why**: Original hub-and-spoke design forced ALL responses through Lead Agent, adding unnecessary API cost and latency. User pointed out that direct-tagged messages should go straight to the specialist agent. New hybrid model: @tag → direct, ambiguous → Lead routes, Lead monitors passively.
**Tests**: Layer 1: 1/1 PASS (openclaw.json valid JSON) | Layer 2: cross-references valid | Layer 3: DEFERRED | Layer 4: Regression check — Lead AGENTS.md rewritten (verified routing table preserved, capability evolution preserved, rules updated)
**Dependencies affected**: All agents' routing behavior, Telegram channel config
**Notes**: Cost saving: ~1 Sonnet API call saved per direct interaction. For 30 daily interactions, ~$0.30-1.50/month savings.

---

### 2026-03-28 — Phase 1a Full Implementation (Infrastructure + Agents + Scripts)
**Phase**: 1a + partial 1b/1c/1d/1e
**Files changed**:
- `docker-compose.yml` — created — OpenClaw container config (mem_limit 2G, healthcheck 60s, security_opt, json-file logging, agow-net network)
- `.env.example` — created — All environment variables: Anthropic, WP, WC, Telegram, GSC, OpenClaw settings, model config, rate limits, backup
- `.gitignore` — created — Protects .env, secrets, runtime data, logs, IDE files
- `openclaw.json` — created — Main config: 2 agents (lead, seo), Telegram channel with allowList, Lossless-Claw + Self-Improving plugins (disabled until install), scheduling (daily SEO 6AM, weekly report Mon 8AM), security scoping, monitoring metrics
- `workspaces/lead/AGENTS.md` — created — Routing table (6 intent patterns), escalation path, Capability Evolution Protocol (6 steps), inter-agent communication spec
- `workspaces/lead/SOUL.md` — created — Vietnamese coordinator personality, error handling tone (3 levels)
- `workspaces/lead/HEARTBEAT.md` — created — 5 periodic checks (agent health, stuck tasks, memory, lessons, sandbox cleanup), session start routine
- `workspaces/lead/skills/task-router/SKILL.md` — created — Intent analysis, confidence-based routing, delegation format, 6 special commands (STATUS, REPORT, RUN, CANCEL, APPROVE, REJECT), weekly report spec
- `workspaces/lead/skills/capability-evolution/SKILL.md` — created — 6-phase self-build protocol, 3 autonomy levels, safety rules
- `workspaces/seo/AGENTS.md` — created — WP/WC API endpoints, RankMath meta fields, 3-tier approval system with specific actions, 6 critical lessons, error handling matrix
- `workspaces/seo/SOUL.md` — created — B&R domain expertise, content guidelines, reporting format template
- `workspaces/seo/HEARTBEAT.md` — created — Session start routine (8 steps), memory management, performance tracking, cache awareness
- `workspaces/seo/skills/wp-audit/SKILL.md` — created — 4-source URL discovery, 13 issue codes with weights, scoring 0-100, severity classification, report format
- `workspaces/seo/skills/wp-content/SKILL.md` — created — 3 strategies (thin/medium/new), quality checks, WP API integration, model selection
- `workspaces/seo/skills/wp-daily-check/SKILL.md` — created — 8-task cycle T01-T08, tier assignments, performance budget ($0.08-0.15/run)
- `workspaces/seo/skills/wp-technical-seo/SKILL.md` — created — Fix procedures for each issue code, backup-before-fix, undo capability, WP API specifics
- `shared-knowledge/company-rules.md` — created — Brand guidelines, content rules, SEO rules, approval requirements, API rate limits, working hours
- `shared-knowledge/product-catalog.md` — created — B&R product categories (Motion, PLC, IPC, HMI, Software, Safety), naming conventions, URL structure
- `shared-knowledge/lessons-learned.md` — created — 6 critical lessons from production (LESSON-001 through LESSON-006)
- `guardrails/approval-required.yml` — created — Tier 1/2/3 action lists with timeouts and undo windows
- `guardrails/rate-limits.yml` — created — API limits, session limits, content limits, cost alerts ($1 warning, $5 hard stop)
- `scripts/backup.sh` — created — Daily tar.gz backup with integrity check, retention (7 daily + 4 weekly), Telegram notification
- `scripts/restore.sh` — created — Interactive restore with pre-restore safety backup
- `scripts/log-rotation.sh` — created — Compress old reports, rotate large logs, clean actions_log
- `scripts/db-vacuum.sh` — created — SQLite integrity check + vacuum, alert on corruption
- `scripts/crontab.txt` — created — All scheduled tasks (daily SEO 6AM, backup 2AM, health 15min, weekly report Mon 8AM, HOT review Sun 9AM, rotation Sun 3AM, vacuum Sun 4AM)
- `monitoring/health-check.sh` — created — 8 checks (container, memory, disk, WP API, backup age, SQLite size, log size, sessions)
- `monitoring/alert-telegram.sh` — created — Utility for sending formatted alerts (critical/warning/info/success)
- `shared-lib/message-bus.md` — created — Inter-agent communication abstraction spec
- `shared-lib/memory-provider.md` — created — Memory/self-improving abstraction spec with promotion/demotion logic
- `shared-lib/channel-adapter.md` — created — Telegram channel abstraction spec with approval/undo/report interfaces
- `openclaw-home/` — created — Empty mount directory for Docker
- `workspaces/lead/sandbox/.gitkeep` — created — Preserve empty sandbox dir in git
- `progress.md` — updated — Marked all completed tasks, added verification results

**Why**: Full Phase 1a implementation — all config, workspace, skill, guardrail, script, and monitoring files needed to run the multi-agent system. Also brought forward monitoring/backup/abstraction tasks from Phases 1b-1e since they could be built without Docker.
**Tests**: Layer 1: 6/6 PASS (JSON valid, YAML x2 valid, docker-compose valid, shell x5 valid) | Layer 2: 6/6 PASS (cross-references all valid, markdown files all non-empty) | Layer 3: DEFERRED (needs Docker + real API keys) | Layer 4: N/A (first creation)
**Dependencies affected**: All files are new — no regression risk
**Notes**: 32 files created total. 58/92 tasks completed, 31 deferred to Docker runtime testing, 6 manual tasks pending (API keys, Telegram bot, git init). Ready for local Docker testing once .env is created.

---

### 2026-03-28 — Integrate Existing SEO Audit Project Knowledge
**Phase**: Pre-1a
**Files changed**:
- `plan.md` — modified — Added §13 "Lessons from Existing SEO Audit Project" with WP/WC API specifics, 6 critical lessons, script-to-skill mapping, SEO scoring system, PHP snippets required. Renumbered §14-§15.
- `CLAUDE.md` — modified — Added "WordPress & WooCommerce" and "Existing Project Reference" sections with production-proven API details, RankMath meta fields, LiteSpeed cache handling, GSC format.
- `progress.md` — recreated — Added "Pre-Phase: Existing Assets" section referencing 8 proven components from 28-auditwebagow. Updated SEO Agent tasks to reference source scripts. Added WooCommerce credentials to Security section. Updated Summary table.
- `changelog.md` — modified — This entry

**Why**: Incorporate production-proven knowledge from existing SEO audit project (28-auditwebagow, deployed since 2026-03-24, 646 URLs audited, 4,600+ issues fixed) to avoid re-learning and accelerate OpenClaw skill development.
**Tests**: Layer 1: 4/4 PASS (all files valid markdown, no broken references)
**Dependencies affected**: All future skill development files (wp-audit, wp-content, wp-daily-check, wp-technical-seo)
**Notes**: Source project at C:\Users\chiennguyen\Documents\28-auditwebagow. Key files: seo_agent.py, sprint1_parser.py, sprint3_content_fixer.py, seo_agent_memory.py, telegram_listener.py.

---

### 2026-03-28 — Project Initialization
**Phase**: Pre-1a
**Files changed**:
- `CLAUDE.md` — created — Project instructions for Claude
- `plan.md` — created — Implementation plan v2.0
- `progress.md` — created — Implementation tracking
- `verification.md` — created — 4-layer test protocol
- `changelog.md` — created — This file

**Why**: Initial project setup with development methodology files
**Tests**: Layer 1: 5/5 PASS (all files valid markdown)
**Dependencies affected**: None (first files)
**Notes**: All files designed to work together. CLAUDE.md references other 4 files via @import.

---

_Future entries go above this line, newest first._
