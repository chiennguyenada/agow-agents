# Agow Automation — Verification Protocol

> MANDATORY: Follow this protocol for EVERY code change.
> Do NOT report "done" until all applicable layers PASS.
> If ANY test fails: fix → re-run ALL 4 layers → update progress.md.

---

## The 4-Layer Verification System

```
Layer 1: Syntax Check        — "Does the file have valid format?"
Layer 2: Unit Test           — "Does this component work alone?"
Layer 3: Integration Test    — "Do components work together?"
Layer 4: Regression Check    — "Did fixing A break B?"
```

Every change MUST pass all applicable layers before being marked "done."

---

## Layer 1: Syntax & Structure Check

Run IMMEDIATELY after writing or editing any file.

### Validation Commands by File Type

| File Type | Validation Command | Pass Criteria |
|-----------|--------------------|---------------|
| `.json` | `node -e "JSON.parse(require('fs').readFileSync('FILE'))"` | No error output |
| `.sh` | `bash -n FILE` | Exit code 0 |
| `.yml` / `.yaml` | `python3 -c "import yaml; yaml.safe_load(open('FILE'))"` | No error output |
| `.md` (AGENTS.md) | Check: has required sections (Role, Rules, Routing) | Manual review |
| `.md` (SOUL.md) | Check: personality traits defined, concise (<30 lines) | Manual review |
| `.md` (SKILL.md) | Check: has YAML frontmatter with `name` and `description` | Parse frontmatter |
| `docker-compose.yml` | `docker compose config` | Valid output, no errors |
| `.env` | Check: all vars from `.env.example` are present | Compare keys |

### SKILL.md Frontmatter Check
```bash
# Verify SKILL.md has valid frontmatter
head -10 SKILL.md | grep -E "^---$" | wc -l  # Must be 2
head -10 SKILL.md | grep "^name:"             # Must exist
head -10 SKILL.md | grep "^description:"      # Must exist
```

### openclaw.json Deep Check
After ANY edit to openclaw.json:
1. JSON syntax valid
2. Every agent in `agents.list` has matching directory in `workspaces/`
3. Every workspace directory has at minimum `AGENTS.md`
4. Channel config has required fields (`enabled`, `botToken`, `dmPolicy`)
5. Plugin config has required fields

```bash
# Quick validation script
node -e "
const cfg = JSON.parse(require('fs').readFileSync('openclaw.json'));
const fs = require('fs');
// Check agents have workspaces
cfg.agents.list.forEach(a => {
  const ws = a.workspace.replace('/home/node/.openclaw/', 'openclaw-home/');
  if (!fs.existsSync(ws)) console.error('FAIL: Missing workspace', ws);
  if (!fs.existsSync(ws + '/AGENTS.md')) console.error('FAIL: Missing AGENTS.md in', ws);
});
console.log('Config validation complete');
"
```

---

## Layer 2: Unit Test (Component in Isolation)

Test each component independently BEFORE integrating.

### For Markdown Config Files (AGENTS.md, SOUL.md, SKILL.md)

| Check | How | Pass Criteria |
|-------|-----|---------------|
| Encoding | `file FILE.md` | UTF-8 text |
| Length | `wc -l FILE.md` | SOUL.md <30 lines, AGENTS.md <100 lines |
| No broken references | Check all file paths mentioned exist | All paths valid |
| No placeholder text | `grep -i "TODO\|FIXME\|PLACEHOLDER\|XXX" FILE.md` | No matches |
| Consistent agent IDs | Agent IDs match `openclaw.json` | IDs match |

### For Shell Scripts

```bash
# 1. Syntax check (Layer 1 already does this)
bash -n script.sh

# 2. Dry run with test data
# For log-rotation.sh:
mkdir -p /tmp/test-reports
touch -d "100 days ago" /tmp/test-reports/old-report.md
touch /tmp/test-reports/new-report.md
REPORTS_DIR=/tmp/test-reports bash script.sh
# Verify: old-report.md.gz exists, new-report.md untouched

# 3. Edge case: empty directory
mkdir -p /tmp/test-empty
REPORTS_DIR=/tmp/test-empty bash script.sh
# Verify: no errors, graceful handling

# 4. Edge case: no permissions
# Test with read-only directory
```

### For Docker Compose

```bash
# 1. Config validates
docker compose config > /dev/null 2>&1 && echo "PASS" || echo "FAIL"

# 2. Container starts
docker compose up -d
sleep 5
docker compose ps | grep "running" && echo "PASS" || echo "FAIL"

# 3. Health check passes
docker compose exec agow-openclaw curl -sf http://localhost:18789/health && echo "PASS" || echo "FAIL"

# 4. Port accessible from host
curl -sf http://localhost:18789/health && echo "PASS" || echo "FAIL"

# 5. Volume mount correct
docker compose exec agow-openclaw ls /home/node/.openclaw/openclaw.json && echo "PASS" || echo "FAIL"

# 6. Memory limit enforced
docker stats --no-stream agow-openclaw --format "{{.MemUsage}}"
```

---

## Layer 3: Integration Test (Components Together)

Test how components interact with each other.

### Agent Communication Tests

