# Agow Automation — Multi-Agent System (OpenClaw)

## Project Context
- Company: Agow Automation — B&R Automation equipment distributor (Vietnam)
- Platform: OpenClaw running in Docker container
- Channel: Telegram
- Website: https://www.agowautomation.com (WordPress)
- Language: Vietnamese (code comments in English)

## Architecture
- Lead Agent ("main"): dispatcher + Capability Evolution coordinator
- SEO Agent "Khoa" ("seo"): SEO audit, content, technical SEO for WordPress
- Future: Warehouse Agent (Phase 2), Accounting Agent (Phase 3)
- Memory: Lossless-Claw (infinite) + Self-Improving (HOT/WARM/COLD)
- All agents share knowledge via `shared-knowledge/` (git-versioned)

## Critical Files — Read Before Coding
- @plan.md — Full implementation plan v2.0. Read FIRST for any new task.
- @progress.md — Current implementation status. Update AFTER every task.
- @verification.md — Testing protocol. MUST follow before marking anything "done".
- @changelog.md — Change history. Log EVERY code change here.

## Coding Rules

### File Types & Validation
- `.json` files: MUST validate with `node -e "JSON.parse(require('fs').readFileSync('file.json'))"` after edit
- `.sh` scripts: MUST validate with `bash -n script.sh` after edit
- `.yml` files: MUST validate with `python3 -c "import yaml; yaml.safe_load(open('file.yml'))"` after edit
- `.md` config files (AGENTS.md, SOUL.md, SKILL.md): MUST have correct YAML frontmatter if required by OpenClaw
- NEVER leave syntax errors — validate immediately after writing

### OpenClaw Specifics
- Agent workspace path inside container: `/home/node/.openclaw/workspaces/<agent-id>/`
- Config file: `openclaw.json` — validate JSON after EVERY edit
- SOUL.md = personality ONLY. Procedures go in AGENTS.md or SKILL.md.
- SKILL.md frontmatter: `name` (kebab-case), `description` (1 line) are required
- Agent IDs: use lowercase, no spaces: `main`, `seo`, `warehouse`, `accounting`
- sessions_send for inter-agent communication — always include task description

### Docker
- Container name: `agow-openclaw`
- Mount: `./openclaw-home:/home/node/.openclaw`
- Backups mount: `./backups:/backups`
- Test with `docker compose config` before `docker compose up`

### WordPress & WooCommerce (from production experience)
- WP REST API: Application Password auth, paginate with `?per_page=100&page=N`
- WC REST API: **Separate credentials** (Consumer Key/Secret from WooCommerce > Settings > Advanced > REST API)
- RankMath meta: `rank_math_title`, `rank_math_description`, `rank_math_focus_keyword` — require `register_post_meta` / `register_term_meta` via PHP snippet (WPCode)
- LiteSpeed Cache: Purge after every content change — aggressive caching will hide updates
- Alt text: Check for duplicates per product/page — Google penalizes identical alt text on multiple images
- Crawl data: Never use data older than 24h for making fixes — always re-crawl first
- GSC domain format: `sc-domain:agowautomation.com` (no www, no https://)
- PageBuilder strips H1 tags: Need PHP filter to inject H1 back
- SEO scoring: 13 issue codes, score 0-100, threshold <70 = needs fix (see plan.md §13)

### Existing Project Reference
- Previous SEO audit project: `28-auditwebagow/` (production since 2026-03-24)
- 646 URLs audited, 4,600+ issues fixed at $0.29 using Claude Haiku
- Key files to reference: `seo_agent.py` (8-task orchestrator), `sprint1_parser.py` (SEO scoring), `sprint3_content_fixer.py` (AI content), `seo_agent_memory.py` (self-improving memory)
- Telegram commands already proven: OK/APPLY, SKIP, STATUS, REPORT, RUN

### Security — NEVER Do These
- NEVER hardcode API keys, tokens, or passwords in any file except `.env`
- NEVER set WordPress API scope broader than needed (Posts + Media only)
- NEVER let agents publish WordPress content directly (DRAFT only)
- NEVER modify robots.txt, sitemap, or .htaccess without human approval flow

## Verification Protocol (MANDATORY)
YOU MUST follow @verification.md for EVERY code change. Summary:
1. **Syntax Check**: Validate file format immediately after writing
2. **Unit Test**: Test component in isolation (happy path + failure path)
3. **Integration Test**: Test component interactions (mock external APIs)
4. **Regression Check**: Before editing ANY existing file, list all dependent files. After edit, re-test ALL of them.

IMPORTANT: Do NOT report "done" until all 4 layers pass. If any test fails, fix and re-run ALL tests.

## Anti-Patterns — AVOID These
- Do NOT edit multiple files without testing between each edit
- Do NOT fix a bug by reverting a previous fix — find root cause
- Do NOT write long scripts without intermediate checkpoints
- Do NOT modify `openclaw.json` agents.list without verifying existing agents still work
- Do NOT skip regression check — this is how "fix A, break B" happens

## Workflow Per Task
1. Read @progress.md — find current task
2. Read @plan.md — understand context for this task
3. Read @changelog.md — understand recent changes that might affect this task
4. Plan approach (use Plan Mode for complex tasks)
5. Implement with validation after each file
6. Run verification protocol (4 layers)
7. Update @progress.md — mark task done with test results
8. Update @changelog.md — log all changes
9. If tests fail: fix, re-run ALL 4 layers, update logs

## Git Conventions
- Branch naming: `phase-{number}/{feature-name}` (e.g., `phase-1a/lead-agent-setup`)
- Commit messages: `[Phase X] verb: description` (e.g., `[Phase 1a] add: Lead Agent AGENTS.md and routing`)
- NEVER commit `.env` — only `.env.example`
- Commit `shared-knowledge/` changes separately with clear messages
