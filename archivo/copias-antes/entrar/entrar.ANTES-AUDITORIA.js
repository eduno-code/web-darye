/* ============================================================
   entrar.js · pantalla de crear cuenta y entrar

   Cuatro cosas, en este orden:
     1. Los paises, sus prefijos y la propuesta segun la zona horaria.
     2. El viaje del panel al cambiar de modo, con inert y el foco.
     3. El ojo de la contraseña.
     4. La validacion y el envio.

   MAQUETA: el envio no llama a Supabase todavia. Donde dice
   "aqui entraran supabase.auth" es el punto de enganche.
   ============================================================ */

(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- PAISES ----------
     Lista corriente de recogida de datos, con su prefijo. Larga a proposito:
     un control de dos opciones junto a los precios delataria que la
     nacionalidad mueve la tarifa. */
  var PAISES = [
    ['Venezuela','58','VE'], ['España','34','ES'], ['Argentina','54','AR'],
    ['Bolivia','591','BO'], ['Brasil','55','BR'], ['Chile','56','CL'],
    ['Colombia','57','CO'], ['Costa Rica','506','CR'], ['Cuba','53','CU'],
    ['Ecuador','593','EC'], ['El Salvador','503','SV'], ['Guatemala','502','GT'],
    ['Honduras','504','HN'], ['México','52','MX'], ['Nicaragua','505','NI'],
    ['Panamá','507','PA'], ['Paraguay','595','PY'], ['Perú','51','PE'],
    ['República Dominicana','1','DO'], ['Uruguay','598','UY'],
    ['Estados Unidos','1','US'], ['Canadá','1','CA'], ['Portugal','351','PT'],
    ['Francia','33','FR'], ['Italia','39','IT'], ['Alemania','49','DE'],
    ['Reino Unido','44','GB'], ['Países Bajos','31','NL'], ['Bélgica','32','BE'],
    ['Suiza','41','CH'], ['Irlanda','353','IE'], ['Australia','61','AU'],
    ['Otro país','','']
  ];

  /* La bandera se compone con los dos indicadores regionales del codigo ISO.
     En Android, iOS y macOS sale la bandera; en Windows no hay glifo y el
     navegador dibuja las dos letras (VE, ES), que dice lo mismo. Por eso el
     numero va SIEMPRE al lado: es el dato que hace falta y no depende de la
     fuente del sistema. */
  function bandera(iso) {
    if (!iso) return '';
    return String.fromCodePoint(0x1F1E6 + iso.charCodeAt(0) - 65,
                                0x1F1E6 + iso.charCodeAt(1) - 65);
  }

  function llenar(sel, marcado) {
    var frag = document.createDocumentFragment();
    PAISES.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p[0]; o.textContent = p[0];
      if (p[0] === marcado) o.selected = true;
      frag.appendChild(o);
    });
    sel.appendChild(frag);
  }

  /* El pais viene ya propuesto por la zona horaria. No se adivina en silencio:
     se propone y la persona lo cambia si no es. */
  var ZONAS = {
    'America/Caracas':'Venezuela', 'Europe/Madrid':'España', 'Atlantic/Canary':'España',
    'America/Lima':'Perú', 'America/Bogota':'Colombia', 'America/Mexico_City':'México',
    'America/Santiago':'Chile', 'America/Argentina/Buenos_Aires':'Argentina',
    'America/Montevideo':'Uruguay', 'America/Panama':'Panamá', 'America/Guayaquil':'Ecuador',
    'America/Sao_Paulo':'Brasil', 'Europe/Lisbon':'Portugal', 'Europe/Paris':'Francia',
    'Europe/Rome':'Italia', 'Europe/Berlin':'Alemania', 'Europe/London':'Reino Unido'
  };

  var zona = '';
  try { zona = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
  var sugerido = ZONAS[zona] || 'Venezuela';

  llenar($('rPais'), sugerido);
  llenar($('rNac'), sugerido);

  /* Prefijos: uno por pais con codigo, sin repetir el numero — +1 lo comparten
     tres paises y tres opciones que dicen "+1" no ayudan a elegir. */
  (function () {
    var sel = $('rPrefijo'), vistos = {}, frag = document.createDocumentFragment();
    PAISES.forEach(function (p) {
      if (!p[1] || vistos[p[1]]) return;
      vistos[p[1]] = true;
      var o = document.createElement('option');
      o.value = p[1];
      o.textContent = bandera(p[2]) + ' +' + p[1];
      frag.appendChild(o);
    });
    sel.appendChild(frag);
  })();

  /* El prefijo sigue al pais mientras nadie lo toque. En cuanto la persona
     elige uno a mano deja de seguirlo: ha dicho que su numero no es del pais
     donde vive, y sobrescribirselo seria pisarle la respuesta. */
  var prefijoTocado = false;

  function sincronizarPrefijo() {
    if (prefijoTocado) return;
    var v = $('rPais').value, p = '';
    PAISES.some(function (x) { if (x[0] === v) { p = x[1]; return true; } });
    if (p) $('rPrefijo').value = p;
  }

  $('rPrefijo').addEventListener('change', function () { prefijoTocado = true; });
  $('rPais').addEventListener('change', sincronizarPrefijo);
  sincronizarPrefijo();

  /* ---------- EL VIAJE DEL PANEL ---------- */

  var puerta = $('puerta');

  var MODOS = {
    registro: { tapado:'vEntrar',   visible:'vRegistro',
                titulo:'¿Ya tienes cuenta?', sub:'Entra y sigue donde lo dejaste.',
                boton:'Entrar', primero:'rNombre' },
    entrar:   { tapado:'vRegistro', visible:'vEntrar',
                titulo:'¿Primera vez aquí?', sub:'Crea tu cuenta y reserva tu consulta en dos minutos.',
                boton:'Crear cuenta', primero:'eMail' }
  };

  var modo = 'registro';
  var menosMovimiento = matchMedia('(prefers-reduced-motion: reduce)');

  /* El formulario que queda detras del panel se marca inerte: si no, el
     teclado se cae dentro de un formulario que nadie ve. */
  function aplicar(m) {
    var f = MODOS[m];
    var tapado = $(f.tapado), visible = $(f.visible);
    tapado.inert = true;  tapado.setAttribute('aria-hidden', 'true');
    visible.inert = false; visible.removeAttribute('aria-hidden');
    $('invitaTit').textContent = f.titulo;
    $('invitaSub').textContent = f.sub;
    $('cambiar').textContent = f.boton;
  }

  function cambiar() {
    var nuevo = modo === 'registro' ? 'entrar' : 'registro';
    modo = nuevo;

    if (menosMovimiento.matches) {
      puerta.dataset.modo = nuevo;
      aplicar(nuevo);
      $(MODOS[nuevo].primero).focus({ preventScroll:true });
      return;
    }

    /* El texto de la invitacion se desvanece, se sustituye a mitad del viaje y
       vuelve ya cambiado. Si se cambiara de golpe se leeria el truco. */
    puerta.classList.add('viajando');
    puerta.dataset.modo = nuevo;

    setTimeout(function () { aplicar(nuevo); }, 200);
    setTimeout(function () {
      puerta.classList.remove('viajando');
      /* El teclado va donde esta el trabajo. Al final del viaje y no antes:
         mover el foco a mitad de camino desplazaria la pagina. */
      $(MODOS[nuevo].primero).focus({ preventScroll:true });
    }, 340);
  }

  $('cambiar').addEventListener('click', cambiar);

  /* ---------- OJO DE LA CONTRASEÑA ---------- */

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('.ojo');
    if (!b) return;
    var input = $(b.dataset.ojo), ver = b.getAttribute('aria-pressed') === 'true';
    b.setAttribute('aria-pressed', ver ? 'false' : 'true');
    b.setAttribute('aria-label', ver ? 'Mostrar la contraseña' : 'Ocultar la contraseña');
    input.type = ver ? 'password' : 'text';
    input.focus();
  });

  /* ---------- VALIDACIÓN ---------- */

  function error(campoId, huecoId, texto) {
    var campo = $(campoId).closest('.campo');
    campo.classList.toggle('mal', !!texto);
    $(campoId).setAttribute('aria-invalid', texto ? 'true' : 'false');
    var hueco = $(huecoId); if (hueco) hueco.textContent = texto || '';
  }

  var CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  var REGLAS = {
    rNombre:  ['eNombre',  function (v) { return v.trim().length >= 2 ? '' : 'Escribe tu nombre y tu apellido.'; }],
    rCorreo:  ['eCorreo',  function (v) { return CORREO.test(v.trim()) ? '' : 'Ese correo no parece válido.'; }],
    rClave:   ['eClave',   function (v) { return v.length >= 8 ? '' : 'Necesita ocho caracteres o más.'; }],
    rTel:     ['eTel',     function (v) { return v.replace(/\D/g,'').length >= 7 ? '' : 'Escribe tu número completo.'; }],
    eMail:    ['eeCorreo', function (v) { return CORREO.test(v.trim()) ? '' : 'Ese correo no parece válido.'; }],
    eClaveIn: ['eeClave',  function (v) { return v.length ? '' : 'Escribe tu contraseña.'; }]
  };

  Object.keys(REGLAS).forEach(function (id) {
    var el = $(id), r = REGLAS[id];
    /* Al salir del campo, no en cada tecla: corregir a alguien mientras aun
       esta escribiendo su correo es hostil. */
    el.addEventListener('blur', function () { if (el.value !== '') error(id, r[0], r[1](el.value)); });
    el.addEventListener('input', function () {
      if (el.closest('.campo').classList.contains('mal')) error(id, r[0], r[1](el.value));
    });
  });

  /* ---------- ENVÍO ---------- */

  function enviar(form, ids, etiqueta) {
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var primero = null;
      ids.forEach(function (id) {
        var r = REGLAS[id], t = r[1]($(id).value);
        error(id, r[0], t);
        if (t && !primero) primero = id;
      });
      if (primero) { $(primero).focus(); return; }

      var btn = form.querySelector('.btn');
      btn.dataset.cargando = '1'; btn.disabled = true;
      btn.querySelector('span').textContent = 'Un momento…';

      /* Maqueta: aqui entraran supabase.auth.signUp y signInWithPassword. */
      setTimeout(function () {
        btn.dataset.cargando = ''; btn.disabled = false;
        btn.querySelector('span').textContent = etiqueta;
      }, 1400);
    });
  }

  enviar($('vRegistro'), ['rNombre','rCorreo','rClave','rTel'], 'Crear cuenta');
  enviar($('vEntrar'),   ['eMail','eClaveIn'], 'Entrar');

  aplicar('registro');
})();
