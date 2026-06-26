#!/usr/bin/env bash
set -euo pipefail
DB=$(mktemp)
trap 'rm -f "$DB"' EXIT
sqlite3 "$DB" < electron/db/schema.sql
sqlite3 "$DB" "INSERT INTO projects VALUES ('system-unassigned-songs','Unassigned Songs','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z',1);"
sqlite3 "$DB" "INSERT INTO songs VALUES ('u1','Untitled Song','system-unassigned-songs',NULL,NULL,NULL,NULL,NULL);"
sqlite3 "$DB" "INSERT INTO songs VALUES ('u3','Untitled Song 3','system-unassigned-songs',NULL,NULL,NULL,NULL,NULL);"
NEXT_UNTITLED=$(sqlite3 "$DB" "WITH RECURSIVE slots(n) AS (VALUES(1) UNION ALL SELECT n + 1 FROM slots LIMIT 10), used(n) AS (SELECT CASE WHEN title = 'Untitled Song' THEN 1 ELSE CAST(substr(title, 15) AS INTEGER) END FROM songs WHERE projectId = 'system-unassigned-songs' AND deletedOn IS NULL AND (title = 'Untitled Song' OR title GLOB 'Untitled Song [0-9]*')) SELECT CASE WHEN MIN(slots.n) = 1 THEN 'Untitled Song' ELSE 'Untitled Song ' || MIN(slots.n) END FROM slots LEFT JOIN used ON used.n = slots.n WHERE used.n IS NULL;")
[ "$NEXT_UNTITLED" = 'Untitled Song 2' ]
sqlite3 "$DB" "INSERT INTO songs VALUES ('song-1','Markers','system-unassigned-songs',NULL,NULL,NULL,NULL,NULL);"
sqlite3 "$DB" "INSERT INTO song_versions VALUES ('working-1','song-1','working',NULL,NULL);"
sqlite3 "$DB" "INSERT INTO content_blocks VALUES ('lyric-1','working-1','lyricLine','hello markers',0);"
sqlite3 "$DB" "INSERT INTO arrangement_markers VALUES ('inline-1','working-1','lyric-1:6','inline','Harmony In');"
sqlite3 "$DB" "INSERT INTO arrangement_markers VALUES ('standalone-1','working-1','position:0','standalone','Full Band');"
sqlite3 "$DB" "INSERT INTO song_versions VALUES ('saved-1','song-1','saved',NULL,NULL);"
sqlite3 "$DB" "INSERT INTO content_blocks SELECT 'saved-' || id, 'saved-1', type, content, position FROM content_blocks WHERE versionId = 'working-1';"
sqlite3 "$DB" "INSERT INTO arrangement_markers SELECT 'saved-' || id, 'saved-1', targetPosition, displayMode, text FROM arrangement_markers WHERE versionId = 'working-1';"
sqlite3 "$DB" "DELETE FROM arrangement_markers WHERE versionId = 'working-1'; DELETE FROM content_blocks WHERE versionId = 'working-1'; DELETE FROM song_versions WHERE id = 'working-1';"
WORKING_COUNT=$(sqlite3 "$DB" "SELECT COUNT(*) FROM song_versions WHERE songId = 'song-1' AND type = 'working';")
[ "$WORKING_COUNT" = 0 ]
SAVED_MARKERS=$(sqlite3 "$DB" "SELECT displayMode || ':' || targetPosition || ':' || text FROM arrangement_markers WHERE versionId = 'saved-1' ORDER BY displayMode;")
[ "$SAVED_MARKERS" = $'inline:lyric-1:6:Harmony In\nstandalone:position:0:Full Band' ]
