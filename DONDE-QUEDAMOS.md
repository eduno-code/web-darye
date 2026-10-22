# Dónde quedamos · 22 de octubre de 2026 (landing)

Plan: `~/.claude/plans/hola-te-explico-daryeli-vivid-giraffe.md`. Etapas 0 y 1 hechas (limpieza, commit `71804af`). **Lo siguiente: Etapa 2, auditoría** (Lighthouse y medidas antes/después, luego la lista B).

Hecho hoy en la landing (sin commit todavía):
- Todos los botones de agendar van a WhatsApp con mensaje ya escrito según la terapia. Fuera «Mi cuenta» y «Mis consultas» hasta que exista la reserva.
- Barra de navegación a todo el ancho (ya no es cápsula). Columnas con `minmax(max-content,1fr)`: no se monta ni con el zoom de Windows al 125 %.
- Pie: raya bajo cada título (blanco 35 %) y línea sobre el aviso final; marca «Psicconsciente / Daryeli Romero»; horario en `dl` por días.
- Textos sin tono de IA y en neutro (sin «espacio seguro», sin listas de tres). La historia NO se tocó: se reescribirá entera.

Etapa 2 · medición «antes» (22/10, ya con los cambios de hoy), informes en `archivo/auditorias/2026-10-22-antes*`:
- Lighthouse móvil: accesibilidad 100, buenas prácticas 100, SEO 100. Escritorio: accesibilidad 96 (contraste del botón flotante de WhatsApp, 1,98:1).
- Rendimiento móvil (Slow 4G, CPU ×4): LCP 1,9 s, CLS 0. Bloqueo de render ~450 ms (fuentes de Google), ~80 kB de imágenes de más.
- Preguntas frecuentes: ahora solo una abierta a la vez (`<details name="faq">` + respaldo en main.js).

Etapa 2 · lista B aplicada (22/10). Después: Lighthouse 100/100/100 en móvil y escritorio (informes `archivo/auditorias/2026-10-22-despues*`). LCP móvil ~2,0 s, CLS 0.
- Botón flotante WhatsApp en verde oscuro `#0E7A5F` (5,29:1), hover `#0A5E49`. Foco blanco en el pie.
- Fotos de terapias: versiones 640 y 1000 px con srcset (los originales de 1600 quedan en la raíz como fuente, ya sin uso).
- Sin parpadeo de las cifras (clase `js` puesta en el head). Redes sin parámetros de seguimiento. Todos los WhatsApp con mensaje.
- og:locale es_VE, og:site_name, fuera «Psychiatric» del JSON-LD. apple-touch-icon, favicon.ico, icono-192/512 y site.webmanifest.
- Unsplash: no hace falta permiso ni crédito; las fotos de terapias se quedan.
- NO tocado a propósito: fotos de Daryeli (hero, historia, og-image) hasta la sesión de fotos; historia (se reescribe); publicar (dominio).
- Queda de la Etapa 2: lo que depende de Daryeli (testimonios, privacidad, correo) y la parte D (publicar). Luego Etapa 3: animaciones y carga del bombillo.

Etapa 3 (22/10): carga con el bombillo, variante A, en línea en el <head> de index.html. Trazo terracota que se dibuja → círculo que se llena → bombillo blanco; sale a 0,8 s. Solo la primera visita de la sesión (sessionStorage `psic-carga`), nunca con movimiento reducido. Usa el bombillo de la barra (dos líneas en la base); favicon.svg y los íconos PNG ya pasados también a dos líneas.
Animaciones aplicadas: FAQ que se despliega (`::details-content`, 0,24 s; en Safari abre sin animar), entrada escalonada del inicio (60 ms; tras el bombillo si sale), pasos uno tras otro (70 ms). Título y texto del inicio solo suben, sin fundido: con fundido el LCP pasaba de 1,9 a 2,5 s. LCP final 1,9 s. Descartadas: hover en tarjetas de terapias, contador en cifras. Testimonios: con el carrusel.
Sin librerías ni Tailwind: todo CSS.

Barra: solo «Psicconsciente» (1,25 rem en escritorio), sin «Daryeli Romero». Ícono de WhatsApp oficial (Simple Icons) en el botón flotante y en «Hablemos».

Pendiente de Daryeli: los testimonios (se pondrán en carrusel uno por uno) y si hay permiso para publicarlos.
Inicio: solo «Psicóloga clínica» y «Terapia cognitivo-conductual». Sesiones de 60 min; pareja «un poco más», sin cifra.
**Ojo reserva:** la base dice 50 min individual y 60 pareja (`supabase/migrations/20260825120000_base.sql:44`, tabla `services`). Hay que pasarlo a 60 y fijar la de pareja con Daryeli.
Cifras: 500+ pacientes (real), 3.000+ horas (estimado: 500 × ~6 sesiones; que Daryeli lo confirme), 6 años de experiencia.

