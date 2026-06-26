#!/usr/bin/env bash
set -euo pipefail
DB=$(mktemp)
trap 'rm -f "$DB"' EXIT
sqlite3 "$DB" < electron/db/schema.sql
sqlite3 "$DB" "INSERT INTO projects VALUES ('system-unassigned-songs','Unassigned Songs','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z',1);"
for i in 1 2 3 4 5 6; do sqlite3 "$DB" "INSERT INTO projects VALUES ('p$i','Project $i','2026-01-0${i}T00:00:00.000Z','2026-01-0${i}T00:00:00.000Z',0);"; done
for i in 1 2 3 4 5 6; do sqlite3 "$DB" "INSERT INTO songs VALUES ('s$i','Song $i','p1','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','2026-01-0${i}T00:00:00.000Z',NULL,NULL);"; done
sqlite3 "$DB" "INSERT INTO songs VALUES ('deleted','Deleted Song','p1','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','2026-01-07T00:00:00.000Z','2026-01-08T00:00:00.000Z','p1');"
RECENTS=$(sqlite3 "$DB" "SELECT title FROM songs WHERE deletedOn IS NULL AND lastOpenedOn IS NOT NULL ORDER BY lastOpenedOn DESC LIMIT 5;")
[ "$RECENTS" = $'Song 6\nSong 5\nSong 4\nSong 3\nSong 2' ]
DISPLAYED_PROJECTS=$(sqlite3 "$DB" "SELECT name FROM projects WHERE isSystemProject = 0 ORDER BY lastUsedOn DESC, createdOn DESC, name ASC LIMIT 4;")
[ "$DISPLAYED_PROJECTS" = $'Project 6\nProject 5\nProject 4\nProject 3' ]
USER_PROJECT_COUNT=$(sqlite3 "$DB" "SELECT COUNT(*) FROM projects WHERE isSystemProject = 0;")
[ "$USER_PROJECT_COUNT" = 6 ]
UNASSIGNED_IS_SYSTEM=$(sqlite3 "$DB" "SELECT isSystemProject FROM projects WHERE id = 'system-unassigned-songs';")
[ "$UNASSIGNED_IS_SYSTEM" = 1 ]
RECENTLY_DELETED_COUNT=$(sqlite3 "$DB" "SELECT COUNT(*) FROM songs WHERE deletedOn IS NOT NULL;")
[ "$RECENTLY_DELETED_COUNT" = 1 ]
DUPLICATE_IN_CONTAINER=$(sqlite3 "$DB" "SELECT COUNT(*) FROM songs WHERE projectId = 'p1' AND title = 'Song 1' AND deletedOn IS NULL;")
[ "$DUPLICATE_IN_CONTAINER" = 1 ]
