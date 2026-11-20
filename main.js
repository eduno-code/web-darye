/* ============================================================
   PSICONCIENTE — comportamiento de la página
   El scroll suave y el desplazamiento por el header sticky los
   resuelve el CSS (scroll-behavior + scroll-padding-top).
   ============================================================ */
(function () {
  'use strict';

  // Marca que hay JS: sin esta clase el CSS nunca oculta contenido.
  document.documentElement.classList.add('js');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1. MENÚ MÓVIL ---------- */
  var toggle = document.getElementById('menuToggle');
  var panel = document.getElementById('navPanel');
  var scrim = document.getElementById('navScrim');

  if (toggle && panel && scrim) {
    var lastFocused = null;

    function focusables() {
      return Array.prototype.slice.call(panel.querySelectorAll('a[href]'));
    }

    function openMenu() {
      lastFocused = document.activeElement;
      panel.setAttribute('data-open', 'true');
      scrim.setAttribute('data-open', 'true');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Cerrar menú');
      document.body.setAttribute('data-menu-open', 'true');
      // El panel pasa de visibility:hidden a visible; hay que esperar a que el
      // navegador recalcule el estilo antes de poder enfocar nada dentro.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          var first = focusables()[0];
          if (first) first.focus();
        });
      });
    }

    function closeMenu(returnFocus) {
      panel.setAttribute('data-open', 'false');
      scrim.removeAttribute('data-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Abrir menú');
      document.body.removeAttribute('data-menu-open');
      if (returnFocus === false) return;
      // body no es enfocable: si no hay origen válido, el foco vuelve al botón.
      var back = (lastFocused && lastFocused !== document.body) ? lastFocused : toggle;
      back.focus();
    }

    function isOpen() {
      return toggle.getAttribute('aria-expanded') === 'true';
    }

    toggle.addEventListener('click', function () {
      if (isOpen()) closeMenu(); else openMenu();
    });

    scrim.addEventListener('click', function () { closeMenu(); });

    // Al elegir un destino, cerrar sin robar el foco al ancla
    panel.addEventListener('click', function (e) {
      if (e.target.closest('a[href]')) closeMenu(false);
    });

    document.addEventListener('keydown', function (e) {
      if (!isOpen()) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu();
        return;
      }

      // Foco atrapado dentro del panel mientras está abierto
      if (e.key === 'Tab') {
        var items = focusables();
        if (!items.length) return;
        var first = items[0];
        var last = items[items.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    // Si se pasa a escritorio con el menú abierto, reponer el estado.
    // Este 1060 debe coincidir con el media query del nav en style.css: por
    // debajo de ese ancho el panel sigue siendo la única navegación, así que
    // cerrarlo antes dejaría al usuario sin menú.
    window.matchMedia('(min-width: 1060px)').addEventListener('change', function (ev) {
      if (ev.matches && isOpen()) closeMenu(false);
    });
  }

  /* ---------- 2. SECCIÓN ACTIVA EN LA NAVEGACIÓN ---------- */
  var navLinks = Array.prototype.slice.call(
    document.querySelectorAll('.nav-list a[href^="#"]')
  );

  if (navLinks.length && 'IntersectionObserver' in window) {
    var linkFor = {};
    navLinks.forEach(function (a) {
      linkFor[a.getAttribute('href').slice(1)] = a;
    });

    var watched = Object.keys(linkFor)
      .map(function (id) { return document.getElementById(id); })
      .filter(Boolean);

    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var link = linkFor[entry.target.id];
        if (!link) return;
        if (entry.isIntersecting) {
          navLinks.forEach(function (a) { a.removeAttribute('aria-current'); });
          link.setAttribute('aria-current', 'page');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

    watched.forEach(function (section) { spy.observe(section); });
  }

  /* ---------- 2b. BARRA CASI BLANCA AL BAJAR ---------- */
  var cabecera = document.querySelector('.site-header');
  if (cabecera && 'IntersectionObserver' in window) {
    var vigia = document.createElement('div');
    vigia.setAttribute('aria-hidden', 'true');
    vigia.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:80px;pointer-events:none';
    document.body.prepend(vigia);
    var colorBarra = document.querySelector('meta[name="theme-color"]');
    new IntersectionObserver(function (entries) {
      var arriba = entries[0].isIntersecting;
      cabecera.classList.toggle('solida', !arriba);
      if (colorBarra) colorBarra.setAttribute('content', arriba ? '#B1ADA9' : '#F3E9DE');
    }).observe(vigia);
  }

  /* ---------- 3. REVELADO AL SCROLL ---------- */
  var revealables = Array.prototype.slice.call(document.querySelectorAll('.reveal'));

  if (!revealables.length) return;

  // Sin observador o con movimiento reducido, todo visible desde el principio
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealables.forEach(function (el) { el.classList.add('is-visible'); });
    return;
  }

  var revealer = new IntersectionObserver(function (entries, observer) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  revealables.forEach(function (el) { revealer.observe(el); });
})();

(function () {
  if ('name' in HTMLDetailsElement.prototype) return;
  var items = document.querySelectorAll('details[name="faq"]');
  items.forEach(function (item) {
    item.addEventListener('toggle', function () {
      if (!item.open) return;
      items.forEach(function (otro) { if (otro !== item) otro.open = false; });
    });
  });
})();

/* Testimonios B — Arena cálida: carrusel aprobado, 56 px/s. */
(() => {
  'use strict';
  const root = document.querySelector('#testimonios [data-rail]');
  if (!root) return;
  const viewport = root.querySelector('.rail-viewport');
  const track = root.querySelector('.rail-track');
  const originals = [...track.children];
  const toggle = root.querySelector('.toggle');
  const position = root.querySelector('.position');
  const status = root.querySelector('[role=status]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reduced.matches, hovered = false, focused = false, visible = false;
  let cycle = 0, unit = 0, offset = 0, previousTime = 0, frame = 0;
  originals.forEach((card, i) => {
    card.tabIndex = 0;
    card.setAttribute('aria-label', `Testimonio ${i + 1} de ${originals.length}`);
    const clone = card.cloneNode(true);
    clone.removeAttribute('tabindex');
    clone.removeAttribute('aria-label');
    clone.setAttribute('aria-hidden', 'true');
    clone.dataset.clone = '';
    track.append(clone);
  });
  function updatePosition() {
    const i = unit ? Math.floor((viewport.scrollLeft % cycle) / unit) % originals.length : 0;
    position.textContent = `${i + 1} / ${originals.length}`;
  }
  function tick(time) {
    if (previousTime) {
      offset = (offset + Math.min(time - previousTime, 64) * .056) % cycle;
      viewport.scrollLeft = offset;
      updatePosition();
    }
    previousTime = time;
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame); previousTime = 0;
    root.dataset.paused = String(paused);
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.setAttribute('aria-label', paused ? 'Reproducir testimonios' : 'Pausar testimonios');
    toggle.querySelector('span').textContent = paused ? 'Reproducir' : 'Pausar';
    if (!paused && !hovered && !focused && visible && !document.hidden && cycle) {
      offset = viewport.scrollLeft % cycle;
      frame = requestAnimationFrame(tick);
    }
  }
  function measure() {
    unit = originals[1].offsetLeft - originals[0].offsetLeft;
    cycle = unit * originals.length;
    viewport.scrollLeft %= cycle;
    updatePosition(); sync();
  }
  function manualPause() { paused = true; sync(); }
  function move(direction) {
    manualPause();
    if (direction < 0 && viewport.scrollLeft < unit) viewport.scrollLeft += cycle;
    if (direction > 0 && viewport.scrollLeft >= cycle) viewport.scrollLeft -= cycle;
    const destination = Math.round(viewport.scrollLeft / unit) * unit + direction * unit;
    viewport.scrollTo({left: Math.max(0, destination), behavior: reduced.matches ? 'instant' : 'smooth'});
    status.textContent = `Testimonio ${((Math.round(destination / unit) % originals.length) + originals.length) % originals.length + 1} de ${originals.length}`;
  }
  root.querySelector('[data-prev]').addEventListener('click', () => move(-1));
  root.querySelector('[data-next]').addEventListener('click', () => move(1));
  toggle.addEventListener('click', () => { paused = !paused; focused = false; sync(); });
  viewport.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { hovered = true; sync(); } });
  viewport.addEventListener('pointerleave', () => { hovered = false; sync(); });
  let gesture = null;
  viewport.addEventListener('pointerdown', e => {
    if (!e.target.closest('.rail-card') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    gesture = {x:e.clientX, y:e.clientY, paused, moved:false};
    if (e.pointerType !== 'mouse') manualPause();
  });
  viewport.addEventListener('pointermove', e => {
    if (gesture && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 10) gesture.moved = true;
  });
  viewport.addEventListener('pointerup', e => {
    if (gesture && !gesture.moved && e.target.closest('.rail-card')) {
      paused = !gesture.paused; focused = false; sync();
      status.textContent = paused ? 'Testimonios en pausa.' : 'Testimonios en reproducción.';
    }
    gesture = null;
  });
  viewport.addEventListener('pointercancel', () => { gesture = null; });
  viewport.addEventListener('wheel', manualPause, {passive:true});
  viewport.addEventListener('scroll', updatePosition, {passive:true});
  viewport.addEventListener('focusin', () => { focused = true; sync(); });
  viewport.addEventListener('focusout', () => requestAnimationFrame(() => { focused = viewport.contains(document.activeElement); sync(); }));
  viewport.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); move(e.key === 'ArrowRight' ? 1 : -1); } });
  reduced.addEventListener('change', () => { if (reduced.matches) paused = true; sync(); });
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('resize', measure);
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); }, {threshold:.15}).observe(viewport);
  else visible = true;
  root.querySelector('.controls').hidden = false;
  document.fonts.ready.then(measure);
  measure();
})();
