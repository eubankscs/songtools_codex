#!/usr/bin/env bash
set -euo pipefail
DB=$(mktemp)
trap 'rm -f "$DB"' EXIT
sqlite3 "$DB" < electron/db/schema.sql
sqlite3 "$DB" "INSERT INTO projects VALUES ('p1','Project 1',NULL,NULL,0); INSERT INTO projects VALUES ('p2','Project 2',NULL,NULL,0); INSERT INTO projects VALUES ('system-unassigned-songs','Unassigned Songs',NULL,NULL,1);"
sqlite3 "$DB" "INSERT INTO songs VALUES ('s1','Move Me','p1',NULL,NULL,NULL,NULL,NULL); INSERT INTO songs VALUES ('s2','Move Me','p2',NULL,NULL,NULL,NULL,NULL);"
COLLISION_COUNT=$(sqlite3 "$DB" "SELECT COUNT(*) FROM songs WHERE projectId = 'p2' AND title = 'Move Me' AND deletedOn IS NULL;")
[ "$COLLISION_COUNT" = 1 ]
sqlite3 "$DB" "UPDATE songs SET title = 'Move Me Renamed', projectId = 'p2' WHERE id = 's1';"
MOVED=$(sqlite3 "$DB" "SELECT projectId || ':' || title FROM songs WHERE id = 's1';")
[ "$MOVED" = 'p2:Move Me Renamed' ]
sqlite3 "$DB" "INSERT INTO songs VALUES ('deleted','Deleted Title','p1',NULL,NULL,NULL,'2026-01-01T00:00:00.000Z','p1'); INSERT INTO songs VALUES ('active-collision','Deleted Title','p1',NULL,NULL,NULL,NULL,NULL);"
RESTORE_COLLISION=$(sqlite3 "$DB" "SELECT COUNT(*) FROM songs WHERE projectId = 'p1' AND title = 'Deleted Title' AND deletedOn IS NULL;")
[ "$RESTORE_COLLISION" = 1 ]
sqlite3 "$DB" "UPDATE songs SET title = 'Deleted Title Restored', deletedOn = NULL WHERE id = 'deleted';"
RESTORED=$(sqlite3 "$DB" "SELECT title || ':' || COALESCE(deletedOn, 'active') FROM songs WHERE id = 'deleted';")
[ "$RESTORED" = 'Deleted Title Restored:active' ]
sqlite3 "$DB" "INSERT INTO song_versions VALUES ('working','s2','working',NULL,NULL); INSERT INTO content_blocks VALUES ('line','working','lyricLine','print lyric',0); INSERT INTO notes VALUES ('note','s2','song',NULL,'print note'); INSERT INTO annotations VALUES ('ann','s2','{\"blockId\":\"line\",\"start\":0,\"end\":5}','print annotation',NULL);"
CHART=$(sqlite3 "$DB" "SELECT content FROM content_blocks WHERE versionId = 'working';")
COMMENTS=$(sqlite3 "$DB" "SELECT (SELECT body FROM notes WHERE songId = 's2') || ':' || (SELECT body FROM annotations WHERE songId = 's2');")
[ "$CHART" = 'print lyric' ]
[ "$COMMENTS" = 'print note:print annotation' ]
