/* ==========================================================================
   VISTA DE RESERVA · PASO 1 · comportamiento
   ==========================================================================

   Sin backend y sin sesión: los datos están abajo, en DATOS, para poder
   diseñar sin Supabase. En la página real llegan de la base con la misma
   forma, así que el resto del archivo no cambiaría.

   QUÉ HACE, y nada más:
     · pinta las opciones desde DATOS
     · calcula el precio de cada plan y el total
     · abre y cierra las pestañas según lo contestado
     · enseña la dirección cuando la modalidad es presencial

   LO QUE NO HACE A PROPÓSITO: no guarda nada, no llama a ninguna API y no
   navega. Es una superficie de diseño.
   ========================================================================== */

(function () {
  'use strict';

  /* ---------------------------------------------------------------- DATOS
     Los cuatro servicios y los tres planes, con los precios reales de la
     semilla del proyecto. `porSesion` es lo que cuesta cada consulta dentro
     de cada plan: el bono sale más barato, que es su sentido. */
  var DATOS = {
    /* Cada modalidad trae la nota que se enseña debajo al elegirla. La
       duracion sale de `duration_min` en la tabla `services`: son 60 minutos
       en las cuatro terapias. */
    modos: [
      { id: 'online', nombre: 'En línea',
        /* Solo la duracion. Estaba ademas "Te llega el enlace por correo al
           confirmarse el pago. No hace falta instalar nada": lo primero se
           sabe cuando llega el correo, y lo segundo es una tranquilidad que
           nadie estaba pidiendo en este punto. Decision de Edgar. */
        nota: '<strong>60 minutos por videollamada</strong>' },
      { id: 'presencial', nombre: 'Presencial',
        /* "Como llegar" pasa de enlace de texto a boton redondo en salvia, el
           color de la accion en esta pantalla. El texto sigue existiendo para
           quien no ve el icono: va en `aria-label`, y ahi se dice ademas que
           abre una pestaña nueva, porque un icono solo no puede avisarlo. */
        nota: '<strong>Centro Humanista Intellego</strong>' +
              'Calle 19, entre carreras 28 y 29. Barquisimeto, estado Lara.' +
              '<a class="mapa" ' +
              'href="https://www.google.com/maps/search/?api=1&query=' +
              'Calle+19+entre+carreras+28+y+29%2C+Barquisimeto%2C+Lara" ' +
              'target="_blank" rel="noopener noreferrer" ' +
              'title="Cómo llegar" ' +
              'aria-label="Cómo llegar, se abre el mapa en una pestaña nueva">' +
              /* LA FLECHA VA RELLENA, no a trazo. A 18 px dentro de un circulo,
                 una flecha de contorno con curvas se ve sucia: los trazos se
                 juntan en la punta y el ojo no lee la forma. Maciza y con
                 geometria de cuatro puntos sin una sola curva, se lee limpia.
                 La punta arriba es el gesto de "navegar", no de "aqui hay un
                 sitio", que es lo que decia la chincheta. */
              '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
              '<path d="M12 3 20 21 12 17 4 21Z"/></svg></a>' }
    ],

    servicios: [
      { id: 'ansiedad',   nombre: 'Superar la Ansiedad',      precio: 30 },
      { id: 'autoestima', nombre: 'Fortalecer tu Autoestima', precio: 30 },
      { id: 'pareja',     nombre: 'Sanar en Pareja',          precio: 45 },
      { id: 'duelo',      nombre: 'Acompañar un Duelo',       precio: 30 }
    ],

    /* `dias` es el plazo para agendar. Los 60 de los paquetes salen de
       `valid_days` en la tabla `packages` de Supabase.

       OJO CON LOS 30 DE LA CONSULTA SUELTA: ES PROVISIONAL Y ESCRITO A MANO.
       La base NO lo tiene — `valid_days` solo existe en `packages`, y una
       consulta suelta no es un paquete—, asi que ese numero no esta respaldado
       por nada. Decision de Edgar para verlo funcionando; hay que confirmarlo
       con Daryeli y, si la regla existe de verdad, guardarla en la base antes
       de que la pagina sea publica. */
    planes: [
      { id: '1', sesiones: 1, nombre: 'Consulta',  dias: 30 },
      { id: '3', sesiones: 3, nombre: 'Consultas', dias: 60 },
      { id: '5', sesiones: 5, nombre: 'Consultas', dias: 60 }
    ],

    /* precio de la consulta suelta -> precio por sesión en cada plan */
    porSesion: {
      30: { 1: 30, 3: 25, 5: 25 },
      45: { 1: 45, 3: 30, 5: 30 }
    }
  };

  /* --------------------------------------------------------------- ESTADO */
  /* NADA PREELEGIDO, tampoco la modalidad. Venia con 'online' puesto, y eso
     rompia la secuencia: el bloque de terapias se abre al ELEGIR modalidad, y
     con una ya elegida sin que la persona toque nada, se abria de entrada.
     Decision de Edgar: la secuencia arranca con una sola pregunta. */
  var estado = { modo: null, servicio: null, plan: null, paso: 1 };

  /* --------------------------------------------------------------- ATAJOS */
  var $ = function (id) { return document.getElementById(id); };

  function dinero(n) { return n + ' $'; }

  /* Los dos iconos de la nota. Van aqui y no en el HTML porque la nota se
     reescribe entera al cambiar de modalidad. */
  var ICONO = {
    online: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="2.5" y="4.5" width="19" height="13" rx="2"/>' +
      '<path d="M8 21h8M12 17.5V21"/></svg>',
    presencial: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/>' +
      '<circle cx="12" cy="10" r="2.6"/></svg>'
  };

  /* Escapar antes de meter texto en innerHTML. Aquí los datos son míos, pero
     en la página real vienen de la base y esto deja de ser opcional. */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  /* ------------------------------------------------------- LA APERTURA

     `inert` y `aria-hidden` van junto a la clase y no son opcionales: cerrado
     el bloque mide cero, pero sus radios seguirian en el orden de tabulacion y
     el teclado caeria dentro de algo invisible.

     VOLVER ATRAS NO CIERRA NADA — decision de Edgar. Esta funcion solo se
     llama para abrir; nada la llama con `false` una vez abierto. Cambiar la
     modalidad con todo contestado deja los bloques de despues como estaban,
     porque hacer desaparecer contenido debajo del cursor de alguien es peor
     que dejar a la vista una pregunta que ya no aplica.                      */
  function abrir(id, abre) {
    var caja = $(id);
    if (!caja) return;

    /* Se anuncia SOLO al abrirse, no en cada cambio. Si esta funcion se llama
       con un bloque que ya estaba abierto —pasa cada vez que se cambia de
       terapia— repetir el anuncio seria ruido: el lector diria "Consulta o
       paquete, 3 opciones" otra vez sin que haya aparecido nada. */
    var yaEstaba = caja.classList.contains('abierto');

    caja.classList.toggle('abierto', abre);
    caja.setAttribute('aria-hidden', String(!abre));
    if (abre) caja.removeAttribute('inert');
    else caja.setAttribute('inert', '');

    if (abre && !yaEstaba) anunciarApertura(caja);
  }

  /* El anuncio dice QUE ha aparecido y CUANTAS opciones trae. El numero importa
     mas de lo que parece: quien no ve la pantalla necesita saber si le esperan
     dos decisiones o diez antes de empezar a recorrerlas con el teclado. */
  function anunciarApertura(caja) {
    var leyenda = caja.querySelector('legend');
    var cuantas = caja.querySelectorAll('input[type="radio"]').length;
    if (!leyenda) return;

    /* El eco lleva `aria-hidden`, pero `textContent` no lo respeta: hay que
       quitarlo a mano o el anuncio saldria como "Que quieres trabajar sin
       elegir, 4 opciones". */
    var eco = leyenda.querySelector('.eco');
    var titulo = leyenda.textContent;
    if (eco) titulo = titulo.replace(eco.textContent, '');

    $('anuncio').textContent = titulo.trim() + ', ' + cuantas + ' opciones';
  }

  /* ------------------------------------------------------------- PINTAR */

  /* Una fila por opción: radio nativo escondido, círculo dibujado, nombre.
     El radio va dentro del label, así que no hace falta `for`/`id`. */
  function fila(grupo, valor, nombre, marcado) {
    return '<label class="op">' +
             '<input type="radio" name="' + grupo + '" value="' + esc(valor) + '"' +
               (marcado ? ' checked' : '') + '>' +
             '<span class="dot" aria-hidden="true"></span>' +
             '<span>' + esc(nombre) + '</span>' +
           '</label>';
  }

  function pintarModos() {
    $('grupoModo').innerHTML = DATOS.modos.map(function (m) {
      return fila('modo', m.id, m.nombre, estado.modo === m.id);
    }).join('');
  }

  /* La nota que acompaña a la modalidad elegida. Rellena el aire que sobraba
     en esta columna con el dato que hace falta en ese momento, no con
     decoracion. */
  function pintarNotaModo() {
    var m = DATOS.modos.filter(function (x) { return x.id === estado.modo; })[0];
    var caja = $('modoNota');
    if (!m) { caja.hidden = true; return; }
    caja.hidden = false;
    caja.innerHTML = (ICONO[m.id] || '') + '<span>' + m.nota + '</span>';
  }

  function pintarServicios() {
    $('grupoServicio').innerHTML = DATOS.servicios.map(function (s) {
      return fila('servicio', s.id, s.nombre, estado.servicio === s.id);
    }).join('');
  }

  /* Los precios siguen al servicio: elegir pareja no puede dejar "75 $"
     escrito debajo cuando ya son 90. Y mientras no haya servicio elegido no
     hay precio que enseñar, así que va un guion: poner una cifra antes sería
     inventársela. */
  function pintarPlanes() {
    var serv = servicioElegido();
    var tabla = serv ? (DATOS.porSesion[serv.precio] || DATOS.porSesion[30]) : null;

    $('grupoPlan').innerHTML = DATOS.planes.map(function (p) {
      var total  = tabla ? tabla[p.sesiones] * p.sesiones : null;
      var ahorro = tabla ? (serv.precio * p.sesiones) - total : 0;

      return '<label class="plan">' +
               '<input type="radio" name="plan" value="' + esc(p.id) + '"' +
                 (estado.plan === p.id ? ' checked' : '') + '>' +
               '<span class="dot" aria-hidden="true"></span>' +
               '<span class="plan-nom">' + p.sesiones + ' ' + esc(p.nombre) + '</span>' +
               '<span class="plan-precio">' +
                 (total === null ? '—' : dinero(total)) +
               '</span>' +
               '<span class="plan-ahorro">' +
                 (ahorro > 0 ? 'Ahorras ' + dinero(ahorro) : '') +
               '</span>' +
             '</label>';
    }).join('');
  }

  /* ------------------------------------------------------------ CONSULTAS */

  function servicioElegido() {
    return DATOS.servicios.filter(function (s) { return s.id === estado.servicio; })[0] || null;
  }

  function planElegido() {
    return DATOS.planes.filter(function (p) { return p.id === estado.plan; })[0] || null;
  }

  function totalActual() {
    var s = servicioElegido(), p = planElegido();
    if (!s || !p) return null;
    var tabla = DATOS.porSesion[s.precio] || DATOS.porSesion[30];
    return tabla[p.sesiones] * p.sesiones;
  }

  /* --------------------------------------------------------- EL PLAZO

     Solo sale con un plan elegido, y el texto sigue al plan. En singular con
     la consulta suelta y en plural con los paquetes: "tus consultas" cuando
     hay una sola es el tipo de descuido que delata una plantilla.            */

  /* PORTAPAPELES CON LAPIZ, la variante 1 de la comparativa. Es el unico de los
     cinco con dos objetos, y por eso el icono va a 16 px y no a 14: con dos
     objetos de contorno, esos dos pixeles son la diferencia entre que se
     distinga el lapiz y que se empaste con el borde del portapapeles.

     El cuerpo esta ABIERTO por la derecha a proposito —solo llega hasta donde
     empieza el lapiz— para que los dos trazos no se toquen. Cerrarlo del todo
     y poner el lapiz encima es lo que convierte el dibujo en una mancha. */
  var ICONO_PLAZO = '<svg class="ico" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M9.5 4H7.6A2.1 2.1 0 0 0 5.5 6.1v12.3A2.1 2.1 0 0 0 7.6 20.5h4.6"/>' +
    '<rect x="9.2" y="2.6" width="5.6" height="3.2" rx="1.1"/>' +
    '<path d="M14.5 4h1.9a2.1 2.1 0 0 1 2.1 2.1v3.3"/>' +
    '<path d="M19.9 12.2l1.9 1.9-4.7 4.7-2.5.6.6-2.5z"/></svg>';

  function refrescarPlazo() {
    var caja = $('notaPlazo');
    var p = planElegido();
    if (!p) { caja.hidden = true; return; }
    caja.hidden = false;
    caja.innerHTML = ICONO_PLAZO + '<span>' + p.dias + ' d\u00edas para agendar ' +
      (p.sesiones === 1 ? 'tu consulta' : 'tus consultas') + '</span>';
  }

  /* ------------------------------------------------------------- LOS ECOS

     Lo que llevas elegido, al lado de cada rotulo. `data-vacio` es lo que le
     quita la caja cuando no hay respuesta: se marca con un atributo y no con
     una clase porque es un estado del dato, no una variante de estilo.        */

  function eco(id, texto) {
    var e = $(id);
    if (!e) return;
    if (texto) {
      e.textContent = texto;
      e.removeAttribute('data-vacio');
    } else {
      e.textContent = 'sin elegir';
      e.setAttribute('data-vacio', '');
    }
  }

  function refrescarEcos() {
    var m = DATOS.modos.filter(function (x) { return x.id === estado.modo; })[0];
    var s = servicioElegido();
    var p = planElegido();
    eco('ecoModo', m ? m.nombre : '');
    eco('ecoServicio', s ? s.nombre : '');
    eco('ecoPlan', p ? p.sesiones + ' ' + p.nombre : '');
  }

  /* --------------------------------------------------------------- PIE */

  function refrescarPie() {
    /* Ya no se escribe ningun total: se retiro del pie porque repetia el
       precio del plan elegido. `totalActual()` se queda porque es lo que dice
       si se puede seguir —hace falta servicio Y plan para que devuelva un
       numero— y es la misma condicion que abre la pestaña "Fecha". */
    var listo = totalActual() !== null;
    $('seguir').disabled = !listo;

    /* El aviso dice qué falta, en concreto. "Completa el formulario" no sirve:
       la persona ya sabe que falta algo, lo que no sabe es qué. */
    var falta = $('falta');
    if (listo) {
      falta.hidden = true;
    } else {
      falta.hidden = false;
      falta.textContent = !estado.servicio && !estado.plan
        ? 'Elige en qué trabajar y cuántas consultas.'
        : (!estado.servicio ? 'Elige en qué quieres trabajar.'
                            : 'Elige cuántas consultas.');
    }
  }

  /* ------------------------------------------------------------ PESTAÑAS

     Las reglas no son de diseño, salen del flujo:
       · "Reserva" siempre.
       · "Fecha" cuando hay servicio Y plan. Es la misma condición que
         gobierna el botón, así que se lee una sola vez y no hay dos verdades.
       · "Pago" solo cuando la cita existe; aquí nunca, porque esta vista no
         reserva nada.

     Y es SIMÉTRICO: cambiar de servicio tira el plan, con lo que "Fecha"
     vuelve a cerrarse. Una pestaña que solo sabe abrirse deja pasar al paso
     siguiente con la pregunta anterior sin contestar.                       */

  function pestanasAbiertas() {
    return { 1: true, 2: totalActual() !== null, 3: false };
  }

  function refrescarPestanas() {
    var abre = pestanasAbiertas();

    [1, 2, 3].forEach(function (i) {
      var b = $('pest' + i);
      var activa = i === estado.paso;

      b.setAttribute('aria-selected', String(activa));
      /* `aria-disabled` y no `disabled`: un botón desactivado de verdad sale
         del orden de tabulación, y en un tablist se espera poder recorrer las
         tres con las flechas aunque alguna no se pueda abrir. */
      if (abre[i]) b.removeAttribute('aria-disabled');
      else b.setAttribute('aria-disabled', 'true');
      b.tabIndex = activa ? 0 : -1;

      $('vista' + i).hidden = !activa;
    });
  }

  function irAPaso(i) {
    if (!pestanasAbiertas()[i] || i === estado.paso) return;
    estado.paso = i;
    refrescarPestanas();
    $('pest' + i).focus();
  }

  /* ------------------------------------------------------------- EVENTOS */

  /* Un solo listener para los tres grupos: delegación en el panel. Añadir una
     pregunta nueva no pide tocar esto. */
  $('vista1').addEventListener('change', function (ev) {
    var i = ev.target;
    if (i.name === 'modo') {
      estado.modo = i.value;
      pintarNotaModo();
      abrir('abreServ', true);

    } else if (i.name === 'servicio') {
      /* Cambiar de servicio tira el plan: los precios son otros. */
      if (estado.servicio !== i.value) estado.plan = null;
      estado.servicio = i.value;
      pintarPlanes();
      abrir('bloquePlanes', true);

    } else if (i.name === 'plan') {
      estado.plan = i.value;
    }

    refrescarEcos();
    refrescarPlazo();
    refrescarPie();
    refrescarPestanas();
  });

  document.querySelector('.tira').addEventListener('click', function (ev) {
    var b = ev.target.closest('.pest');
    if (b) irAPaso(Number(b.id.replace('pest', '')));
  });

  /* Flechas, Inicio y Fin: es lo que pide el patrón de tablist y lo que espera
     quien navega con teclado. Solo se mueve entre las que se pueden abrir. */
  document.querySelector('.tira').addEventListener('keydown', function (ev) {
    var b = ev.target.closest('.pest');
    if (!b) return;

    var abre = pestanasAbiertas();
    var libres = [1, 2, 3].filter(function (i) { return abre[i]; });
    if (!libres.length) return;

    var aqui = libres.indexOf(Number(b.id.replace('pest', '')));
    var i = null;

    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') i = libres[(aqui + 1) % libres.length];
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') i = libres[(aqui - 1 + libres.length) % libres.length];
    else if (ev.key === 'Home') i = libres[0];
    else if (ev.key === 'End')  i = libres[libres.length - 1];

    if (i === null) return;
    ev.preventDefault();
    irAPaso(i);
  });

  /* --------------------------------------------------------------- ARRANQUE

     Nada preelegido salvo la modalidad. Arrancar con un servicio y un plan
     marcados esconde el estado bloqueado de "Fecha", que es justo lo que hay
     que poder ver, y además no es cómo se comporta el asistente real: ahí la
     persona elige las dos cosas.                                            */
  pintarModos();
  pintarNotaModo();
  pintarServicios();
  pintarPlanes();
  refrescarEcos();
  refrescarPlazo();
  refrescarPie();
  refrescarPestanas();

  /* Los dos bloques nacen cerrados en el HTML, con `inert` puesto. No hace
     falta cerrarlos aqui, y ademas no conviene: llamar a `abrir(false)` en el
     arranque dispararia la transicion en la primera pintada y se veria un
     pliegue al cargar la pagina. */
})();
