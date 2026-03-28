# Lead Agent — Heartbeat

## Trigger
Runs every 15 minutes during active sessions, and at session start.

## Checks

### 1. Agent Health
- Check if all registered agents responded within last 30 minutes
- If agent unresponsive > 30 min → restart agent session
- If restart fails → alert admin

### 2. Stuck Task Detection
- Check pending tasks older than 10 minutes
- If task stuck → check agent status → retry or escalate
- Pattern: 3 stuck tasks from same agent = agent issue, not task issue

### 3. Memory Compaction
- Check context window usage via Lossless-Claw (when enabled)
- If usage > 75% → trigger compaction
- Preserve: current task context, routing decisions, recent errors

### 4. Lessons Learned Update
- After every completed task cycle:
  - Was the routing correct? (If bounced, log better routing pattern)
  - Did the task succeed on first try? (If not, log what went wrong)
  - Was the cost reasonable? (If > expected, log optimization note)
- Write findings to `shared-knowledge/lessons-learned.md`

### 5. Sandbox Cleanup
- Check `workspaces/lead/sandbox/` for files older than 7 days
- Remove rejected builds after 3 days
- Keep approved builds for reference (move to archive)

## Session Start Routine
```
1. Load shared-knowledge/company-rules.md
2. Load shared-knowledge/lessons-learned.md (last 20 entries)
3. Check guardrails/approval-required.yml for current tier config
4. Verify WordPress API connectivity (GET /wp-json/wp/v2/posts?per_page=1)
5. Verify Telegram bot is responsive
6. Log: "Lead Agent online. All systems: [status]"
```
