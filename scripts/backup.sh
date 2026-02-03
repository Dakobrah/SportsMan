#!/bin/bash
# Database backup script
# Run manually or via cron for scheduled backups

set -e

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/sportsman_${TIMESTAMP}.sql.gz"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "Starting backup at $(date)"

# Create backup using pg_dump inside the container
docker compose exec -T db pg_dump -U sportsman sportsman | gzip > "${BACKUP_FILE}"

# Keep only last 7 days of backups
find "${BACKUP_DIR}" -name "sportsman_*.sql.gz" -mtime +7 -delete

echo "Backup completed: ${BACKUP_FILE}"
echo "Backup size: $(du -h ${BACKUP_FILE} | cut -f1)"
