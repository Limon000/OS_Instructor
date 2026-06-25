#!/usr/bin/env bash
# Nightly backup for OS_Instructor's SQLite database.
#
# Uses `sqlite3 .backup` for an atomic, consistent hot copy that works even
# while the app is running (WAL mode tolerates concurrent readers).
#
# Cron example (3am daily):
#   0 3 * * * /path/to/OS_Instructor/db/backup.sh >> /var/log/os_instructor_backup.log 2>&1

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${ROOT}/data/os_instructor.db"
DEST_DIR="${ROOT}/data/backups"
RETAIN_DAYS=7

mkdir -p "${DEST_DIR}"

if [[ ! -f "${DB}" ]]; then
  echo "[$(date -u +%FT%TZ)] no database at ${DB} — nothing to back up" >&2
  exit 0
fi

STAMP="$(date -u +%Y-%m-%d_%H%M%SZ)"
OUT="${DEST_DIR}/os_instructor_${STAMP}.db"

sqlite3 "${DB}" ".backup '${OUT}'"
echo "[${STAMP}] backup -> ${OUT}"

# Prune backups older than RETAIN_DAYS.
find "${DEST_DIR}" -name 'os_instructor_*.db' -type f -mtime "+${RETAIN_DAYS}" -delete
