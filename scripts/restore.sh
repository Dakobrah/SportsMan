#!/bin/bash
# Database restore script
# Usage: ./restore.sh backup_file.sql.gz

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <backup_file.sql.gz>"
    echo "Available backups:"
    ls -la backups/*.sql.gz 2>/dev/null || echo "No backups found"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "WARNING: This will overwrite the current database!"
read -p "Are you sure? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Restore cancelled"
    exit 0
fi

echo "Restoring from: $BACKUP_FILE"

# Stop web container to prevent connections
docker compose stop web

# Drop and recreate database
docker compose exec -T db psql -U sportsman -c "DROP DATABASE IF EXISTS sportsman;"
docker compose exec -T db psql -U sportsman -c "CREATE DATABASE sportsman;"

# Restore backup
gunzip -c "$BACKUP_FILE" | docker compose exec -T db psql -U sportsman sportsman

# Start web container
docker compose start web

echo "Restore completed successfully"
