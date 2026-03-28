#!/bin/bash
# =============================================================
# Agow Automation — Restore from Backup
# Usage: ./restore.sh [backup_file.tar.gz]
# =============================================================

set -euo pipefail

OPENCLAW_HOME="/home/openclaw"
BACKUP_DIR="${BACKUP_DIR:-/home/openclaw/backups}"

if [ -z "${1:-}" ]; then
    echo "Usage: $0 <backup_file.tar.gz>"
    echo ""
    echo "Available backups:"
    echo "--- Daily ---"
    ls -lh "${BACKUP_DIR}/daily/"*.tar.gz 2>/dev/null || echo "  (none)"
    echo "--- Weekly ---"
    ls -lh "${BACKUP_DIR}/weekly/"*.tar.gz 2>/dev/null || echo "  (none)"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Verify backup integrity
echo "Verifying backup integrity..."
if ! tar -tzf "$BACKUP_FILE" > /dev/null 2>&1; then
    echo "ERROR: Backup file is corrupted"
    exit 1
fi
echo "Backup integrity: OK"

# Confirm
echo ""
echo "WARNING: This will overwrite the current OpenClaw data."
echo "Backup: $BACKUP_FILE"
echo "Target: $OPENCLAW_HOME"
echo ""
read -p "Type 'RESTORE' to confirm: " CONFIRM

if [ "$CONFIRM" != "RESTORE" ]; then
    echo "Aborted."
    exit 0
fi

# Stop OpenClaw
echo "Stopping OpenClaw..."
docker compose -f "${OPENCLAW_HOME}/../docker-compose.yml" down 2>/dev/null || true

# Create pre-restore backup
PRE_RESTORE="${BACKUP_DIR}/pre-restore-$(date +%Y%m%d_%H%M%S).tar.gz"
echo "Creating pre-restore safety backup: $PRE_RESTORE"
tar -czf "$PRE_RESTORE" -C "$OPENCLAW_HOME" . 2>/dev/null || true

# Restore
echo "Restoring from backup..."
tar -xzf "$BACKUP_FILE" -C "$OPENCLAW_HOME"

# Restart OpenClaw
echo "Starting OpenClaw..."
docker compose -f "${OPENCLAW_HOME}/../docker-compose.yml" up -d

echo ""
echo "Restore complete. Pre-restore backup saved at: $PRE_RESTORE"
echo "Verify the system is working correctly."
