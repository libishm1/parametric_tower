from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import mimetypes
import os

# Ensure JavaScript modules are served with the correct MIME type.
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")


class Handler(SimpleHTTPRequestHandler):
    extensions_map = SimpleHTTPRequestHandler.extensions_map.copy()
    extensions_map.update({
        ".js": "application/javascript",
        ".mjs": "application/javascript"
    })

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.getcwd(), **kwargs)


if __name__ == "__main__":
    port = 8080
    with ThreadingHTTPServer(("", port), Handler) as httpd:
        print(f"Serving on http://localhost:{port}")
        httpd.serve_forever()
