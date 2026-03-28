#!/bin/bash
# =============================================================
# Agow Automation — Log Rotation Script
# Runs weekly: 0 3 * * 0 /home/openclaw/scripts/log-rotation.sh
# =============================================================

set -euo pipefail

OPENCLAW_HOME="/home/openclaw"
ARCHIVE_DIR="${OPENCLAW_HOME}/backups/logs"
ROTATE_DAYS=90
LOG_FILE="${OPENCLAW_HOME}/monitoring/rotation.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

mkdir -p "$ARCHIVE_DIR"

log "=== Starting log rotation ==="

# Compress old reports
REPORT_COUNT=0
find "${OPENCLAW_HOME}" -name "*.json" -path "*/audit-results/*" -mtime +${ROTATE_DAYS} | while read f; do
    gzip "$f" && REPORT_COUNT=$((REPORT_COUNT + 1))
done
log "Compressed ${REPORT_COUNT} old audit reports"

# Rotate log files > 10MB
find "${OPENCLAW_HOME}" -name "*.log" -size +10M | while read f; do
    BASENAME=$(basename "$f")
    mv "$f" "${ARCHIVE_DIR}/${BASENAME}.$(date +%Y%m%d).old"
    touch "$f"
    log "Rotated: ${BASENAME}"
done

# Delete archived logs older than 180 days
DELETED=$(find "$ARCHIVE_DIR" -name "*.old" -mtime +180 -delete -print | wc -l)
DELETED_GZ=$(find "$ARCHIVE_DIR" -name "*.gz" -mtime +180 -delete -print | wc -l)
log "Deleted ${DELETED} old logs, ${DELETED_GZ} old archives"

# Clean actions_log entries older than 90 days (if JSON)
ACTIONS_LOG="${OPENCLAW_HOME}/shared-knowledge/actions_log.json"
if [ -f "$ACTIONS_LOG" ]; then
    CUTOFF=$(date -d "-90 days" +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -v-90d +%Y-%m-%dT%H:%M:%S)
    python3 -c "
import json, sys
with open('$ACTIONS_LOG', 'r') as f:
    data = json.load(f)
if isinstance(data, list):
    filtered = [e for e in data if e.get('timestamp','9999') > '$CUTOFF']
    removed = len(data) - len(filtered)
    with open('$ACTIONS_LOG', 'w') as f:
        json.dump(filtered, f, indent=2)
    print(f'Cleaned {removed} old actions_log entries')
" 2>/dev/null || log "Skipped actions_log cleanup (not found or parse error)"
fi

log "=== Log rotation complete ==="
