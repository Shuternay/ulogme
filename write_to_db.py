import sqlite3
import datetime
import time

def write_entry(table, timestamp, entry, timezone='+0300'):
  conn = sqlite3.connect('logs/logs.db')
  c = conn.cursor()
  c.execute("INSERT INTO {0} VALUES (?, ?, ?);".format(table),
    (int(timestamp), timezone, entry))
  conn.commit()
  conn.close()

if __name__ == '__main__':
  query = input().split(maxsplit=2)
  write_entry(query[0], query[1], query[2] if len(query) > 2 else '', time.strftime("%z"))
