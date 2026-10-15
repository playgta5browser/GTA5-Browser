"""Run GTA 5 Browser locally with project assets and streamed game data."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, unquote
import argparse
import json
import mimetypes
import re
import webbrowser

ROOT = Path(__file__).resolve().parent
import httpx
BUILD = json.loads((ROOT / 'source-refresh.json').read_text(encoding='utf-8'))
SOURCE = BUILD['source'].rstrip('/')
CLIENT = httpx.Client(http2=True, timeout=60, follow_redirects=True, limits=httpx.Limits(max_connections=32), headers={'User-Agent':'Mozilla/5.0'})
mimetypes.add_type('application/wasm', '.wasm')
mimetypes.add_type('application/javascript', '.js')

class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def end_headers(self):
        for name,value in [('Cross-Origin-Opener-Policy','same-origin'),('Cross-Origin-Embedder-Policy','require-corp'),('Cross-Origin-Resource-Policy','same-origin'),('Cache-Control','no-cache'),('X-Local-Copy','gta-copy-refresh')]:
            self.send_header(name,value)
        super().end_headers()
    def handle(self):
        try: super().handle()
        except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError): pass
    def do_GET(self): self.serve()
    def do_HEAD(self): self.serve(True)
    def do_POST(self): self.serve()
    def serve(self,head=False):
        route = unquote(urlsplit(self.path).path)
        body = self.rfile.read(int(self.headers.get('Content-Length',0))) if self.command == 'POST' else None
        if route == '/log' and body is not None:
            with (ROOT / 'game.log').open('ab') as output: output.write(body+b'\n')
            self.send_response(204);self.send_header('Content-Length','0');self.end_headers();return
        relative = 'index.html' if route == '/' else route.lstrip('/')
        if '\\' in relative or '\x00' in relative or any(part.startswith('.') for part in relative.split('/')):
            return self.send_error(403)
        target = (ROOT / relative).resolve()
        if not target.is_relative_to(ROOT): return self.send_error(403)
        public = relative in ('index.html', 'favicon.ico') or relative.startswith(('assets/', 'b/', 'data/'))
        if not public: return self.send_error(404)
        if target.is_file() and body is None:
            size = target.stat().st_size
            start,end,status=0,size-1,200
            if self.headers.get('Range'):
                match=re.fullmatch(r'bytes=(\d+)-(\d*)',self.headers['Range'])
                if not match:return self.send_error(416)
                start=int(match[1]);end=min(int(match[2]),end) if match[2] else end;status=206
                if start>end:return self.send_error(416)
            self.send_response(status);self.send_header('Content-Type',mimetypes.guess_type(target)[0] or 'application/octet-stream')
            self.send_header('Content-Length',str(max(0,end-start+1)))
            if status==206:self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
            self.end_headers()
            if not head:
                with target.open('rb') as source:
                    source.seek(start);remaining=end-start+1
                    while remaining>0:
                        chunk=source.read(min(1048576,remaining))
                        if not chunk:break
                        self.wfile.write(chunk);remaining-=len(chunk)
            return
        upstream = self.path.replace(BUILD['freshBuild'],BUILD['build'])
        if not (route.startswith('/data/') or route.startswith(BUILD['freshBuild']+'/')):return self.send_error(404)
        headers={'Accept-Encoding':'identity'}
        if self.headers.get('Range'):headers['Range']=self.headers['Range']
        if self.headers.get('Content-Type'):headers['Content-Type']=self.headers['Content-Type']
        try:
            result=CLIENT.request(self.command,SOURCE+upstream,headers=headers,content=body)
        except httpx.HTTPError:return self.send_error(502,'Source temporarily unavailable')
        self.send_response(result.status_code)
        for name in ['Content-Type','Content-Range','Accept-Ranges','X-Run-Lengths']:
            if name in result.headers:self.send_header(name,result.headers[name])
        self.send_header('Content-Length',str(len(result.content)));self.end_headers()
        if not head:self.wfile.write(result.content)
    def log_message(self,format,*args):
        if len(args)>1 and str(args[1]).isdigit() and int(args[1])>=400:print(format%args,flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=8766)
    parser.add_argument('--open',action='store_true')
    args=parser.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print(f'GTA 5 Browser: http://127.0.0.1:{args.port}/',flush=True)
    print('Keep this window open while playing. Press Ctrl+C to stop.',flush=True)
    if args.open: webbrowser.open(f'http://127.0.0.1:{args.port}/')
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close();CLIENT.close()
