/* ============================================================
   Fechas, horas y zonas horarias.

   VIVE EN LA RAÍZ, igual que supabase.js y por el mismo motivo: desde que
   existe la pantalla de la cuenta, estas funciones las usan dos páginas. Un
   archivo que usan dos sitios no puede vivir dentro de uno de ellos.

   Y AQUÍ IMPORTA MÁS QUE EN OTROS SITIOS que sea el mismo archivo y no una
   copia. Daryeli trabaja en hora de Caracas y sus pacientes están repartidos
   entre Venezuela y España, así que cada hora se enseña en la zona de quien
   mira con la de Caracas al lado. Dos implementaciones de eso acaban
   divergiendo justo en el detalle que más confunde — y confundirse aquí
   significa que alguien se presenta a su terapia con dos horas de diferencia.
   ============================================================ */
(function (global) {
  'use strict';

  /* La zona en la que Daryeli define su horario. Es la referencia contra la que
     se traduce todo, y coincide con el ajuste `timezone` de la base. */
  var ZONA_DARYELI = 'America/Caracas';

  /* La del visitante, con Caracas como red de seguridad: si el navegador no
     sabe decirla, enseñar la hora de Daryeli es mejor que enseñar UTC, que no
     es la hora de nadie. */
  function zonaVisitante() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ZONA_DARYELI; }
    catch (e) { return ZONA_DARYELI; }
  }

  function hora(iso, zona) {
    return new Intl.DateTimeFormat('es-ES', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zona
    }).format(new Date(iso));
  }

  /* 'en-CA' devuelve exactamente AAAA-MM-DD, lo que evita construir la fecha a
     mano y equivocarse con el desfase de la zona. */
  function diaEnZona(iso, zona) {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zona
    }).format(new Date(iso));
  }

  function ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
           '-' + String(d.getDate()).padStart(2, '0');
  }

  function desdeYmd(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }

  function sumaDias(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }

  function fechaLarga(s) {
    return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
      .format(desdeYmd(s));
  }

  function fechaCorta(iso) {
    try {
      return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' })
        .format(new Date(iso));
    } catch (e) { return ''; }
  }

  function dinero(n) {
    return new Intl.NumberFormat('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
      .format(n);
  }

  /* Una fecha con su año, para el historial: "12 de agosto de 2026". Sin el año
     no se distingue la sesión del agosto pasado de la de este. */
  function fechaConAno(iso, zona) {
    try {
      return new Intl.DateTimeFormat('es-ES', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: zona || ZONA_DARYELI
      }).format(new Date(iso));
    } catch (e) { return ''; }
  }

  global.FECHAS = {
    ZONA_DARYELI: ZONA_DARYELI,
    zonaVisitante: zonaVisitante,
    hora: hora,
    diaEnZona: diaEnZona,
    ymd: ymd,
    desdeYmd: desdeYmd,
    sumaDias: sumaDias,
    fechaLarga: fechaLarga,
    fechaCorta: fechaCorta,
    fechaConAno: fechaConAno,
    dinero: dinero
  };
})(window);
