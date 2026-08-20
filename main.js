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
