/* ============================================================
   RESERVA DE CITAS — Psicconsciente

   Tres decisiones gobiernan este archivo:

   1. SE VEN VARIOS DÍAS A LA VEZ. El patrón viene de las agendas médicas:
      columnas de días con sus horas debajo. Elegir cuándo es UNA decisión que
      se toma comparando, y separarla en "primero el día, luego la hora"
      obliga a ir y volver.

   2. EL ESTADO SOBREVIVE. En el paso 4 la persona se va a la app de su banco,
      y el teléfono puede descartar la pestaña mientras tanto. Todo se guarda
      en sessionStorage y se restaura al volver.

   3. EL SERVIDOR MANDA. Aquí no se calcula ningún precio ni se decide qué
      hueco está libre: se pregunta. Este archivo solo pinta las respuestas.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- EL MENU DEL PANEL ----------

     Si hay sesion, el asistente deja de ser una pagina suelta y pasa a estar
     DENTRO de la cuenta, con el mismo menu a la izquierda. Antes, pulsar
     "Reservar cita" desde el panel te dejaba en una pantalla sin menu y con
     otra cabecera: se sentia como salir del sitio en el paso mas importante.

     Y entonces la cabecera propia -la foto de Daryeli y "Tengo una duda"- se
     esconde: ya estas dentro de tu cuenta, no te estan presentando a nadie, y
     dos barras apiladas se roban la altura del primer paso.

     Sin sesion no se toca nada. Ese es el caso de quien abre el enlace de su
     cita desde el correo en otro dispositivo, y ahi esa cabecera es su unica
     marca y su unica salida de vuelta al sitio. */
  if (window.PANEL && PANEL.montar('reservar')) {
    var cab = document.querySelector('header.top');
    if (cab) cab.hidden = true;
    /* Y el pie por lo mismo: repite la marca que ya esta arriba a la izquierda
       en el menu. Sin sesion se queda, porque entonces es la unica firma de la
       pagina y donde vive el enlace a privacidad. */
    var pie = document.querySelector('footer.wz-pie');
    if (pie) pie.hidden = true;

  } else {
    /* RED DE SEGURIDAD. El script del <head> marco `data-sesion="si"` leyendo
       localStorage, pero el menu no ha montado: o no hay sesion valida de
       verdad, o algo fallo. Se retira la marca para que la cabecera y el pie
       vuelvan, porque si no, quien tenga una sesion guardada y un fallo al
       montar se queda sin navegacion ninguna. */
    delete document.documentElement.dataset.sesion;
  }

  var CLAVE = 'psi_reserva_v2';
  var ZONA_DARYELI = FECHAS.ZONA_DARYELI;
  /* LAS TRES FRANJAS DEL DIA. Los cortes salen del idioma y de los datos, no
     de dividir el dia en tres partes iguales: las 12:00 son manana en espanol
     —es mediodia—, asi que el corte va DESPUES de las 12.

     Con la agenda real de Daryeli esto reparte 09-12 en manana, 13-17 en tarde
     y 19-21 en noche, y el salto de las 18:00 cae exactamente en la frontera
     entre tarde y noche en vez de partir un grupo por la mitad.

     Doce huecos en una sola columna son una lista que hay que leer entera; en
     tres franjas se ven de un vistazo. */
  var FRANJAS = [
    /* MADRUGADA EXISTE por las zonas de fuera, y salio al probar con Madrid:
       un hueco de las 19:00 de Caracas es la 01:00 en Espana, y con "Mañana"
       empezando a medianoche salia etiquetado como mañana. La 1 de la madrugada
       no es la mañana en ningun sitio.

       No estorba a quien esta en Venezuela: las franjas vacias no se pintan, y
       la agenda de Daryeli no tiene huecos antes de las 9. */
    { nombre: 'Madrugada', desde: 0,  hasta: 6  },
    { nombre: 'Mañana',    desde: 6,  hasta: 13 },
    { nombre: 'Tarde',     desde: 13, hasta: 19 },
    { nombre: 'Noche',     desde: 19, hasta: 24 }
  ];

  var estado = {
    paso: 1,
    /* `modo` NACE VACIO. Venia con 'online' puesto, y eso rompia la apertura
       progresiva: el bloque de las terapias se abre al ELEGIR modalidad, y con
       una ya elegida sin que la persona toque nada se abria de entrada.

       OJO, porque esto tiene consecuencia fuera de la pantalla: `modo` viaja al
       servidor como `p_mode` al pedir los huecos y al reservar. No puede salir
       en nulo, y el guardian es `estadoPestanas()`, que exige los tres para
       abrir el paso 2. Al paso 2 no se llega sin modalidad. */
    modo: null, servicio: null, plan: null,
    hora: null, zona: null,
    token: null, tokenPaquete: null,
    vence: null, importe: null, resumen: null,
    prepago: false, momento: 'ahora',
    reprogramando: null
  };

  var catalogo = { servicios: [], paquetes: [], bancos: [] };
  var mesVisible = null;       // Date del dia 1 del mes que se esta viendo
  var diaElegido = null;        // 'AAAA-MM-DD' en la zona de quien mira
  var huecos = {};             // 'AAAA-MM-DD' -> [iso, iso...]
  var reloj = null;
  var archivo = null;
  var consultorio = null;   // dirección de la consulta, para las citas presenciales
  var tasa = null;          // tasa del BCV: { rate, at, source }


  var $ = function (id) { return document.getElementById(id); };

  /* ---------- ESTADO ---------- */
  function guardar() { try { sessionStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (e) {} }
  function restaurar() {
    try {
      var c = sessionStorage.getItem(CLAVE);
      if (!c) return;
      var g = JSON.parse(c);
      for (var k in g) if (g.hasOwnProperty(k)) estado[k] = g[k];
    } catch (e) {}
  }
  function limpiar() { try { sessionStorage.removeItem(CLAVE); } catch (e) {} }

  /* ---------- FECHAS ---------- */

  /* Viven en ../fechas.js desde que la pantalla de la cuenta las necesita
     tambien. Se traen como locales con el mismo nombre para no tocar las
     llamadas repartidas por el resto del archivo. */
  var zonaVisitante = FECHAS.zonaVisitante,
      hora          = FECHAS.hora,
      diaEnZona     = FECHAS.diaEnZona,
      ymd           = FECHAS.ymd,
      desdeYmd      = FECHAS.desdeYmd,
      sumaDias      = FECHAS.sumaDias,
      fechaLarga    = FECHAS.fechaLarga,
      fechaCorta    = FECHAS.fechaCorta,
      dinero        = FECHAS.dinero;

  /* ---------- NAVEGACIÓN ---------- */
  /* Tres pasos desde que "Tus datos" dejo de ser uno: lo unico suyo era el
     consentimiento, y eso vive ahora junto al boton de reservar. */
  var VISTAS = { 1: 'vista1', 2: 'vista2', 3: 'vista3', fin: 'vistaFin' };
  var NOMBRES = { 1: 'Tu sesión', 2: 'Día y hora', 3: 'Pago', fin: 'Listo' };

  function mostrar(paso, empujar) {
    Object.keys(VISTAS).forEach(function (k) {
      var v = $(VISTAS[k]);
      if (v) v.hidden = String(k) !== String(paso);
    });
    estado.paso = paso;
    /* La barra fija del movil es del PASO 1: lleva "Ver horarios". Sin esta
       marca se quedaba pegada abajo en los pasos 2, 3 y 4 con un boton muerto,
       tapando ademas el ultimo renglon de cada pantalla. El CSS la muestra solo
       cuando este atributo vale 1. */
    document.body.dataset.paso = paso;
    guardar();

    sincronizarPestanas();

    /* El titular del paso 1 ya no esta DENTRO de su vista: subio a la cabeza
       de la pantalla, encima de las pestañas. Los pasos 2 y 3 aun tienen el
       suyo dentro porque se rediseñan aparte, asi que se busca primero ahi y
       se cae al titular de la pantalla cuando la vista no trae ninguno. Sin
       esta caida, el paso 1 se quedaba sin mover el foco ni anunciarse. */
    var h = document.querySelector('#' + VISTAS[paso] + ' h1') || $('t1');
    if (h) {
      $('anuncio').textContent = h.textContent;
      // El foco va al titular para que el lector de pantalla lea el paso nuevo
      // en vez de quedarse donde estaba el botón pulsado.
      h.setAttribute('tabindex', '-1');
      h.focus({ preventScroll: true });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (empujar !== false) history.pushState({ paso: paso }, '', '?paso=' + paso);
  }

  /* ---------- LAS PESTANAS ----------

     QUIEN SE ABRE Y CUANDO. Las reglas no son de diseno, salen del flujo:

       · "Reserva" siempre, mientras no exista la cita.
       · "Fecha" cuando hay motivo Y consultas elegidas. Es la misma condicion
         que ya gobernaba el boton "Ver horarios" (`refrescarBoton`), asi que no
         se inventa una segunda verdad: se lee la misma.
       · "Pago" solo cuando la cita EXISTE, porque el paso 3 no es alcanzable
         antes —se llega a el despues de `create_booking`.

     Y EN CUANTO EXISTE LA CITA, los dos primeros se cierran. El cupo esta
     tomado: volver atras ya no es editar, es reprogramar o cancelar, que son
     otras dos cosas con su propia pantalla. Es la misma guarda que `popstate`
     tenia desde antes; aqui solo se hace visible.

     `data-hecha` marca los pasos contestados —ensena el visto— y es
     independiente de si se pueden pulsar: un paso puede estar hecho y cerrado. */
  function estadoPestanas() {
    /* UNA SOLA VERDAD para "el paso 1 esta contestado": la usan las pestanas,
       el boton de seguir y el aviso de lo que falta. Si estuviera escrita en
       tres sitios, tarde o temprano dirian cosas distintas.

       `modo` entra en la cuenta desde que dejo de venir preelegido, y ademas es
       lo que impide que el paso 2 pida huecos con `p_mode` en nulo. */
    var listo = !!(estado.modo && estado.servicio && estado.plan);
    var hecha = !!estado.token;
    return {
      1: { abre: !hecha,  hecha: listo },
      2: { abre: !hecha && listo, hecha: hecha },
      3: { abre: hecha,   hecha: false }
    };
  }

  function sincronizarPestanas() {
    var st = estadoPestanas();
    var n = estado.paso === 'fin' ? 3 : Number(estado.paso);

    [1, 2, 3].forEach(function (i) {
      var b = $('pest' + i); if (!b) return;
      b.setAttribute('aria-selected', String(i === n));
      /* `aria-disabled` y no `disabled`: un boton desactivado de verdad sale
         del orden de tabulacion, y en un tablist se espera poder recorrer las
         tres con las flechas aunque alguna no se pueda abrir. */
      if (st[i].abre) b.removeAttribute('aria-disabled');
      else b.setAttribute('aria-disabled', 'true');
      if (st[i].hecha) b.dataset.hecha = 'si'; else delete b.dataset.hecha;
      b.tabIndex = i === n ? 0 : -1;
    });
  }

  function irAPestana(i) {
    if (!estadoPestanas()[i].abre) return;
    if (String(i) === String(estado.paso)) return;
    mostrar(i);
  }

  document.addEventListener('click', function (ev) {
    if (!ev.target.closest) return;
    var b = ev.target.closest('.pest');
    if (b) irAPestana(Number(b.dataset.p));
  });

  /* Flechas, Inicio y Fin: es lo que pide el patron de tablist y lo que espera
     quien navega con teclado. Solo se mueve entre las que se pueden abrir. */
  document.addEventListener('keydown', function (ev) {
    if (!ev.target.closest) return;
    var b = ev.target.closest('.pest'); if (!b) return;
    var abiertas = [1, 2, 3].filter(function (i) { return estadoPestanas()[i].abre; });
    if (!abiertas.length) return;
    var aqui = abiertas.indexOf(Number(b.dataset.p));
    var i = null;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') i = abiertas[(aqui + 1 + abiertas.length) % abiertas.length];
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') i = abiertas[(aqui - 1 + abiertas.length) % abiertas.length];
    else if (ev.key === 'Home') i = abiertas[0];
    else if (ev.key === 'End') i = abiertas[abiertas.length - 1];
    if (i === null) return;
    ev.preventDefault();
    irAPestana(i);
    var d = $('pest' + i); if (d) d.focus();
  });

  window.addEventListener('popstate', function (ev) {
    var p = (ev.state && ev.state.paso) || 1;
    // Con la reserva ya creada no se vuelve atrás: el cupo está tomado y
    // rehacer el paso 3 crearía una segunda cita.
    if (estado.token && p < 3) { mostrar(3, false); return; }
    mostrar(p, false);
  });

  /* ---------- CATÁLOGO ----------

     `fallos` guarda qué tablas no se pudieron leer. Hace falta porque
     `PSI.tabla()` ahora rechaza cuando falla en vez de devolver una lista
     vacía: un vacío de verdad y un error dejaron de parecer lo mismo.

     Cada lectura se envuelve para que un fallo en una NO tumbe las demás —los
     bancos solo hacen falta en el paso del pago, y que no lleguen no es motivo
     para dejar sin reservar a nadie—, pero el fallo queda anotado y la
     pantalla lo dice. Media lista nunca se ofrece como si fuera la lista. */
  var fallos = [];

  function pedir(nombre, columnas, orden) {
    return PSI.tabla(nombre, columnas, orden).catch(function () {
      if (fallos.indexOf(nombre) < 0) fallos.push(nombre);
      return [];
    });
  }

  function cargarCatalogo() {
    fallos = [];
    return Promise.all([
      pedir('services', 'id,slug,name,duration_min,price_usd,sort_order', 'sort_order.asc'),
      pedir('packages', 'id,slug,name,modality,sessions_count,price_usd,valid_days,sort_order', 'sort_order.asc'),
      pedir('banks', 'code,name', 'sort_order.asc'),
      PSI.rpc('get_consultorio', {}),
      PSI.rpc('get_exchange_rate', {})
    ]).then(function (r) {
      catalogo.servicios = r[0] || [];
      catalogo.paquetes  = r[1] || [];
      catalogo.bancos    = r[2] || [];
      consultorio        = r[3] && r[3].address ? r[3] : null;
      tasa               = r[4] && r[4].rate ? r[4] : null;
    });
  }
  function servicio() { return catalogo.servicios.filter(function (s) { return s.slug === estado.servicio; })[0] || null; }
  function paquete() {
    if (!estado.plan || estado.plan === '1') return null;
    return catalogo.paquetes.filter(function (p) { return p.slug === estado.plan; })[0] || null;
  }
  function modalidad() { var s = servicio(); return s ? (s.slug === 'pareja' ? 'pareja' : 'individual') : null; }
  function importe() { var p = paquete(); if (p) return Number(p.price_usd); var s = servicio(); return s ? Number(s.price_usd) : 0; }


  /* ============================================================
     PASO 1 — portado de la maqueta

     Un cambio de fondo respecto a agosto: los motivos dejan de ser un <select>
     y vuelven a ser filas con foto. La razon de agosto para el desplegable era
     buena —cuatro tarjetas ocupaban media pantalla para una eleccion que la
     persona trae decidida de casa— y la maqueta la resuelve por otro lado: en
     movil son una LISTA de filas de 56 px, que ocupa menos que las cuatro
     tarjetas y menos que el desplegable abierto, y solo en escritorio, donde
     sobra sitio, se despliegan en tres columnas.

     Y la diferencia deliberada con la maqueta: alli los cuatro motivos y los
     tres precios estaban escritos a mano; aqui salen de Supabase. Se ven igual,
     cambia de donde vienen los datos.
     ============================================================ */

  /* La pantalla final sigue construyendo su caja en JavaScript: alli el lugar
     aparece dentro de un resumen que solo existe despues de reservar, asi que no
     hay marcado fijo donde meterlo. Usa las reglas .wz-lugar, que se quedan. */
  function tarjetaLugar() {
    if (!consultorio) return '';
    var l = consultorio;
    var ir = l.maps_url ||
      ('https://www.google.com/maps/search/?api=1&query=' +
       encodeURIComponent([l.name, l.address, l.city].filter(Boolean).join(', ')));
    return '<div class="wz-lugar">' +
      '<div class="wz-lugar-cab">' +
        '<span class="wz-lugar-icono" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/></svg>' +
        '</span>' +
        '<span class="wz-lugar-nombre">' + (l.name || 'Consulta') + '</span>' +
      '</div>' +
      '<div class="wz-lugar-cuerpo">' +
        '<p class="wz-lugar-dir">' + [l.address, l.city, l.reference].filter(Boolean).join('<br>') + '</p>' +
        '<a class="wz-lugar-ir" href="' + ir + '" target="_blank" rel="noopener noreferrer">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11 21 3l-8 18-2-7-8-3Z"/></svg>' +
          'Como llegar<span class="sr-only"> (abre tu aplicacion de mapas)</span>' +
        '</a>' +
      '</div>' +
    '</div>';
  }

  /* ---------- DONDE ES LA CITA ---------- */
  /* La caja ya no se construye en JavaScript: vive en el marcado, que es donde
     se puede leer. Aqui solo se le meten los datos de la base cuando los hay.
     Si la llamada falla, se queda lo que esta escrito en el HTML en vez de
     dejar un hueco: una direccion algo desactualizada sirve mas que ninguna. */
  function pintarLugar() {
    if (!consultorio) return;
    var l = consultorio;
    /* La cabecera con su clase propia desaparecio: la nota es ahora una sola
       linea de texto con el nombre en negrita dentro. */
    var nom = document.querySelector('#lugar strong');
    var dir = document.querySelector('#lugar .lugar-dir');
    var ir  = $('lugarIr');
    if (nom && l.name) nom.textContent = l.name;
    if (dir) {
      /* EN UNA SOLA LINEA, no una por dato. Decision de Edgar: partida en dos
         lineas cortas dejaba 194 px muertos a la derecha de la columna, casi la
         mitad. Corrida, el texto usa el ancho y el hueco desaparece.

         Se une con ". " y no con ", " porque son datos de distinto nivel -calle,
         ciudad, referencia- y la coma los encadenaria como si fueran una lista
         de la misma cosa. Si la direccion crece, vuelve a partirse sola y no se
         rompe nada. */
      var lineas = [l.address, l.city, l.reference].filter(Boolean);
      if (lineas.length) dir.textContent = lineas.join('. ') + '.';
    }
    /* Un mapa incrustado se come la pantalla del movil y no lleva a ningun
       sitio. Un boton que abre la app de mapas del telefono si traza la ruta,
       que es lo que de verdad necesita quien tiene que desplazarse. */
    if (ir) {
      ir.href = l.maps_url ||
        ('https://www.google.com/maps/search/?api=1&query=' +
         encodeURIComponent([l.name, l.address, l.city].filter(Boolean).join(', ')));
    }
  }

  /* Los nombres de los motivos vienen de la base y se pintan como texto, no
     como marcado. Escapar no es paranoia de manual: es lo que separa "meter un
     dato" de "dejar que un dato escriba HTML". */
  function escapar(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  function ico(n) {
    return '<svg class="ico" aria-hidden="true"><use href="#i-' + n + '"/></svg>';
  }

  /* ---------- CUANDO EL CATÁLOGO NO LLEGA ----------

     Lo que NO se hace: seguir como si nada con lo que sí llegó. Si faltan los
     paquetes, las opciones de consulta que se ven son una parte de las que hay,
     y la persona elegiría creyendo que ve todo.

     El aviso va donde falta el dato —dentro de la pregunta afectada— y no en
     una franja arriba: así se lee en el momento de decidir, que es cuando
     importa. Y trae un botón, porque un aviso sin salida solo informa de que
     te has quedado atascado.                                                */

  function fallo(tabla) {
    return fallos.indexOf(tabla) >= 0;
  }

  function avisoFallo(que) {
    return '<p class="fallo-catalogo">' +
             '<span>No pudimos cargar ' + que + '.</span>' +
             '<button type="button" class="fallo-otra" data-recargar="1">' +
               'Volver a intentarlo</button>' +
           '</p>';
  }

  /* Reintenta la carga entera y repinta. Se vuelve a leer todo y no solo lo que
     falló: son tres lecturas pequeñas, y pedir el conjunto deja el catálogo
     coherente en vez de mezclar datos de dos momentos distintos. */
  document.addEventListener('click', function (ev) {
    if (!ev.target.closest || !ev.target.closest('[data-recargar]')) return;
    var b = ev.target.closest('[data-recargar]');
    b.disabled = true;
    b.textContent = 'Cargando…';
    cargarCatalogo().then(function () {
      pintarModos();
      pintarServicios();
      pintarLugar();
      if (estado.servicio) pintarPlanes();
      refrescarBoton();
    });
  });

  /* ---------- LA FILA DE UNA OPCION ----------

     Es la misma forma para las tres preguntas, asi que se escribe una vez: un
     `label` con el radio NATIVO dentro, el punto que lo dibuja, y el nombre.

     EL RADIO ESTA ESCONDIDO PERO PRESENTE -un pixel y opacidad cero, nunca
     `display:none`-, porque asi sigue recibiendo el foco y el teclado. El punto
     que se ve es un `span` vacio que el CSS pinta segun `:checked`.

     Esto es lo que borro las 45 lineas de la version anterior: las flechas, el
     Inicio y el Fin, el tabulador unico del grupo, el estado y el nombre
     accesible los da el navegador. Antes se hacian a mano con
     `button role="radio"`, `aria-checked` y un roving tabindex.               */

  function fila(grupo, valor, nombre, elegido) {
    return '<label class="op">' +
             '<input type="radio" name="' + grupo + '" value="' + escapar(valor) + '"' +
               (elegido ? ' checked' : '') + '>' +
             '<span class="dot" aria-hidden="true"></span>' +
             '<span>' + escapar(nombre) + '</span>' +
           '</label>';
  }

  /* ---------- COMO QUIERES TU CONSULTA ---------- */

  var MODOS = [
    { v: 'online',     n: 'En línea',   nota: 'notaOnline' },
    { v: 'presencial', n: 'Presencial', nota: 'lugar' }
  ];

  function pintarModos() {
    var g = $('gModos'); if (!g) return;
    g.innerHTML = MODOS.map(function (m) {
      return fila('modo', m.v, m.n, estado.modo === m.v);
    }).join('');
    pintarNotaModo();
  }

  /* La duracion sale de `duration_min` en `services`, y SOLO se escribe si las
     cuatro terapias coinciden. El motivo es de orden: la modalidad se elige
     ANTES que la terapia, asi que en ese momento no hay una duracion concreta
     que decir. Hoy las cuatro son de 60 minutos; si algun dia dejan de serlo,
     se queda lo escrito en el HTML en vez de dar un numero que puede no ser el
     de la sesion que la persona acabe eligiendo. */
  function duracionComun() {
    var ds = (catalogo.servicios || [])
      .map(function (x) { return Number(x.duration_min); })
      .filter(function (n) { return n > 0; });
    if (!ds.length) return null;
    for (var i = 1; i < ds.length; i++) if (ds[i] !== ds[0]) return null;
    return ds[0];
  }

  /* LAS DOS NOTAS VIVEN EN EL HTML y aqui solo se decide cual se ve. Se podrian
     construir enteras en JavaScript, pero entonces un fallo de la llamada a la
     base dejaria la direccion en blanco. Escritas en el marcado, si la llamada
     falla se queda lo que hay puesto, y una direccion algo desactualizada sirve
     mas que ninguna. */
  function pintarNotaModo() {
    /* La duracion se escribe en LOS DOS paneles. Antes solo la decia el de en
       linea, siendo el mismo dato y necesitandolo igual quien va a desplazarse
       hasta el consultorio. Se marcan con `data-min` en el marcado en vez de
       con un id cada uno: son el mismo dato en dos sitios, y un dia podrian ser
       tres. */
    var d = duracionComun();
    if (d) {
      var minutos = document.querySelectorAll('#vista1 [data-min]');
      for (var i = 0; i < minutos.length; i++) {
        minutos[i].textContent = d + ' minutos';
      }
    }

    MODOS.forEach(function (m) {
      var caja = $(m.nota);
      if (caja) caja.hidden = estado.modo !== m.v;
    });
  }

  /* ---------- QUE QUIERES TRABAJAR ---------- */
  /* SIN FOTOS. Habia una por motivo -ansiedad, autoestima, pareja, duelo- y se
     fueron las cuatro: no ayudaban a elegir y eran lo que engordaba la
     pantalla. Ninguna referencia del sector usa foto de archivo para escoger
     servicio.

     Y no se sustituyen por un icono ni por un disco de color. El nombre que
     viene de la base ya dice lo que hay que saber -"Superar la Ansiedad",
     "Sanar en Pareja"-, asi que la opcion es el nombre y nada mas. Los .webp
     siguen en el repositorio por si vuelven a hacer falta en otra pantalla. */
  function pintarServicios() {
    var g = $('gServ'); if (!g) return;

    /* Sin servicios no hay nada que elegir, asi que aqui el aviso SUSTITUYE a
       la lista: antes se quedaba un hueco vacio y la persona no tenia forma de
       saber si es que no habia terapias o si algo se habia roto. */
    if (fallo('services') && !(catalogo.servicios || []).length) {
      g.innerHTML = avisoFallo('las terapias');
      return;
    }

    g.innerHTML = (catalogo.servicios || []).map(function (x) {
      return fila('servicio', x.slug, x.name, estado.servicio === x.slug);
    }).join('');
  }

  /* ---------- CONSULTA O PAQUETE ---------- */

  /* Devuelve las opciones de consulta del servicio elegido: la suelta, que sale
     del propio servicio, y los paquetes de su modalidad -que aqui significa
     individual o pareja, no en linea o presencial-. */
  function opcionesPlan() {
    var sv = servicio(), m = modalidad();
    if (!sv || !m) return [];

    /* "1" con cifra y no "Una": al lado de "3" y "5", la palabra rompe la
       comparacion que la persona esta haciendo, que es entre numeros.

       LOS 30 DIAS SON PROVISIONALES Y ESTAN ESCRITOS A MANO. La base no los
       tiene: `valid_days` solo existe en `packages`, y una consulta suelta no es
       un paquete. Decision de Edgar para verlo funcionando, con el acuerdo de
       llevarlo a Supabase cuando esten las tres vistas. Hace falta antes
       confirmar la cifra con Daryeli: el plazo real de una consulta suelta es
       una decision suya, no tecnica. */
    var lista = [{
      slug: '1', cifra: '1', nom: 'Consulta',
      precio: Number(sv.price_usd), ahorro: 0, dias: 30
    }];

    (catalogo.paquetes || []).filter(function (x) { return x.modality === m; })
      .forEach(function (x) {
        var por = Number(x.price_usd) / x.sessions_count;
        lista.push({
          slug: x.slug,
          cifra: String(x.sessions_count),
          nom: 'Consultas',
          precio: Number(x.price_usd),
          ahorro: Math.round((Number(sv.price_usd) - por) * x.sessions_count),
          /* Este si sale de la base: `valid_days` en `packages`. */
          dias: Number(x.valid_days) || null
        });
      });

    return lista;
  }

  /* La etiqueta "Sugerida" se retiro. Marcaba el primer paquete por ser donde
     el ahorro aparece por primera vez, pero el badge del ahorro ya dice eso con
     la cifra exacta: "Ahorras 15 $" informa, "Sugerida" solo empuja. */
  function pintarPlanes() {
    var g = $('gPlanes'); if (!g) return;
    var lista = opcionesPlan();
    if (!lista.length) { abrir('bloquePlanes', false); return; }

    /* AQUI EL AVISO ACOMPAÑA A LA LISTA en vez de sustituirla. La consulta
       suelta sale del servicio, asi que esa si se puede ofrecer; lo que no se
       puede es dejar creer que es la unica opcion que existe. */
    var aviso = (fallo('packages') && lista.length === 1) ? avisoFallo('los paquetes') : '';

    g.innerHTML = aviso + lista.map(function (x) {
      /* TRES PIEZAS: la cabecera con la marca y el nombre, la linea, y la fila
         del dinero con el precio a la izquierda y el ahorro al canto derecho.

         El `span` del ahorro SE PINTA SIEMPRE, vacio incluido: es el segundo
         hijo que necesita el `space-between` de la fila para repartir. Vacio no
         se ve, porque su estilo va en `.plan-ahorro:not(:empty)`. */
      return '<label class="plan">' +
               '<input type="radio" name="plan" value="' + escapar(x.slug) + '"' +
                 (estado.plan === x.slug ? ' checked' : '') + '>' +

               '<span class="plan-cab">' +
                 '<span class="dot" aria-hidden="true"></span>' +
                 '<span class="plan-nom">' + x.cifra + ' ' + x.nom + '</span>' +
               '</span>' +

               '<span class="plan-sep" aria-hidden="true"></span>' +

               '<span class="plan-dinero">' +
                 '<span class="plan-precio">' + dinero(x.precio) + ' $</span>' +
                 '<span class="plan-ahorro">' +
                   (x.ahorro > 0 ? 'Ahorras ' + dinero(x.ahorro) + ' $' : '') +
                 '</span>' +
               '</span>' +
             '</label>';
    }).join('');
  }

  /* ---------- LA APERTURA PROGRESIVA ----------

     Cada pregunta aparece cuando se contesta la anterior. La razon no es el
     efecto: quien llega a pedir cita de psicologia no siempre llega con la
     cabeza para tres decisiones apiladas, y una sola pregunta en pantalla pide
     mucho menos.

     `inert` y `aria-hidden` van junto a la clase y no son opcionales: cerrado,
     el bloque mide cero, pero sus radios seguirian en el orden de tabulacion y
     el teclado caeria dentro de algo invisible.

     VOLVER ATRAS NO CIERRA NADA -decision de Edgar-. Nada llama a esta funcion
     con `false` sobre un bloque ya abierto, salvo cuando no hay opciones que
     enseñar. Cambiar la modalidad con todo contestado deja los bloques de
     despues como estaban, porque hacer desaparecer contenido debajo del cursor
     de alguien es peor que dejar a la vista una pregunta que ya no aplica.    */

  function abrir(id, abre) {
    var caja = $(id); if (!caja) return;

    /* Se anuncia SOLO al abrirse, no en cada cambio. Esta funcion se llama
       tambien con bloques que ya estaban abiertos -pasa cada vez que se cambia
       de terapia-, y repetir el anuncio seria ruido. */
    var yaEstaba = caja.classList.contains('abierto');

    caja.classList.toggle('abierto', abre);
    caja.setAttribute('aria-hidden', String(!abre));
    if (abre) caja.removeAttribute('inert');
    else caja.setAttribute('inert', '');

    if (abre && !yaEstaba) anunciar(caja);
  }

  /* El anuncio dice QUE ha aparecido y CUANTAS opciones trae. El numero importa
     mas de lo que parece: quien no ve la pantalla necesita saber si le esperan
     dos decisiones o diez antes de empezar a recorrerlas con el teclado.

     Es el criterio 4.1.3 de WCAG, nivel AA: al elegir modalidad aparece una
     pregunta entera, y sin esto no hay forma de enterarse. */
  function anunciar(caja) {
    var leyenda = caja.querySelector('legend');
    var cuantas = caja.querySelectorAll('input[type="radio"]').length;
    var region = $('anuncio');
    if (!leyenda || !region) return;

    /* El eco lleva `aria-hidden`, pero `textContent` no lo respeta: hay que
       quitarlo a mano o el anuncio saldria como "Que quieres trabajar sin
       elegir, 4 opciones". */
    var eco = leyenda.querySelector('.eco');
    var titulo = leyenda.textContent;
    if (eco) titulo = titulo.replace(eco.textContent, '');

    region.textContent = titulo.trim() + ', ' + cuantas + ' opciones';
  }

  /* ---------- LOS ECOS ----------

     Lo que llevas elegido, al lado de cada rotulo. `data-vacio` es lo que le
     quita la caja cuando no hay respuesta: se marca con un atributo y no con
     una clase porque es un estado del dato, no una variante de estilo.        */

  function eco(id, texto) {
    var e = $(id); if (!e) return;
    if (texto) {
      e.textContent = texto;
      e.removeAttribute('data-vacio');
    } else {
      e.textContent = 'sin elegir';
      e.setAttribute('data-vacio', '');
    }
  }

  function refrescarEcos() {
    var m = MODOS.filter(function (x) { return x.v === estado.modo; })[0];
    var sv = servicio();
    var pl = estado.plan
      ? opcionesPlan().filter(function (x) { return x.slug === estado.plan; })[0]
      : null;

    eco('ecoModo', m ? m.n : '');
    eco('ecoServ', sv ? sv.name : '');
    eco('ecoPlan', pl ? pl.cifra + ' ' + pl.nom : '');
  }

  /* ---------- EL PLAZO ----------

     Solo sale con un plan elegido, y el texto sigue al plan. En singular con la
     consulta suelta y en plural con los paquetes: "tus consultas" cuando hay
     una sola es el tipo de descuido que delata una plantilla.                 */

  function refrescarPlazo() {
    var caja = $('notaPlan'); if (!caja) return;
    var pl = estado.plan
      ? opcionesPlan().filter(function (x) { return x.slug === estado.plan; })[0]
      : null;

    if (!pl || !pl.dias) { caja.hidden = true; return; }
    caja.hidden = false;
    caja.innerHTML =
      '<svg class="ico ico-trazo" viewBox="0 0 24 24" aria-hidden="true">' +
      '<use href="#i-plazo"/></svg><span>' + pl.dias +
      ' días para agendar ' + (pl.cifra === '1' ? 'tu consulta' : 'tus consultas') +
      '</span>';
  }

  /* ---------- EL PIE ----------

     SIN TOTAL. Esta linea llevaba "Total 75 $" y era el mismo numero que el
     precio del plan elegido tres centimetros mas arriba, que ahora esta
     resaltado, en negrita y con su canto en salvia. No era un dato nuevo.     */

  function refrescarBoton() {
    var listo = estadoPestanas()[2].abre || !!estado.token;

    ['ir2Escritorio', 'ir2Movil'].forEach(function (id) {
      var b = $(id); if (b) b.disabled = !listo;
    });

    /* El aviso dice QUE falta, en concreto. "Completa el formulario" no sirve:
       la persona ya sabe que falta algo, lo que no sabe es que. */
    var falta = $('falta');
    if (falta) {
      falta.hidden = listo;
      if (!listo) {
        falta.textContent =
          !estado.modo      ? 'Elige cómo quieres tu consulta.'
        : !estado.servicio  ? 'Elige en qué quieres trabajar.'
        :                     'Elige cuántas consultas.';
      }
    }

    refrescarEcos();
    refrescarPlazo();

    /* Los bloques que ya tienen respuesta se abren. Hace falta en el arranque:
       quien vuelve con la reserva a medias la tiene guardada en sessionStorage,
       y la pantalla debe reaparecer como la dejo, no cerrada. */
    if (estado.modo) abrir('abreServ', true);
    if (estado.servicio && opcionesPlan().length) abrir('bloquePlanes', true);

    /* Las pestanas leen la MISMA condicion, asi que se enteran aqui. Y es
       simetrico: cambiar de motivo tira el plan elegido, con lo que "Fecha"
       vuelve a cerrarse. Una pestana que solo sabe abrirse deja pasar al paso
       siguiente con la pregunta anterior sin contestar. */
    sincronizarPestanas();
  }

  /* ---------- CUANDO SE ELIGE ALGO ----------

     Un solo listener para las tres preguntas, delegado en el paso 1, y escucha
     `change` en vez de `click`: asi recoge igual el raton y el teclado sin
     distinguirlos. Anadir una pregunta nueva no pide tocar esto.

     Va acotado a `#vista1` a proposito. Los pasos 2 y 3 tienen sus propios
     controles y un listener a nivel de documento se los comeria tambien.      */

  document.addEventListener('change', function (ev) {
    var i = ev.target;
    if (!i || i.type !== 'radio' || !i.closest || !i.closest('#vista1')) return;

    if (i.name === 'modo') {
      estado.modo = i.value;
      pintarNotaModo();
      abrir('abreServ', true);

    } else if (i.name === 'servicio') {
      /* Cambiar de motivo tira el plan y la hora: los precios son otros y el
         paquete que estaba elegido puede no existir en la modalidad nueva. */
      if (estado.servicio !== i.value) { estado.plan = null; estado.hora = null; }
      estado.servicio = i.value;
      pintarPlanes();
      abrir('bloquePlanes', true);

    } else if (i.name === 'plan') {
      estado.plan = i.value;
    } else {
      return;
    }

    guardar();
    refrescarBoton();
  });

  /* ---------- RESUMEN DE LA RESERVA ---------- */
  /* Antes era una lista de pares etiqueta/valor: cinco filas con el mismo peso,
     que se leian como una tabla y obligaban a recorrerlas enteras para saber
     que se estaba reservando. Ahora el nombre de la sesion es el titulo, el
     resto son datos secundarios con su icono, y el total cierra abajo separado,
     que es lo que la persona comprueba antes de seguir. */
  var ICO = {
    reloj: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    modo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.6" y="6.4" width="13.2" height="11.2" rx="2.6"/><path d="m15.8 11.2 5.6-3.2v8l-5.6-3.2Z"/></svg>',
    lugar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/></svg>',
    paquete: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5Z"/><path d="M4 8.5 12 13l8-4.5M12 13v7"/></svg>',
    dia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3.5v3M16 3.5v3"/></svg>'
  };

  function filaResumen(icono, texto) {
    return '<li class="wz-resumen-dato">' +
      '<span class="wz-resumen-ico" aria-hidden="true">' + ICO[icono] + '</span>' +
      '<span>' + texto + '</span>' +
    '</li>';
  }

  function pintarContexto() {
    var s = servicio(), p = paquete();
    if (!s) return;

    var datos = filaResumen('reloj', duracion(s.duration_min));
    datos += estado.modo === 'presencial'
      ? filaResumen('lugar', 'Presencial · Barquisimeto')
      : filaResumen('modo', 'Online · por videollamada');
    if (p) datos += filaResumen('paquete', p.sessions_count + ' sesiones · válido ' + p.valid_days + ' días');
    if (estado.hora) {
      var cuando = fechaLarga(diaEnZona(estado.hora, estado.zona)) + ' · ' + hora(estado.hora, estado.zona);
      if (estado.zona !== ZONA_DARYELI) cuando += ' <small>(' + hora(estado.hora, ZONA_DARYELI) + ' en Caracas)</small>';
      datos += filaResumen('dia', cuando);
    }

    var html =
      '<p class="wz-resumen-etq">Tu reserva</p>' +
      '<h2 class="wz-resumen-titulo">' + s.name + '</h2>' +
      '<ul class="wz-resumen-datos">' + datos + '</ul>' +
      '<p class="wz-resumen-total"><span>Total</span><b>' + dinero(importe()) + ' $</b></p>' +
      '<button type="button" class="wz-resumen-cambiar" data-cambiar="1">Cambiar de sesión</button>';

    /* El resumen se pinta en los dos sitios donde aparece: el paso de la hora
       y el del pago. (Antes eran tres: el tercero era el paso de datos, que ya
       no existe.) */
    /* Solo el del paso de pago. El del paso 2 se retiro: repetia las tres
       decisiones del paso 1 y volvia a salir aqui, y ocupaba la columna que
       ahora es del calendario. */
    ['contextoDatosPago'].forEach(function (id) {
      var el = $(id); if (el) el.innerHTML = html;
    });
  }

  /* ---------- PASO 2 · DIA Y HORA ----------

     `diasVisibles()` se fue con la tira: decia cuantas columnas de dias caben
     segun el ancho, y el calendario de mes siempre ensena el mes entero. */

  /* Daryeli atiende a gente fuera de Venezuela y la aritmetica de husos engana:
     Caracas es UTC-4 y Madrid UTC+2, seis horas por delante. En vez de pedirle
     a la persona que calcule, se le ensena la hora ya convertida. La lista va
     agrupada por continente porque una lista plana de veinte entradas se
     recorre peor que tres grupos cortos. */
  var ZONAS = [
    ['América', [
      ['America/Caracas', 'Venezuela · Caracas'],
      ['America/Bogota', 'Colombia · Bogotá'],
      ['America/Lima', 'Perú · Lima'],
      ['America/Guayaquil', 'Ecuador · Quito'],
      ['America/Panama', 'Panamá'],
      ['America/Santiago', 'Chile · Santiago'],
      ['America/Argentina/Buenos_Aires', 'Argentina · Buenos Aires'],
      ['America/Sao_Paulo', 'Brasil · São Paulo'],
      ['America/Mexico_City', 'México · Ciudad de México'],
      ['America/New_York', 'EE. UU. · Este (Nueva York, Miami)'],
      ['America/Chicago', 'EE. UU. · Centro (Chicago, Houston)'],
      ['America/Denver', 'EE. UU. · Montaña (Denver)'],
      ['America/Los_Angeles', 'EE. UU. · Oeste (Los Ángeles)'],
      ['America/Toronto', 'Canadá · Toronto']
    ]],
    ['Europa', [
      ['Europe/Madrid', 'España · Madrid'],
      ['Atlantic/Canary', 'España · Canarias'],
      ['Europe/Lisbon', 'Portugal · Lisboa'],
      ['Europe/London', 'Reino Unido · Londres'],
      ['Europe/Paris', 'Francia · París'],
      ['Europe/Rome', 'Italia · Roma'],
      ['Europe/Berlin', 'Alemania · Berlín']
    ]],
    ['Asia y Oceanía', [
      ['Asia/Dubai', 'Emiratos · Dubái'],
      ['Asia/Shanghai', 'China · Shanghái'],
      ['Asia/Tokyo', 'Japón · Tokio'],
      ['Australia/Sydney', 'Australia · Sídney']
    ]]
  ];

  /* La zona real de quien mira se calcula una vez y no cambia. Si se derivase de
     estado.zona, al elegir "Espana - Madrid" la propia opcion pasaba a llamarse
     "Mi hora local (Madrid)", que es mentira: solo cambio lo que se muestra. */
  var zonaPropia = null;

  /* Prefijos telefonicos. La lista sigue a la de zonas horarias: son los sitios
     desde donde Daryeli recibe pacientes. El prefijo se guarda junto al numero
     para que ella pueda marcar sin adivinar de que pais es. */
  var PREFIJOS = [
    ['+58', 'Venezuela'], ['+34', 'España'], ['+1', 'EE. UU. / Canadá'],
    ['+57', 'Colombia'], ['+51', 'Perú'], ['+593', 'Ecuador'],
    ['+56', 'Chile'], ['+54', 'Argentina'], ['+52', 'México'],
    ['+507', 'Panamá'], ['+55', 'Brasil'], ['+598', 'Uruguay'],
    ['+591', 'Bolivia'], ['+595', 'Paraguay'], ['+506', 'Costa Rica'],
    ['+809', 'Rep. Dominicana'], ['+351', 'Portugal'], ['+44', 'Reino Unido'],
    ['+33', 'Francia'], ['+39', 'Italia'], ['+49', 'Alemania'],
    ['+971', 'Emiratos'], ['+86', 'China'], ['+61', 'Australia']
  ];

  /* Se propone el prefijo segun la zona horaria del navegador. No es adivinar
     por adivinar: quien mira desde Madrid casi nunca tiene un numero venezolano,
     y equivocarse solo cuesta un clic en el desplegable. */
  var PREFIJO_POR_ZONA = {
    'America/Caracas': '+58', 'Europe/Madrid': '+34', 'Atlantic/Canary': '+34',
    'America/Bogota': '+57', 'America/Lima': '+51', 'America/Guayaquil': '+593',
    'America/Santiago': '+56', 'America/Argentina/Buenos_Aires': '+54',
    'America/Mexico_City': '+52', 'America/Panama': '+507', 'America/Sao_Paulo': '+55',
    'America/New_York': '+1', 'America/Chicago': '+1', 'America/Denver': '+1',
    'America/Los_Angeles': '+1', 'America/Toronto': '+1',
    'Europe/Lisbon': '+351', 'Europe/London': '+44', 'Europe/Paris': '+33',
    'Europe/Rome': '+39', 'Europe/Berlin': '+49',
    'Asia/Dubai': '+971', 'Asia/Shanghai': '+86', 'Australia/Sydney': '+61'
  };

  function pintarPrefijos() {
    var sel = $('paisTel');
    if (!sel || sel.options.length) return;      // se construye una sola vez
    PREFIJOS.forEach(function (pr) {
      var op = document.createElement('option');
      op.value = pr[0];
      op.textContent = pr[0] + ' · ' + pr[1];
      sel.appendChild(op);
    });
    sel.value = PREFIJO_POR_ZONA[zonaVisitante()] || '+58';
  }

  function pintarZonas() {
    var sel = $('zonaSelect');
    if (!zonaPropia) zonaPropia = zonaVisitante();
    if (!estado.zona) estado.zona = zonaPropia;
    sel.innerHTML = '';

    /* La zona de quien mira va primero y sola: es la que va a querer el 90 %
       de la gente, y buscarla dentro de un grupo seria trabajo para nada. */
    var suya = document.createElement('option');
    suya.value = zonaPropia;
    suya.textContent = 'Mi hora local (' + etiquetaZona(zonaPropia) + ')';
    sel.appendChild(suya);

    ZONAS.forEach(function (grupo) {
      var g = document.createElement('optgroup');
      g.label = grupo[0];
      grupo[1].forEach(function (z) {
        if (z[0] === zonaPropia) return;   // ya esta arriba
        var op = document.createElement('option');
        op.value = z[0]; op.textContent = z[1];
        g.appendChild(op);
      });
      if (g.children.length) sel.appendChild(g);
    });

    /* Si la zona elegida no esta en la lista (alguien en un huso que no
       cubrimos), se anade al vuelo para que el selector no se quede en blanco. */
    if (estado.zona && !sel.querySelector('option[value="' + estado.zona + '"]')) {
      var extra = document.createElement('option');
      extra.value = estado.zona; extra.textContent = etiquetaZona(estado.zona);
      sel.appendChild(extra);
    }
    sel.value = estado.zona;
  }

  /* "America/Argentina/Buenos_Aires" -> "Buenos Aires". Sirve para etiquetar la
     zona del visitante aunque no este en la lista de arriba. */
  function etiquetaZona(z) {
    var conocida = null;
    ZONAS.forEach(function (grupo) {
      grupo[1].forEach(function (par) { if (par[0] === z) conocida = par[1]; });
    });
    if (conocida) return conocida.split(' · ').pop();
    return String(z || '').split('/').pop().replace(/_/g, ' ');
  }

  /* ---------- CARGAR EL MES ----------

     Se pide el mes entero de una vez, no cinco dias como antes. Son mas datos
     por llamada —unos 280 huecos contra 60— pero una sola llamada en vez de
     seis para ver el mismo mes, y es lo que permite que el calendario ensene de
     golpe donde hay y donde no.

     UN DIA EXTRA A CADA LADO, igual que antes: un hueco de las 9:00 de Caracas
     puede caer en otro dia natural segun la zona de quien mira.               */

  function cargarMes() {
    var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    if (!mesVisible) mesVisible = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    var primero = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), 1);
    var ultimo = new Date(mesVisible.getFullYear(), mesVisible.getMonth() + 1, 0);

    $('calDias').innerHTML = '<p class="cal-cargando">Buscando horarios…</p>';

    return PSI.rpc('get_available_slots', {
      p_service_slug: estado.servicio,
      p_from: ymd(sumaDias(primero, -1)),
      p_to: ymd(sumaDias(ultimo, 1)),
      /* Sin esto no se ven los horarios de noche: son franjas marcadas como
         solo online, y el servidor solo las devuelve si se le dice la
         modalidad. Tampoco es cosmetico al reves — el servidor rechaza una
         reserva presencial a las 20:00 aunque el navegador la pida. */
      p_mode: estado.modo
    }).then(function (slots) {
      huecos = {};
      if (Array.isArray(slots)) {
        slots.forEach(function (iso) {
          var d = diaEnZona(iso, estado.zona);
          (huecos[d] = huecos[d] || []).push(iso);
        });
        Object.keys(huecos).forEach(function (d) { huecos[d].sort(); });
      }

      /* Si no hay dia elegido, se elige el PRIMERO CON HUECO del mes en vez de
         dejar la columna de horas vacia esperando un clic. Quien llega aqui
         quiere una cita, y el dia mas cercano es la respuesta mas probable. */
      if (!diaElegido || !huecos[diaElegido]) {
        var libres = Object.keys(huecos).filter(function (d) {
          return huecos[d].length && d >= ymd(hoy) && mismoMes(d);
        }).sort();
        diaElegido = libres[0] || null;
      }

      pintarCalendario();
      pintarHoras();
    });
  }

  function mismoMes(clave) {
    return clave.slice(0, 7) ===
      mesVisible.getFullYear() + '-' + ('0' + (mesVisible.getMonth() + 1)).slice(-2);
  }

  /* ---------- PINTAR EL CALENDARIO ----------

     SIN REJILLA DE CELDAS —eleccion de Edgar sobre tres variantes
     renderizadas—: los numeros respiran y lo unico que pinta color es el dia
     elegido. Con 42 celdas dibujadas, la unica que importa competia con 41
     rectangulos mas.

     Y NO MARCA LO DISPONIBLE, MARCA LO CERRADO. Se midio la agenda real: 27
     dias con hueco de 31, solo cierran los domingos. Encender lo disponible
     habria encendido casi toda la rejilla y no habria informado de nada;
     apagar lo cerrado si.                                                     */

  function pintarCalendario() {
    var cont = $('calDias');
    var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    var hoyStr = ymd(hoy);

    var anio = mesVisible.getFullYear(), mes = mesVisible.getMonth();
    var primero = new Date(anio, mes, 1);
    var cuantos = new Date(anio, mes + 1, 0).getDate();

    /* La semana arranca en lunes, como en Venezuela y en toda Latinoamerica.
       `getDay()` devuelve 0 para domingo, asi que se rota. */
    var hueco = (primero.getDay() + 6) % 7;

    $('calMes').textContent = new Intl.DateTimeFormat('es', {
      month: 'long', year: 'numeric'
    }).format(primero);

    cont.innerHTML = '';
    var fila = null;
    var cerrados = 0;

    for (var i = 0; i < hueco + cuantos; i++) {
      if (i % 7 === 0) {
        fila = document.createElement('div');
        fila.setAttribute('role', 'row');
        fila.className = 'cal-fila';
        cont.appendChild(fila);
      }

      if (i < hueco) {
        var vacia = document.createElement('span');
        vacia.setAttribute('role', 'gridcell');
        vacia.className = 'cal-dia cal-fuera';
        fila.appendChild(vacia);
        continue;
      }

      var n = i - hueco + 1;
      var d = new Date(anio, mes, n);
      var clave = ymd(d);
      var libres = (huecos[clave] || []).length;
      var pasado = clave < hoyStr;
      if (!pasado && !libres) cerrados++;

      fila.appendChild(celdaDia(clave, n, libres, pasado, clave === hoyStr));
    }

    /* La nota dice por que hay dias apagados, y solo cuando los hay. Sin ella,
       un domingo en gris se lee como un fallo de la pagina. */
    var nota = $('calNota');
    nota.hidden = !cerrados;
    if (cerrados) nota.textContent = 'Los días en gris no tienen horarios libres.';

    $('mesAtras').disabled = mes === hoy.getMonth() && anio === hoy.getFullYear();
    pintarContexto();
  }

  function celdaDia(clave, n, libres, pasado, esHoy) {
    var celda = document.createElement('div');
    celda.setAttribute('role', 'gridcell');
    celda.className = 'cal-dia';

    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'cal-num' + (esHoy ? ' cal-hoy' : '');
    b.textContent = n;
    b.dataset.dia = clave;
    b.setAttribute('aria-pressed', String(clave === diaElegido));

    /* `aria-disabled` Y NO `disabled`, y no es un matiz: un boton deshabilitado
       de verdad no puede recibir el foco, asi que el teclado no podria pasar
       por encima de un domingo cerrado — y saltarlo obligaria a que las flechas
       se movieran por botones activos en vez de por dias de calendario.

       Con `aria-disabled` el dia sigue siendo enfocable, el lector de pantalla
       lo anuncia como no disponible, y quien recorre el mes con las flechas se
       entera de que ese dia existe y no tiene hueco. Es lo mismo que hacen las
       pestanas de arriba. Los clics los ignora el listener. */
    if (pasado || !libres) {
      b.setAttribute('aria-disabled', 'true');
      /* `data-pasado` separa las dos razones por las que un dia no se puede
         elegir, porque no significan lo mismo: un dia que ya paso no informa de
         nada y solo tiene que no invitar; un domingo cerrado SI informa —dice
         que Daryeli no atiende los domingos— y por eso es el unico que lleva
         relleno. */
      if (pasado) b.setAttribute('data-pasado', '');
    }

    /* La etiqueta dice la fecha entera y CUANTOS huecos hay. El numero importa:
       quien no ve la pantalla necesita saber si le espera una hora o doce antes
       de entrar a recorrerlas. */
    b.setAttribute('aria-label', fechaLarga(clave) +
      (libres ? ', ' + libres + (libres === 1 ? ' hora libre' : ' horas libres')
              : ', sin horarios'));

    /* UN SOLO TABULADOR EN TODO EL MES: se entra con Tab y se recorre con las
       flechas, que es como se espera manejar un calendario. Sin esto harian
       falta hasta 31 pulsaciones para cruzarlo. */
    b.tabIndex = clave === diaElegido ? 0 : -1;

    celda.appendChild(b);
    return celda;
  }

  /* ---------- PINTAR LAS HORAS ---------- */

  function pintarHoras() {
    var cont = $('horasFranjas');
    var cab = $('horasDia');

    /* LA ZONA SOLO SE ENSENA A QUIEN NO ESTA EN VENEZUELA. Decision de Edgar.

       Para quien ya esta en la hora de Caracas, "Horas de: mi hora local
       (Caracas)" no dice nada: son sus horas y no hay nada que convertir ni
       que elegir. Es un control que ocupa una linea para confirmar lo obvio.

       Desde fuera si hace falta, y ahi hace dos cosas: dice en que zona esta
       leyendo las horas y deja cambiarla. Ademas cada hora ensena las dos —la
       suya y la de Caracas—, asi que quien reserve desde Espana ve "21:00" y
       debajo "15:00 Ccs". */
    var zona = $('horasZona');
    if (zona) zona.hidden = estado.zona === ZONA_DARYELI;

    if (!diaElegido) {
      cab.textContent = 'Sin días libres este mes';
      cont.innerHTML = '<p class="horas-vacio">Prueba con el mes siguiente.</p>';
      return;
    }

    cab.textContent = fechaLarga(diaElegido);

    var libres = huecos[diaElegido] || [];
    var mismaZona = estado.zona === ZONA_DARYELI;
    cont.innerHTML = '';

    FRANJAS.forEach(function (f) {
      var suyas = libres.filter(function (iso) {
        var h = Number(hora(iso, estado.zona).slice(0, 2));
        return h >= f.desde && h < f.hasta;
      });
      if (!suyas.length) return;

      var bloque = document.createElement('div');
      bloque.className = 'franja';

      var t = document.createElement('h3');
      t.className = 'franja-tit';
      t.textContent = f.nombre;
      bloque.appendChild(t);

      var rejilla = document.createElement('div');
      rejilla.className = 'franja-horas';
      rejilla.setAttribute('role', 'radiogroup');
      rejilla.setAttribute('aria-label', f.nombre + ' del ' + fechaLarga(diaElegido));
      suyas.forEach(function (iso) { rejilla.appendChild(botonHueco(iso, mismaZona)); });
      bloque.appendChild(rejilla);

      cont.appendChild(bloque);
    });
  }

  function botonHueco(iso, mismaZona) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'hueco';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', estado.hora === iso ? 'true' : 'false');

    var propia = hora(iso, estado.zona);
    var caracas = hora(iso, ZONA_DARYELI);
    b.innerHTML = '<span>' + propia + '</span>' +
      (mismaZona ? '' : '<span class="hueco-alt">' + caracas + ' Ccs</span>');

    b.setAttribute('aria-label', propia +
      (mismaZona ? '' : ', que son las ' + caracas + ' en Caracas'));

    b.addEventListener('click', function () {
      /* Al reprogramar, elegir un hueco NO es avanzar al paso siguiente: es la
         accion completa. Confirmar despues obligaria a un paso de mas para algo
         que ya se decidio al tocar la hora. */
      if (estado.reprogramando) { moverCita(iso); return; }
      estado.hora = iso; guardar();
      pintarHoras();
      $('ir4').disabled = false;
    });
    return b;
  }

  /* ---------- PASO 3 ---------- */
  function error(campo, err, msg) {
    var e = $(err), c = campo ? $(campo) : null;
    if (msg) { e.textContent = msg; e.hidden = false; if (c) c.setAttribute('aria-invalid', 'true'); }
    else { e.hidden = true; e.textContent = ''; if (c) c.removeAttribute('aria-invalid'); }
  }

  /* YA NO HAY NADA QUE VALIDAR AQUI, y la funcion se queda porque el envio la
     llama y porque va a volver a tener trabajo.

     La casilla del consentimiento se retiro por decision de Edgar. Lo sustituye
     la linea "Al reservar aceptas el consentimiento informado...", justo debajo
     del boton: el clic ES el acto de aceptacion, asi que el `p_consent: true`
     que se manda a la base sigue siendo verdad.

     LO PENDIENTE, acordado: llevar el consentimiento al registro de la cuenta
     —se acepta una vez y no en cada reserva— y que `create_booking` lo lea de
     la persona. Eso pide una migracion, porque hoy `consents.appointment_id`
     es obligatorio y un consentimiento no puede pertenecer a alguien todavia. */
  function validarDatos() {
    error(null, 'errConsent', null);
    return true;
  }

  function alerta(host, msg, tipo) {
    var h = $(host), vieja = h.querySelector('.wz-alerta');
    if (vieja) vieja.remove();
    var d = document.createElement('div');
    d.className = 'wz-alerta';
    d.dataset.tipo = tipo || 'error';
    d.setAttribute('role', 'alert');
    d.textContent = msg;
    h.insertBefore(d, h.firstChild);
    d.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* A entrar y de vuelta. Lo elegido ya esta guardado en el navegador, asi que
     al volver la persona se encuentra su hueco donde lo dejo en vez de tener
     que rehacer los tres pasos. */
  function aEntrar() {
    guardar();
    location.href = '/entrar/?volver=' + encodeURIComponent('/reservar/');
  }

  function reservar() {
    if (!validarDatos()) return;

    /* Desde 20260907140000 reservar exige cuenta: la identidad la pone la
       sesion y no el formulario. Se comprueba AQUI, antes de molestar al
       servidor, porque asi el desvio es instantaneo en vez de un viaje de ida y
       vuelta para que nos digan lo que ya sabiamos. */
    if (!PSI.sesion.hay()) { aEntrar(); return; }

    var boton = $('ir4');
    boton.dataset.cargando = 'si';

    var p = paquete();
    /* Ni nombre, ni correo, ni telefono: eso lo sabe el servidor por la sesion.
       Mandarlos seria ofrecerle una identidad que ya no se cree. */
    var base = {
      p_service_slug: estado.servicio,
      p_starts_at: estado.hora,
      p_consent: true,
      p_mode: estado.modo
    };
    if (p) base.p_package_slug = p.slug;

    PSI.rpc(p ? 'buy_package' : 'create_booking', base).then(function (r) {
      delete boton.dataset.cargando;
      if (!r || !r.ok) {
        /* La sesion caduco entre que se cargo la pagina y se pulso el boton.
           Se manda a entrar en vez de ensenar un error: el fallo tiene arreglo
           y ensenarselo sin el arreglo al lado no ayuda a nadie. */
        if (r && r.error === 'not_signed_in') { aEntrar(); return; }
        alerta('formDatos', (r && r.message) || 'No pudimos crear la reserva.', 'error');
        if (r && (r.error === 'slot_taken' || r.error === 'slot_unavailable')) {
          estado.hora = null; guardar();
          setTimeout(function () { mostrar(2); cargarMes(); }, 1800);
        }
        return;
      }
      estado.token        = r.manage_token;
      estado.tokenPaquete = r.package_token || null;
      estado.vence        = r.hold_expires_at;
      /* El servidor decide si hay prepago obligatorio, no el navegador: es
         una regla de negocio y aqui solo se refleja. */
      estado.prepago      = r.prepago === true;
      estado.momento      = 'ahora';
      estado.importe      = importe();
      estado.resumen      = { servicio: (servicio() || {}).name, hora: estado.hora,
                              quien: perfil ? perfil.nombre : '' };
      guardar();
      prepararPago(r.payment_info);
      mostrar(3);
    });
  }

  /* ---------- PASO 4 ---------- */
  function prepararPago(cuentas) {
    pintarContexto();
    pintarMomento();
    pintarImporte();
    pintarCuentas(cuentas || []);
    pintarBancos();
    refrescarWhatsapp();
    var h = new Date();
    $('fechaPago').value = ymd(h);
    $('fechaPago').max = ymd(h);
    arrancarReloj();
  }

  /* Quien reserva online sin historial no elige: paga por adelantado. Los demas
     eligen, con "ahora" por defecto. El aviso se redacta como norma y no como
     sospecha — la persona no ha hecho nada malo, sencillamente es nueva. */
  function pintarMomento() {
    var caja = $('momentoPago'), aviso = $('prepagoAviso');
    if (estado.prepago) {
      caja.hidden = true;
      aviso.hidden = false;
      estado.momento = 'ahora';
    } else {
      caja.hidden = false;
      aviso.hidden = true;
    }
    marcarMomento();
  }

  function marcarMomento() {
    document.querySelectorAll('.wz-momento-op').forEach(function (b) {
      b.setAttribute('aria-checked', b.dataset.momento === estado.momento ? 'true' : 'false');
    });
    var despues = estado.momento === 'despues';
    /* Pagar despues no es un formulario mas corto: es no tener formulario. Se
       oculta todo lo que solo sirve para pagar ahora. */
    ['importe', 'cuentas', 'formPago'].forEach(function (id) {
      var el = $(id); if (el) el.hidden = despues;
    });
    document.querySelectorAll('.wz-paso-titulo').forEach(function (t) { t.hidden = despues; });
    $('pagoDespues').hidden = !despues;
    /* La retencion solo existe para el prepago obligatorio; en cualquier otro
       caso el horario ya es suyo y ensenar un plazo seria mentir. */
    $('reten').hidden = !estado.prepago;
  }

  /* Antes la pantalla decia "30 $ en su equivalente en bolivares" y ahi acababa:
     la persona tenia que abrir otra pestana, buscar la tasa del BCV y
     multiplicar. Ese es el punto exacto donde se abandona una reserva. Ahora la
     cifra en bolivares —que es la que se teclea en la app del banco— es la
     grande, y el dolar queda como referencia. */
  function pintarImporte() {
    var usd = Number(estado.importe) || 0;
    var caja = $('importe');

    if (!tasa || !tasa.rate) {
      /* Sin tasa no se inventa ninguna: se pide el importe en dolares y se
         explica. Peor que no saber es dar un numero equivocado. */
      caja.dataset.sinTasa = 'si';
      $('importeBs').textContent = dinero(usd);
      $('importe').querySelector('.wz-importe-moneda').textContent = '$';
      $('importeNota').textContent = 'Conviértelo a bolívares con la tasa del BCV del día y escribe abajo el monto exacto que pagaste.';
      $('copiarMonto').hidden = true;
      return;
    }

    var bs = usd * Number(tasa.rate);
    var bsTexto = bolivares(bs);

    $('importeBs').textContent = bsTexto;
    $('importeNota').innerHTML =
      dinero(usd) + ' $ · tasa BCV <strong>' + bolivares(tasa.rate) + '</strong> Bs por dólar' +
      (tasa.at ? ' · ' + fechaCorta(tasa.at) : '');
    $('copiarMonto').dataset.copiar = bs.toFixed(2);
    $('copiarMonto').hidden = false;

    // El campo llega relleno; sigue siendo editable porque cada banco redondea
    // a su manera y lo que vale es lo que dice el comprobante.
    if (!$('montoBs').value) $('montoBs').value = bsTexto;
  }

  /* "1 hora" y no "60 min": es como Daryeli lo habla con sus pacientes, y una
     cifra en minutos por encima de sesenta obliga a dividir mentalmente. Sirve
     igual cuando la de pareja tenga su duracion real: 90 -> "1 hora 30 min". */
  function duracion(min) {
    var m = Number(min) || 0;
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60), resto = m % 60;
    var txt = h === 1 ? '1 hora' : h + ' horas';
    return resto ? txt + ' ' + resto + ' min' : txt;
  }

  /* Formato venezolano: punto para los miles y coma para los decimales. */
  function bolivares(n) {
    return new Intl.NumberFormat('es-VE', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(Number(n) || 0);
  }

  /* Color y monograma por banco. No son logotipos: reproducirlos exigiria sus
     archivos y su permiso, y ademas envejecen mal. Un cuadro con el color de la
     marca y las iniciales cumple la misma funcion —distinguir de un vistazo a
     cual estas pagando— y es honesto sobre lo que es. Distinguirlos importa:
     pagar a la cuenta equivocada es el error caro de este formulario. */
  var BANCOS_MARCA = {
    '0102': { color: '#C8102E', sigla: 'BDV' },   // Banco de Venezuela
    '0172': { color: '#E87722', sigla: 'BM'  },   // Bancamiga
    '0134': { color: '#00693C', sigla: 'BNS' },   // Banesco
    '0105': { color: '#0033A0', sigla: 'MER' },   // Mercantil
    '0108': { color: '#004481', sigla: 'BBV' },   // BBVA Provincial
    '0191': { color: '#003A70', sigla: 'BNC' },   // Banco Nacional de Crédito
    '0114': { color: '#D50032', sigla: 'BCR' },   // Bancaribe
    '0163': { color: '#0091DA', sigla: 'TES' },   // Banco del Tesoro
    '0175': { color: '#B31B34', sigla: 'BIC' },   // Bicentenario
    '0115': { color: '#00539B', sigla: 'EXT' },   // Banco Exterior
    '0138': { color: '#6D2077', sigla: 'PLZ' },   // Banco Plaza
    '0171': { color: '#E4002B', sigla: 'ACT' },   // Banco Activo
    '0174': { color: '#00A0AF', sigla: 'BPL' },   // Banplus
    '0168': { color: '#8DC63F', sigla: 'BCR' },   // Bancrecer
    '0151': { color: '#F2A900', sigla: 'BFC' },   // BFC
    '0000': { color: '#5F6D65', sigla: '···' }    // Otro banco
  };

  /* Blanco o casi negro segun el color del banco, calculado y no elegido a ojo.
     El naranja de Bancamiga con letra blanca da 2,96:1 y el minimo accesible es
     4,5:1; el amarillo de BFC y el verde de Bancrecer fallarian igual. Con esto
     cualquier banco que se anada manana queda resuelto sin revisarlo. */
  function tintaSobre(hex) {
    var r = parseInt(hex.substr(1, 2), 16) / 255,
        g = parseInt(hex.substr(3, 2), 16) / 255,
        b = parseInt(hex.substr(5, 2), 16) / 255;
    var f = function (v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    var L = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    var conBlanco = 1.05 / (L + 0.05);
    return conBlanco >= 4.5 ? '#FFFFFF' : '#16220E';
  }

  function marcaBanco(codigo, nombre) {
    if (BANCOS_MARCA[codigo]) return BANCOS_MARCA[codigo];
    /* Banco que no esta en la tabla: se le hacen unas iniciales con su nombre y
       se le da el verde de la pagina. Mejor eso que un hueco. */
    var sigla = String(nombre || '?').replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ ]/g, '')
      .split(/\s+/).filter(Boolean).slice(0, 3)
      .map(function (w) { return w[0].toUpperCase(); }).join('');
    return { color: '#2F6B4F', sigla: sigla || '?' };
  }

  function pintarCuentas(cuentas) {
    var c = $('cuentas');
    c.innerHTML = '';
    if (!cuentas.length) {
      c.innerHTML = '<p class="wz-vacio">Escríbele a Daryeli por WhatsApp para recibir los datos de pago.</p>';
      return;
    }
    cuentas.forEach(function (x) {
      var m = marcaBanco(x.bank_code, x.bank_name);
      var caja = document.createElement('div');
      caja.className = 'wz-cuenta';
      caja.style.setProperty('--banco', m.color);
      caja.style.setProperty('--banco-tinta', tintaSobre(m.color));

      var html =
        '<div class="wz-cuenta-cab">' +
          '<span class="wz-cuenta-sello" aria-hidden="true">' + m.sigla + '</span>' +
          '<p class="wz-cuenta-banco">' + x.bank_name + '</p>' +
        '</div>';

      [['Cédula', x.id_number], ['Teléfono', x.phone]].forEach(function (d) {
        if (!d[1]) return;
        html += '<div class="wz-dato">' +
          '<span class="wz-dato-txt">' +
            '<span class="wz-dato-etq">' + d[0] + '</span>' +
            '<span class="wz-dato-val">' + d[1] + '</span></span>' +
          '<button type="button" class="wz-copiar" data-copiar="' + d[1] + '" aria-label="Copiar ' + d[0].toLowerCase() + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>' +
          '<span>Copiar</span></button></div>';
      });
      caja.innerHTML = html;
      c.appendChild(caja);
    });
  }

  /* Un solo escuchador delegado para todo lo que se copia: los datos de las
     cuentas se repintan y el monto vive fuera de ellas, asi que atar el
     escuchador a cada boton obligaba a reatarlo en cada repintado. */
  function prepararCopiar() {
    document.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('[data-copiar]');
      if (!b || !b.dataset.copiar) return;

      var etiqueta = b.querySelector('span:last-child');
      var original = etiqueta ? etiqueta.textContent : '';
      var listo = function () {
        b.dataset.copiado = 'si';
        if (etiqueta) etiqueta.textContent = 'Copiado';
        setTimeout(function () {
          delete b.dataset.copiado;
          if (etiqueta) etiqueta.textContent = original;
        }, 1800);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(b.dataset.copiar).then(listo, function () {});
      } else {
        var ta = document.createElement('textarea');
        ta.value = b.dataset.copiar; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); listo(); } catch (e) {}
        ta.remove();
      }
    });
  }

  function pintarBancos() {
    var s = $('banco');
    s.innerHTML = '<option value="">Selecciona tu banco</option>';
    catalogo.bancos.forEach(function (b) {
      var o = document.createElement('option');
      o.value = b.code; o.textContent = b.code + ' — ' + b.name;
      s.appendChild(o);
    });
  }

  /* Antes esto era un cronometro de segundos. La informacion util no es cuanto
     falta al segundo, sino hasta que hora esta guardado el horario: eso se lee
     de un vistazo, se puede comparar con el reloj del telefono y no mete prisa.
     Se sigue comprobando cada medio minuto, pero solo para avisar cuando queda
     poco y para reaccionar si vence con la pagina abierta. */
  function arrancarReloj() {
    if (reloj) clearInterval(reloj);
    var caja = $('reten');
    if (!estado.vence || !estado.prepago) { caja.hidden = true; return; }
    caja.hidden = false;

    var limite = new Date(estado.vence);
    var hasta = new Intl.DateTimeFormat('es-ES', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: estado.zona || ZONA_DARYELI
    }).format(limite);

    function tic() {
      var falta = limite - new Date();

      if (falta <= 0) {
        clearInterval(reloj);
        caja.dataset.urgente = 'si';
        $('retenPie').innerHTML =
          '<strong>El horario volvió a quedar libre.</strong> ' +
          'Puedes elegir otro y empezar de nuevo.';
        return;
      }

      var minutos = Math.floor(falta / 60000);
      if (minutos < 15) {
        caja.dataset.urgente = 'si';
        /* Ojo con el punto: en espanol Intl devuelve "4:45 p. m." con punto
           final, asi que la frase no puede terminar justo despues de la hora
           o salen dos seguidos. */
        $('retenPie').innerHTML =
          '<strong>Queda poco tiempo.</strong> El horario sigue guardado hasta las ' +
          hasta + ' &mdash; unos ' + minutos + (minutos === 1 ? ' minuto más.' : ' minutos más.');
      } else {
        caja.dataset.urgente = 'no';
        $('retenPie').innerHTML =
          'Te guardamos el horario hasta las <strong>' + hasta + '</strong> ' +
          'para que puedas pagar con calma. Si para entonces no llega el pago, ' +
          'vuelve a quedar libre para otra persona.';
      }
    }

    tic();
    reloj = setInterval(tic, 30000);
  }

  /* Hoy / Ayer / Otra fecha. Un pago movil se declara casi siempre el mismo dia
     o el siguiente, asi que dos botones resuelven la practica totalidad de los
     casos sin abrir ningun calendario. El calendario nativo queda para la
     excepcion de verdad, que era lo unico que habia antes. */
  function prepararFecha() {
    var chips = document.querySelectorAll('.wz-cuando .wz-chip');
    var caja = $('cajaFecha'), campo = $('fechaPago');

    function elegir(cual) {
      chips.forEach(function (c) {
        c.setAttribute('aria-checked', c.dataset.cuando === cual ? 'true' : 'false');
      });
      var hoy = new Date();
      if (cual === 'hoy') {
        campo.value = ymd(hoy); caja.hidden = true;
      } else if (cual === 'ayer') {
        campo.value = ymd(sumaDias(hoy, -1)); caja.hidden = true;
      } else {
        caja.hidden = false;
        campo.focus();
      }
      error('fechaPago', 'errFecha', null);
    }

    chips.forEach(function (c) {
      c.addEventListener('click', function () { elegir(c.dataset.cuando); });
    });
    elegir('hoy');
  }

  function prepararSubida() {
    $('captura').addEventListener('change', function () {
      var f = this.files && this.files[0];
      error('captura', 'errCaptura', null);
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) {
        error('captura', 'errCaptura', 'La imagen pesa más de 5 MB. Prueba con una captura más pequeña.');
        this.value = ''; archivo = null; return;
      }
      archivo = f;
      $('subirCaja').dataset.lleno = 'si';
      $('subirTxt').textContent = f.name;
      $('subirPista').textContent = (f.size / 1024 < 1024)
        ? Math.round(f.size / 1024) + ' KB · toca para cambiarla'
        : (f.size / 1048576).toFixed(1) + ' MB · toca para cambiarla';

      var prev = $('vistaPrevia');
      prev.innerHTML = ''; prev.hidden = true;
      if (f.type.indexOf('image/') === 0) {
        /* Ver la captura antes de enviarla evita el error mas comun: mandar la
           foto equivocada del carrete y tener que rehacer el tramite por chat. */
        var img = document.createElement('img');
        img.alt = 'Vista previa del comprobante';
        img.src = URL.createObjectURL(f);
        img.onload = function () { URL.revokeObjectURL(img.src); };
        prev.appendChild(img); prev.hidden = false;
      } else {
        prev.innerHTML = '<p class="wz-previa-pdf">Documento PDF adjunto</p>';
        prev.hidden = false;
      }
    });
  }

  /* Los bancos venezolanos mandan la confirmacion por SMS y la gente pega el
     mensaje entero. Pegar ya se podia; lo que no se podia es pegar Y QUE
     FUNCIONE. Se busca la tirada de digitos mas larga, que es siempre la
     referencia: los importes llevan coma o punto y las fechas, barras. */
  function prepararReferencia() {
    var campo = $('referencia'), banco = $('banco');
    if (!campo) return;

    campo.addEventListener('paste', function (ev) {
      var txt = (ev.clipboardData || window.clipboardData).getData('text') || '';
      var tiradas = txt.match(/\d{4,}/g);
      if (!tiradas || !tiradas.length) return;      // no parece un SMS: se pega tal cual
      ev.preventDefault();
      var mejor = tiradas.sort(function (a, b) { return b.length - a.length; })[0];
      campo.value = mejor;
      campo.dispatchEvent(new Event('input', { bubbles: true }));
    });

    var temporizador = null;
    function comprobar() {
      clearTimeout(temporizador);
      var ref = campo.value.trim();
      if (!banco.value || ref.length < 4) { error('referencia', 'errReferencia', null); return; }
      /* Con retraso: comprobar en cada tecla seria una consulta por pulsacion. */
      temporizador = setTimeout(function () {
        PSI.rpc('reference_taken', { p_bank_code: banco.value, p_reference: ref }).then(function (usada) {
          if (usada === true) {
            error('referencia', 'errReferencia',
              'Esa referencia ya se usó en otro pago. Revisa que sea la del comprobante de esta sesión.');
          } else {
            error('referencia', 'errReferencia', null);
          }
        });
      }, 600);
    }
    campo.addEventListener('input', comprobar);
    banco.addEventListener('change', comprobar);
  }

  function validarPago() {
    var ok = true, primero = null;
    if (!$('banco').value) { error('banco', 'errBanco', 'Elige el banco desde el que pagaste.'); ok = false; primero = primero || 'banco'; }
    else error('banco', 'errBanco', null);

    if ($('referencia').value.trim().length < 4) { error('referencia', 'errReferencia', 'La referencia tiene al menos 4 cifras.'); ok = false; primero = primero || 'referencia'; }
    else error('referencia', 'errReferencia', null);

    var monto = Number($('montoBs').value.replace(/\./g, '').replace(',', '.'));
    if (!monto || monto <= 0) { error('montoBs', 'errMonto', 'Escribe el monto en bolívares del comprobante.'); ok = false; primero = primero || 'montoBs'; }
    else error('montoBs', 'errMonto', null);

    if (!ok && primero) $(primero).focus();
    return ok ? monto : null;
  }

  function enviarPago() {
    var monto = validarPago();
    if (monto === null) return;
    var boton = $('enviarPago');
    boton.dataset.cargando = 'si';

    subir().then(function (ruta) {
      return PSI.rpc('submit_payment', {
        p_token: estado.tokenPaquete || estado.token,
        p_bank_code: $('banco').value,
        p_reference: $('referencia').value.trim(),
        p_paid_on: $('fechaPago').value || ymd(new Date()),
        p_amount_bs: monto,
        // La tasa no se le pregunta a nadie: se deduce del monto y el precio.
        p_exchange_rate: estado.importe ? Number((monto / estado.importe).toFixed(4)) : null,
        p_proof_path: ruta
      });
    }).then(function (r) {
      delete boton.dataset.cargando;
      if (!r || !r.ok) { alerta('formPago', (r && r.message) || 'No pudimos registrar el pago.', 'error'); return; }
      if (reloj) clearInterval(reloj);
      terminar();
    });
  }

  /* La subida pasa por una función del servidor que valida el token antes de
     dar permiso: el navegador nunca escribe directo en el almacenamiento. Si
     esa función no responde, la reserva NO se pierde: el pago se registra sin
     captura y Daryeli la pedirá por WhatsApp. */
  function subir() {
    if (!archivo) return Promise.resolve(null);
    var fd = new FormData();
    fd.append('token', estado.tokenPaquete || estado.token);
    fd.append('file', archivo);
    return fetch(PSI.url + '/functions/v1/upload-proof', {
      method: 'POST',
      headers: { 'apikey': PSI.llave, 'Authorization': 'Bearer ' + PSI.llave },
      body: fd
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return (d && d.path) || null; })
      .catch(function () { return null; });
  }

  /* Vuelta a una cita desde el enlace guardado. Reconstruye lo justo del estado
     para reutilizar la misma pantalla de cierre en lugar de mantener dos. */
  function mostrarCitaGuardada(token) {
    PSI.rpc('get_booking', { p_token: token }).then(function (r) {
      if (!r || !r.ok || !r.appointment) {
        mostrar(1, false);
        alerta('vista1', 'No encontramos esa cita. Puede que el enlace esté incompleto.', 'error');
        return;
      }
      var a = r.appointment;
      estado.modo    = a.mode || 'online';
      estado.hora    = a.starts_at;
      estado.importe = Number(a.price_usd) || 0;
      estado.token   = token;
      estado.zona    = estado.zona || zonaVisitante();
      estado.resumen = { servicio: a.service, hora: a.starts_at };
      if (r.consultorio && r.consultorio.address) consultorio = r.consultorio;

      /* Una cita que aun no tiene pago declarado vuelve al paso 4, que es donde
         quedo la persona. Con el pago ya declarado, a la pantalla de cierre. */
      if (a.status === 'pending_payment' && !(r.payment && r.payment.status)) {
        estado.vence = a.hold_expires_at;
        prepararPago(r.payment_info);
        mostrar(3, false);
        return;
      }
      pintarCierre(r);
    });
  }

  /* Se llega aqui por dos caminos —acabar de pagar, o abrir el enlace guardado
     dias despues— y la pantalla es la misma. La diferencia es de donde salen los
     datos: del estado local en el primer caso, de get_booking en el segundo. */
  function refrescarWhatsapp() {
    var cab = document.querySelector('.wz-ayuda');
    if (cab) cab.href = enlaceWhatsapp('cabecera');
    if ($('waPago')) $('waPago').href = enlaceWhatsapp('pago');
    if ($('waFin'))  $('waFin').href  = enlaceWhatsapp('fin');
  }

  function pintarCierre(r) {
    var res = estado.resumen || {};
    var cita = r && r.appointment ? r.appointment : null;
    var servicio = (cita && cita.service) || res.servicio || 'Tu sesión';
    var presencial = estado.modo === 'presencial';
    var token = estado.tokenPaquete || estado.token;

    /* Estado del pago. Al recien terminar siempre es "por verificar"; volviendo
       por el enlace puede que Daryeli ya lo haya revisado, y eso es justo lo que
       la persona viene a mirar. */
    /* Sin respuesta del servidor, el estado sale de lo que la persona acaba de
       elegir: quien dijo "pago en la consulta" no tiene nada que verificar, y
       ensenarle "Por verificar" seria inventarse un pago que no existe. */
    var pago = r && r.payment ? r.payment.status
             : (estado.momento === 'despues' ? 'pendiente' : 'declared');
    var confirmada = cita && cita.status === 'confirmed';
    var etiquetas = {
      verified:  ['Pago verificado', 'wz-ok'],
      rejected:  ['Pago rechazado', 'wz-mal'],
      declared:  ['Por verificar', 'wz-pendiente'],
      pendiente: ['En la consulta', 'wz-pendiente']
    };
    var etq = etiquetas[pago] || etiquetas.declared;

    document.getElementById('tFin').textContent = confirmada
      ? 'Tu cita está confirmada'
      : 'Listo, tu cita está reservada';

    if (pago === 'pendiente') {
      $('finTexto').textContent = 'Tu horario está reservado. Le pagas a Daryeli cuando termine la sesión.';
    } else
    $('finTexto').textContent = confirmada
      ? 'Daryeli ya revisó tu pago. Nos vemos el día de la sesión.'
      : (archivo || (r && r.payment)
          ? 'Daryeli revisa tu comprobante y te confirma por correo. Suele tardar unas horas.'
          : 'Registramos tu pago. Daryeli lo verifica y te confirma por correo; si hace falta la captura, te la pedirá por WhatsApp.');

    var datos = filaResumen('dia',
      fechaLarga(diaEnZona(estado.hora, estado.zona)) + ' · ' + hora(estado.hora, estado.zona) +
      (estado.zona !== ZONA_DARYELI ? ' <small>(' + hora(estado.hora, ZONA_DARYELI) + ' en Caracas)</small>' : ''));
    datos += presencial
      ? filaResumen('lugar', 'Presencial · Barquisimeto')
      : filaResumen('modo', 'Online · por videollamada');

    $('finCita').innerHTML =
      '<p class="wz-resumen-etq">Tu cita</p>' +
      '<h2 class="wz-resumen-titulo">' + servicio + '</h2>' +
      '<ul class="wz-resumen-datos">' + datos + '</ul>' +
      '<p class="wz-resumen-total"><span>Pago</span>' +
      '<b class="wz-marca-estado ' + etq[1] + '">' + etq[0] + '</b></p>';

    /* Lo que faltaba entero: decir que pasa ahora. Sin esto la persona no sabe
       si tiene que hacer algo mas, y acaba preguntando por WhatsApp. */
    var pasos = [];
    if (pago === 'pendiente') {
      pasos.push('Le pagas a Daryeli cuando termine la sesión. Si prefieres dejarlo hecho antes, entra por el enlace de abajo.');
    } else if (!confirmada) {
      pasos.push('Daryeli revisa tu pago y te confirma la cita por correo.');
    }
    pasos.push(presencial
      ? 'El día de la cita, acércate al consultorio unos minutos antes.'
      : 'El enlace de la videollamada llega a tu correo.');
    pasos.push('Si necesitas cambiarla o cancelarla, escríbele por WhatsApp.');
    $('finPasos').innerHTML = pasos.map(function (t) { return '<li>' + t + '</li>'; }).join('');

    var caja = $('lugarFin');
    if (presencial && consultorio) {
      caja.innerHTML = tarjetaLugar(); caja.hidden = false;
    } else {
      caja.innerHTML = ''; caja.hidden = true;
    }

    if (token) {
      var url = location.origin + location.pathname + '?cita=' + encodeURIComponent(token);
      $('finUrl').textContent = url;
      $('copiarEnlace').dataset.copiar = url;
      $('finEnlace').hidden = false;
    } else {
      $('finEnlace').hidden = true;
    }

    refrescarWhatsapp();
    mostrar('fin');
  }

  function terminar() {
    if (reloj) clearInterval(reloj);
    var guardado = estado.tokenPaquete || estado.token;
    pintarCierre(null);
    limpiar();
    // limpiar() borra el token, pero el enlace ya quedo escrito en la pantalla.
    estado.token = guardado;
  }

  /* ---------- QUIEN VUELVE NO REESCRIBE ----------
     Un paciente habitual no deberia teclear su nombre, correo y telefono cada
     vez. Se guardan en localStorage —en SU dispositivo, nunca se envian a otro
     sitio— y se rellenan solos la proxima vez. Solo datos de contacto: nada de
     que sesion reservo ni cuando, que ya seria historial clinico en un sitio
     donde no pinta nada. */
  /* ---------- QUIEN RESERVA ----------

     Ya no se piden datos aqui: el panel los sabe y los deja corregir en "Mis
     datos". Lo unico que hace falta es el nombre, y solo para el mensaje de
     WhatsApp con contexto de la pantalla final. */
  var perfil = null;

  function cargarPerfil() {
    if (!PSI.sesion.hay()) return Promise.resolve(null);
    return PSI.rpc('mi_perfil').then(function (r) {
      if (r && r.ok) perfil = r;
      return perfil;
    });
  }


  /* ---------- GESTIONAR UNA CITA YA HECHA ---------- */

  function entrarReprogramar() {
    estado.reprogramando = estado.token;
    guardar();
    $('bandaRepro').hidden = false;
    $('reproActual').textContent =
      'Ahora es el ' + fechaLarga(diaEnZona(estado.hora, estado.zona)) +
      ' a las ' + hora(estado.hora, estado.zona) + '.';
    $('gestionCita').hidden = true;
    irA2();
  }

  function salirReprogramar() {
    estado.reprogramando = null;
    guardar();
    $('bandaRepro').hidden = true;
    $('gestionCita').hidden = false;
    pintarCierre(null);
  }

  function moverCita(iso) {
    PSI.rpc('reschedule_booking', {
      p_token: estado.reprogramando,
      p_starts_at: iso
    }).then(function (r) {
      if (!r || !r.ok) {
        alerta('vista2', (r && r.message) || 'No pudimos mover la cita.', 'error');
        if (r && (r.error === 'slot_taken' || r.error === 'slot_unavailable')) cargarMes();
        return;
      }
      estado.hora = iso;
      estado.resumen = estado.resumen || {};
      estado.resumen.hora = iso;
      estado.reprogramando = null;
      guardar();
      $('bandaRepro').hidden = true;
      $('gestionCita').hidden = false;
      pintarCierre(null);
    });
  }

  function cancelarCita() {
    /* Confirmacion antes de una accion que no se deshace. El texto dice lo que
       va a pasar de verdad —el horario se libera— y no un "estas seguro". */
    if (!window.confirm('Se cancelará tu cita y el horario quedará libre para otra persona. ¿Seguimos?')) return;
    PSI.rpc('cancel_booking', {
      p_token: estado.token,
      p_reason: 'Cancelada por el paciente desde su enlace'
    }).then(function (r) {
      if (!r || !r.ok) {
        alerta('vistaFin', (r && r.message) || 'No pudimos cancelar la cita.', 'error');
        return;
      }
      $('tFin').textContent = 'Tu cita quedó cancelada';
      $('finTexto').textContent = 'El horario volvió a quedar libre. Cuando quieras, puedes reservar otro.';
      $('gestionCita').hidden = true;
      $('finEnlace').hidden = true;
      $('finPasos').innerHTML = '';
      $('finCita').innerHTML = '';
      $('lugarFin').hidden = true;
      limpiar();
    });
  }

  /* ---------- WHATSAPP CON CONTEXTO ----------
     Cuando algo falla la persona escribe igual. La diferencia esta en si Daryeli
     recibe un "hola" suelto y tiene que averiguar quien es, o un mensaje que ya
     trae nombre, dia, hora y modalidad. Le ahorra media conversacion a ella y la
     verguenza de explicarse a quien escribe. */
  var WA = 'https://wa.me/584126724351';

  function enlaceWhatsapp(motivo) {
    var quien = ($('nombre') && $('nombre').value.trim()) ||
                (estado.resumen && estado.resumen.quien) || '';
    var yo = quien ? 'Soy ' + quien + '. ' : '';

    /* La cita SIN punto final: cada mensaje decide como sigue la frase. Con el
       punto dentro salia "a las 09:00, presencial. y tuve un problema". */
    var cita = estado.hora
      ? 'el ' + fechaLarga(diaEnZona(estado.hora, estado.zona)) +
        ' a las ' + hora(estado.hora, estado.zona) +
        (estado.modo === 'presencial' ? ', presencial' : ', online')
      : '';

    var t;
    if (motivo === 'pago') {
      t = 'Hola, Daryeli. ' + yo +
          (cita ? 'Reservé una sesión para ' + cita + ' y tuve un problema al registrar el pago.'
                : 'Reservé una sesión y tuve un problema al registrar el pago.');
    } else if (motivo === 'fin') {
      t = 'Hola, Daryeli. ' + yo +
          (cita ? 'Tengo mi cita ' + cita + '. Quería consultarte una cosa.'
                : 'Ya tengo agendada mi sesión. Quería consultarte una cosa.');
    } else {
      t = 'Hola, Daryeli. Estoy en tu página de reservas y tengo una duda antes de agendar.';
    }
    return WA + '?text=' + encodeURIComponent(t.replace(/\s+/g, ' ').trim());
  }

  /* ---------- VISTA PREVIA ----------
     ?demo=1..4 o ?demo=fin rellena el estado con datos de mentira y salta a esa
     pantalla, para poder revisar el diseno sin recorrer el flujo ni crear citas.

     SOLO FUNCIONA EN LOCALHOST. No es una comprobacion cosmetica: si esto
     viviera en produccion, cualquiera podria pintarse una pantalla de "pago
     confirmado" y ensenarsela a Daryeli. Los datos de pago son de relleno con
     la misma FORMA que los reales, para que la maqueta cuadre sin meter la
     cedula y el telefono de Daryeli en un archivo que se publica. */
  function esLocal() {
    return ['localhost', '127.0.0.1', '::1'].indexOf(location.hostname) >= 0;
  }

  function vistaPrevia(cual) {
    if (!esLocal()) return false;

    var s = catalogo.servicios[0];
    if (!s) return false;

    estado.servicio = s.slug;
    estado.plan     = '1';
    estado.importe  = Number(s.price_usd);
    estado.zona     = estado.zona || zonaVisitante();
    estado.token    = 'demo-token-para-vista-previa-000000000000';
    estado.resumen  = { servicio: s.name, hora: null };

    // Manana a las 10:00 de Caracas, para que el resumen ensene algo creible
    var d = new Date();
    d.setDate(d.getDate() + 1);
    estado.hora = new Date(ymd(d) + 'T14:00:00.000Z').toISOString();
    estado.resumen.hora = estado.hora;

    var q = new URLSearchParams(location.search);
    estado.modo    = q.get('modo') === 'presencial' ? 'presencial' : 'online';
    estado.prepago = q.get('prepago') === '1';
    estado.momento = 'ahora';
    estado.vence   = estado.prepago ? new Date(Date.now() + 55 * 60000).toISOString() : null;

    pintarModos();
    pintarServicios();
    pintarPlanes();
    refrescarBoton();

    if (cual === '1') { mostrar(1, false); return true; }
    if (cual === '2') { irA2(); return true; }
    
    /* Cuentas de relleno: misma forma que las de verdad, sin los datos de
       Daryeli. Lo que se revisa aqui es la maqueta, no el contenido. */
    var cuentas = [
      { bank_code: '0102', bank_name: 'Banco de Venezuela', id_number: 'V-00.000.000', phone: '0412-0000000' },
      { bank_code: '0172', bank_name: 'Bancamiga',          id_number: 'V-00.000.000', phone: '0412-0000000' }
    ];
    if (cual === '3') { prepararPago(cuentas); mostrar(3, false); return true; }
    if (cual === 'fin') { pintarCierre(null); return true; }
    return false;
  }

  /* ---------- ARRANQUE ---------- */
  function irA2() {
    pintarZonas();
    pintarContexto();
    mostrar(2);
    cargarMes().then(function () { $('ir4').disabled = !estado.hora; });
  }

  function enlazar() {
    /* Los modos ya no se enlazan uno a uno: el paso 1 entero va por delegacion
       en #vista1, asi que un boton repintado sigue respondiendo. */
    ['ir2Escritorio', 'ir2Movil'].forEach(function (id) {
      var x = $(id); if (x) x.addEventListener('click', irA2);
    });
    /* Delegado: el resumen se vuelve a pintar entero en cada cambio, asi que
       un listener atado al boton concreto se perderia en el primer repintado. */
    document.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('[data-cambiar]');
      if (b) mostrar(1);
    });
    $('formDatos').addEventListener('submit', function (e) { e.preventDefault(); reservar(); });
    $('formPago').addEventListener('submit', function (e) { e.preventDefault(); enviarPago(); });

    document.querySelectorAll('.wz-volver').forEach(function (b) {
      b.addEventListener('click', function () { mostrar(Number(b.dataset.volver)); });
    });

    /* Cambiar de mes NO borra el dia elegido si sigue existiendo: quien va a
       octubre a mirar y vuelve a septiembre encuentra su eleccion donde la
       dejo. Lo decide cargarMes(), que solo elige otro dia si el que habia no
       tiene huecos en el mes que se ve. */
    $('mesAtras').addEventListener('click', function () {
      mesVisible = new Date(mesVisible.getFullYear(), mesVisible.getMonth() - 1, 1);
      cargarMes();
    });
    $('mesAdelante').addEventListener('click', function () {
      mesVisible = new Date(mesVisible.getFullYear(), mesVisible.getMonth() + 1, 1);
      cargarMes();
    });

    /* ELEGIR DIA. Delegado en la rejilla, asi que repintar el mes no deja
       listeners sueltos detras. */
    $('calDias').addEventListener('click', function (ev) {
      /* `:not([aria-disabled])` en vez de `:not(:disabled)`: desde que los
         dias cerrados son enfocables, el navegador ya no bloquea sus clics y
         hay que descartarlos aqui. */
      var b = ev.target.closest('.cal-num:not([aria-disabled])');
      if (!b) return;
      diaElegido = b.dataset.dia;
      pintarCalendario();
      pintarHoras();
      var nuevo = $('calDias').querySelector('.cal-num[aria-pressed="true"]');
      if (nuevo) nuevo.focus();
    });

    /* EL TECLADO DEL CALENDARIO: flechas en las dos direcciones, Inicio y Fin
       para los extremos de la semana, y las de subir y bajar para saltar siete
       dias. Es lo que se espera de una rejilla de fechas, y sin esto cruzar el
       mes con el teclado pediria hasta 31 pulsaciones.

       Se mueve por dias de calendario y no por botones activos a proposito: al
       caer en un domingo cerrado se nota que ese dia existe y no tiene hueco,
       que es informacion. */
    $('calDias').addEventListener('keydown', function (ev) {
      var b = ev.target.closest('.cal-num');
      if (!b) return;

      /* Enter y espacio sobre un dia cerrado disparan `click` igual, porque el
         boton ya no esta deshabilitado de verdad. Se cortan aqui. */
      if ((ev.key === 'Enter' || ev.key === ' ') && b.getAttribute('aria-disabled')) {
        ev.preventDefault();
        return;
      }

      var salto = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[ev.key];
      var borde = { Home: 'inicio', End: 'fin' }[ev.key];
      if (salto === undefined && !borde) return;
      ev.preventDefault();

      var d = desdeYmd(b.dataset.dia);
      if (borde) {
        var dow = (d.getDay() + 6) % 7;             // lunes = 0
        d = sumaDias(d, borde === 'inicio' ? -dow : 6 - dow);
      } else {
        d = sumaDias(d, salto);
      }

      /* Salirse del mes lo cambia, que es lo natural: la flecha derecha en un
         31 lleva al 1 del mes siguiente. */
      if (d.getMonth() !== mesVisible.getMonth() || d.getFullYear() !== mesVisible.getFullYear()) {
        var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        if (d < hoy) return;
        mesVisible = new Date(d.getFullYear(), d.getMonth(), 1);
        diaElegido = huecos[ymd(d)] ? ymd(d) : diaElegido;
        cargarMes().then(function () {
          var destino = $('calDias').querySelector('.cal-num[data-dia="' + ymd(d) + '"]');
          if (destino) { destino.tabIndex = 0; destino.focus(); }
        });
        return;
      }

      var destino = $('calDias').querySelector('.cal-num[data-dia="' + ymd(d) + '"]');
      if (!destino) return;
      $('calDias').querySelectorAll('.cal-num').forEach(function (x) { x.tabIndex = -1; });
      destino.tabIndex = 0;
      destino.focus();
    });

    $('zonaSelect').addEventListener('change', function () {
      /* La hora elegida NO se borra: se guarda como instante, no como texto,
         asi que sigue siendo la misma cita mirada desde otro huso. Borrarla
         obligaba a elegir dos veces a quien solo queria comprobar a que hora
         le cae en su pais. */
      estado.zona = this.value;
      guardar();
      cargarMes();
    });

    // El número de columnas depende del ancho, así que al girar el teléfono
    // hay que repintar. Con margen para no repintar en cada píxel del gesto.
    var ultimoAncho = window.innerWidth, temp = null;
    window.addEventListener('resize', function () {
      if (Math.abs(window.innerWidth - ultimoAncho) < 40) return;
      ultimoAncho = window.innerWidth;
      clearTimeout(temp);
      temp = setTimeout(function () { if (!$('vista2').hidden) cargarMes(); }, 220);
    });

    // Validar al salir del campo, no en cada tecla: corregir a alguien
    // mientras todavía escribe es hostil.
    prepararSubida();
    prepararFecha();
    prepararReferencia();
    cargarPerfil();
    prepararCopiar();
    document.querySelectorAll('.wz-momento-op').forEach(function (b) {
      b.addEventListener('click', function () {
        estado.momento = b.dataset.momento; guardar(); marcarMomento();
      });
    });
    $('confirmarDespues').addEventListener('click', function () { pintarCierre(null); });
    $('btnReprogramar').addEventListener('click', entrarReprogramar);
    $('salirRepro').addEventListener('click', salirReprogramar);
    $('btnCancelar').addEventListener('click', cancelarCita);
  }

  function arrancar() {
    restaurar();
    estado.zona = estado.zona || zonaVisitante();

    pintarPrefijos();

    cargarCatalogo().then(function () {
      pintarModos();
      pintarServicios();
      pintarLugar();
      if (estado.servicio) pintarPlanes();
      refrescarBoton();
      enlazar();

      // Si ya había reserva creada se vuelve directo al pago. Este es el caso
      // que salva el sistema en móvil: la persona se fue al banco, el teléfono
      // descartó la pestaña, y al volver lo encuentra todo igual.
      var demo = new URLSearchParams(location.search).get('demo');
      if (demo && vistaPrevia(demo)) return;

      /* ?cita=TOKEN es la unica llave que tiene la persona para volver a su
         reserva: no hay cuenta ni contrasena, a proposito, porque una agenda de
         terapia no deberia obligar a registrarse.

         Va ANTES de restaurar lo que quedara en la pestana. Al reves, alguien
         que abriera su enlace en una pestana con estado viejo veia la cita
         equivocada, o ninguna. */
      var deEnlace = new URLSearchParams(location.search).get('cita');
      if (deEnlace) {
        mostrarCitaGuardada(deEnlace);
        return;
      }

      if (estado.token) {
        PSI.rpc('get_booking', { p_token: estado.token }).then(function (r) {
          if (!r || !r.ok || !r.appointment) {
            limpiar();
            location.replace(location.pathname);
            return;
          }
          // Sigue debiendo el pago: se retoma donde lo dejo.
          if (r.appointment.status === 'pending_payment' && !(r.payment && r.payment.status)) {
            estado.vence = r.appointment.hold_expires_at;
            prepararPago(r.payment_info);
            mostrar(3, false);
            history.replaceState({ paso: 3 }, '', '?paso=3');
            return;
          }
          /* Ya pago, o Daryeli ya la confirmo. Antes esto se tiraba a la basura
             y la persona volvia al paso 1 sin explicacion; ahora ve su cita. */
          mostrarCitaGuardada(estado.token);
        });
        return;
      }

      /* ?servicio=SLUG viene de las tarjetas de terapia de la portada. Quien
         pulsa "Agendar cita" en la de duelo ya dijo a que viene, y volver a
         preguntarselo aqui es hacerle repetir.

         NO salta al paso 2, aunque seria lo vistoso: en este paso se eligen
         DOS cosas, la terapia y si es consulta suelta o paquete, y el boton de
         continuar exige las dos. Saltar dejaria elegida media pregunta y el
         paso 1 a medio contestar detras. Lo que hace es dejar la terapia
         marcada y abrir los planes, que es donde sigue la conversacion.

         Va despues de ?cita= y de la reserva a medias a proposito: quien tiene
         una cita esperando pago vuelve a su cita, no empieza otra. */
      var pedido = new URLSearchParams(location.search).get('servicio');
      if (pedido && (catalogo.servicios || []).some(function (x) { return x.slug === pedido; })) {
        if (estado.servicio !== pedido) {
          /* Igual que al cambiar de terapia a mano: el plan y la hora que
             hubiera se caen, porque los precios son otros y el paquete elegido
             puede no existir en la modalidad nueva. */
          estado.servicio = pedido;
          estado.plan = null;
          estado.hora = null;
          guardar();
        }
        pintarServicios();
        pintarPlanes();
        refrescarBoton();
      }

      var q = new URLSearchParams(location.search);
      if (Number(q.get('paso')) >= 2 && estado.plan) irA2();
      else { mostrar(1, false); history.replaceState({ paso: 1 }, '', location.pathname); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();
})();
