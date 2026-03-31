#!/usr/bin/env python3
"""
Automated routing test for Agow OpenClaw multi-agent system.
Tests Tong's routing behavior without needing Docker/Telegram.

How it works:
  - Reads Tong's actual AGENTS.md + SOUL.md from disk
  - Calls Claude API exactly as OpenClaw would (same model, same prompt structure)
  - Sends test messages and verifies tool calls (sessions_send) are made
  - Reports PASS/FAIL per test case
"""

import json
import urllib.request
import urllib.error
import sys
import os

# ── Config ──────────────────────────────────────────────────────────────────
ENV_FILE = "/sessions/upbeat-modest-mendel/mnt/Documents--agow-agents/.env"
WORKSPACE_LEAD = "/sessions/upbeat-modest-mendel/mnt/Documents--agow-agents/workspaces/lead"
MODEL = "claude-sonnet-4-6"  # same as Tong's config

# ── Load .env ────────────────────────────────────────────────────────────────
def load_env(path):
    env = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env

# ── Build system prompt (mirrors what OpenClaw does) ─────────────────────────
def build_system_prompt():
    parts = []
    for fname in ["AGENTS.md", "SOUL.md", "HEARTBEAT.md"]:
        fpath = os.path.join(WORKSPACE_LEAD, fname)
        if os.path.exists(fpath):
            with open(fpath) as f:
                content = f.read()
            parts.append(f"## {fname}\n{content}")
    return "\n\n---\n\n".join(parts)

# ── Tool definitions (mirrors what OpenClaw provides) ────────────────────────
TOOLS = [
    {
        "name": "sessions_list",
        "description": "List all active agent sessions",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "sessions_send",
        "description": "Send a message to another agent's session. Creates a new session if none exists.",
        "input_schema": {
            "type": "object",
            "properties": {
                "agentId": {
                    "type": "string",
                    "description": "The agent ID to send to (e.g. 'seo', 'lead')"
                },
                "message": {
                    "type": "string",
                    "description": "The message content to send"
                },
                "waitForReply": {
                    "type": "boolean",
                    "description": "Whether to wait for a reply"
                }
            },
            "required": ["agentId", "message"]
        }
    },
    {
        "name": "sessions_yield",
        "description": "Yield control back to the caller",
        "input_schema": {
            "type": "object",
            "properties": {
                "message": {"type": "string"}
            },
            "required": []
        }
    },
    {
        "name": "memory_search",
        "description": "Search agent memory",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"}
            },
            "required": ["query"]
        }
    }
]

# ── Claude API call ───────────────────────────────────────────────────────────
def call_claude(api_key, system_prompt, user_message, conversation_history=None):
    messages = []
    if conversation_history:
        messages.extend(conversation_history)

    # Format user message as OpenClaw does (with metadata)
    formatted_msg = f"""Conversation info (untrusted metadata):
```json
{{"sender": "ChienNguyen", "sender_id": "212081475", "is_group_chat": true, "group_subject": "AgWork"}}
```

{user_message}"""

    messages.append({"role": "user", "content": formatted_msg})

    payload = {
        "model": MODEL,
        "max_tokens": 1024,
        "thinking": {"type": "enabled", "budget_tokens": 2000},
        "system": system_prompt,
        "tools": TOOLS,
        "messages": messages
    }

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "interleaved-thinking-2025-05-14",
            "content-type": "application/json"
        },
        data=json.dumps(payload).encode()
    )

    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())

# ── Test cases ────────────────────────────────────────────────────────────────
TEST_CASES = [
    {
        "name": "T01: @khoa audit → must sessions_send to seo",
        "message": "@khoa audit website agowautomation.com",
        "expect_tool": "sessions_send",
        "expect_agent": "seo",
        "must_not_answer_directly": True,
    },
    {
        "name": "T02: @seo kiểm tra SEO → must sessions_send to seo",
        "message": "@seo kiểm tra SEO trang agowautomation.com",
        "expect_tool": "sessions_send",
        "expect_agent": "seo",
    },
    {
        "name": "T03: @tong status → handle directly, no sessions_send to seo",
        "message": "@tong status",
        "expect_tool": None,          # No sessions_send needed
        "must_not_delegate": True,    # Tong handles this itself
    },
    {
        "name": "T04: @khoa fix meta descriptions → must sessions_send to seo",
        "message": "@khoa sửa meta description cho tất cả sản phẩm",
        "expect_tool": "sessions_send",
        "expect_agent": "seo",
    },
    {
        "name": "T05: Ambiguous SEO question (no @tag) → must sessions_send to seo",
        "message": "website bị giảm traffic, cần kiểm tra SEO",
        "expect_tool": "sessions_send",
        "expect_agent": "seo",
    },
]

