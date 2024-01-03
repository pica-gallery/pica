#!/bin/sh

FILE="$1"

sqlite3 \
  --bail \
  --cmd "ATTACH 'pica.db' as db1;" \
  --cmd "ATTACH '$1' as db2;" \
  --cmd "INSERT OR IGNORE INTO db1.pica_image (media, size, type, error, content) SELECT media, size, type, error, content FROM db2.pica_image;" \
  --cmd ".exit" \
  ":memory:"
