#!/usr/bin/env bash
set -euo pipefail
DB=$(mktemp)
trap 'rm -f "$DB"' EXIT
sqlite3 "$DB" < electron/db/schema.sql
sqlite3 "$DB" "INSERT INTO projects VALUES ('system-unassigned-songs','Unassigned Songs','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z',1);"
sqlite3 "$DB" "INSERT INTO songs VALUES ('song-1','Precise Chords','system-unassigned-songs','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z',NULL,NULL);"
sqlite3 "$DB" "INSERT INTO song_versions VALUES ('version-1','song-1','working',NULL,NULL);"
sqlite3 "$DB" "INSERT INTO content_blocks VALUES ('section-1','version-1','section','[Verse 1]',0);"
sqlite3 "$DB" "INSERT INTO content_blocks VALUES ('chords-1','version-1','chordLine','[{\"chord\":\"G\",\"offset\":0},{\"chord\":\"C\",\"offset\":6},{\"chord\":\"D/F#\",\"offset\":13},{\"chord\":\"Em\",\"offset\":23}]',1);"
sqlite3 "$DB" "INSERT INTO content_blocks VALUES ('lyric-1','version-1','lyricLine','Amazingmidword line end',2);"
CHORD_JSON=$(sqlite3 "$DB" "SELECT content FROM content_blocks WHERE id = 'chords-1';")
[ "$CHORD_JSON" = '[{"chord":"G","offset":0},{"chord":"C","offset":6},{"chord":"D/F#","offset":13},{"chord":"Em","offset":23}]' ]
sqlite3 "$DB" 'SELECT json_extract(content, "$[0].offset") FROM content_blocks WHERE id = "chords-1";' | grep -qx 0
sqlite3 "$DB" 'SELECT json_extract(content, "$[1].offset") FROM content_blocks WHERE id = "chords-1";' | grep -qx 6
sqlite3 "$DB" 'SELECT json_extract(content, "$[2].offset") FROM content_blocks WHERE id = "chords-1";' | grep -qx 13
sqlite3 "$DB" 'SELECT json_extract(content, "$[3].offset") FROM content_blocks WHERE id = "chords-1";' | grep -qx 23
