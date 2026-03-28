# Message Bus — Abstraction Layer

## Purpose
Wraps OpenClaw's `sessions_send` to provide a consistent inter-agent communication interface. Reduces vendor lock-in and simplifies routing logic.

## Interface

### send(message)
```
message = {
  from: string        // sender agent ID ("lead", "seo")
  to: string          // target agent ID
  type: string        // "task" | "response" | "alert" | "heartbeat"
  taskId: string      // unique task identifier
  priority: string    // "high" | "medium" | "low"
  payload: object     // task-specific data
  deadline?: number   // timeout in seconds
  replyTo?: string    // task ID this responds to
}
```

### Behavior
- **Routing**: Validate target agent exists in openclaw.json before sending
- **Timeout**: Default 300s (5 min). High priority: 900s (15 min)
- **Retry**: On delivery failure, retry 2x with 5s backoff
- **Logging**: All messages logged with timestamp for debugging
- **Dead letter**: After 3 failures, message stored in dead-letter queue for manual review

### Implementation Note
In OpenClaw, this maps to:
```
sessions_send({
  target_agent: message.to,
  content: JSON.stringify({
    type: message.type,
    taskId: message.taskId,
    priority: message.priority,
    payload: message.payload
  })
})
```

Future: if migrating to n8n webhooks, only this adapter needs to change.

## Usage in AGENTS.md
Agents reference message-bus as the standard way to communicate:
```
// In Lead Agent AGENTS.md:
// To delegate to Khoa: send via message-bus
{
  from: "lead",
  to: "seo",
  type: "task",
  taskId: "task-20260328-001",
  priority: "medium",
  payload: {
    skill: "wp-audit",
    scope: "full-site",
    params: {}
  }
}
```
