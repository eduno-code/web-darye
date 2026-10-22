/* ============================================================
   Cliente mínimo de Supabase: datos y sesión.

   No se carga la librería oficial: son ~120 KB para hacer POST a un puñado de
   funciones y guardar dos tokens. Todo lo que necesitan estas páginas cabe en
   este archivo, y así el proyecto sigue sin dependencias ni paso de
   compilación, igual que el resto del sitio.

   VIVE EN LA RAÍZ y no dentro de reservar/ porque desde que hay cuentas lo usan
   dos páginas: la de reservar y la de entrar. Un archivo que usan dos sitios no
   puede vivir dentro de uno de ellos.

   La llave de abajo es PÚBLICA por diseño y va en el navegador a propósito. La
   seguridad no está en esconderla: está en las políticas RLS de la base, donde
   ninguna tabla con datos de pacientes es legible y todo pasa por funciones que
   validan por su cuenta. Desde hoy, además, las funciones que crean citas
   exigen sesión: con esta llave sola no se reserva nada.
   ============================================================ */
(function (global) {
  'use strict';

  var URL_BASE = 'https://ofoprhjvnpijfyukdpcm.supabase.co';
  var LLAVE    = 'sb_publishable_l0XIzs1KgJFW4Vj_CWPT9w_1aGRe3ZM';

  /* Dónde se guarda la sesión entre visitas. localStorage y no una cookie
     porque no hay servidor que lea cookies: aquí solo hay archivos estáticos y
     la API de Supabase, que espera el token en una cabecera. */
  var ALMACEN = 'psi.sesion';


  /* ============================================================
     LA SESIÓN GUARDADA
     ============================================================ */

  /* Todo acceso al almacén va envuelto: en modo privado de Safari, y con las
     cookies de terceros bloqueadas, leer o escribir localStorage LANZA en vez
     de devolver null. Sin el try, la página entera se caería al arrancar por no
     poder guardar una sesión que ni siquiera existe todavía. */
  function leerGuardada() {
    try {
      var s = JSON.parse(global.localStorage.getItem(ALMACEN));
      return (s && s.access_token && s.refresh_token) ? s : null;
    } catch (e) { return null; }
  }

  function guardar(s) {
    sesion = s;
    try {
      if (s) global.localStorage.setItem(ALMACEN, JSON.stringify(s));
      else   global.localStorage.removeItem(ALMACEN);
    } catch (e) { /* sin persistencia, pero la sesión vale para esta pestaña */ }
    oyentes.forEach(function (fn) { try { fn(s); } catch (e) {} });
  }

  var sesion  = leerGuardada();
  var oyentes = [];

  /* De la respuesta de Supabase solo se guarda lo que hace falta. Guardar el
     objeto entero metería en el almacén datos del usuario que no necesitamos
     tener escritos en el disco de nadie. */
  function normalizar(r) {
    return {
      access_token:  r.access_token,
      refresh_token: r.refresh_token,
      /* expires_at viene en segundos desde 1970. Si faltara se calcula, porque
         sin caducidad no se sabe cuándo renovar y el token moriría en silencio. */
      expires_at:    r.expires_at || (Math.floor(Date.now() / 1000) + (r.expires_in || 3600)),
      correo:        (r.user && r.user.email) || (sesion && sesion.correo) || '',
      uid:           (r.user && r.user.id)    || (sesion && sesion.uid)    || ''
    };
  }


  /* ============================================================
     RENOVAR EL TOKEN
     ============================================================ */

  var renovando = null;

  /* Devuelve una promesa con un token válido, o null si no hay sesión.
     Se renueva ANTES de que caduque, con un minuto de margen: esperar al 401
     significa que la primera reserva de la mañana falla y hay que reintentar
     a la vista del usuario.

     `renovando` evita la estampida: si tres llamadas coinciden con el token a
     punto de morir, las tres esperan la misma renovación en vez de pedir tres,
     que además invalidarían el refresh_token de las otras dos. */
  function tokenVigente() {
    if (!sesion) return Promise.resolve(null);

    if (sesion.expires_at - 60 > Math.floor(Date.now() / 1000)) {
      return Promise.resolve(sesion.access_token);
    }

    if (!renovando) {
      renovando = auth('token?grant_type=refresh_token',
                       { refresh_token: sesion.refresh_token })
        .then(function (r) {
          renovando = null;
          /* OJO CON EL `.datos`: auth() no devuelve el cuerpo de la respuesta,
             devuelve {http, datos}. Aquí se leía r.access_token —sin el datos—
             y eso era SIEMPRE undefined, así que la renovación se daba por
             fallida aunque el servidor hubiera contestado 200 con un token
             nuevo, y se borraba la sesión. Resultado: a todo el mundo se le
             caía la sesión a la hora justa, sin motivo y sin aviso.

             No se veía leyendo el código porque el camino del error es el
             mismo que el de una sesión de verdad caducada. Salió al forzar la
             caducidad a mano y ver que el servidor respondía bien igualmente. */
          if (r && r.datos && r.datos.access_token) {
            guardar(normalizar(r.datos));
            return r.datos.access_token;
          }
          /* Aquí sí: el refresh_token ya no vale y la sesión se acabó de
             verdad. Se borra para que la página se entere y mande a entrar otra
             vez, en vez de seguir intentándolo con algo muerto. */
          guardar(null);
          return null;
        })
        .catch(function () { renovando = null; return null; });
    }
    return renovando;
  }


  /* ============================================================
     HABLAR CON LA API DE AUTENTICACIÓN
     ============================================================ */

  function auth(ruta, cuerpo, token) {
    return fetch(URL_BASE + '/auth/v1/' + ruta, {
      method: 'POST',
      headers: {
        'apikey': LLAVE,
        'Authorization': 'Bearer ' + (token || LLAVE),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(cuerpo || {})
    }).then(function (r) {
      return r.json()
        .then(function (d) { return { http: r.status, datos: d }; })
        .catch(function ()  { return { http: r.status, datos: {} }; });
    });
  }

  /* Los mensajes de Supabase vienen en inglés y hablan de "credentials" y
     "identities". Se traducen aquí, en un solo sitio, para que ninguna pantalla
     tenga que interpretar códigos: reciben un texto que se puede enseñar tal
     cual, escrito desde el lado de quien lo lee.

     Supabase ha cambiado la forma del error con los años, así que se miran los
     dos campos donde puede venir el código. */
  var MENSAJES = {
    invalid_credentials:        'El correo o la contraseña no coinciden.',
    email_not_confirmed:        'Todavía no has confirmado tu correo. Busca el mensaje que te enviamos.',
    user_already_exists:        'Ya hay una cuenta con ese correo. Prueba a entrar.',
    email_exists:               'Ya hay una cuenta con ese correo. Prueba a entrar.',
    weak_password:              'Esa contraseña es demasiado corta. Ocho caracteres o más.',
    over_request_rate_limit:    'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.',
    over_email_send_rate_limit: 'Ya enviamos varios correos. Espera unos minutos antes de pedir otro.',
    validation_failed:          'Revisa los datos: hay alguno que no podemos aceptar.',
    same_password:              'Esa es la contraseña que ya tenías. Elige otra.'
  };

  function traducir(r) {
    var d = r.datos || {};
    var codigo = d.error_code || d.code || d.error || '';
    return {
      ok: false,
      error: codigo || ('http_' + r.http),
      message: MENSAJES[codigo] ||
        (r.http >= 500
          ? 'El servidor no responde. Inténtalo dentro de un momento.'
          : 'No pudimos completar la operación. Revisa los datos e inténtalo otra vez.')
    };
  }

  function sinRed() {
    return { ok: false, error: 'offline',
             message: 'No hay conexión. Revisa tus datos e inténtalo de nuevo.' };
  }


  /* ============================================================
     LO QUE USAN LAS PANTALLAS
     ============================================================ */

  /* Crear cuenta. Los datos que no son correo ni contraseña —nombre, teléfono,
     nacionalidad, país— viajan en `data`, que Supabase guarda como metadatos
     del usuario. De ahí los lee asegurar_mi_ficha() para montar la ficha del
     paciente. No se mandan a ninguna función aparte a propósito: así no hay
     forma de que la cuenta exista y los datos se pierdan por el camino. */
  function registrar(correo, clave, datos) {
    return auth('signup', {
      email: correo,
      password: clave,
      data: datos || {}
    }).then(function (r) {
      if (r.http >= 400) return traducir(r);

      /* Con la confirmación de correo APAGADA, Supabase devuelve ya la sesión.
         Con ella encendida devuelve solo el usuario, y hay que ir al buzón.
         Se contemplan las dos porque la confirmación se va a encender antes de
         abrir al público, y ese día esto no debería hacer falta tocarlo. */
      if (r.datos && r.datos.access_token) {
        guardar(normalizar(r.datos));
        return asegurarFicha().then(function (f) {
          if (!f.ok) return f;
          return { ok: true, entrado: true };
        });
      }
      return { ok: true, entrado: false, confirmar: true };
    }).catch(sinRed);
  }

  function entrar(correo, clave) {
    return auth('token?grant_type=password', { email: correo, password: clave })
      .then(function (r) {
        if (r.http >= 400 || !r.datos.access_token) return traducir(r);
        guardar(normalizar(r.datos));
        /* Se asegura la ficha TAMBIÉN al entrar, no solo al registrarse. Si la
           llamada del registro se perdió —se cayó la red, se cerró la pestaña—
           quedaría una cuenta sin ficha y una persona que no puede reservar sin
           saber por qué. Así el sistema se repara solo en el siguiente intento. */
        return asegurarFicha().then(function () { return { ok: true }; });
      }).catch(sinRed);
  }

  function salir() {
    var t = sesion && sesion.access_token;
    guardar(null);           // primero local: salir no puede depender de la red
    if (!t) return Promise.resolve({ ok: true });
    return auth('logout', {}, t).then(function () { return { ok: true }; })
                                .catch(function () { return { ok: true }; });
  }

  /* Enviar el correo para poner una contraseña nueva. Responde lo mismo exista
     o no la cuenta: decir "ese correo no está registrado" le confirmaría a
     cualquiera quién es paciente de una consulta de psicología. */
  function recuperar(correo) {
    return auth('recover', { email: correo }).then(function (r) {
      if (r.http >= 400 && r.http !== 422) return traducir(r);
      return { ok: true };
    }).catch(sinRed);
  }

  function asegurarFicha() { return rpc('asegurar_mi_ficha'); }

  /* Corregir el nombre o el teléfono. Se hace en DOS pasos y a propósito:
     primero se actualizan los metadatos de la cuenta, y después
     asegurar_mi_ficha() los copia a la ficha del paciente validándolos con las
     mismas reglas que usa el registro.

     Podría haber una función de escritura en la base que hiciera las dos cosas,
     pero entonces habría DOS sitios definiendo qué es un nombre válido, y el
     día que cambie uno el otro se queda viejo sin que nadie se entere.

     OJO: hay que mandar los cuatro datos aunque solo cambien dos. Lo que se
     manda sustituye a lo que había, así que omitir nacionalidad y país los
     borraría — y son justo los que deciden cuánto cobra Daryeli. */
  function actualizarDatos(datos) {
    return tokenVigente().then(function (tok) {
      if (!tok) return { ok: false, error: 'not_signed_in',
                         message: 'Entra en tu cuenta para cambiar tus datos.' };
      return fetch(URL_BASE + '/auth/v1/user', {
        method: 'PUT',
        headers: {
          'apikey': LLAVE,
          'Authorization': 'Bearer ' + tok,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: datos || {} })
      }).then(function (r) {
        return r.json()
          .then(function (d) { return { http: r.status, datos: d }; })
          .catch(function ()  { return { http: r.status, datos: {} }; });
      }).then(function (r) {
        if (r.http >= 400) return traducir(r);
        return asegurarFicha();
      });
    }).catch(sinRed);
  }


  /* ============================================================
     LLAMAR A LAS FUNCIONES DE LA BASE
     ============================================================ */

  /* Llama a una función de la base. Devuelve lo que ella responda.
     Los errores de red se traducen a la misma forma {ok:false,...} que usan las
     funciones, para que quien llama tenga un solo camino de error.

     La diferencia con antes: si hay sesión, la petición va firmada con el token
     de la persona en vez de con la llave pública. Eso es lo que hace que
     auth.uid() valga algo del otro lado. */
  function rpc(nombre, params, reintento) {
    return tokenVigente().then(function (tok) {
      return fetch(URL_BASE + '/rest/v1/rpc/' + nombre, {
        method: 'POST',
        headers: {
          'apikey': LLAVE,
          'Authorization': 'Bearer ' + (tok || LLAVE),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params || {})
      }).then(function (r) {
        /* 401 con sesión = el token murió antes de lo que decía su fecha (pasa
           si se cambió la contraseña en otro dispositivo). Se renueva a la
           fuerza y se reintenta UNA vez; dos sería un bucle. */
        if (r.status === 401 && sesion && !reintento) {
          sesion.expires_at = 0;
          return rpc(nombre, params, true);
        }
        return r.json().then(function (datos) {
          if (!r.ok) {
            return { ok: false, error: 'network',
                     message: 'No pudimos completar la operación. Inténtalo de nuevo.' };
          }
          return datos;
        });
      });
    }).catch(sinRed);
  }

  /* Lectura de las tablas públicas. Las columnas se piden por nombre porque a
     un visitante solo se le concedieron esas: pedir "*" devuelve permiso
     denegado, y eso es intencionado.

     ESTA FUNCIÓN RECHAZA CUANDO FALLA, y antes no: devolvía una lista vacía
     ante cualquier error. Parece inofensivo y no lo es, porque un vacío
     legítimo —"esa tabla no tiene filas"— y un error se volvían la misma cosa.
     Lo que pasaba en la práctica: si la lectura de `packages` fallaba, el paso
     1 de la reserva ofrecía solo la consulta suelta, sin un aviso en ninguna
     parte, y la persona no se enteraba de que existen los paquetes. Pagaba
     30 $ por consulta en vez de 25 $ por una pantalla que se calló.

     Quien llame se hace cargo del error. Son tres sitios, todos en
     reservar.js, y ahí se avisa y se ofrece reintentar.

     Y REINTENTA EN EL 401 IGUAL QUE rpc(): con sesión abierta, un 401 suele
     ser el token muriéndose antes de la fecha que decía. `rpc()` ya lo hacía y
     esto no, y esa asimetría se veía en pantalla — la dirección del
     consultorio, que viene por `rpc`, aparecía; los paquetes, que vienen por
     aquí, no. */
  function tabla(nombre, columnas, orden, reintento) {
    var url = URL_BASE + '/rest/v1/' + nombre + '?select=' + columnas;
    if (orden) url += '&order=' + orden;
    return tokenVigente().then(function (tok) {
      return fetch(url, {
        headers: { 'apikey': LLAVE, 'Authorization': 'Bearer ' + (tok || LLAVE) }
      }).then(function (r) {
        if (r.status === 401 && sesion && !reintento) {
          sesion.expires_at = 0;   // fuerza la renovación
          return tabla(nombre, columnas, orden, true);
        }
        if (!r.ok) throw new Error('no se pudo leer ' + nombre + ' (' + r.status + ')');
        return r.json();
      });
    });
  }


  global.PSI = {
    rpc: rpc,
    tabla: tabla,
    url: URL_BASE,
    llave: LLAVE,

    sesion: {
      hay:    function () { return !!sesion; },
      correo: function () { return sesion ? sesion.correo : ''; },
      uid:    function () { return sesion ? sesion.uid : ''; },

      registrar: registrar,
      entrar:    entrar,
      salir:     salir,
      recuperar: recuperar,
      asegurarFicha:   asegurarFicha,
      actualizarDatos: actualizarDatos,

      /* Para que una pantalla pueda repintarse cuando la sesión cambie —por
         ejemplo al caducar en otra pestaña. */
      alCambiar: function (fn) { oyentes.push(fn); }
    }
  };
})(window);
