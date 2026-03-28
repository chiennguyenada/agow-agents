# Channel Adapter — Abstraction Layer

## Purpose
Wraps Telegram Bot API interactions to provide a consistent messaging interface. If switching to another channel (Slack, Discord, Zalo), only this adapter changes.

## Hybrid Routing Model (Group Chat)
Bot operates in a Telegram Group. All agents respond directly in the group.

```
Incoming group message
  → Step 1: Check sender user ID against authorization config
    → Not admin/operator → IGNORE (silent, no response)
  → Step 2: Parse for @tag (e.g., @khoa, @seo, @lead)
    → If @tag found → route directly to tagged agent
  → Step 3: No @tag → check for context keywords
    → If keywords match an agent domain → proactive suggestion (not auto-execute)
  → Step 4: No @tag, no keywords → route to defaultAgent (Lead)
  → Agent processes and responds directly in group chat
  → Lead is NOT in the response path (monitors via logs only)
```

### Privacy Mode
- Privacy mode: DISABLED (bot reads all messages in group)
- Required for context-aware suggestions
- Must disable via BotFather: /setprivacy → Disable

### Agent Identity Prefixes
Each agent identifies itself in responses:
- Lead: "👔 **Lead Agent**:"
- Khoa: "🔍 **Khoa (SEO)**:"
- Warehouse: "📦 **Warehouse**:" (future)
- Accounting: "📊 **Accounting**:" (future)
- Proactive suggestions: "💡 Gợi ý: ..."

### User Roles
| Role | Source | Permissions |
|------|--------|-------------|
| admin | TELEGRAM_ADMIN_USER_ID | All tiers, approve/reject, system commands |
| operator | TELEGRAM_OPERATOR_USER_IDS (comma-separated) | Tier 1 + 2, cannot approve Tier 3 |
| unauthorized | Everyone else in group | Ignored by bot |

## Interface

### sendMessage(options)
Send a text message to user.
```
options: {
  chatId: string       // target chat/user ID
  text: string         // message content (max 4096 chars for Telegram)
  parseMode?: string   // "HTML" | "Markdown" (default: "HTML")
  replyMarkup?: object // inline keyboard for approval buttons
}
```

### sendApprovalRequest(options)
Send a message with APPROVE/REJECT buttons.
```
options: {
  chatId: string
  title: string        // what needs approval
  description: string  // details
  taskId: string       // for tracking
  tier: number         // 2 or 3
  timeoutHours: number // auto-reject after this
  buttons: [{
    text: string       // button label
    callbackData: string // action identifier
  }]
}
```

Format for Telegram:
```
{tier_emoji} {title}

{description}

Task ID: {taskId}
Auto-reject in: {timeoutHours}h

[APPROVE] [REJECT]
```

### sendReport(options)
Send a formatted report (daily/weekly).
```
options: {
  chatId: string
  title: string
  sections: [{
    header: string
    content: string
  }]
}
```

### sendUndoNotification(options)
Send Tier 2 notification with undo option.
```
options: {
  chatId: string
  action: string       // what was done
  url: string          // affected URL
  oldValue: string     // before
  newValue: string     // after
  taskId: string       // for undo command
  undoWindowHours: number
}
```

Format:
```
Đã sửa {action} cho {url}:
  Trước: {oldValue}
  Sau: {newValue}

Nhấn UNDO-{taskId} để hoàn tác ({undoWindowHours}h).
```

## Callback Handling

### onMessage(handler)
Register handler for incoming user messages.
```
handler(message: {
  chatId: string
  text: string
  userId: string
  timestamp: number
}) => void
```

### onCallback(handler)
Register handler for inline button clicks (APPROVE/REJECT/UNDO).
```
handler(callback: {
  chatId: string
  callbackData: string  // "approve-{taskId}" | "reject-{taskId}" | "undo-{taskId}"
  userId: string
}) => void
```

## Rate Limiting (built-in)
- Max 10 messages/minute per chat
- Max 100 messages/hour per chat
- Queue excess messages, deliver when rate allows
- Long messages (>4096 chars) auto-split into multiple messages

## Security
- Only process messages from users in allowList (from openclaw.json)
- Silently ignore messages from unauthorized users (no error response)
- Log unauthorized access attempts for monitoring
