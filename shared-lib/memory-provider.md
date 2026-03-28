# Memory Provider — Abstraction Layer

## Purpose
Wraps OpenClaw's Lossless-Claw memory tools to provide a consistent memory interface. Decouples agent logic from specific memory implementation.

## Interface

### search(query, options?)
Search memory across sessions.
```
query: string        // search term
options: {
  scope?: string     // "current-session" | "all-sessions" | "agent-only"
  limit?: number     // max results (default: 10)
  timeRange?: string // "1h" | "24h" | "7d" | "30d" | "all"
}
```
Maps to: `lcm_grep(query)` in Lossless-Claw

### expand(contextId, depth?)
Expand a memory node to see surrounding context.
```
contextId: string    // ID from search results
depth?: number       // how many levels to expand (default: 1)
```
Maps to: `lcm_expand(contextId)`

### describe(contextId)
Get summary of a memory node.
Maps to: `lcm_describe(contextId)`

### store(entry)
Explicitly store important information in memory.
```
entry: {
  category: string   // "lesson" | "pattern" | "correction" | "decision"
  content: string    // what to remember
  tags: string[]     // for search
  importance: string // "high" | "medium" | "low"
}
```

## Self-Improving Memory (Tiered)

### HOT Rules (always-loaded)
- File: `self-improving/hot.md`
- Max 50 rules per agent
- Loaded at every session start
- Promoted from WARM after 3 uses in 7 days

### WARM Rules (domain-specific)
- File: `self-improving/patterns.md`, `self-improving/corrections.md`
- Loaded on-demand when relevant domain is active
- Promoted to HOT if frequently used
- Demoted to COLD after 30 days unused

### COLD Rules (archived)
- File: `self-improving/archive/`
- Searchable but not loaded
- Demoted to COLD after 90 days in WARM
- Never auto-deleted (git-versioned)

## Promotion/Demotion Logic
```
On pattern usage:
  usage_count += 1
  last_used = now()
  if usage_count >= 3 AND last_used within 7 days:
    promote to HOT

On heartbeat check:
  for each HOT rule:
    if last_used > 30 days ago:
      demote to WARM
  for each WARM rule:
    if last_used > 90 days ago:
      demote to COLD
  if HOT count > 50:
    demote least-used HOT rules to WARM until count <= 50
```
