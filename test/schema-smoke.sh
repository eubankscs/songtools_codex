#!/usr/bin/env bash
set -euo pipefail
DB=$(mktemp)
trap 'rm -f "$DB"' EXIT
sqlite3 "$DB" < electron/db/schema.sql
sqlite3 "$DB" < electron/db/schema.sql
TABLES=$(sqlite3 "$DB" "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
EXPECTED=$'annotations\narrangement_markers\ncontent_blocks\nnotes\nprojects\nreview_queue\nsong_versions\nsongs\ntags'
[ "$TABLES" = "$EXPECTED" ]
sqlite3 "$DB" "PRAGMA foreign_keys=ON; INSERT INTO projects VALUES ('p1','Project',NULL,NULL,0); INSERT INTO songs VALUES ('s1','Song','p1',NULL,NULL,NULL,NULL,NULL); INSERT INTO song_versions VALUES ('v1','s1','working',NULL,NULL);"
! sqlite3 "$DB" "INSERT INTO song_versions VALUES ('v2','s1','working',NULL,NULL);" >/dev/null 2>&1
! sqlite3 "$DB" "INSERT INTO song_versions VALUES ('v3','s1','draft',NULL,NULL);" >/dev/null 2>&1
! sqlite3 "$DB" "INSERT INTO content_blocks VALUES ('b1','v1','bad',NULL,0);" >/dev/null 2>&1
! sqlite3 "$DB" "INSERT INTO arrangement_markers VALUES ('m1','v1','b1:0','bad','text');" >/dev/null 2>&1
! sqlite3 "$DB" "INSERT INTO notes VALUES ('n1','s1','bad',NULL,'body');" >/dev/null 2>&1
! sqlite3 "$DB" "PRAGMA foreign_keys=ON; INSERT INTO songs VALUES ('s2','Broken','missing',NULL,NULL,NULL,NULL,NULL);" >/dev/null 2>&1
sqlite3 "$DB" "SELECT name FROM pragma_table_info('tags') WHERE name='createsReviewItem' AND type='BOOLEAN' AND \"notnull\"=1 AND dflt_value='0';" | grep -qx createsReviewItem
