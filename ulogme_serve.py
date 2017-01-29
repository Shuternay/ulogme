import socketserver
import http.server
import sys
import cgi
import os
import json
import sqlite3
from urllib.parse import urlparse, parse_qs

from export_events import updateEvents
from rewind7am import rewindTime

# Port settings
IP = ""
if len(sys.argv) > 1:
  PORT = int(sys.argv[1])
else:
  PORT = 8124

# serve render/ folder, not current folder
rootdir = os.getcwd()
os.chdir('render')

# Custom handler
class CustomHandler(http.server.SimpleHTTPRequestHandler):
  def do_GET(self):
    # default behavior
    if self.path.startswith('/events?'):
      query_components = parse_qs(urlparse(self.path).query)

      conn = sqlite3.connect('../logs/logs.db')
      c = conn.cursor()

      notes = []
      for row in c.execute('SELECT * FROM notes WHERE date >= ? AND date < ? ORDER BY date;',
          (int(query_components['begin_time'][0]) // 1000, int(query_components['end_time'][0]) // 1000)):
        notes.append({'t': row[0], 'timezone': row[1], 's': row[2]})
      window = []
      for row in c.execute('SELECT * FROM window WHERE date >= ? AND date < ? ORDER BY date;',
          (int(query_components['begin_time'][0]) // 1000, int(query_components['end_time'][0]) // 1000)):
        window.append({'t': row[0], 'timezone': row[1], 's': row[2]})
      keyfreq = []
      for row in c.execute('SELECT * FROM keyfreq WHERE date >= ? AND date < ? ORDER BY date;',
          (int(query_components['begin_time'][0]) // 1000, int(query_components['end_time'][0]) // 1000)):
        keyfreq.append({'t': row[0], 'timezone': row[1], 's': row[2]})

      conn.close()

      response = {
        'blog': '',
        'window_events': window,
        'keyfreq_events': keyfreq,
        'notes_events': notes
      }

      self.send_response(200)
      self.send_header('Content-type','text/json')
      self.end_headers()
      self.wfile.write(json.dumps(response).encode('utf8'))

    else:
      http.server.SimpleHTTPRequestHandler.do_GET(self)

  def do_POST(self):
    form = cgi.FieldStorage(
      fp = self.rfile,
      headers = self.headers,
      environ = {'REQUEST_METHOD':'POST', 'CONTENT_TYPE':self.headers['Content-Type']})
    result = 'NOT_UNDERSTOOD'

    if self.path == '/refresh':
      # recompute jsons. We have to pop out to root from render directory
      # temporarily. It's a little ugly
      refresh_time = form.getvalue('time')
      os.chdir(rootdir) # pop out
      updateEvents() # defined in export_events.py
      os.chdir('render') # pop back to render directory
      result = 'OK'

    if self.path == '/addnote':
      # add note at specified time and refresh
      note = form.getvalue('note')
      note_time = form.getvalue('time')
      os.chdir(rootdir) # pop out
      os.system('echo %s | ./note.sh %s' % (note, note_time))
      updateEvents() # defined in export_events.py
      os.chdir('render') # go back to render
      result = 'OK'

    if self.path == '/blog':
      # add note at specified time and refresh
      post = form.getvalue('post')
      if post is None: post = ''
      post_time = int(form.getvalue('time'))
      os.chdir(rootdir) # pop out
      trev = rewindTime(post_time)
      open('logs/blog_%d.txt' % (post_time, ), 'w').write(post)
      updateEvents() # defined in export_events.py
      os.chdir('render') # go back to render
      result = 'OK'

    self.send_response(200)
    self.send_header('Content-type','text/html')
    self.end_headers()
    self.wfile.write(result.encode('utf8'))

httpd = socketserver.ThreadingTCPServer((IP, PORT), CustomHandler)

print ('Serving ulogme, see it on http://localhost:' + str(PORT))
httpd.serve_forever()
