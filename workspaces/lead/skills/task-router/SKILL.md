---
name: task-router
description: Analyze user messages, identify intent, and route to the correct agent or skill
---

# Skill: Task Router

## Purpose
Analyze user messages, identify intent, and route to the correct agent + skill combination.

## Trigger
Every incoming user message through Telegram channel.

## Process

### Step 1: Intent Analysis
Parse the user message for:
- **Action keywords**: audit, viết, kiểm tra, sửa, tạo, báo cáo, xóa, cập nhật
- **Domain keywords**: SEO, website, content, bài viết, meta, schema, product, sản phẩm
- **Urgency markers**: khẩn, gấp, ngay, immediately
- **Scope**: single page, category, entire site

### Step 2: Route Decision
Match intent against routing table in AGENTS.md:
- Confidence > 0.9 → Route directly
- Confidence 0.7-0.9 → Route with confirmation: "Tôi hiểu bạn muốn [X]. Đúng không?"
- Confidence < 0.7 → Ask for clarification

### Step 3: Delegation
```
sessions_send({
  target: "{agent_id}",
  task: {
    id: "task-{timestamp}",
    skill: "{skill_name}",
    priority: "{high|medium|low}",
    context: "{user_message}",
    params: {parsed_params},
    deadline: "{calculated_deadline}",
    approval_tier: "{1|2|3}"
  }
})
```

### Step 4: Track & Report
- Wait for agent response (timeout: 5 min for simple, 15 min for complex)
- On success → format result → send to user via Telegram
- On failure → retry logic → escalate if needed

## Special Commands
These bypass normal routing:

| Command | Action |
|---------|--------|
| STATUS | Return status of all agents and pending tasks |
| REPORT | Generate summary of recent activity |
| RUN | Manually trigger daily SEO check |
| CANCEL {task_id} | Cancel a pending task |
| APPROVE {task_id} | Approve a Tier 3 pending action |
| REJECT {task_id} | Reject a Tier 3 pending action |

## Weekly Report (triggered by cron)
Generate and send via Telegram:
- Tasks completed this week (count, success rate)
- SEO score changes (site-wide trend)
- Issues found vs fixed
- API costs this week
- Agent uptime
- Memory usage (HOT rules count)
- Pending approvals (if any)
