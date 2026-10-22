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

  var CLAVE = 'psi_reserva_v2';
  var ZONA_DARYELI = FECHAS.ZONA_DARYELI;
  var HORAS_VISIBLES = 4;      // por columna antes de "ver más"

  var estado = {
    paso: 1,
    modo: 'online', servicio: null, plan: null,
    hora: null, zona: null,
    token: null, tokenPaquete: null,
    vence: null, importe: null, resumen: null,
    prepago: false, momento: 'ahora',
    reprogramando: null
  };

  var catalogo = { servicios: [], paquetes: [], bancos: [] };
  var inicioTira = null;       // Date del primer día de la tira
  var huecos = {};             // 'AAAA-MM-DD' -> [iso, iso...]
  var expandidos = {};         // días con todas las horas desplegadas
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
  var VISTAS = { 1: 'vista1', 2: 'vista2', 3: 'vista3', 4: 'vista4', fin: 'vistaFin' };
  var NOMBRES = { 1: 'Tu sesión', 2: 'Día y hora', 3: 'Tus datos', 4: 'Pago', fin: 'Listo' };

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

    var n = paso === 'fin' ? 4 : Number(paso);
    $('pasoNum').textContent = n;
    $('pasoNombre').textContent = NOMBRES[paso];
    $('barraRelleno').style.width = (paso === 'fin' ? 100 : (n / 4) * 100) + '%';
    $('barra').setAttribute('aria-valuenow', n);

    var h = document.querySelector('#' + VISTAS[paso] + ' h1');
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

  window.addEventListener('popstate', function (ev) {
    var p = (ev.state && ev.state.paso) || 1;
    // Con la reserva ya creada no se vuelve atrás: el cupo está tomado y
    // rehacer el paso 3 crearía una segunda cita.
    if (estado.token && p < 4) { mostrar(4, false); return; }
    mostrar(p, false);
  });

  /* ---------- CATÁLOGO ---------- */
  function cargarCatalogo() {
    return Promise.all([
      PSI.tabla('services', 'id,slug,name,duration_min,price_usd,sort_order', 'sort_order.asc'),
      PSI.tabla('packages', 'id,slug,name,modality,sessions_count,price_usd,valid_days,sort_order', 'sort_order.asc'),
      PSI.tabla('banks', 'code,name', 'sort_order.asc'),
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
    var nom = document.querySelector('#lugar .lugar-cab strong');
    var dir = document.querySelector('#lugar .lugar-dir');
    var ir  = $('lugarIr');
    if (nom && l.name) nom.textContent = l.name;
    if (dir) {
      var lineas = [l.address, l.city, l.reference].filter(Boolean);
      if (lineas.length) dir.innerHTML = lineas.map(escapar).join('<br>');
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

  /* ---------- MODALIDAD ---------- */
  var MODOS = [
    { v:'online',     n:'Online',     d:'video' },
    { v:'presencial', n:'Presencial', d:'pin' }
  ];

  function pintarModos() {
    var g = $('gModos'); if (!g) return;
    var botones = MODOS.map(function (m) {
      return '<button type="button" class="seg" role="radio" data-modo="' + m.v + '" ' +
        'aria-checked="' + (estado.modo === m.v) + '">' +
        ico(m.d) + '<span>' + m.n + '</span></button>';
    }).join('');
    /* La copia va SIN role ni data-modo: es solo tinta, no un control. Si
       llevara role="radio" el teclado la contaria como una opcion mas. */
    var copias = MODOS.map(function (m) {
      return '<span class="seg">' + ico(m.d) + '<span>' + m.n + '</span></span>';
    }).join('');

    g.innerHTML =
      '<span class="seg-hilo" aria-hidden="true"></span>' +
      '<span class="seg-ind" aria-hidden="true"></span>' +
      botones +
      '<span class="seg-copia" aria-hidden="true">' + copias + '</span>';

    roving(g);
    refrescarModo();
    abrirLugar(estado.modo === 'presencial');
  }

  /* No se repinta al cambiar de opcion: solo se mueven dos valores. Repintar
     crearia elementos nuevos y la transicion arrancaria de cero, sin
     deslizarse. */
  function refrescarModo() {
    var g = $('gModos'); if (!g) return;
    var dos = estado.modo === 'presencial';
    var ind = g.querySelector('.seg-ind');
    var cop = g.querySelector('.seg-copia');
    if (ind) ind.style.transform = dos ? 'translateX(calc(100% + 20px))' : 'translateX(0)';
    if (cop) cop.style.clipPath = dos ? 'inset(0 0 0 50%)' : 'inset(0 50% 0 0)';
  }

  /* Cerrado mide cero, pero sin `inert` sus botones seguirian en el orden de
     tabulacion y el teclado caeria dentro de un bloque invisible. */
  function abrirLugar(abre) {
    var l = $('lugar'); if (!l) return;
    l.classList.toggle('abierto', abre);
    l.setAttribute('aria-hidden', String(!abre));
    if (abre) l.removeAttribute('inert'); else l.setAttribute('inert', '');
  }

  /* ---------- MOTIVO ---------- */
  /* La foto va explicita y no deducida del slug. Deducir el nombre del archivo
     ata dos cosas que no tienen por que seguir atadas: el dia que la base tenga
     un motivo nuevo, la pagina pediria una imagen que no existe y dejaria el
     hueco roto. Si un slug no esta aqui, la fila se pinta sin foto y se ve
     igual de bien. */
  var FOTOS = {
    ansiedad:   '../ansiedad.webp',
    autoestima: '../autoestima.webp',
    pareja:     '../pareja.webp',
    duelo:      '../duelo.webp'
  };

  function pintarServicios() {
    var g = $('gServ'); if (!g) return;
    g.innerHTML = catalogo.servicios.map(function (s) {
      var foto = FOTOS[s.slug];
      return '<button type="button" class="fila" role="radio" data-serv="' + escapar(s.slug) + '" ' +
        'aria-checked="' + (estado.servicio === s.slug) + '">' +
        /* alt vacio a proposito: el nombre del motivo va al lado, en texto,
           dentro del mismo boton. Describir la foto ademas haria que el lector
           de pantalla anunciase dos veces la misma opcion. */
        (foto
          ? '<span class="serv-foto"><img src="' + foto + '" alt="" width="1600" height="1200" ' +
            'loading="lazy" decoding="async"></span>'
          : '') +
        '<span class="serv-nom">' + escapar(s.name) + '</span></button>';
    }).join('');
    roving(g);
  }

  /* ---------- CONSULTAS ---------- */
  function abrirPlanes(abre) {
    var b = $('bloquePlanes'); if (!b) return;
    b.classList.toggle('abierto', abre);
    b.setAttribute('aria-hidden', String(!abre));
    if (abre) b.removeAttribute('inert'); else b.setAttribute('inert', '');
  }

  /* Devuelve las opciones de consulta del servicio elegido: la suelta, que sale
     del propio servicio, y los paquetes de su modalidad. */
  function opcionesPlan() {
    var s = servicio(), m = modalidad();
    if (!s || !m) return [];
    /* "1" con cifra y no "Una": al lado de "3" y "5", la palabra rompe la
       comparacion que la persona esta haciendo, que es entre numeros. */
    var lista = [{ slug:'1', cifra:'1', nom:'Consulta', precio:Number(s.price_usd), ahorro:0 }];
    catalogo.paquetes.filter(function (p) { return p.modality === m; })
      .forEach(function (p, i) {
        var por = Number(p.price_usd) / p.sessions_count;
        lista.push({
          slug: p.slug,
          cifra: String(p.sessions_count),
          nom: 'Consultas',
          precio: Number(p.price_usd),
          ahorro: Math.round((Number(s.price_usd) - por) * p.sessions_count),
          /* La sugerida es el primer paquete, que es el escalon donde el ahorro
             aparece por primera vez. Es la misma que senalaba la maqueta. */
          sugerida: i === 0
        });
      });
    return lista;
  }

  function pintarPlanes() {
    var g = $('gPlanes'); if (!g) return;
    var lista = opcionesPlan();
    if (!lista.length) { abrirPlanes(false); return; }

    g.innerHTML = lista.map(function (p) {
      return '<button type="button" class="card' + (p.sugerida ? ' sugerida' : '') + '" ' +
        'role="radio" data-plan="' + escapar(p.slug) + '" ' +
        'aria-checked="' + (estado.plan === p.slug) + '">' +
        '<span class="plan-cab">' +
          '<span class="circ plan-cifra">' + p.cifra + '</span>' +
          '<span class="plan-nom">' + p.nom + '</span>' +
          (p.sugerida ? '<span class="plan-eti">Sugerida</span>' : '') +
        '</span>' +
        '<span class="plan-pie">' +
          '<span class="plan-precio">' + dinero(p.precio) + ' $</span>' +
          (p.ahorro > 0 ? '<span class="plan-ahorro">Ahorras ' + dinero(p.ahorro) + ' $</span>' : '') +
        '</span></button>';
    }).join('');
    abrirPlanes(true);
    roving(g);
  }

  /* ---------- LO QUE LLEVA AL PASO 2 ---------- */
  /* Dos botones y no uno: el de escritorio va dentro del flujo, al final de las
     decisiones, y el del movil vive anclado abajo, donde llega el pulgar. Solo
     uno se ve a la vez, pero los dos tienen que saber si se puede seguir. */
  function refrescarBoton() {
    var listo = !!(estado.servicio && estado.plan);
    ['ir2Escritorio', 'ir2Movil'].forEach(function (id) {
      var b = $(id); if (b) b.disabled = !listo;
    });
    pintarResumen();
  }

  /* El resumen se arma de lo que ya hay en estado, sin inventar nada:
     modalidad siempre, motivo cuando se elige, y consultas con su precio. */
  function pintarResumen() {
    var caja = $('resumen'); if (!caja) return;
    var s = servicio();
    var partes = [estado.modo === 'presencial' ? 'Presencial' : 'Online'];
    if (s) partes.push(s.name);
    var p = null;
    if (s && estado.plan) {
      p = opcionesPlan().filter(function (x) { return x.slug === estado.plan; })[0];
    }
    if (p) partes.push(p.cifra + ' ' + p.nom);
    var txt = partes.map(escapar).join(' · ');
    /* Un solo separador en toda la linea, el mismo punto medio: en castellano
       el guion largo abre incisos, no significa "y esto cuesta". La jerarquia
       la lleva la negrita, no la puntuacion ni una palabra de mas. */
    caja.innerHTML = p ? txt + ' · <b>' + dinero(p.precio) + ' $</b>' : txt;
  }

  /* ---------- TECLADO Y SELECCION ---------- */
  /* El grupo de modalidad ya no contiene solo radios: lleva ademas el hilo, el
     aro y la copia. Hay que recorrer los radios de verdad, no todos los hijos. */
  function radios(g) {
    return [].slice.call(g.querySelectorAll('[role="radio"]'));
  }

  /* Un solo tabulador por grupo, que es lo que pide el patron de radiogroup:
     se entra al grupo con Tab y se recorre con las flechas. */
  function roving(g) {
    var rs = radios(g);
    rs.forEach(function (b) {
      b.tabIndex = b.getAttribute('aria-checked') === 'true' ? 0 : -1;
    });
    if (!rs.some(function (b) { return b.tabIndex === 0; }) && rs[0]) rs[0].tabIndex = 0;
  }

  function alElegir(g, b) {
    radios(g).forEach(function (o) { o.setAttribute('aria-checked', String(o === b)); });
    roving(g);

    if (g === $('gModos')) {
      estado.modo = b.dataset.modo;
      refrescarModo();
      abrirLugar(estado.modo === 'presencial');
    } else if (g === $('gServ')) {
      var previo = estado.servicio;
      estado.servicio = b.dataset.serv;
      /* Cambiar de motivo tira el plan: los precios son otros y el paquete que
         estaba elegido puede no existir en la modalidad nueva. */
      if (previo !== estado.servicio) { estado.plan = null; estado.hora = null; }
      pintarPlanes();
    } else {
      estado.plan = b.dataset.plan;
    }
    guardar();
    refrescarBoton();
  }

  /* La delegacion se acota a #vista1 a proposito. Los pasos 2, 3 y 4 tienen sus
     propios controles con role="radio" —las horas, las cuentas, el momento de
     pago— y un listener a nivel de documento se los habria comido tambien,
     mandandolos por este camino. */
  document.addEventListener('click', function (ev) {
    if (!ev.target.closest) return;
    var b = ev.target.closest('#vista1 [role="radio"]');
    if (!b) return;
    var g = b.closest('[role="radiogroup"]');
    if (g) alElegir(g, b);
  });

  document.addEventListener('keydown', function (ev) {
    if (!ev.target.closest) return;
    var g = ev.target.closest('#vista1 [role="radiogroup"]');
    if (!g) return;
    var teclas = ['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'];
    if (teclas.indexOf(ev.key) < 0) return;
    ev.preventDefault();
    var hijos = radios(g);
    var i = hijos.indexOf(ev.target);
    if (i < 0) i = 0;
    var n = ev.key === 'Home' ? 0
          : ev.key === 'End' ? hijos.length - 1
          : (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') ? (i + 1) % hijos.length
          : (i - 1 + hijos.length) % hijos.length;
    alElegir(g, hijos[n]);
    hijos[n].focus();
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

    ['contextoDatos', 'contextoDatos3', 'contextoDatos4'].forEach(function (id) {
      var el = $(id); if (el) el.innerHTML = html;
    });
  }

  /* ---------- PASO 2 · TIRA DE DÍAS ---------- */
  function diasVisibles() {
    var w = window.innerWidth;
    return w < 560 ? 3 : (w < 900 ? 4 : 5);
  }

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

  function cargarTira() {
    var n = diasVisibles();
    var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    if (!inicioTira || inicioTira < hoy) inicioTira = hoy;

    $('dias').innerHTML = '<p class="wz-cargando">Buscando horarios…</p>';

    // Un día extra a cada lado: un hueco de las 9:00 de Caracas puede caer en
    // otro día natural según la zona de quien mira.
    return PSI.rpc('get_available_slots', {
      p_service_slug: estado.servicio,
      p_from: ymd(sumaDias(inicioTira, -1)),
      p_to: ymd(sumaDias(inicioTira, n + 1)),
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
      }
      pintarTira();
    });
  }

  function pintarTira() {
    var n = diasVisibles();
    var cont = $('dias');
    cont.innerHTML = '';

    var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    var hoyStr = ymd(hoy);
    var mismaZona = estado.zona === ZONA_DARYELI;
    var hayAlguno = false;

    var fin = sumaDias(inicioTira, n - 1);
    var fmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
    $('tiraRango').textContent = fmt.format(inicioTira) + ' – ' + fmt.format(fin);
    /* La duracion se dice UNA vez aqui y no doce veces dentro de los huecos: a
       390 px cada columna mide unos 105 px y "09:00 - 10:00" no cabe, pero la
       duda que resuelve —cuanto tiempo hay que apartar— es la misma. */
    var srv = servicio();
    if ($('tiraDuracion') && srv) $('tiraDuracion').textContent = 'Sesiones de ' + duracion(srv.duration_min);

    for (var i = 0; i < n; i++) {
      var d = sumaDias(inicioTira, i);
      var clave = ymd(d);
      var libres = (huecos[clave] || []).slice().sort();
      if (libres.length) hayAlguno = true;

      var col = document.createElement('div');
      /* La columna entera se apaga cuando no hay nada: si solo se apagaba el
         hueco, la cabecera seguia igual de viva y el dia parecia disponible. */
      col.className = 'wz-col' + (clave === hoyStr ? ' wz-col-hoy' : '') +
                      (libres.length ? '' : ' wz-col-sin');

      var dia = new Intl.DateTimeFormat('es-ES', { weekday: 'short' }).format(d).replace('.', '');
      col.innerHTML =
        '<div class="wz-col-cabecera">' +
          '<span class="wz-col-dia">' + dia + '</span>' +
          '<span class="wz-col-num">' + d.getDate() + '</span>' +
        '</div>';

      if (!libres.length) {
        /* Un guion dentro de una caja de borde punteado se lee como un campo
           roto, no como "ese dia no hay". Se dice con palabras.

           Y hoy no es lo mismo que un domingo: hoy quedan huecos, lo que pasa
           es que ya no dan tiempo a pagarlos. Si ambos dijeran "Sin horarios",
           quien entra por la tarde pensaria que Daryeli no atiende los
           miercoles. */
        var v = document.createElement('p');
        v.className = 'wz-col-vacio';
        v.textContent = clave === hoyStr ? 'Ya no quedan huecos hoy' : 'Sin horarios';
        v.setAttribute('aria-label', fechaLarga(clave) + ': ' +
          (clave === hoyStr ? 'ya no quedan huecos para hoy' : 'sin horarios disponibles'));
        col.appendChild(v);
      } else {
        var tope = expandidos[clave] ? libres.length : Math.min(HORAS_VISIBLES, libres.length);
        for (var j = 0; j < tope; j++) {
          col.appendChild(botonHueco(libres[j], mismaZona));
        }
        if (libres.length > tope) {
          col.appendChild(botonMas(clave, libres.length - tope));
        }
      }
      cont.appendChild(col);
    }

    if (!hayAlguno) {
      cont.innerHTML = '<p class="wz-vacio">No hay huecos en estos días. Prueba con la semana siguiente.</p>';
    }

    $('diasAtras').disabled = inicioTira <= hoy;
    pintarContexto();
  }

  function botonHueco(iso, mismaZona) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'wz-hueco';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', estado.hora === iso ? 'true' : 'false');
    var propia = hora(iso, estado.zona);
    var caracas = hora(iso, ZONA_DARYELI);
    b.innerHTML = '<span>' + propia + '</span>' +
      (mismaZona ? '' : '<span class="wz-hueco-alt">' + caracas + ' Ccs</span>');
    b.setAttribute('aria-label',
      fechaLarga(diaEnZona(iso, estado.zona)) + ' a las ' + propia +
      (mismaZona ? '' : ', que son las ' + caracas + ' en Caracas'));
    b.addEventListener('click', function () {
      /* Al reprogramar, elegir un hueco NO es avanzar al paso siguiente: es la
         accion completa. Confirmar despues obligaria a un paso de mas para algo
         que ya se decidio al tocar la hora. */
      if (estado.reprogramando) { moverCita(iso); return; }
      estado.hora = iso; guardar();
      pintarTira();
      $('ir3').disabled = false;
    });
    return b;
  }

  function botonMas(clave, cuantos) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'wz-mas';
    b.textContent = '+' + cuantos + ' más';
    b.addEventListener('click', function () { expandidos[clave] = true; pintarTira(); });
    return b;
  }

  /* ---------- PASO 3 ---------- */
  function error(campo, err, msg) {
    var e = $(err), c = campo ? $(campo) : null;
    if (msg) { e.textContent = msg; e.hidden = false; if (c) c.setAttribute('aria-invalid', 'true'); }
    else { e.hidden = true; e.textContent = ''; if (c) c.removeAttribute('aria-invalid'); }
  }

  /* Lo unico que queda por comprobar aqui es el consentimiento. Nombre, correo
     y telefono ya no se piden: vienen de la cuenta. Si hay que corregirlos se
     hace en el panel de correccion, que valida por su cuenta. */
  function validarDatos() {
    if ($('consent').checked) { error(null, 'errConsent', null); return true; }
    error(null, 'errConsent', 'Para reservar hace falta aceptar el consentimiento.');
    $('consent').focus();
    return false;
  }

  /* Los campos del panel de correccion. Van aparte porque solo estan a la vista
     mientras el panel esta abierto, y exigirlos siempre impediria reservar a
     quien no ha abierto nada. */
  function validarEdicion() {
    var ok = true, primero = null;
    var n = $('nombre').value.trim(), t = $('telefono').value.trim();

    if (n.length < 2) { error('nombre', 'errNombre', 'Escribe tu nombre y apellido.'); ok = false; primero = 'nombre'; }
    else error('nombre', 'errNombre', null);

    if (t.replace(/[^0-9]/g, '').length < 7) { error('telefono', 'errTelefono', 'Escribe un teléfono donde podamos ubicarte.'); ok = false; primero = primero || 'telefono'; }
    else error('telefono', 'errTelefono', null);

    if (!ok && primero) $(primero).focus();
    return ok;
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
          setTimeout(function () { mostrar(2); cargarTira(); }, 1800);
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
      mostrar(4);
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
        mostrar(4, false);
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
  /* ---------- LA FICHA DE QUIEN RESERVA ---------- */

  /* Antes los datos de contacto se guardaban en ESTE navegador para no tener
     que teclearlos otra vez. Ya no hace falta: viven en la cuenta, y la cuenta
     acompana a la persona a cualquier dispositivo. Lo que queda por hacer aqui
     no es recogerlos, es ensenarlos para que se puedan revisar. */
  var perfil = null;

  function pintarFicha() {
    if (!perfil) return;
    $('fNombre').textContent = perfil.nombre;
    $('fCorreo').textContent = perfil.correo;
    $('fTel').textContent    = perfil.telefono;
  }

  function cargarPerfil() {
    if (!PSI.sesion.hay()) {
      $('fNombre').textContent  = 'Entra en tu cuenta para reservar.';
      $('fCorreo').textContent  = '';
      $('fTel').textContent     = '';
      $('corregir').textContent = 'Entrar o crear cuenta';
      return Promise.resolve(null);
    }
    return PSI.rpc('mi_perfil').then(function (r) {
      if (!r || !r.ok) {
        /* Sin ficha no se puede reservar, y el sitio donde se arregla es la
           pantalla de entrar: su registro pide exactamente lo que falta. */
        if (r && r.error === 'perfil_incompleto') { aEntrar(); return null; }
        $('fNombre').textContent = 'No pudimos cargar tus datos.';
        return null;
      }
      perfil = r;
      pintarFicha();
      return r;
    });
  }

  /* El telefono se guarda entero (+584121234567) y el formulario lo quiere
     partido. Se busca el prefijo MAS LARGO que encaje, no el primero: +1 y +58
     conviven en la lista, y quedarse con el primero que case cortaria mal los
     numeros de los paises de prefijo largo. */
  function partirTelefono(t) {
    var sel = $('paisTel'), mejor = '', i, v;
    t = String(t || '');
    if (t.charAt(0) === '+') {
      for (i = 0; i < sel.options.length; i++) {
        v = sel.options[i].value;
        if (v && t.indexOf(v) === 0 && v.length > mejor.length) mejor = v;
      }
    }
    return mejor ? { pref: mejor, num: t.slice(mejor.length) } : { pref: '', num: t };
  }

  function verEdicion(abierta) {
    $('fichaResumen').hidden = abierta;
    $('camposDatos').hidden  = !abierta;
    /* Mientras se corrige no se reserva: quedarian dos acciones principales a
       la vez y no estaria claro cual manda. */
    $('ir4').disabled = abierta;
    if (abierta) $('nombre').focus();
    else $('corregir').focus();
  }

  function prepararFicha() {
    $('corregir').addEventListener('click', function () {
      if (!PSI.sesion.hay()) { aEntrar(); return; }
      if (!perfil) return;
      $('nombre').value = perfil.nombre;
      var t = partirTelefono(perfil.telefono);
      if (t.pref) $('paisTel').value = t.pref;
      $('telefono').value = t.num;
      error('nombre', 'errNombre', null);
      error('telefono', 'errTelefono', null);
      $('errGuardar').hidden = true;
      verEdicion(true);
    });

    $('cancelarDatos').addEventListener('click', function () { verEdicion(false); });

    $('guardarDatos').addEventListener('click', function () {
      if (!validarEdicion()) return;
      var b = $('guardarDatos');
      b.disabled = true;
      var nuevos = {
        nombre:   $('nombre').value.trim(),
        telefono: $('paisTel').value + $('telefono').value.replace(/[^0-9]/g, ''),
        /* Se reenvian tambien los dos que aqui no se editan: lo que se manda
           SUSTITUYE a lo que habia, asi que omitirlos borraria la nacionalidad
           y el pais, que son los que deciden la tarifa. */
        nacionalidad: perfil.nacionalidad,
        pais:         perfil.pais
      };
      PSI.sesion.actualizarDatos(nuevos).then(function (r) {
        b.disabled = false;
        if (!r || !r.ok) {
          $('errGuardar').textContent = (r && r.message) || 'No pudimos guardar los cambios.';
          $('errGuardar').hidden = false;
          return;
        }
        perfil.nombre   = nuevos.nombre;
        perfil.telefono = nuevos.telefono;
        pintarFicha();
        verEdicion(false);
      });
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
        if (r && (r.error === 'slot_taken' || r.error === 'slot_unavailable')) cargarTira();
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
    if (cual === '3') { pintarContexto(); mostrar(3, false); return true; }

    /* Cuentas de relleno: misma forma que las de verdad, sin los datos de
       Daryeli. Lo que se revisa aqui es la maqueta, no el contenido. */
    var cuentas = [
      { bank_code: '0102', bank_name: 'Banco de Venezuela', id_number: 'V-00.000.000', phone: '0412-0000000' },
      { bank_code: '0172', bank_name: 'Bancamiga',          id_number: 'V-00.000.000', phone: '0412-0000000' }
    ];
    if (cual === '4') { prepararPago(cuentas); mostrar(4, false); return true; }
    if (cual === 'fin') { pintarCierre(null); return true; }
    return false;
  }

  /* ---------- ARRANQUE ---------- */
  function irA2() {
    pintarZonas();
    pintarContexto();
    mostrar(2);
    cargarTira().then(function () { $('ir3').disabled = !estado.hora; });
  }

  function enlazar() {
    /* Los modos ya no se enlazan uno a uno: el paso 1 entero va por delegacion
       en #vista1, asi que un boton repintado sigue respondiendo. */
    ['ir2Escritorio', 'ir2Movil'].forEach(function (id) {
      var x = $(id); if (x) x.addEventListener('click', irA2);
    });
    $('ir3').addEventListener('click', function () { pintarContexto(); mostrar(3); });
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

    $('diasAtras').addEventListener('click', function () {
      inicioTira = sumaDias(inicioTira, -diasVisibles());
      var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      if (inicioTira < hoy) inicioTira = hoy;
      expandidos = {};
      cargarTira();
    });
    $('diasAdelante').addEventListener('click', function () {
      inicioTira = sumaDias(inicioTira, diasVisibles());
      expandidos = {};
      cargarTira();
    });

    $('zonaSelect').addEventListener('change', function () {
      /* La hora elegida NO se borra: se guarda como instante, no como texto,
         asi que sigue siendo la misma cita mirada desde otro huso. Borrarla
         obligaba a elegir dos veces a quien solo queria comprobar a que hora
         le cae en su pais. */
      estado.zona = this.value;
      guardar();
      cargarTira();
    });

    // El número de columnas depende del ancho, así que al girar el teléfono
    // hay que repintar. Con margen para no repintar en cada píxel del gesto.
    var ultimoAncho = window.innerWidth, temp = null;
    window.addEventListener('resize', function () {
      if (Math.abs(window.innerWidth - ultimoAncho) < 40) return;
      ultimoAncho = window.innerWidth;
      clearTimeout(temp);
      temp = setTimeout(function () { if (!$('vista2').hidden) cargarTira(); }, 220);
    });

    // Validar al salir del campo, no en cada tecla: corregir a alguien
    // mientras todavía escribe es hostil.
    ['nombre', 'telefono'].forEach(function (id) {
      $(id).addEventListener('blur', function () { if (this.value.trim()) validarEdicion(); });
    });

    prepararSubida();
    prepararFecha();
    prepararReferencia();
    prepararFicha();
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
            mostrar(4, false);
            history.replaceState({ paso: 4 }, '', '?paso=4');
            return;
          }
          /* Ya pago, o Daryeli ya la confirmo. Antes esto se tiraba a la basura
             y la persona volvia al paso 1 sin explicacion; ahora ve su cita. */
          mostrarCitaGuardada(estado.token);
        });
        return;
      }

      var q = new URLSearchParams(location.search);
      if (Number(q.get('paso')) >= 2 && estado.plan) irA2();
      else { mostrar(1, false); history.replaceState({ paso: 1 }, '', location.pathname); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();
})();
