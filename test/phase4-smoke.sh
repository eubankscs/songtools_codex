#!/usr/bin/env bash
set -euo pipefail
DB=$(mktemp)
trap 'rm -f "$DB"' EXIT
sqlite3 "$DB" < electron/db/schema.sql
sqlite3 "$DB" "INSERT INTO projects VALUES ('system-unassigned-songs','Unassigned Songs',NULL,NULL,1);"
sqlite3 "$DB" "INSERT INTO songs VALUES ('song-1','Editorial','system-unassigned-songs',NULL,NULL,NULL,NULL,NULL);"
sqlite3 "$DB" "INSERT INTO song_versions VALUES ('version-1','song-1','working',NULL,NULL);"
sqlite3 "$DB" "INSERT INTO content_blocks VALUES ('lyric-1','version-1','lyricLine','placeholder lyric',0);"
sqlite3 "$DB" "INSERT INTO notes VALUES ('note-song','song-1','song',NULL,'overall note');"
sqlite3 "$DB" "INSERT INTO notes VALUES ('note-line','song-1','line','lyric-1','line note');"
sqlite3 "$DB" "INSERT INTO tags VALUES ('tag-placeholder','placeholder','#f97316',1);"
sqlite3 "$DB" "INSERT INTO annotations VALUES ('annotation-1','song-1','{\"blockId\":\"lyric-1\",\"start\":0,\"end\":11}','needs rewrite','tag-placeholder');"
sqlite3 "$DB" "INSERT INTO review_queue VALUES ('review-placeholder','song-1','annotation-1','Placeholder lyric','needs rewrite','2026-01-01T00:00:00.000Z',NULL,NULL);"
ACTIVE_REVIEW_COUNT=$(sqlite3 "$DB" "SELECT COUNT(*) FROM review_queue WHERE songId = 'song-1' AND ignoredOn IS NULL AND resolvedOn IS NULL;")
[ "$ACTIVE_REVIEW_COUNT" = 1 ]
sqlite3 "$DB" "UPDATE review_queue SET resolvedOn = '2026-01-02T00:00:00.000Z' WHERE id = 'review-placeholder';"
RESOLVED_COUNT=$(sqlite3 "$DB" "SELECT COUNT(*) FROM review_queue WHERE resolvedOn IS NOT NULL;")
[ "$RESOLVED_COUNT" = 1 ]
sqlite3 "$DB" "INSERT INTO review_queue VALUES ('review-manual','song-1','lyric-1','Manual user flag','check this','2026-01-03T00:00:00.000Z',NULL,NULL);"
sqlite3 "$DB" "UPDATE review_queue SET ignoredOn = '2026-01-04T00:00:00.000Z' WHERE id = 'review-manual';"
VISIBLE_COUNT=$(sqlite3 "$DB" "SELECT COUNT(*) FROM review_queue WHERE songId = 'song-1' AND ignoredOn IS NULL AND resolvedOn IS NULL;")
[ "$VISIBLE_COUNT" = 0 ]
TAG_JOIN=$(sqlite3 "$DB" "SELECT annotations.body || ':' || tags.color FROM annotations LEFT JOIN tags ON tags.id = annotations.tagId WHERE annotations.id = 'annotation-1';")
[ "$TAG_JOIN" = 'needs rewrite:#f97316' ]
