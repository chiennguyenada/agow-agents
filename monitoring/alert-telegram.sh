#!/bin/bash
# =============================================================
# Agow Automation — Telegram Alert Utility
# Usage: ./alert-telegram.sh <level> <message>
# Levels: critical, warning, info
# =============================================================

set -uo pipefail

LEVEL="${1:-info}"
MESSAGE="${2:-No message provided}"

# Load env if available
if [ -f "/home/openclaw/.env" ]; then
    set -a
    source /home/openclaw/.env
    set +a
fi

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_ADMIN_CHAT_ID:-}" ]; then
    echo "ERROR: TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID not set" >&2
    exit 1
fi

# Format prefix based on level
case "$LEVEL" in
    critical)
        PREFIX="🔴 CRITICAL"
        ;;
    warning)
        PREFIX="🟡 WARNING"
        ;;
    info)
        PREFIX="🟢 INFO"
        ;;
    success)
        PREFIX="✅ SUCCESS"
        ;;
    *)
        PREFIX="ℹ️ ${LEVEL^^}"
        ;;
esac

FULL_MESSAGE="${PREFIX} — Agow Automation
$(date '+%Y-%m-%d %H:%M:%S')

${MESSAGE}"

# Send to Telegram
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_ADMIN_CHAT_ID}" \
    -d "text=${FULL_MESSAGE}" \
    -d "parse_mode=HTML" 2>&1)

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
    echo "Alert sent: ${LEVEL} — ${MESSAGE}"
else
    echo "ERROR: Failed to send Telegram alert (HTTP ${HTTP_CODE})" >&2
    echo "Response: ${BODY}" >&2
    exit 1
fi