# ── Run tests ─────────────────────────────────────────────────────────────────
def run_tests(api_key, system_prompt):
    results = []

    print(f"\n{'='*60}")
    print("AGOW OPENCLAW — AGENT ROUTING TEST")
    print(f"Model: {MODEL}")
    print(f"{'='*60}\n")

    for tc in TEST_CASES:
        print(f"Running: {tc['name']}")
        print(f"  Message: \"{tc['message']}\"")

        try:
            response = call_claude(api_key, system_prompt, tc["message"])

            # Extract tool calls and text from response
            tool_calls = []
            text_responses = []
            thinking_parts = []

            for block in response.get("content", []):
                if block.get("type") == "tool_use":
                    tool_calls.append(block)
                elif block.get("type") == "text":
                    text_responses.append(block.get("text", ""))
                elif block.get("type") == "thinking":
                    thinking_parts.append(block.get("thinking", ""))

            # Show thinking summary (first 200 chars)
            if thinking_parts:
                thinking_preview = thinking_parts[0][:200].replace('\n', ' ')
                print(f"  Thinking: \"{thinking_preview}...\"")

            # Check expected tool call
            passed = True
            failure_reason = ""

            if tc.get("expect_tool") == "sessions_send":
                # Must have called sessions_send
                ss_calls = [t for t in tool_calls if t.get("name") == "sessions_send"]
                if not ss_calls:
                    passed = False
                    failure_reason = f"Expected sessions_send call but got tools: {[t.get('name') for t in tool_calls]}"
                else:
                    # Check the agent ID
                    expected_agent = tc.get("expect_agent")
                    if expected_agent:
                        actual_agent = ss_calls[0].get("input", {}).get("agentId", "")
                        if actual_agent != expected_agent:
                            passed = False
                            failure_reason = f"Expected agentId='{expected_agent}' but got '{actual_agent}'"
                        else:
                            print(f"  ✓ sessions_send(agentId='{actual_agent}', message='{ss_calls[0]['input'].get('message','')[:50]}...')")

            elif tc.get("must_not_delegate"):
                # Should NOT call sessions_send to seo
                ss_calls = [t for t in tool_calls if t.get("name") == "sessions_send"
                           and t.get("input", {}).get("agentId") == "seo"]
                if ss_calls:
                    passed = False
                    failure_reason = "Tong delegated to seo but should have handled directly"
                else:
                    if text_responses:
                        print(f"  ✓ Handled directly: \"{text_responses[0][:80]}\"")
                    else:
                        print(f"  ✓ Handled directly (no text but no wrong delegation)")

            status = "✅ PASS" if passed else "❌ FAIL"
            print(f"  Result: {status}")
            if not passed:
                print(f"  Reason: {failure_reason}")

            results.append({
                "test": tc["name"],
                "passed": passed,
                "reason": failure_reason,
                "tool_calls": [{"name": t.get("name"), "input": t.get("input")} for t in tool_calls],
                "text": text_responses[0][:100] if text_responses else ""
            })

        except Exception as e:
            print(f"  ❌ ERROR: {e}")
            results.append({"test": tc["name"], "passed": False, "reason": str(e)})

        print()

    # Summary
    passed = sum(1 for r in results if r["passed"])
    total = len(results)
    print(f"{'='*60}")
    print(f"RESULTS: {passed}/{total} PASS")

    if passed == total:
        print("✅ All routing tests PASS — ready for container restart")
    else:
        print("❌ Some tests FAILED — routing needs more fixes")
        print("\nFailed tests:")
        for r in results:
            if not r["passed"]:
                print(f"  - {r['test']}: {r['reason']}")

    print(f"{'='*60}\n")
    return results

# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("Loading .env and workspace files...")
    env = load_env(ENV_FILE)
    api_key = env.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not found in .env")
        sys.exit(1)

    print("Building system prompt from workspace files...")
    system_prompt = build_system_prompt()
    print(f"System prompt: {len(system_prompt)} chars")
    print(f"  AGENTS.md: {'✓' if 'Routing Rules' in system_prompt else '✗'}")
    print(f"  SOUL.md:   {'✓' if 'SOUL' in system_prompt else '✗'}")

    results = run_tests(api_key, system_prompt)

    # Exit with failure code if any test failed
    if not all(r["passed"] for r in results):
        sys.exit(1)