---

# Dónde quedamos · 19 de octubre de 2026

## Lo hecho el 19/10

- **Móvil con sesión arreglado** (`reservar/reservar.css`): la columna del menú solo en escritorio (`@media (min-width:44.01rem)`) y pestañas repartidas en móvil. 390/390 px, sin scroll lateral.
- **Letra del sistema: Source Sans 3** en `entrar/`, `cuenta/`, `reservar/` y panel. La landing sigue en Inter. Fraunces en títulos. Números del calendario también en Source Sans 3 (tabulares).
- **Auditoría impeccable** guardada en `.impeccable/critique/`. Nota 25/40.
- **Maquetas APROBADAS por Edgar** («me gustó mucho, queda»):
  - `maqueta-movil-app.html` — Mis consultas, Reserva paso 1 y paso 2 en móvil.
  - `maqueta-escritorio.html` — las mismas tres vistas en escritorio.
- Color decidido: **azul pizarra `#3D5568` decide** (botón, check, día y hora elegidos); terracota dibuja (líneas, aros, precio `#8C6246`). Se retira el verde salvia `--acc:#5A7060`.
- Fondo **blanco**. Tarjetas con línea `rgba(166,123,91,.24)`.
- Escritorio: **barra superior blanca** (nada de barra lateral flotante: era igual a La Providencia). La tarjeta de la reserva va **a todo el ancho** (contenedor 1280 px).

- **Paso 3 (pago) añadido a las dos maquetas** el 19/10: aviso suave de retención, monto en Bs grande con tasa BCV y «Copiar monto», «1 · Paga a esta cuenta» (banco, cédula y teléfono con Copiar), «2 · Cuéntanos del pago» (banco, referencia, monto, Hoy/Ayer/Otra fecha, captura). En escritorio va en dos columnas a todo el ancho. Falta que Edgar lo apruebe. No se maquetó la elección «Pagar ahora / en la consulta», que sigue saliendo solo cuando aplica.

- **MAQUETAS CERRADAS Y APROBADAS (19/10, noche).** Edgar: «me gustó mucho, así quedamos». Copias fijas en `maquetas-aprobadas/movil-2026-10-19.html` y `maquetas-aprobadas/escritorio-2026-10-19.html` (las de la raíz se pueden seguir tocando; estas no).
  - Bandas marrones con degradado `#7A5638 → #5E442C → #3F2C1C` + celosía del login en la esquina + brillo cálido.
  - Escritorio: barra superior blanca en el panel; **marrón con celosía en la reserva**, con «Reservar cita» blanco, borde y texto pizarra, hover relleno pizarra.
  - Paso 3: dos bloques con cabecera de color — «1 · Datos para pagar» (terracota claro con puntitos) y «2 · Cuéntanos del pago» (pizarra claro con líneas). Varios bancos con botones «Elige la cuenta» (la página real ya lee varias cuentas de Supabase). Captura en fila compacta (miniatura con puntitos y +, sin botón «Elegir») y vista previa con «Cambiar».
  - **«Pagar ahora / Pagar en la consulta» NO va en la maqueta por decisión de Edgar**; en la página real se mantiene tal como funciona hoy (solo sale cuando aplica).
  - Pendiente aparte: pantalla en el panel de Daryeli para que ella agregue sus bancos.

## Lo siguiente: pasar las maquetas a las páginas reales

Orden, una sesión por paso:

1. **Reserva (`reservar/`), pasos 1 y 2, móvil y escritorio.**
   - Móvil: barra de app marrón con ←, «Nueva reserva» y botón de dudas (WhatsApp); pasos como puntos numerados; paso 1 a una columna; botón fijo abajo; paso 2 con días de 44 px y horas en botones de 48 px por franja; botón «Reservar lunes 19 · 19:00».
   - Escritorio: barra superior blanca; título + pasos numerados; paso 1 en tres columnas; paso 2 calendario | horas; pie con Atrás · consentimiento · Reservar.
   - Cambiar `--acc` a la pizarra y el precio a terracota. Fondo blanco.
   - No romper `reservar.js`: mismos ids (`ir2Escritorio`, `ir2Movil`, `calDias`, `horasFranjas`, `t1`, `t2`, pestañas `pest1-3`…).
2. **Panel del paciente (`cuenta/`)**: banda marrón con «Hola, nombre» y fecha, tarjeta «Tu próxima consulta» encima, paquete con barra, historial; en móvil, atajos y barra inferior Consultas · Reservar · Mis datos. Rehacer `panel.css` (cabecera de escritorio en vez de columna lateral).
3. **Login (`entrar/`)** con el mismo estilo.

Skills por etapa: impeccable (polish al final), ui-ux-pro-max, design-taste-frontend, frontend-design; verificar midiendo el DOM en 1440 y 390, en Chrome y comprobando Brave/Safari.

