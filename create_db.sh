sqlite3 logs/logs.db 'CREATE TABLE blog (date integer PRIMARY KEY, timezone text, entry text);'
sqlite3 logs/logs.db 'CREATE TABLE keyfreq (date integer PRIMARY KEY, timezone text, entry integer);'
sqlite3 logs/logs.db 'CREATE TABLE notes (date integer PRIMARY KEY, timezone text, entry text);'
sqlite3 logs/logs.db 'CREATE TABLE window (date integer PRIMARY KEY, timezone text, entry text);'
