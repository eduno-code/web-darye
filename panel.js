/* ============================================================
   EL MENÚ DEL PANEL

   Lo dibuja este archivo y no el HTML de cada página, a propósito: si estuviera
   escrito en cuenta/index.html y en reservar/index.html, añadir una entrada
   obligaría a acordarse de los dos, y el día que se olvide uno las dos páginas
   dejan de ser el mismo panel.

   SOLO SE DIBUJA SI HAY SESIÓN. Sin ella la página se queda como estaba: pasa
   en el asistente cuando alguien abre el enlace de su cita desde el correo, en
   un dispositivo donde no ha entrado. Ese camino tiene que seguir funcionando,
   y ahí la cabecera propia del asistente es su única marca y su única salida.

   Uso:  PANEL.montar('consultas' | 'datos' | 'reservar')
   Devuelve true si lo dibujó, para que quien llama pueda reaccionar — el
   asistente esconde su cabecera cuando el menú aparece.
   ============================================================ */
(function (global) {
  'use strict';

  /* Los iconos van escritos aquí y no como <use> de un sprite: si dependieran
     del sprite de cada página, el menú se rompería en la que se olvidara uno. */
  var I = {
    hoja: '<path d="M12 2.1A7.2 7.2 0 0 0 7.8 15.15c.55.4.8 1 .8 1.7v.75h6.8v-.75c0-.7.25-1.3.8-1.7A7.2 7.2 0 0 0 12 2.1Z"/><path d="M9 20h6M10.2 22.2h3.6"/>',
    mas: '<path d="M12 5v14M5 12h14"/>',
    lista: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3.5v3M16 3.5v3"/>',
    persona: '<circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 20a7.4 7.4 0 0 1 14.4 0"/>',
    salir: '<path d="M15 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v2M11 12h10M18 9l3 3-3 3"/>'
  };

  function ico(cual, grosor) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' +
           (grosor || 1.7) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
           I[cual] + '</svg>';
  }

  /* Las rutas se calculan desde la raíz del sitio y no en relativo: este archivo
     lo cargan páginas que están en carpetas distintas, y "../reservar/" solo
     acierta desde una de ellas. */
  function marcar(quien, activa) {
    return quien === activa ? ' aria-current="page"' : '';
  }

  function montar(activa) {
    if (!global.PSI || !PSI.sesion.hay()) return false;

    var hueco = document.getElementById('panelMenu');
    if (!hueco) return false;

    hueco.outerHTML =
      '<nav class="pnl-menu" aria-label="Tu cuenta">' +
        '<a class="pnl-marca" href="/index.html">' + ico('hoja', 1.25) +
          '<span>Psicconsciente</span></a>' +

        '<a class="pnl-reservar" href="/reservar/"' + marcar('reservar', activa) + '>' +
          ico('mas', 1.9) + '<span>Reservar cita</span></a>' +

        '<div class="pnl-vistas">' +
          '<a class="pnl-vista" href="/cuenta/#consultas" data-vista="consultas"' +
            marcar('consultas', activa) + '>' + ico('lista') +
            '<span>Mis consultas</span></a>' +
          '<a class="pnl-vista" href="/cuenta/#datos" data-vista="datos"' +
            marcar('datos', activa) + '>' + ico('persona') +
            '<span>Mis datos</span></a>' +
        '</div>' +

        '<button type="button" class="pnl-salir" id="salir">' + ico('salir') +
          '<span>Cerrar sesión</span></button>' +
      '</nav>';

    /* La rejilla solo es de dos columnas cuando hay menú que poner en la
       primera. Se marca en el contenedor para que lo decida el CSS. */
    var caja = document.querySelector('.pnl');
    if (caja) caja.dataset.menu = 'si';

    document.getElementById('salir').addEventListener('click', function () {
      PSI.sesion.salir().then(function () { location.href = '/index.html'; });
    });

    return true;
  }

  global.PANEL = { montar: montar };
})(window);
