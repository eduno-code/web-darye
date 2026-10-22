/* ============================================================
   MIS CONSULTAS

   Casi todo lo que hay aqui es presentacion. La logica de negocio —cancelar,
   reprogramar, pagar— ya vive en reservar/?cita=TOKEN, que es una pantalla
   completa de gestion de UNA cita y funciona desde antes de que existieran las
   cuentas. mis_consultas() devuelve el manage_token de cada cita, asi que esta
   pagina se limita a enlazar alli.

   Eso es deliberado: duplicar aqui el cancelar habria significado dos sitios
   que hay que acordarse de cambiar a la vez el dia que cambie la regla.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var anuncio = $('anuncio');
  var zona = FECHAS.zonaVisitante();

  var perfil = null;


  /* ---------- LAS DOS VISTAS ----------

     Se cambian con el #hash y NO interceptando el clic. La diferencia importa:
     con un enlace normal a #datos, el historial y el boton Atras los lleva el
     navegador, que ya sabe hacerlo. Interceptando habria que reimplementar los
     dos, y el Atras es de las cosas que mas se rompen al reimplementarlas.

     Los desvios por falta de sesion si usan location.replace, y ahi es lo
     correcto: no se debe poder volver atras a una pantalla que te echo. */
  var VISTAS = { consultas:'vConsultas', datos:'vDatos' };

  function cual() {
    var h = (location.hash || '').replace('#', '');
    return VISTAS[h] ? h : 'consultas';
  }

  function pintarVista(avisar) {
    var v = cual();
    Object.keys(VISTAS).forEach(function (k) { $(VISTAS[k]).hidden = (k !== v); });
    document.querySelectorAll('[data-vista]').forEach(function (a) {
      if (a.dataset.vista === v) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    /* Solo al cambiar, no al cargar: anunciar la vista inicial seria ruido
       encima de lo que ya se anuncia al terminar de cargar. */
    if (avisar) { anuncio.textContent = (v === 'datos') ? 'Tus datos.' : 'Mis consultas.'; window.scrollTo(0, 0); }
  }

  addEventListener('hashchange', function () { pintarVista(true); });


  /* ---------- SIN SESION NO HAY PAGINA ----------
     Se comprueba antes que nada. Enviar a entrar con ?volver hace que se
     regrese aqui, no a la portada. */
  if (!PSI.sesion.hay()) {
    location.replace('/entrar/?volver=' + encodeURIComponent('/cuenta/'));
    return;
  }

  pintarVista(false);

  (function () {
    var t = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', timeZone: zona }).format(new Date());
    $('hoy').textContent = t.charAt(0).toUpperCase() + t.slice(1);
  })();

  $('salir').addEventListener('click', function () {
    PSI.sesion.salir().then(function () { location.href = '/index.html'; });
  });


  /* ---------- COMO SE LLAMA CADA ESTADO ----------

     La etiqueta sale de DOS datos: el estado de la cita y el del pago. Es el
     motivo de haber ampliado mis_consultas(). Una cita de prepago sigue siendo
     'pending_payment' despues de que la persona declare su pago movil —solo
     cambia cuando Daryeli verifica el comprobante—, asi que mirar solo la cita
     le diria "Pendiente de pago" a alguien que ya pago. Suena a reproche y
     encima invita a pagar dos veces. */
  function etiqueta(c) {
    if (c.estado === 'pending_payment') {
      if (c.pago === 'declared') return ['Comprobante en revisión', 'pend'];
      if (c.pago === 'rejected') return ['Comprobante rechazado', 'mal'];
      return ['Pendiente de pago', 'pend'];
    }
    var mapa = {
      confirmed: ['Confirmada', 'ok'],
      completed: ['Completada', ''],
      no_show:   ['No asististe', ''],
      cancelled: ['Cancelada', ''],
      rejected:  ['Rechazada', 'mal']
    };
    return mapa[c.estado] || [c.estado, ''];
  }

  function etiquetaBono(p) {
    if (p.estado === 'pending_payment') {
      return p.pago === 'declared' ? ['Comprobante en revisión', 'pend']
                                   : ['Pendiente de pago', 'pend'];
    }
    var mapa = {
      active:    ['Activo', 'ok'],
      exhausted: ['Sin sesiones', ''],
      expired:   ['Caducado', ''],
      cancelled: ['Cancelado', ''],
      rejected:  ['Rechazado', 'mal']
    };
    return mapa[p.estado] || [p.estado, ''];
  }

  function ponerMarca(el, par) {
    el.textContent = par[0];
    if (par[1]) el.dataset.tono = par[1];
  }

  function gestionar(token) {
    return '../reservar/?cita=' + encodeURIComponent(token);
  }


  /* ---------- PINTAR ---------- */

  function clonar(id) { return $(id).content.firstElementChild.cloneNode(true); }

  function pintarProxima(c) {
    var n = clonar('pProxima');
    var dia = FECHAS.diaEnZona(c.starts_at, zona);
    var fecha = FECHAS.desdeYmd(dia);

    n.querySelector('.js-mes').textContent = new Intl.DateTimeFormat('es', { month: 'short' }).format(fecha).replace('.', '');
    n.querySelector('.js-num').textContent = fecha.getDate();
    n.querySelector('.js-sem').textContent = new Intl.DateTimeFormat('es', { weekday: 'long' }).format(fecha);
    n.querySelector('.js-servicio').textContent = c.servicio;

    var h = n.querySelector('.js-hora');
    h.textContent = FECHAS.hora(c.starts_at, zona);
    h.setAttribute('datetime', c.starts_at);
    var largo = FECHAS.fechaLarga(dia);
    n.querySelector('.js-cuando').textContent = ' · ' + largo.charAt(0).toUpperCase() + largo.slice(1);

    var presencial = c.modalidad === 'presencial';
    n.querySelector('.js-modo').innerHTML =
      '<svg class="ic" aria-hidden="true"><use href="#i-' + (presencial ? 'pin' : 'video') + '"/></svg>' +
      (presencial ? 'Presencial · Barquisimeto' : 'Online · videollamada') +
      (zona !== FECHAS.ZONA_DARYELI ? ' · ' + FECHAS.hora(c.starts_at, FECHAS.ZONA_DARYELI) + ' en Caracas' : '');

    var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    var dias = Math.round((fecha - hoy) / 86400000);
    var falta = dias <= 0 ? 'es hoy' : dias === 1 ? 'es mañana' : 'faltan ' + dias + ' días';
    n.querySelector('.js-falta span').textContent = (c.duracion ? c.duracion + ' minutos · ' : '') + falta;

    ponerMarca(n.querySelector('.js-estado'), etiqueta(c));
    n.querySelector('.js-mover').href     = gestionar(c.token);
    n.querySelector('.js-gestionar').href = gestionar(c.token);

    $('proxima').appendChild(n);
    $('bloqueProxima').hidden = false;
  }

  function pintarFilas(lista, destino, conEnlace) {
    var ul = $(destino), frag = document.createDocumentFragment();
    lista.forEach(function (c) {
      var n = clonar(conEnlace ? 'pFila' : 'pFilaQuieta');
      var t = n.querySelector('.js-dia');
      t.textContent = FECHAS.fechaConAno(c.starts_at, zona) + ' · ' + FECHAS.hora(c.starts_at, zona);
      t.setAttribute('datetime', c.starts_at);
      n.querySelector('.js-servicio').textContent = c.servicio +
        (c.modalidad ? ' · ' + (c.modalidad === 'presencial' ? 'Presencial' : 'Online') : '');
      ponerMarca(n.querySelector('.js-estado'), etiqueta(c));
      if (conEnlace) n.querySelector('.fila').href = gestionar(c.token);
      frag.appendChild(n);
    });
    ul.appendChild(frag);
  }

  function pintarPaquetes(lista) {
    var ul = $('paquetes'), frag = document.createDocumentFragment();
    lista.forEach(function (p) {
      var n = clonar('pPaquete');
      n.querySelector('.js-nombre').textContent = p.nombre + (p.modalidad === 'pareja' ? ' · Pareja' : '');
      n.querySelector('.js-libres').textContent = p.sesiones_libres;
      n.querySelector('.js-libres-txt').textContent = ' de ' + p.sesiones_total + ' por agendar';
      var usadas = p.sesiones_total ? (p.sesiones_total - p.sesiones_libres) / p.sesiones_total : 0;
      n.querySelector('.js-medidor').style.width = Math.round(usadas * 100) + '%';

      var saldo = '';
      if (p.caduca) {
        var cad = new Date(p.caduca), hoy = new Date();
        var dias = Math.ceil((cad - hoy) / 86400000);
        saldo = dias < 0 ? 'Caducó el ' + FECHAS.fechaConAno(p.caduca, zona)
              : dias <= 60 ? 'Vence en ' + dias + (dias === 1 ? ' día' : ' días')
              : 'Vence el ' + FECHAS.fechaConAno(p.caduca, zona);
      }
      n.querySelector('.js-saldo').textContent = saldo;
      ponerMarca(n.querySelector('.js-estado'), etiquetaBono(p));

      if (!(p.estado === 'active' && p.sesiones_libres > 0)) {
        n.querySelector('.js-usar').remove();
      }
      frag.appendChild(n);
    });
    ul.appendChild(frag);
    $('bloquePaquetes').hidden = false;
  }

  function pintarFicha() {
    $('fNombre').textContent = perfil.nombre;
    $('fCorreo').textContent = perfil.correo;
    $('fTel').textContent    = perfil.telefono;
    $('saludo').textContent  = 'Hola, ' + perfil.nombre.split(' ')[0];
    var ini = perfil.nombre.trim().split(/\s+/).slice(0, 2).map(function (x) { return x.charAt(0); }).join('').toUpperCase();
    ['avatar', 'avatarMovil'].forEach(function (id) {
      $(id).textContent = ini;
      $(id).setAttribute('aria-label', 'Tus datos: ' + perfil.nombre);
    });
  }


  /* ---------- CARGAR ---------- */

  function aEntrar() {
    location.replace('/entrar/?volver=' + encodeURIComponent('/cuenta/'));
  }

  function arrancar(reintento) {
    Promise.all([
      PSI.rpc('mi_perfil'),
      PSI.rpc('mis_consultas'),
      PSI.rpc('mis_paquetes')
    ]).then(function (r) {
      var p = r[0], c = r[1], q = r[2];

      /* Sesion caducada entre cargar la pagina y responder: a entrar, y de
         vuelta aqui. */
      if ((p && p.error === 'not_signed_in') || (c && c.error === 'not_signed_in')) {
        aEntrar();
        return;
      }

      /* HAY SESION PERO NO HAY FICHA. Pasa de dos maneras, y las dos tienen
         arreglo:

         · El registro creo la cuenta y la llamada que monta la ficha se perdio
           por el camino. Se repara sola llamando otra vez, que para eso
           asegurar_mi_ficha() es idempotente y lee los datos del propio
           registro.
         · La sesion guardada en este navegador es de una cuenta que ya no
           existe. El token sigue siendo valido —un JWT no se entera de que
           borraron al usuario— asi que la pagina cree que hay sesion. Ahi el
           arreglo falla, y entonces lo que toca es limpiar y mandar a entrar.

         Sin esto, las dos acababan en "no pudimos cargar" y sin salida. */
      if (p && p.error === 'perfil_incompleto' && !reintento) {
        PSI.sesion.asegurarFicha().then(function (f) {
          if (f && f.ok) { arrancar(true); return; }
          PSI.sesion.salir().then(aEntrar);
        });
        return;
      }
      if (p && p.error === 'perfil_incompleto') { PSI.sesion.salir().then(aEntrar); return; }

      if (!p || !p.ok || !c || !c.ok) {
        $('cargando').textContent = 'No pudimos cargar tus consultas. Recarga la página, por favor.';
        return;
      }

      perfil = p;
      $('cargando').hidden = true;

      var proximas = c.proximas || [];
      var pasadas  = c.pasadas  || [];
      var bonos    = (q && q.ok && q.paquetes) ? q.paquetes : [];

      /* Nada de nada: una frase y la accion. Una pagina con cuatro secciones
         vacias es peor que una linea que diga la verdad. */
      if (!proximas.length && !pasadas.length && !bonos.length) {
        $('vacio').hidden = false;
        anuncio.textContent = 'Todavía no tienes consultas.';
        return;
      }

      $('contenido').hidden = false;
      pintarFicha();

      if (!proximas.length) $('sinProxima').hidden = false;
      if (proximas.length) {
        pintarProxima(proximas[0]);
        if (proximas.length > 1) {
          pintarFilas(proximas.slice(1), 'otras', true);
          $('bloqueOtras').hidden = false;
        }
      }

      if (bonos.length)   pintarPaquetes(bonos);

      if (pasadas.length) {
        pintarFilas(pasadas, 'historial', false);
        $('histCuantas').innerHTML = pasadas.length + '<small>' + (pasadas.length === 1 ? 'consulta' : 'consultas') + '</small>';
        $('histUltima').textContent = 'Última: ' + FECHAS.fechaConAno(pasadas[0].starts_at, zona);
        $('bloqueHistorial').hidden = false;
        if (window.matchMedia('(min-width:44rem)').matches) $('bloqueHistorial').open = true;
      }

      anuncio.textContent = proximas.length
        ? 'Tu próxima consulta es el ' +
          FECHAS.fechaLarga(FECHAS.diaEnZona(proximas[0].starts_at, zona)) + '.'
        : 'No tienes consultas próximas.';
    });
  }


  /* ---------- CORREGIR LOS DATOS ---------- */

  function error(campo, hueco, texto) {
    var e = $(hueco);
    e.textContent = texto || '';
    e.hidden = !texto;
    if (campo) $(campo).setAttribute('aria-invalid', texto ? 'true' : 'false');
  }

  function validar() {
    var ok = true, primero = null;
    var n = $('nombre').value.trim(), t = $('telefono').value.trim();

    if (n.length < 2) { error('nombre', 'errNombre', 'Escribe tu nombre y apellido.'); ok = false; primero = 'nombre'; }
    else error('nombre', 'errNombre', null);

    /* Los mismos limites que la base: entre 7 y 20 caracteres. Comprobarlo aqui
       no es desconfiar del servidor, es no hacer un viaje para que lo diga el. */
    if (t.replace(/[^0-9]/g, '').length < 7 || t.length > 20) {
      error('telefono', 'errTelefono', 'Escribe tu número completo, con el código de país.');
      ok = false; primero = primero || 'telefono';
    } else error('telefono', 'errTelefono', null);

    if (!ok && primero) $(primero).focus();
    return ok;
  }

  function verEdicion(abierta) {
    $('fichaResumen').hidden = abierta;
    $('camposDatos').hidden  = !abierta;
    if (abierta) $('nombre').focus();
    else $('corregir').focus();
  }

  $('corregir').addEventListener('click', function () {
    if (!perfil) return;
    $('nombre').value   = perfil.nombre;
    $('telefono').value = perfil.telefono;
    error('nombre', 'errNombre', null);
    error('telefono', 'errTelefono', null);
    $('errGuardar').hidden = true;
    verEdicion(true);
  });

  $('cancelarDatos').addEventListener('click', function () { verEdicion(false); });

  $('camposDatos').addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (!validar()) return;

    var b = $('guardarDatos');
    b.disabled = true;
    b.textContent = 'Guardando…';

    var nuevos = {
      nombre:   $('nombre').value.trim(),
      telefono: $('telefono').value.trim(),
      /* Se reenvian los dos que aqui no se editan: lo que se manda SUSTITUYE a
         lo que habia, asi que omitirlos borraria la nacionalidad y el pais, que
         son los que deciden la tarifa. */
      nacionalidad: perfil.nacionalidad,
      pais:         perfil.pais
    };

    PSI.sesion.actualizarDatos(nuevos).then(function (r) {
      b.disabled = false;
      b.textContent = 'Guardar';

      if (!r || !r.ok) {
        $('errGuardar').textContent = (r && r.message) || 'No pudimos guardar los cambios.';
        $('errGuardar').hidden = false;
        return;
      }
      perfil.nombre   = nuevos.nombre;
      perfil.telefono = nuevos.telefono;
      pintarFicha();
      verEdicion(false);
      anuncio.textContent = 'Datos actualizados.';
    });
  });


  arrancar();
})();
