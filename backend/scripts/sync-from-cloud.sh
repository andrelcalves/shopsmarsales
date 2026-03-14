#!/bin/bash
set -euo pipefail

# ==============================================================
# sync-from-cloud.sh
# Exports cloud RDS database and imports into local PostgreSQL
# ==============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DUMP_FILE="${SCRIPT_DIR}/cloud-backup.dump"

if [ -z "${LOCAL_DATABASE_URL:-}" ]; then
  echo "ERROR: LOCAL_DATABASE_URL is not set."
  echo "Example: export LOCAL_DATABASE_URL='postgresql://user:pass@localhost:5432/shopsmarsales'"
  exit 1
fi

if [ -z "${CLOUD_DATABASE_URL:-}" ]; then
  echo "ERROR: CLOUD_DATABASE_URL is not set."
  echo "Example: export CLOUD_DATABASE_URL='postgresql://user:pass@rds-host:5432/shopsmarsales'"
  exit 1
fi

echo "==> Exporting cloud database..."
pg_dump -Fc --no-owner --no-acl "$CLOUD_DATABASE_URL" > "$DUMP_FILE"
echo "    Dump saved to $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"

echo ""
echo "==> Importing into local database..."
echo "    WARNING: This will REPLACE all data in your local database."
read -r -p "    Continue? (y/N): " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "    Aborted."
  exit 0
fi

pg_restore --clean --no-owner --no-acl -d "$LOCAL_DATABASE_URL" "$DUMP_FILE" 2>&1 || true

echo ""
echo "==> Running Prisma migrations locally..."
cd "$SCRIPT_DIR/.."
DATABASE_URL="$LOCAL_DATABASE_URL" npx prisma migrate deploy

echo ""
echo "==> Sync from cloud complete!"
echo "    Dump file: $DUMP_FILE"
