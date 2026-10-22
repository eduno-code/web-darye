# -*- coding: utf-8 -*-
"""
Servidor local para desarrollo.

Es `python -m http.server` con UNA diferencia que importa mucho mientras se
trabaja: manda `Cache-Control: no-store` en todo.

POR QUE HACE FALTA. El servidor de serie manda solo `Last-Modified`, sin
`Cache-Control` ni `ETag`. Cuando falta `Cache-Control`, el navegador NO se
queda sin instrucciones: aplica una heuristica propia y decide por su cuenta
que la pagina sigue fresca, asi que la sirve de su cache sin preguntarle nada
al servidor. El resultado es que se edita un archivo, se recarga, y se ve la
version de antes — y uno acaba buscando el fallo en el sitio equivocado.

Los ?v=NN de los <script> y <link> resuelven esto para el CSS y el JavaScript,
pero no para el propio index.html, que no lleva version en ninguna parte.

Uso:
    python servidor.py            (puerto 8123)
    python servidor.py 9000
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class SinCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        # no-store y no no-cache: no-cache permite guardar la copia y
        # revalidarla, no-store prohibe guardarla siquiera. Durante el
        # desarrollo interesa lo segundo.
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        SimpleHTTPRequestHandler.end_headers(self)

    def log_message(self, formato, *args):
        # Solo lo que no sea un 200: con la consola limpia se ven los 404 de
        # verdad, que es lo unico que hay que mirar aqui.
        if args and len(args) > 1 and str(args[1]).startswith('2'):
            return
        SimpleHTTPRequestHandler.log_message(self, formato, *args)


if __name__ == '__main__':
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    servidor = ThreadingHTTPServer(('127.0.0.1', puerto), partial(SinCache))
    print('Sirviendo en http://127.0.0.1:%d/  (sin cache)' % puerto)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print('\nParado.')
