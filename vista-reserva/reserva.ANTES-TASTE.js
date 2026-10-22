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
    modos: [
      { id: 'online',     nombre: 'En línea' },
      { id: 'presencial', nombre: 'Presencial' }
    ],

    servicios: [
      { id: 'ansiedad',   nombre: 'Superar la Ansiedad',      precio: 30 },
      { id: 'autoestima', nombre: 'Fortalecer tu Autoestima', precio: 30 },
      { id: 'pareja',     nombre: 'Sanar en Pareja',          precio: 45 },
      { id: 'duelo',      nombre: 'Acompañar un Duelo',       precio: 30 }
    ],

    planes: [
      { id: '1', sesiones: 1, nombre: 'Consulta'  },
      { id: '3', sesiones: 3, nombre: 'Consultas' },
      { id: '5', sesiones: 5, nombre: 'Consultas' }
    ],

    /* precio de la consulta suelta -> precio por sesión en cada plan */
    porSesion: {
      30: { 1: 30, 3: 25, 5: 25 },
      45: { 1: 45, 3: 30, 5: 30 }
    }
  };

  /* --------------------------------------------------------------- ESTADO */
  var estado = { modo: 'online', servicio: null, plan: null, paso: 1 };

  /* --------------------------------------------------------------- ATAJOS */
  var $ = function (id) { return document.getElementById(id); };

  function dinero(n) { return n + ' $'; }

  /* Escapar antes de meter texto en innerHTML. Aquí los datos son míos, pero
     en la página real vienen de la base y esto deja de ser opcional. */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
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
               '<span class="plan-cab">' +
                 '<span>' + p.sesiones + '</span>' +
                 '<span>' + esc(p.nombre) + '</span>' +
               '</span>' +
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

  /* --------------------------------------------------------------- PIE */

  function refrescarPie() {
    var t = totalActual();
    $('total').textContent = t === null ? '—' : dinero(t);

    var listo = t !== null;
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

      $('panel' + i).hidden = !activa;
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
  $('panel1').addEventListener('change', function (ev) {
    var i = ev.target;
    if (i.name === 'modo') {
      estado.modo = i.value;
      $('lugar').hidden = estado.modo !== 'presencial';

    } else if (i.name === 'servicio') {
      /* Cambiar de servicio tira el plan: los precios son otros. */
      if (estado.servicio !== i.value) estado.plan = null;
      estado.servicio = i.value;
      pintarPlanes();

    } else if (i.name === 'plan') {
      estado.plan = i.value;
    }

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
  pintarServicios();
  pintarPlanes();
  refrescarPie();
  refrescarPestanas();
})();
