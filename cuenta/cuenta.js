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
    document.querySelectorAll('.pnl-vista').forEach(function (a) {
      if (a.dataset.vista === v) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    /* Solo al cambiar, no al cargar: anunciar la vista inicial seria ruido
       encima de lo que ya se anuncia al terminar de cargar. */
    if (avisar) anuncio.textContent = (v === 'datos') ? 'Tus datos.' : 'Mis consultas.';
  }

  addEventListener('hashchange', function () { pintarVista(true); });


  /* ---------- SIN SESION NO HAY PAGINA ----------
     Se comprueba antes que nada. Enviar a entrar con ?volver hace que se
     regrese aqui, no a la portada. */
  if (!PSI.sesion.hay()) {
    location.replace('/entrar/?volver=' + encodeURIComponent('/cuenta/'));
    return;
  }

  /* El menú se dibuja antes de pintar la vista, porque pintarVista marca en él
     cuál está activa y no puede marcar lo que todavía no existe. */
  PANEL.montar('consultas');
  pintarVista(false);


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

  function modalidad(c) {
    return (c.modalidad === 'presencial' ? 'Presencial' : 'Online') +
           (c.duracion ? ' · ' + c.duracion + ' min' : '');
  }

  function gestionar(token) {
    return '../reservar/?cita=' + encodeURIComponent(token);
  }


  /* ---------- PINTAR ---------- */

  function clonar(id) { return $(id).content.firstElementChild.cloneNode(true); }

  /* La cita que toca. Es el dato por el que se entra en esta pagina, asi que es
     lo unico que se pinta entero y con superficie propia. */
  function pintarProxima(c) {
    var n = clonar('pProxima');
    var dia = FECHAS.diaEnZona(c.starts_at, zona);

    var t = n.querySelector('.js-dia');
    t.textContent = FECHAS.fechaLarga(dia) + ' · ' + FECHAS.hora(c.starts_at, zona);
    t.setAttribute('datetime', c.starts_at);

    /* La hora de Caracas solo cuando NO coincide con la de quien mira. Ponerla
       siempre seria ruido para quien ya esta en Venezuela, que es la mayoria. */
    if (zona !== FECHAS.ZONA_DARYELI) {
      var otra = n.querySelector('.js-caracas');
      otra.textContent = FECHAS.hora(c.starts_at, FECHAS.ZONA_DARYELI) + ' en Caracas';
      otra.hidden = false;
    }

    n.querySelector('.js-servicio').textContent = c.servicio;
    n.querySelector('.js-detalle').textContent  = modalidad(c);
    ponerMarca(n.querySelector('.js-estado'), etiqueta(c));

    /* Los dos botones van al mismo sitio: reservar/?cita= abre la cita con sus
       opciones de mover y cancelar. Se separan porque son dos intenciones
       distintas, y quien viene a mover no deberia tener que buscar. */
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
      /* Con el ano: sin el no se distingue la sesion del agosto pasado de la de
         este, y un historial sin anos deja de servir justo cuando se alarga. */
      t.textContent = FECHAS.fechaConAno(c.starts_at, zona) + ' · ' + FECHAS.hora(c.starts_at, zona);
      t.setAttribute('datetime', c.starts_at);

      n.querySelector('.js-servicio').textContent = c.servicio;
      ponerMarca(n.querySelector('.js-estado'), etiqueta(c));

      if (conEnlace) n.querySelector('.cta-fila-enlace').href = gestionar(c.token);
      frag.appendChild(n);
    });
    ul.appendChild(frag);
  }

  function pintarPaquetes(lista) {
    var ul = $('paquetes'), frag = document.createDocumentFragment();
    lista.forEach(function (p) {
      var n = clonar('pPaquete');
      n.querySelector('.js-nombre').textContent =
        p.nombre + ' · ' + (p.modalidad === 'pareja' ? 'Pareja' : 'Individual');

      var saldo = 'Te quedan ' + p.sesiones_libres + ' de ' + p.sesiones_total;
      if (p.caduca) {
        saldo += ' · ' + (new Date(p.caduca) < new Date() ? 'caducó el ' : 'caduca el ') +
                 FECHAS.fechaConAno(p.caduca, zona);
      }
      n.querySelector('.js-saldo').textContent = saldo;
      ponerMarca(n.querySelector('.js-estado'), etiquetaBono(p));

      /* Solo se ofrece usarlo si de verdad se puede: un enlace que lleva a una
         reserva que va a fallar es peor que no ponerlo. */
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
        $('bloqueHistorial').hidden = false;
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


  /* Cerrar sesión lo lleva panel.js, que es quien dibuja el botón. */

  arrancar();
})();
