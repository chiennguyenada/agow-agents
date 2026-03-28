#!/bin/bash
# =============================================================
# Agow Automation — Daily Backup Script
# Runs via cron at 2:00 AM: 0 2 * * * /home/openclaw/scripts/backup.sh
# =============================================================

set -euo pipefail

# --- Config ---
BACKUP_DIR="${BACKUP_DIR:-/home/openclaw/backups}"
OPENCLAW_HOME="/home/openclaw"
RETENTION_DAILY=7
RETENTION_WEEKLY=4
DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/daily/agow-backup-${TIMESTAMP}.tar.gz"
LOG_FILE="${BACKUP_DIR}/backup.log"

# --- Functions ---
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

alert_telegram() {
    local message="$1"
    if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_ADMIN_CHAT_ID:-}" ]; then
        curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            -d "chat_id=${TELEGRAM_ADMIN_CHAT_ID}" \
            -d "text=${message}" \
            -d "parse_mode=HTML" > /dev/null 2>&1 || true
    fi
}

# --- Setup ---
mkdir -p "${BACKUP_DIR}/daily" "${BACKUP_DIR}/weekly"

log "=== Starting backup ==="

# --- Create backup ---
log "Creating backup: ${BACKUP_FILE}"
tar -czf "$BACKUP_FILE" \
    --exclude="backups" \
    --exclude="*.log" \
    --exclude="tmp/*" \
    -C "$OPENCLAW_HOME" . 2>&1 | tee -a "$LOG_FILE"

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log "Backup created: ${BACKUP_SIZE}"

# --- Weekly backup (keep Sunday's) ---
DAY_OF_WEEK=$(date +%u)
if [ "$DAY_OF_WEEK" -eq 7 ]; then
    cp "$BACKUP_FILE" "${BACKUP_DIR}/weekly/agow-weekly-${DATE}.tar.gz"
    log "Weekly backup copied"
fi

# --- Retention: clean old daily backups ---
find "${BACKUP_DIR}/daily" -name "agow-backup-*.tar.gz" -mtime +${RETENTION_DAILY} -delete 2>/dev/null
DAILY_COUNT=$(find "${BACKUP_DIR}/daily" -name "agow-backup-*.tar.gz" | wc -l)
log "Daily backups retained: ${DAILY_COUNT}"

# --- Retention: clean old weekly backups ---
find "${BACKUP_DIR}/weekly" -name "agow-weekly-*.tar.gz" -mtime +$((RETENTION_WEEKLY * 7)) -delete 2>/dev/null
WEEKLY_COUNT=$(find "${BACKUP_DIR}/weekly" -name "agow-weekly-*.tar.gz" | wc -l)
log "Weekly backups retained: ${WEEKLY_COUNT}"

# --- Verify backup integrity ---
if tar -tzf "$BACKUP_FILE" > /dev/null 2>&1; then
    log "Backup integrity: OK"
    alert_telegram "✅ Backup thành công: ${BACKUP_SIZE} (${DATE})"
else
    log "ERROR: Backup integrity check FAILED"
    alert_telegram "❌ BACKUP LỖI: File backup bị hỏng (${DATE}). Cần kiểm tra!"
    exit 1
fi

log "=== Backup complete ==="