| Test | Steps | Pass Criteria |
|------|-------|---------------|
| Lead → Khoa routing | Send "Audit website" via Telegram | Lead identifies as SEO task, sends to Khoa |
| Khoa → WordPress | Khoa runs wp-daily-check skill | Successfully calls WP REST API, gets response |
| Khoa → Lead report | Khoa completes task | Lead receives result, formats for user |
| Lead → Telegram response | Full flow complete | User receives formatted response in Telegram |
| Memory persistence | Send query, wait, send follow-up | Agent recalls previous context |

### Mock Testing (when external APIs unavailable)

For WordPress API:
```bash
# Start simple mock server
node -e "
const http = require('http');
http.createServer((req, res) => {
  if (req.url.includes('/wp-json/wp/v2/posts')) {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify([{id:1, title:{rendered:'Test Post'}, status:'publish'}]));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(8080);
console.log('Mock WP API on :8080');
" &

# Test agent with mock endpoint
# (Configure agent to use http://localhost:8080 instead of real WP)
```

### Flow Tests

```
Test Flow 1: Happy Path
User → "Xin chào" → Lead responds in Vietnamese → PASS/FAIL

Test Flow 2: SEO Routing
User → "Audit website" → Lead → Khoa → audit report → Lead → User → PASS/FAIL

Test Flow 3: Approval Gate
User → "Sửa robots.txt" → Lead → Khoa prepares diff → Lead sends preview → User sees Approve/Reject → PASS/FAIL

Test Flow 4: Error Recovery
Simulate WP API down → Agent retries 3x → Queues task → Alerts admin → PASS/FAIL
```

---

## Layer 4: Regression Check (Fix A, Don't Break B)

THIS IS THE MOST IMPORTANT LAYER. This prevents the "fix one bug, create another" problem.

### Before Editing ANY Existing File

1. **List dependents**: What other files reference or depend on this file?
2. **Record current state**: Run existing tests for ALL dependent files → save results
3. **Make the edit**
4. **Re-test EVERYTHING**: Run ALL tests from step 2 again
5. **Compare**: Any test that previously passed but now fails = REGRESSION

### Dependency Map

```
openclaw.json
├── affects: ALL agents (they read config at startup)
├── affects: Telegram channel
├── affects: Lossless-Claw plugin
└── REGRESSION TEST: Start all agents, verify each responds

workspaces/lead/AGENTS.md
├── affects: Routing behavior
├── affects: All sub-agents (routing table)
└── REGRESSION TEST: Send test messages for each route, verify correct agent receives

workspaces/seo/AGENTS.md
├── affects: Khoa's behavior and capabilities
├── affects: WordPress API interactions
└── REGRESSION TEST: Run each skill, verify all still work

workspaces/seo/skills/wp-audit/SKILL.md
├── affects: Audit functionality only
└── REGRESSION TEST: Run audit, compare output format with previous

shared-knowledge/company-rules.md
├── affects: ALL agents (all read this at session start)
└── REGRESSION TEST: Verify all agents still load rules correctly

docker-compose.yml
├── affects: ENTIRE system
└── REGRESSION TEST: Full restart, all health checks pass, all agents respond
```

### Regression Test Checklist Template

Use this checklist when editing an existing file:

```
File being edited: _______________
Date: _______________

Pre-edit tests:
[ ] Test 1: _____________ → PASS/FAIL
[ ] Test 2: _____________ → PASS/FAIL
[ ] Test 3: _____________ → PASS/FAIL

Edit made: _______________

Post-edit tests:
[ ] Test 1: _____________ → PASS/FAIL (was: PASS)
[ ] Test 2: _____________ → PASS/FAIL (was: PASS)
[ ] Test 3: _____________ → PASS/FAIL (was: PASS)

Regression detected: YES/NO
If YES: Rollback and find alternative approach.
```

---

## Verification Report Format

After completing all 4 layers, record results in progress.md:

```
### [Task Name] — [Date]
Verification Results:
- Layer 1 (Syntax):      X/X PASS
- Layer 2 (Unit):         X/X PASS
- Layer 3 (Integration):  X/X PASS
- Layer 4 (Regression):   X/X PASS
- **TOTAL: X/X PASS, 0 FAIL**

Files changed:
- file1.md (created)
- file2.json (modified)

Notes: [any observations or concerns]
```

---

## Quick Reference: What to Test for Each File Type

| File Created/Changed | L1 | L2 | L3 | L4 |
|----------------------|----|----|----|----|
| New AGENTS.md | Format, encoding | Sections complete, IDs match | Agent loads and responds | N/A (new file) |
| New SOUL.md | Format, <30 lines | Personality consistent | Agent personality in responses | N/A (new file) |
| New SKILL.md | Frontmatter valid | Workflow steps make sense | Skill executes end-to-end | N/A (new file) |
| Edit openclaw.json | JSON valid | All agents referenced exist | All agents start correctly | ALL existing agents still work |
| New shell script | bash -n passes | Happy + failure path | Works with real paths in container | N/A (new file) |
| Edit shell script | bash -n passes | Happy + failure path | Works in container | Other scripts still work |
| Edit docker-compose.yml | docker compose config | Container starts with new config | All services healthy | ALL previous functionality intact |
| Edit existing AGENTS.md | Format OK | Sections complete | Agent behavior matches updates | OTHER agents' routing still works |
| New shared-knowledge file | Encoding OK | Content accurate | All agents can read it | N/A (new file) |
| Edit shared-knowledge file | Encoding OK | Content accurate | All agents read correctly | Other agents not broken by change |
