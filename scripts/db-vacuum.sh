#!/bin/bash
# =============================================================
# Agow Automation — SQLite DB Vacuum Script
# Runs weekly: 0 4 * * 0 /home/openclaw/scripts/db-vacuum.sh
# =============================================================

set -euo pipefail

OPENCLAW_HOME="/home/openclaw"
LOG_FILE="${OPENCLAW_HOME}/monitoring/vacuum.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== Starting DB vacuum ==="

find "$OPENCLAW_HOME" -name "*.db" -type f | while read db; do
    BASENAME=$(basename "$db")
    SIZE_BEFORE=$(du -h "$db" | cut -f1)

    # Check integrity first
    INTEGRITY=$(sqlite3 "$db" "PRAGMA integrity_check;" 2>/dev/null || echo "ERROR")

    if [ "$INTEGRITY" = "ok" ]; then
        sqlite3 "$db" "VACUUM;" 2>/dev/null
        SIZE_AFTER=$(du -h "$db" | cut -f1)
        log "${BASENAME}: ${SIZE_BEFORE} → ${SIZE_AFTER} (integrity: OK)"
    else
        log "WARNING: ${BASENAME} integrity check failed — skipping vacuum"
        # Alert admin for corrupted DB
        if [ -n "${TELEGRAM_BOT_TOKEN:-}" ]; then
            curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
                -d "chat_id=${TELEGRAM_ADMIN_CHAT_ID}" \
                -d "text=🔴 Database ${BASENAME} integrity check failed. Manual intervention needed." \
                > /dev/null 2>&1 || true
        fi
    fi
done

log "=== DB vacuum complete ==="