## Pendientes de la auditoría que siguen abiertos

- Error de red se muestra como «Sin días libres» (`reservar.js` 1016-1046, 1191): separar error de vacío, con Reintentar.
- `reservar/privacidad.html` da 404.
- Reducir la escala de 10 tamaños de letra a 5.
- `prefers-reduced-motion` global en `paso1.css` mata también el indicador de carga.
- «16:00 Ccs» → «16:00 en Caracas».
- Animaciones propuestas: horas al cambiar de día (180 ms), cambio de mes (200 ms), nota de modalidad con `.abre`, check de cita confirmada.

---

# Antes: 15 de septiembre de 2026

---

## Arrancar

```bash
cd "/c/Users/EDGAR/Desktop/Claude Cowork/WEB-DARYE1"
python servidor.py
```

`http://127.0.0.1:8123/reservar/` — y **Ctrl+Shift+R** la primera vez.

Cuenta de prueba: `edgar.prueba@psicconsciente.com` (la contraseña no se guarda aquí).

Versiones vivas: `paso1.css?v=21`, `reservar.js?v=61`, `reservar.css?v=73`,
`supabase.js?v=44`.

---

## Lo que está terminado

**Paso 1 · Reserva.** Portado del taller a la página real y refinado. Radios
nativos (se borraron unas 45 líneas de manejo de teclado), apertura progresiva,
marca de selección cuadrada en salvia, panel de modalidad a todo el ancho con la
duración a la derecha, botón del mapa que se abre al pasar por encima, tarjetas
de plan en tres bandas con línea interior.

**Paso 2 · Día y hora.** Rediseñado completo. Calendario de mes sin rejilla a la
izquierda y las horas del día elegido a la derecha, las dos columnas de 407 px.
Las horas van en cuatro franjas —madrugada, mañana, tarde, noche— con los cortes
puestos según el idioma y los datos reales. Se pide el mes entero a
`get_available_slots` en una llamada.

Se retiraron, por decisión de Edgar: la tarjeta «Tu reserva», el bloque de
urgencias, la casilla del consentimiento, la bajada con la promesa de las dos
horas, y la tira de cinco días.

---

## Lo siguiente, en este orden

### 1 · La migración del consentimiento

Es lo acordado para justo después de terminar el paso 2, y hay una memoria
dedicada. Resumen:

- La base **exige** el consentimiento: `create_booking` rechaza con
  `consent_required` y guarda la versión en `consents`.
- `consents.appointment_id` es obligatorio, así que un consentimiento no puede
  pertenecer a una persona. **Hace falta migración.**
- Mientras no esté, el paso 2 lleva la línea «Al reservar aceptas el
  consentimiento…» bajo el botón. **Es deuda marcada en el código**, no el
  diseño final.
- Aplicarla pide un **token nuevo de Supabase**; el anterior se revocó.
- Caso a resolver: las cuentas que ya existen no tienen consentimiento guardado.

### 2 · Paso 3 · Pago

231 líneas de marcado, la vista más cargada de las tres. Cuando esté,
`reservar.css` (2.128 líneas) desaparece y `paso1.css` se queda sola — y
entonces tocará renombrarla, porque ya no será «paso 1».

### 3 · Los 30 días a Supabase

Tiene memoria propia. El plazo de la consulta suelta está escrito a mano en
`reservar.js` y no lo respalda la base: `valid_days` solo existe en `packages`.
Hay que confirmar la cifra con Daryeli.

---

## Pendientes que no son diseño

- **`reservar/privacidad.html` da 404** y dos enlaces apuntan ahí, uno de ellos
  el del consentimiento. El texto es de Daryeli.
- **Tres preguntas para Daryeli**, juntas: el texto de privacidad, si el horario
  se retiene de verdad y cuánto, y el plazo real de una consulta suelta.
- El panel de móvil sigue sin diseñar (hay un bloque provisional marcado en
  `panel.css`).
- Correos del sistema (no sale ni uno), dominio, `site_url` en `localhost:3000`,
  confirmar correo.
- El aviso de urgencias se quitó del paso 2. La landing sí lo dice en su pie.
  Quedó sugerido llevarlo también al pie del panel; Edgar no lo ha decidido.

---

## Una trampa de esta pantalla, por si reaparece

Tres veces en la misma sesión: **un elemento que se oculta con el atributo
`hidden` y tiene `display` propio en el CSS no se oculta.** El `display` de autor
le gana al `[hidden]{display:none}` del navegador. Pasó con `.modo-nota`, con el
aviso de reprogramar y con `.horas-zona`. La guarda es `:not([hidden])` en la
regla.

Y otra: **el hueco entre cajas con esquinas redondeadas tiene que ser al menos
del tamaño del radio.** Con radio de 8 px y hueco de 4, las pastillas grises del
calendario se fusionaban en barras.
