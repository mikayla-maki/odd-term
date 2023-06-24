from http.server import HTTPServer, SimpleHTTPRequestHandler
from ssl import SSLContext
import ssl
import sys

def run(which="localhost", port=8081, server_class=HTTPServer, handler_class=SimpleHTTPRequestHandler):
    server_address = (which, port)
    try:
        httpd = server_class(server_address, handler_class)
    except Exception as e:
        print("Failed to launch: " + which + ":" + str(port))
        raise e
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain("certs/" + which + '.pem', "certs/" + which + '.key')
    httpd.socket = context.wrap_socket (httpd.socket)
    httpd.serve_forever()

print("https://" + sys.argv[1] + ":" + sys.argv[2] + "/term.odd.html")

print("Making server for... " + sys.argv[1] + ":" + sys.argv[2])

run(sys.argv[1], int(sys.argv[2]))
