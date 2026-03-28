# Skill: Capability Evolution

## Purpose
When no existing skill can handle a user request, this skill activates the self-build protocol to create a new capability.

## Trigger
- Task Router confidence < 0.7 for any known skill
- Explicit user request: "thêm chức năng", "tạo skill mới"
- Agent reports: "Tôi không có skill để làm việc này"

## Process

### Phase 1: Gap Analysis (Auto — no approval needed)
1. Log the unhandled request in `shared-knowledge/lessons-learned.md`
2. Analyze what capabilities are missing:
   - What API/tool is needed?
   - Which agent should own this skill?
   - Is there a similar existing skill to extend?
3. Check if this gap has been reported before (search lessons-learned.md)
4. Classify complexity:
   - **Simple**: New routing rule, text template, config change
   - **Medium**: New skill using existing APIs (WordPress, WooCommerce, GSC)
   - **Complex**: New external API integration, new agent needed

### Phase 2: Self-Build (Auto — sandbox only)
1. Create skill directory in `workspaces/lead/sandbox/{skill-name}/`
2. Generate `SKILL.md` with:
   - Purpose and trigger conditions
   - Step-by-step process
   - Input/output format
   - Error handling
   - Dependencies
3. Generate test cases (minimum 3):
   - Happy path
   - Edge case
   - Error case

### Phase 3: Self-Verify (Auto — sandbox only)
Run verification checklist:
- [ ] SKILL.md is valid markdown with all required sections
- [ ] No hardcoded credentials or secrets
- [ ] API endpoints referenced are correct and documented
- [ ] Tier assignment is correct (1/2/3)
- [ ] No conflict with existing skills (check routing table overlap)
- [ ] Test cases have expected outputs defined
- [ ] Dependencies listed are available
- [ ] Vietnamese language used for user-facing text

### Phase 4: Present for Approval (via Telegram)
Send structured message to admin:

```
🔧 CAPABILITY EVOLUTION REQUEST

Phát hiện: {description of gap}
Giải pháp: {skill name} cho agent {agent_name}

Mô tả: {what the skill does}
Độ phức tạp: {Simple/Medium/Complex}
APIs cần thiết: {list}
Tier phê duyệt: {1/2/3}

Kết quả kiểm tra:
✅ Syntax valid
✅ No security issues
✅ No skill conflicts
✅ Test cases: 3/3 pass

[APPROVE] [REJECT] [XEMCHI TIẾT]
```

### Phase 5: Deploy (after admin APPROVE)
1. Copy skill from sandbox to target agent workspace
2. Update agent's AGENTS.md routing table
3. Update Lead Agent routing table
4. Test live with a sample request
5. Log deployment in changelog.md
6. Clean sandbox (keep copy in sandbox/archive/)

### Phase 6: Rejection Handling
If admin REJECTs:
1. Ask admin for reason (optional)
2. Log rejection reason in lessons-learned.md
3. Archive sandbox files (keep for 3 days)
4. If same gap reported 3+ times → flag for developer attention

## Autonomy Levels

| Level | When | Example |
|-------|------|---------|
| Fully Auto | Read-only operations, report generation | "Thống kê số bài viết theo tháng" |
| Needs Admin | New API integrations, new scheduled tasks | "Tích hợp Google Analytics" |
| Needs Developer | Security changes, multi-service flows, infrastructure | "Thêm agent mới cho kế toán" |

## Safety Rules
- NEVER deploy to production without admin approval
- NEVER create skills that modify security configs
- NEVER create skills that access APIs not in .env
- Sandbox builds auto-delete after 7 days if no action taken
- Maximum 1 concurrent evolution process
