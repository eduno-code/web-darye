/* ============================================================
   Cliente mínimo de Supabase.

   No se carga la librería oficial: son ~120 KB para hacer POST a un puñado
   de funciones. Todo lo que necesita esta página son dos llamadas fetch, y
   así el proyecto sigue sin dependencias ni paso de compilación, igual que
   el resto del sitio.

   La llave de abajo es PÚBLICA por diseño y va en el navegador a propósito.
   La seguridad no está en esconderla: está en las políticas RLS de la base,
   donde ninguna tabla con datos de pacientes es legible y todo pasa por
   funciones que validan por su cuenta.
   ============================================================ */
(function (global) {
  'use strict';

  var URL_BASE = 'https://ofoprhjvnpijfyukdpcm.supabase.co';
  var LLAVE    = 'sb_publishable_l0XIzs1KgJFW4Vj_CWPT9w_1aGRe3ZM';

  function cabeceras() {
    return {
      'apikey': LLAVE,
      'Authorization': 'Bearer ' + LLAVE,
      'Content-Type': 'application/json'
    };
  }

  /* Llama a una función de la base. Devuelve lo que ella responda.
     Los errores de red se traducen a la misma forma {ok:false,...} que usan
     las funciones, para que quien llama tenga un solo camino de error. */
  function rpc(nombre, params) {
    return fetch(URL_BASE + '/rest/v1/rpc/' + nombre, {
      method: 'POST',
      headers: cabeceras(),
      body: JSON.stringify(params || {})
    })
      .then(function (r) {
        return r.json().then(function (datos) {
          if (!r.ok) {
            return {
              ok: false,
              error: 'network',
              message: datos && datos.message
                ? 'No pudimos completar la operación. Inténtalo de nuevo.'
                : 'Sin conexión con el servidor.'
            };
          }
          return datos;
        });
      })
      .catch(function () {
        return {
          ok: false,
          error: 'offline',
          message: 'No hay conexión. Revisa tus datos e inténtalo de nuevo.'
        };
      });
  }

  /* Lectura de las dos tablas públicas. Las columnas se piden por nombre
     porque a un visitante solo se le concedieron esas: pedir "*" devuelve
     permiso denegado, y eso es intencionado. */
  function tabla(nombre, columnas, orden) {
    var url = URL_BASE + '/rest/v1/' + nombre + '?select=' + columnas;
    if (orden) url += '&order=' + orden;
    return fetch(url, { headers: cabeceras() })
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; });
  }

  global.PSI = { rpc: rpc, tabla: tabla, url: URL_BASE, llave: LLAVE };
})(window);
