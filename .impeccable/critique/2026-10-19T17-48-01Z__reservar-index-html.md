---
timestamp: 2026-10-19T17-48-01Z
slug: reservar-index-html
---
# Crítica reservar/ paso 1 y 2 — 19/10/2026
Método: dual-agent. Nielsen 25/40 (Aceptable). H4=2, H9=1, H10=1.
P0 móvil con sesión: reservar.css:2086 `html[data-sesion="si"] .pnl` 2 columnas sin media query → scroll 598/390.
P1 paso 1 sin maqueta móvil (rejilla 2 col, planes 3 col, pestañas desbordan hasta x=415, dos botones a la vez).
P1 error de red = "Sin días libres" (reservar.js:1016-1046, 1191), sin .catch.
P1 privacidad.html 404 (consentimiento).
P2 dos h1 (Inter 26.4 vs Fraunces 25.6); color que decide es salvia #5A7060 no pizarra; precio sin terracota; paso 2 sin terracota.
P2 táctiles <44: días 29px, horas 38px alto, flechas mes 34.
P2 contraste: pestaña hecha 4.22, "Busca un rincón" 4.45.
P2 reduced-motion global kill (paso1.css:1575) mata spinner.
Tipografía: 9-10 tamaños; .cal-num pide Fraunces 500 no cargado. Candidatas UI: Source Sans 3 (recomendada), Commissioner, Red Hat Text.
