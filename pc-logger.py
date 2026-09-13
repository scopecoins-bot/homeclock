import http.server, socketserver, sys, datetime
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        line = datetime.datetime.now().strftime("%H:%M:%S") + " " + self.path.replace("/log?msg=", "", 1)[:600]
        try:
            with open("pc-logger.log", "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception:
            pass
        try:
            sys.stderr.write("LOG: " + line + "\n")
            sys.stderr.flush()
        except Exception:
            pass
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")
    def log_message(self, *a):
        pass
socketserver.TCPServer.allow_reuse_address = True
socketserver.ThreadingTCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(("0.0.0.0", 9911), H) as httpd:
    httpd.serve_forever()
