#!/bin/bash
# =============================================================
# Agow Automation — Health Check Script
# Runs via cron every 15 min: */15 * * * * /home/openclaw/monitoring/health-check.sh
# =============================================================

set -uo pipefail

# --- Config ---
LOG_FILE="/home/openclaw/monitoring/health.log"
OPENCLAW_PORT=18789
WP_BASE_URL="${WP_BASE_URL:-https://agowautomation.com}"
DISK_WARN_PERCENT=80
DISK_CRIT_PERCENT=90
MEM_WARN_PERCENT=80
BACKUP_MAX_AGE_HOURS=26  # allow 2h buffer over daily
SQLITE_MAX_SIZE_MB=500
API_ERROR_THRESHOLD=5

STATUS="OK"
ISSUES=()

# --- Functions ---
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

alert_telegram() {
    local level="$1"
    local message="$2"
    if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_ADMIN_CHAT_ID:-}" ]; then
        local prefix=""
        case "$level" in
            critical) prefix="🔴 CRITICAL" ;;
            warning)  prefix="🟡 WARNING" ;;
            info)     prefix="🟢 INFO" ;;
        esac
        curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            -d "chat_id=${TELEGRAM_ADMIN_CHAT_ID}" \
            -d "text=${prefix}: ${message}" \
            -d "parse_mode=HTML" > /dev/null 2>&1 || true
    fi
}

# --- Check 1: Container Status ---
log "Check 1: Container status"
if curl -sf "http://localhost:${OPENCLAW_PORT}/health" > /dev/null 2>&1; then
    log "  Container: RUNNING"
else
    STATUS="CRITICAL"
    ISSUES+=("Container not responding on port ${OPENCLAW_PORT}")
    log "  Container: DOWN"
fi

# --- Check 2: Memory Usage ---
log "Check 2: Memory usage"
MEM_PERCENT=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100}')
if [ "$MEM_PERCENT" -ge "$DISK_CRIT_PERCENT" ]; then
    STATUS="CRITICAL"
    ISSUES+=("Memory usage: ${MEM_PERCENT}%")
elif [ "$MEM_PERCENT" -ge "$MEM_WARN_PERCENT" ]; then
    [ "$STATUS" != "CRITICAL" ] && STATUS="WARNING"
    ISSUES+=("Memory usage high: ${MEM_PERCENT}%")
fi
log "  Memory: ${MEM_PERCENT}%"

# --- Check 3: Disk Usage ---
log "Check 3: Disk usage"
DISK_PERCENT=$(df /home/openclaw | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$DISK_PERCENT" -ge "$DISK_CRIT_PERCENT" ]; then
    STATUS="CRITICAL"
    ISSUES+=("Disk usage: ${DISK_PERCENT}% — emergency log rotation needed")
elif [ "$DISK_PERCENT" -ge "$DISK_WARN_PERCENT" ]; then
    [ "$STATUS" != "CRITICAL" ] && STATUS="WARNING"
    ISSUES+=("Disk usage high: ${DISK_PERCENT}%")
fi
log "  Disk: ${DISK_PERCENT}%"

# --- Check 4: WordPress API ---
log "Check 4: WordPress API"
WP_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "${WP_BASE_URL}/wp-json/wp/v2/posts?per_page=1" 2>/dev/null || echo "000")
if [ "$WP_STATUS" != "200" ]; then
    [ "$STATUS" != "CRITICAL" ] && STATUS="WARNING"
    ISSUES+=("WordPress API returned HTTP ${WP_STATUS}")
fi
log "  WP API: HTTP ${WP_STATUS}"

# --- Check 5: Backup Age ---
log "Check 5: Backup age"
LATEST_BACKUP=$(find /home/openclaw/backups/daily -name "*.tar.gz" -type f -printf '%T@\n' 2>/dev/null | sort -rn | head -1)
if [ -n "$LATEST_BACKUP" ]; then
    NOW=$(date +%s)
    BACKUP_AGE_HOURS=$(( (NOW - ${LATEST_BACKUP%.*}) / 3600 ))
    if [ "$BACKUP_AGE_HOURS" -gt "$BACKUP_MAX_AGE_HOURS" ]; then
        [ "$STATUS" != "CRITICAL" ] && STATUS="WARNING"
        ISSUES+=("Latest backup is ${BACKUP_AGE_HOURS}h old (max: ${BACKUP_MAX_AGE_HOURS}h)")
    fi
    log "  Backup age: ${BACKUP_AGE_HOURS}h"
else
    [ "$STATUS" != "CRITICAL" ] && STATUS="WARNING"
    ISSUES+=("No backups found")
    log "  Backup: NONE"
fi

# --- Check 6: SQLite Size ---
log "Check 6: SQLite size"
for db in /home/openclaw/*.db /home/openclaw/**/*.db; do
    if [ -f "$db" ]; then
        DB_SIZE_MB=$(du -m "$db" | cut -f1)
        if [ "$DB_SIZE_MB" -gt "$SQLITE_MAX_SIZE_MB" ]; then
            [ "$STATUS" != "CRITICAL" ] && STATUS="WARNING"
            ISSUES+=("SQLite $(basename $db): ${DB_SIZE_MB}MB (max: ${SQLITE_MAX_SIZE_MB}MB)")
        fi
        log "  SQLite $(basename $db): ${DB_SIZE_MB}MB"
    fi
done

# --- Check 7: Log File Size ---
log "Check 7: Log files"
TOTAL_LOG_SIZE=$(find /home/openclaw -name "*.log" -exec du -cm {} + 2>/dev/null | tail -1 | cut -f1)
if [ "${TOTAL_LOG_SIZE:-0}" -gt 100 ]; then
    [ "$STATUS" != "CRITICAL" ] && STATUS="WARNING"
    ISSUES+=("Total log files: ${TOTAL_LOG_SIZE}MB — rotation needed")
fi
log "  Total logs: ${TOTAL_LOG_SIZE:-0}MB"

# --- Check 8: Session Count ---
log "Check 8: Active sessions"
# This check depends on OpenClaw API, placeholder:
log "  Sessions: (check via OpenClaw API)"

# --- Summary ---
log "=== Health Status: ${STATUS} ==="

if [ "$STATUS" = "CRITICAL" ]; then
    alert_telegram "critical" "Health check FAILED:\n$(printf '• %s\n' "${ISSUES[@]}")"
elif [ "$STATUS" = "WARNING" ]; then
    alert_telegram "warning" "Health check warnings:\n$(printf '• %s\n' "${ISSUES[@]}")"
fi

# Output for cron log
echo "${STATUS}: ${#ISSUES[@]} issues found"
