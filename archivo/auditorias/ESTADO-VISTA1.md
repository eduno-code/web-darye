# Vista 1 de la reserva · dónde nos quedamos

Última sesión: 2 de septiembre de 2026.

## Archivo vivo

`maqueta-vista1-salvia.html` — maqueta autónoma (HTML + CSS + JS en un solo archivo).
Todavía **no está portada** a `reservar/index.html` + `reservar/reservar.css` + `reservar/reservar.js`,
que siguen con la versión del 26 de agosto.

Copias de seguridad por si hay que comparar:

- `maqueta-vista1-salvia.ANTES.html` — antes de la tanda de "quitarle la cara de IA"
- `maqueta-vista1-salvia.ANTES-TIPO.html` — antes del cambio de tipografía
- `maqueta-vista1-salvia.ANTES-FOTOS.html` — antes de meter las fotos en los motivos

## Cómo verla

Abrir directamente desde el disco, sin servidor:

- Visor móvil 390 + escritorio 1280: `ver-vista1.html`
- Auditoría con los diez hallazgos: `auditoria-vista1.html`
- La maqueta sola: `maqueta-vista1-salvia.html`

En `file://` el visor no puede leer dentro de su propio iframe, así que el panel de
escritorio se queda con su alto fijo de 880 px en vez de ajustarse al contenido. Está
dentro de un `try/catch` y no rompe nada. Con un servidor estático en la carpeta
(`python -m http.server 8123`) sí se ajusta solo.

**El panel móvil enseña 390 px de verdad.** Chrome de escritorio le pone al iframe una barra
de desplazamiento clásica que se comía 20 px, así que el panel de "390" estaba enseñando 369
útiles: la maqueta se veía más estrecha de lo que será y con una barra gris al lado que en un
teléfono no existe, porque ahí la barra flota encima y ocupa cero. El visor le da ahora al
iframe 390 más lo que mida la barra y lo recorta a 390 con su `overflow`, así que el contenido
se maqueta con 390 reales y la barra queda fuera del recorte. La medida se toma **dentro** del
iframe —una sonda en la página padre devuelve 0, porque Chrome le da barra flotante a un div
suelto— y se repite tras el `load`, porque en ese instante la maqueta todavía no es más alta
que su ventana y aún no hay barra que medir. El panel de escritorio no se toca: ahí la barra sí
va a estar en el navegador real. Copia previa: `ver-vista1.ANTES-BARRA.html`.

Aviso: el navegador cachea `ver-vista1.html`. Si un cambio del visor no aparece, abrirlo con
`?v=` y un número detrás.

## Datos reales frente a datos de relleno

**La dirección del consultorio es:**

> Calle 19, entre carreras 28 y 29
> Barquisimeto, estado Lara

Confirmada por Edgar el 2 de septiembre. La que traía la maqueta —"Av. Lara con calle 8, Torre
Empresarial, piso 3 / Frente a la plaza"— **era inventada**. Se cayó también la línea de
referencia, porque el "frente a la plaza" tampoco era real y no hay nada confirmado que lo
sustituya; si Daryeli aporta un punto de referencia, su sitio es la tercera línea de
`.lugar-dir`.

Queda por confirmar si **"Centro Humanista Intellego"** es el nombre real del sitio o también
era relleno. Nadie lo ha dicho.

## La auditoría: 8 de 10 hechos, y uno más que no estaba

Los diez hallazgos, con su medición y su recomendación, están en `auditoria-vista1.html`.
Ojo: esa página es la foto del 31 de agosto y **ya no describe el archivo**. La segunda
auditoría, del 2 de septiembre y sobre el estado actual, está en **`auditoria-vista1-b.html`**
con seis hallazgos nuevos. Varios hallazgos se
llevaron por delante partes de otros —las fotos de los motivos borraron cuatro iconos, el cuerpo
de las tarjetas borró otro— así que para saber cómo está la vista hoy manda este documento.

### Hecho

**01 · La tipografía de la marca.** La maqueta declaraba Inter y no la cargaba, así que
titulaba en Segoe UI. Ahora carga Fraunces e Inter con el mismo patrón no bloqueante de
`index.html`, trae los seis `@font-face` de respaldo con métricas ajustadas de `style.css`,
y reparte según la regla que ya sigue la landing: Fraunces para el h1, los títulos de
bloque, el nombre de Daryeli, el precio (peso 700, como `.stat-number`) y la cifra del
disco (como `.step-num`); Inter para todo lo demás, incluidos los rótulos de las opciones,
que son controles y no contenido.

Dos ajustes que salieron de medir al cambiar de fuente: se quitó el `translateY(1.5px)`
del badge de "Ahorras", que compensaba las métricas del sans del sistema y con Fraunces
había pasado a ser el error (desfase óptico ahora de 0,01 px), y el interletraje del
precio subió de -0,035 a -0,02 em.

**02 · Las fotos en los cuatro motivos.** Edgar eligió la variante B: la foto entra en las
**dos anchuras**, no solo en escritorio. Un único elemento `.serv-foto` con dos formas —
miniatura de 44 px a la izquierda en la lista de móvil, franja de 16:10 a sangre sobre el
nombre en las tarjetas de escritorio— sin JavaScript de por medio, igual que hace la propia
lista. Son las cuatro imágenes que la landing ya usa para estos mismos cuatro motivos, con
la gradación de arcilla de `.graded` para que no lleguen con otra temperatura.

Los cuatro glifos SVG de los motivos desaparecieron del archivo, así que esto adelanta
parte del hallazgo 03: quedan cinco iconos, no nueve.

La foto además hace de segunda señal de "elegido": en reposo va a `saturate(.8)` y elegida
sube a `saturate(1.06) contrast(1.03)`, que son los valores de `.graded img` en `style.css`.
El relleno cálido y el canto de salvia siguen siendo la señal principal.

Un descuadre que salió de medir y ya está resuelto: la rejilla estira las cuatro tarjetas al
alto de la más alta y "Fortalecer tu Autoestima" es la única de dos líneas, así que las otras
tres se quedaban con **21,2 px muertos abajo**. Es el mismo defecto que el `min-height:2.7em`
resolvía para los discos y que con foto deja de servir, porque ese mínimo se lo come el propio
relleno del nombre. Ahora la franja de texto toma el hueco sobrante y centra dentro: asimetría
de 2,8 px, idéntica en las cuatro.

Medido con las fotos puestas: móvil 390 con filas de 72,8 px y sin desbordes; escritorio 1280
con las cuatro tarjetas a 176,8 × 177,3 y desfase de alto **0**.

Copia previa: `maqueta-vista1-salvia.ANTES-FOTOS.html`.

**La cabecera sobre terracota** (fuera de la lista de la auditoría; lo pidió Edgar el 1 de
septiembre). La banda pasa de blanca a `--banda #8C6246`, que es `--primary-deep` de
`style.css`: el mismo terracota hondo con el que la landing pinta su pie, sus cifras y su
botón principal. La reserva se abre con la banda con la que se cierra la web de la que viene
el visitante. Nombre en blanco (5,32:1) y subtítulo al 92 % (4,79:1), que es como el pie
separa su texto secundario.

Tres cosas que salieron de medir y que no se copiaron del pie tal cual:

- La pastilla de WhatsApp va **hueca**, no rellena de blanco: rellena sería lo más luminoso
  de la pantalla y la acción principal de esta vista es elegir, no preguntar. Se rellena al
  pasar por encima.
- Su canto va a **`rgba(255,255,255,.62)`, no al `.32` del pie**. Ese `.32` da 1,88:1 sobre
  el terracota y la WCAG pide 3:1 para el contorno de un objeto gráfico; al 62 % da 3,12:1.
  El mismo valor sirve para el aro del avatar, que en arcilla no se distinguía del fondo.
- El foco global es `--acc-dp`, verde hondo, y sobre el terracota da **1,64:1** cuando la
  WCAG 2.2 pide 3:1. Dentro de la banda pasa a blanco, 5,32:1.

También se rehízo el texto. Decía "Psicóloga · Barquisimeto y online" y ahora dice
**"Psicóloga clínica"**, con "· Terapias de tercera generación" añadido a partir de 560 px.
Dos razones: "Psicóloga" a secas rebajaba el cargo que usa el resto del sitio (el `<title>`
de la landing, la lista de credenciales y la ficha de datos estructurados dicen "psicóloga
clínica"), y "Barquisimeto y online" repetía exactamente la elección que se pide unos
centímetros más abajo, en el control de Online / Presencial.

De paso arregla un desbordamiento al filo: la línea vieja ocupaba **194,5 px en una caja de
194,5**, el 100 % exacto, así que envolvía en cuanto la fuente tardaba en cargar o cambiaba
el zoom. La nueva ocupa 98,7 de 120,6 en móvil —21,9 px de holgura— y 293,2 de 542,6 libres
en escritorio. Una línea en las dos anchuras.

El subtítulo dice lo mismo en las dos anchuras. Se probó a sumarle "· Terapias de tercera
generación" en escritorio, donde el hueco entre el nombre y la pastilla está vacío, y Edgar lo
quitó: el hueco no es un problema que haya que rellenar.

Copia previa: `maqueta-vista1-salvia.ANTES-BANDA.html`.

**El fondo de la barra fija**, también del 1 de septiembre. Pasa de `rgba(244,236,228,.93)` a
`--barra #E0CDB8`, dos escalones más oscuro, para que el botón verde se apoye en algo en vez de
flotar sobre casi blanco. El verde no se tocó.

El tope no es estético: un botón es un objeto gráfico y la WCAG le pide 3:1 con su fondo. Con
`#E0CDB8` el verde da **3,47:1**; un paso más (`#D6BFA6`) lo dejaría en 3,03 y cualquier
retoque posterior del verde lo tumbaría. De regalo, el botón **apagado** —que es como arranca
la pantalla, porque al entrar no hay nada elegido— pasa de 1,13:1 a 1,19:1 contra la barra:
sobre el beige claro de antes era prácticamente el mismo color.

El fondo va macizo y se quitó el `backdrop-filter`. Con un beige claro el 7 % de transparencia
daba igual, pero al oscurecerlo deja pasar lo que haya debajo y el tono de la barra cambiaría
según por dónde vaya el desplazamiento, y con él el contraste del botón. Macizo, el 3,47:1 es
una cifra fija y no una media; y sin transparencia el desenfoque ya no pintaba nada.

**04 · Title Case en español.** Los cuatro motivos iban con mayúscula en cada palabra
importante, que es una regla del inglés y en un texto en español suena a rótulo importado.
Ahora son "Superar la ansiedad", "Fortalecer tu autoestima", "Sanar en pareja" y "Acompañar
un duelo".

Se cambió en los **dos sitios vivos**, porque la landing escribía los mismos cuatro nombres
igual de mal y tocar solo la reserva habría dejado las dos páginas diciendo cosas distintas:

- `maqueta-vista1-salvia.html` — las cuatro cadenas de `SERVICIOS` (y la cita dentro de un
  comentario del CSS, para que no quedara desfasado).
- `index.html` — los cuatro `<h3>` de las especialidades y los cuatro `name` de los
  `Service` en los datos estructurados. El JSON-LD se verificó después: sigue parseando.

Quedan fuera a propósito `maqueta-vista1.html` y `maqueta-vista1-b.html`, que son versiones
superadas, y `.superdesign/tmp/`, que es borrador. Copia previa de la landing:
`index.ANTES-MINUSCULAS.html`.

**06 · El texto repetido en las tarjetas de consulta.** No se repetía solo el texto: el
cuerpo de la tarjeta era `[icono] + [texto]` y en las de 3 y 5 consultas las dos piezas eran
la misma, mismo calendario y "A tu ritmo, 60 días" palabra por palabra.

No se sustituyó por otro dato porque no existe: el precio por consulta es 25 $ en las dos de
individual (75/3 y 125/5); en pareja sí difiere, 33,33 y 30, pero una línea que solo funciona
en una de las dos modalidades es peor que ninguna.

El cuerpo se fue entero y el plazo se dice una vez debajo del grupo:
**"60 días para agendar tus consultas."** Va enlazada al `radiogroup` con `aria-describedby`
para que quien use lector de pantalla la oiga al llegar a las opciones y no después de haberlas
pasado todas.

Esa redacción es la tercera y llegó por dos observaciones de Edgar. La primera, de vocabulario:
en el bloque convivían **tres palabras para dos cosas** —consulta, proceso y paquete— y
"paquete" no aparecía en ninguna tarjeta, así que la nota hablaba de algo que en pantalla no se
llamaba así; además es la palabra más comercial del conjunto, que desentona en una consulta de
psicología. La segunda, de alcance, y es la buena: **los 60 días no aplican a quien elige una
sola consulta**, porque esa se agenda para un día concreto y no tiene ventana. Las redacciones
con "tus consultas" se los aplicaban igual, que es decir algo que no es cierto.

Se probó "El proceso son 60 días, a tu ritmo" para acotar por la vía del titular, y Edgar la
tumbó con razón: decía otra cosa que tampoco es cierta, que **la terapia dura sesenta días**.
Los 60 días son la ventana para usar las consultas, no la duración de ningún proceso, y eso no
se puede prometer.

La redacción final nombra lo que de verdad tiene plazo —las consultas— y el plural hace el
grueso del acotado: quien elige una sola lee "tus consultas" y no se da por aludido. No es
hermético. La versión que lo sería del todo es "Si eliges varias, tienes 60 días para usarlas",
y se descartó porque a cambio parte en dos líneas en todo el móvil.

El verbo es **agendar** y no "usar" porque Edgar lo confirmó: el plazo corre para reservar las
citas, no para tomarlas. No es un matiz de estilo — "usar" prometía una condición más estricta
de la que existe.

Edgar propuso además renombrar las tarjetas a "Paquete 1 / Paquete 2" con borde verde oscuro y
la cuenta debajo. Se descartó de común acuerdo por tres razones: "Paquete 1" no dice lo que hay
dentro y "3 Consultas" sí; el disco de la tarjeta lleva hoy la cifra de consultas, así que con
un nombre ordinal la tarjeta enseñaría dos números distintos y el más grande sería el menos
importante; y un borde verde permanente rompería el significado de la salvia, que en esta vista
quiere decir "esto es lo tuyo" y por eso la tarjeta sugerida se distingue en arcilla.

Edgar la quiso **con superficie**, no en texto plano. Empezó siendo una pastilla con el
calendario, y en móvil no funcionaba: a 390 px la columna útil son 330 y la cápsula medía 276,
el **84 %**. Una cápsula es para dos o tres palabras y ahí hay siete, así que a esa anchura
dejaba de leerse como pastilla y se leía como una barra estirada.

Ahora es una **caja al ancho completo** con el radio 16 de la escala, así que rima exactamente
con la tarjeta que tiene encima —miden lo mismo— y no introduce ningún valor nuevo. Fondo
`--sel`, que es el único tinte cálido de la paleta sin otro significado (hoy solo lo usa el
hueco de la foto mientras carga), así que no se confunde con el relleno de una tarjeta elegida.
Medido: texto 5,01:1 sobre el tinte, icono 7,06:1, y el `svg` va `aria-hidden` para que la
descripción accesible sea solo la frase.

Al ancho completo **solo mientras las tarjetas están apiladas**. Edgar pidió que en escritorio
no llegara hasta el final sino hasta donde termina el texto, y tiene razón: allí serían 760 px
de superficie para seis palabras. El corte es **780**, que es el de su propio bloque —a 780 las
tarjetas pasan de una columna a tres—, y no el 760 de la lista de motivos: mientras las tarjetas
sigan apiladas la nota las acompaña midiendo lo mismo que ellas; en cuanto se reparten, la nota
deja de tener con quién alinearse y vuelve a medir lo suyo, 276 px.

Verificado que las dos cosas van siempre juntas: a 390 y 700 la nota mide lo mismo que la
tarjeta y las tarjetas están apiladas; a 800, 819 y 1280 la nota mide 276 y las tarjetas van en
tres columnas. Una línea en todos ellos.

Una línea de **360 px para arriba**, con 28 px de holgura a 360 y 58 a 390. A 320 pide 218 de
los 206,7 disponibles y parte en dos, pero el `text-wrap:balance` de `.grupo-nota` hace que el
corte caiga bien: "60 días para agendar" / "tus consultas". Se acepta el coste — decir el verbo
correcto vale más que una línea en un teléfono de 2016. La caja mide 260 a 320 px, 330 a 390 y
272 en escritorio, donde se encoge a su contenido.

Eso devuelve el calendario a la pantalla, pero **una sola vez y fuera de las tarjetas**: lo que
el 06 quitaba no era el icono sino la misma fila repetida en dos opciones que hay que comparar.
Sigue siendo un glifo dibujado a mano, así que entra en el lote del hallazgo 03.

Se llevó por delante otros dos de los glifos dibujados a mano —el reloj y el calendario—, así
que de los nueve originales quedan **tres**. Medido: las tarjetas pasan de 179,6 a 131 px
(132,5 en móvil), las tres siguen midiendo igual, el precio sigue anclado abajo porque
`.plan-pie` conserva su `margin-top:auto`, y las dos modalidades siguen pintando sus precios
correctos. Copia previa: `maqueta-vista1-salvia.ANTES-06.html`.

**03 · Los iconos, a Phosphor.** Los cinco glifos que quedaban vienen ahora de Phosphor
2.1.1. Los tres de interfaz —`video-camera`, `map-pin` y `calendar-blank`— en peso *regular*;
`navigation-arrow` y `whatsapp-logo` en *fill*. Se copian los glifos sueltos, así que no añade
ni una petición ni una librería.

Los dos macizos lo son por la misma razón medida: a 15 o 16 px un dibujo con detalle interior
pierde el interior y se cierra en una mancha. La flecha de "Cómo llegar" ya lo estaba (y es
además el glifo que usa Google Maps para esa acción). El logo de WhatsApp se pasó después de
que Edgar dijera que no se notaba: **no era el color** —ya estaba en blanco puro, 5,32:1 sobre
la banda— sino el peso. En *regular* su contorno mide 2.052 unidades de perímetro dentro del
mismo cuadrado en que el macizo mide 1.452, un 41 % más de línea peleándose consigo misma a
menos de un píxel físico de grosor. Y es un logotipo: una marca se reconoce por su silueta.

El hallazgo pide una librería y un tratamiento coherente, no un peso literal único; los dos
casos macizos lo son por el mismo motivo declarado.

Dos cosas que aparecieron al mirar el archivo y que la auditoría no había visto:

- **El pin salía dos veces**, a 1.6 y 24 px en la caja del consultorio y a 1.7 y 18 px en el
  control de modalidad: el mismo dibujo mantenido por duplicado y ya divergido.
- **`check` estaba definido en el objeto `I` y no lo usaba nadie.**

Por eso los glifos van en un **sprite** de `<symbol>` al principio del `<body>` en vez de
sueltos: así cada path existe una sola vez y el JavaScript y el marcado estático usan la misma
pieza. El objeto `I` desapareció entero.

Phosphor no expone el grosor como `stroke-width` —sus paths traen el trazo ya convertido en
relleno, sobre un lienzo de 256— así que el helper perdió su segundo parámetro: `ico(d, w)`
pasó a ser `ico(nombre)`, y con él se fueron los cuatro tratamientos de trazo que había
(1.6, 1.7, 1.8 y macizo).

La escala de tamaños baja de seis valores (15, 16, 17, 18, 19 y 24 px) a **dos**: `--ico:16px`
y `--ico-lg:20px`. La grande se reserva para los dos sitios donde el icono no acompaña a un
texto pequeño sino que encabeza algo: la caja del consultorio y la pastilla de WhatsApp cuando
en móvil se queda sin rótulo. 16 y no 18 para la base porque un glifo relleno pesa más que uno
de línea al mismo tamaño.

Medido: 10 iconos en pantalla, todos resueltos desde los 5 símbolos, solo dos medidas (16 y
20), cero `stroke-width` en el documento, y cada uno hereda el color de su sitio —blanco sobre
la banda y sobre la salvia, arcilla honda en la caja del consultorio, salvia honda en la
pastilla de los 60 días—. Copia previa: `maqueta-vista1-salvia.ANTES-03.html`.

**07 · Los radios, a una escala.** Había cinco valores sin regla —50 %, 999 px, 14, 8, 7 y un
12 suelto— repartidos como salió. Ahora son tres medidas y un círculo, y no son inventadas: son
las de `style.css` (8 / 16 / 28 / 999) menos el 28, que esta pantalla no usa. Van como tokens
(`--r-sm`, `--r`, `--r-pill`) y no como literales, para que la regla se sostenga sola.

La regla queda escrita en el archivo: círculo para lo que es una moneda, pastilla para lo que
se pulsa o encierra dos palabras, 16 para las cajas y 8 para lo que va dentro de una.

Cambios concretos: la tarjeta sube de 14 a **16 px**, que es lo que la landing usa para la
misma clase de objeto; el badge de "Ahorras" y la pastilla de los 60 días pasan de 7 px a
pastilla completa; y el aviso de maqueta deja su 12 px suelto.

Al pasar a canto redondo hubo que subir el relleno lateral de las dos pastillas —el badge de
`.5` a `.7rem` y la nota de `.75` a `.95rem`—: con la esquina redonda del todo, un relleno
menor que el radio deja la primera letra montada sobre la curva. Ahora el badge tiene 11,2 px
de lado para un radio efectivo de 12, y la nota 15,2 para 17.

Medido en el caso más apretado, 800 px, que es donde conviven tres columnas con el relleno de
tarjeta de móvil: el badge sigue en la misma línea que el precio, las tres tarjetas miden 132,5
y no hay desbordes. En pantalla quedan **cuatro** valores en móvil (50 %, 999, 16, 8) y **tres**
en escritorio, donde la lista se deshace en tarjetas y la miniatura pierde su esquina.
Copia previa: `maqueta-vista1-salvia.ANTES-07.html`.

**05 · Las tres preguntas seguidas.** Los tres títulos de bloque eran "¿Cómo prefieres la
consulta?", "¿En qué quieres trabajar?" y "¿Una consulta o un proceso?": del mismo largo y con
la misma cadencia, tres interrogativas seguidas se leen como un molde rellenado tres veces. Es
lo mismo que pasaba con las cuatro tarjetas idénticas, pero en texto.

Se fue **la primera**, que era la que menos falta hacía: un interruptor de dos opciones con
"Online" y "Presencial" escritos a la vista se explica solo. Las otras dos se quedan —ahí sí hay
algo que preguntar— y separadas por un bloque entero ya no riman.

El grupo pasó de `aria-labelledby` a `aria-label="Modalidad de la consulta"`: su nombre deja de
ser una pregunta y pasa a decir lo que el grupo **es**, que informa más a quien usa lector de
pantalla que la pregunta que había.

Medido a 390 × 844: la primera decisión sube del píxel **305 al 264** —41 px ganados, sin contar
el aviso de maqueta, que no llega a producción— y el bloque entero termina en el 497, o sea
dentro de la primera pantalla. Comprobado que el interruptor sigue funcionando: elegir
Presencial abre la caja del consultorio con `aria-hidden="false"` y sin `inert`, volver a Online
la cierra a 0 px y la vuelve a marcar como oculta e inerte. Copia previa:
`maqueta-vista1-salvia.ANTES-05.html`.

**09 · Remates, la mitad que tocaba ahora.** La propia auditoría separaba este hallazgo en dos
tiempos: el borde y el guión se hacían ya, el modo oscuro cuando estuviera cerrado el diseño en
claro y los estados de carga al portar a la página real.

**El borde de los controles.** `--linea` sube de `#C6A783` a `#A8825F`. Las tarjetas y las filas
son `<button>`, o sea controles, y la WCAG pide 3:1 para su contorno contra lo que tienen al
lado; el claro daba **2,27:1** contra el papel blanco. El nuevo da **3,49:1** y no es un color
inventado: es `--marca`, que ya estaba escrito en el bloque de tokens. El claro se queda como
`--marca-cl` para lo decorativo. Verificado sobre los once controles con borde de la pantalla.

**El guión largo.** El `aria-label` del botón del mapa decía "Cómo llegar — se abre en el mapa"
y ahora usa coma. El guión largo está fuera también en el texto que solo oye un lector de
pantalla. La etiqueta sigue empezando por "Cómo llegar", que es lo que se lee en el botón, para
que quien maneje la página por voz pueda decir su nombre visible (WCAG 2.5.3). Cero guiones
largos en `aria-label` en toda la vista.

De paso quedó verificado con el fondo real —no contra el `body`— que la pastilla de WhatsApp
sobre la banda de terracota da **3,11:1** en el canto y **5,32:1** en el icono.

Copia previa: `maqueta-vista1-salvia.ANTES-09.html`.

**El `border:1.5px` del estado elegido, arreglado** (hallazgo nuevo del 1 de septiembre, no
está en `auditoria-vista1.html`). Chrome trunca el grosor de borde a píxeles físicos enteros,
con un mínimo de uno, así que 1 px y 1,5 px acababan en **el mismo píxel físico** tanto a
densidad 1 —la mayoría de escritorios— como a 1,15, que es la pantalla de Edgar con Windows al
115 %. El borde de la tarjeta elegida era idéntico al de reposo y la única señal que quedaba era
el relleno cálido. Sube a **2 px** en `.card[aria-checked]` y en `.fila[aria-checked]` de
escritorio, que es el valor que se separa del de reposo en todas las densidades.

| CSS | dpr 1,00 | dpr 1,15 | dpr 1,25 | dpr 1,50 | dpr 2,00 |
|---|---|---|---|---|---|
| 1 px | 1 | 1 | 1 | 1 | 2 |
| 1,5 px | 1 | 1 | 1 | 2 | 3 |
| **2 px** | **2** | **2** | **2** | 3 | 4 |
| 2,5 px | 2 | 2 | 3 | 3 | 5 |

La regla práctica que queda escrita en el archivo: **solo los grosores enteros son de fiar**.

Coste: el contenido de la tarjeta elegida se mete 0,87 px por lado a densidad 1,15. El archivo
avisaba de que engordar el borde desalineaba los precios, y por eso la tarjeta **sugerida** se
distingue por color y no por grosor — pero esa es permanente y se compara con sus dos vecinas,
mientras que la elegida es transitoria y es la que acabas de pulsar. Verificado que las tres
tarjetas siguen midiendo 240 × 131,8 y que no hay desbordes.

El disco de la tarjeta elegida no se tocó: su anillo va de 1,5 a 2,5 px, y esos dos sí caen en
píxeles distintos (1 y 2) a la densidad de Edgar. Además su estado de reposo es un disco macizo
y el elegido un aro sobre blanco, así que no depende del grosor para distinguirse.

Aviso de método: **el navegador de Playwright estaba corriendo a densidad 0,86**, donde ni 1,5
ni 2 px llegan a dos píxeles físicos, así que este cambio no se pudo comprobar renderizado y se
resolvió con la aritmética del truncado, que es determinista. Lo que sí se midió es la
geometría: sin desalineación. Copia previa: `maqueta-vista1-salvia.ANTES-BORDE.html`.

**Auditoría 2 · hallazgos 01 y 04, hechos.** El precio baja de **1,8 rem / peso 700** a
**1,45 rem / peso 600**. Estaba empatado en tamaño con el `h1` de la página —los dos a 28,8 px—
y con un peso más, así que en el desempate ganaba el dinero; multiplicado por tres tarjetas, lo
primero que veía el ojo al llegar al bloque no era qué estaba eligiendo sino cuánto costaba. A
1,45 sigue siendo con diferencia lo más grande de la tarjeta (el nombre del plan mide 0,94) pero
deja de competir con el titular.

Se copiaba el peso 700 de `.stat-number` de la landing, pero allí esa cifra **es** el contenido
de su bloque y aquí no: aquí el contenido es la decisión. Con el cambio el 700 desaparece de la
vista entera y quedan **tres pesos** (400, 500, 600), que es lo que el comentario del cuerpo de
la página decía desde el principio que había. Eso cierra también el hallazgo 04.

Un efecto de segundo orden que apareció al medir: había un `.plan-precio{font-size:1.55rem}` en
el bloque de móvil que **bajaba** el precio desde el 1,8 de entonces. Con la base en 1,45 ese
mismo valor pasaba a **subirlo**, así que en el teléfono el precio volvía a acercarse al titular,
justo lo que el cambio quería evitar. Se quitó: 1,45 en las dos anchuras, y un tamaño menos en
la escala.

Verificado a 390, 800 y 1280: precio 23,2 px / 600 en los tres, los tres precios alineados entre
sí, el badge sigue en la misma línea que el precio y cero desbordes. Copia previa:
`maqueta-vista1-salvia.ANTES-PRECIO.html`.

**Auditoría 2 · hallazgo 02, hecho. La escala tipográfica.** Había **veintidós declaraciones
de `font-size` con quince valores distintos**, todas escritas a mano en el sitio donde hacían
falta: `.72 · .74 · .76 · .78 · .8 · .82 · .85 · .9 · .94 · .95 · .98 · 1 · 1.05 · 1.45 · 1.8`.
Entre `.94rem` y `.95rem` había dieciséis centésimas de píxel — dos tamaños que nadie distingue
pero que el archivo tenía que sostener los dos.

Ahora hay **seis pasos, en tokens de `:root`**, nombrados por función y no por número:

| Token | Tamaño | Familia | Se lo llevan |
|---|---|---|---|
| `--t-nota`  | .78 rem · 12,5 px | Inter | `.paso-txt` `.top-txt span` `.wa` `.grupo-nota` `.plan-eti` `.plan-ahorro` `.aviso-maqueta` |
| `--t-aux`   | .88 rem · 14,1 px | Inter | `.seg` `.lugar-dir` `.lugar-ir` `.serv-nom` `.plan-nom` `.resumen` |
| `--t-base`  | 1 rem · 16 px | Inter | `.top-txt strong` `.intro` `.lugar-cab strong` `.btn` |
| `--t-tit`   | 1.05 rem · 16,8 px | Fraunces | `.grupo-tit` `.plan-cifra` |
| `--t-cifra` | 1.45 rem · 23,2 px | Fraunces | `.plan-precio` |
| `--t-h1`    | 1.8 rem · 28,8 px | Fraunces | `h1` |

Los nombres son por función porque los dos pasos de en medio casi miden lo mismo —16 y 16,8 px—
y solo se diferencian por la familia: Inter escribe, Fraunces titula. Con un `--t-4` al lado de
un `--t-5` esa pareja parecería una errata; con `--t-base` y `--t-tit` se explica sola.

Tres mapeos no eran automáticos:

- **`.grupo-nota` baja de `.82` a `.78`.** Subirla a `.88` ensanchaba el texto un 7 % y la nota
  de los 60 días está prometida a una sola línea en móvil. Además la deja en el mismo rango que
  `.paso-txt`, que es lo mismo: texto que acompaña.
- **`.serv-nom` y `.plan-nom` bajan de `.94` a `.88`.** Subirlas a 16 px era tentador —son los
  nombres de lo que se elige— pero "Superar la ansiedad" vive en una tarjeta de 176 px en
  escritorio y `.plan-nom` comparte línea con la cifra y con "Sugerida".
- **`.btn` sube de `.95` a `1`.** El botón que cierra el paso no debería ir por debajo del
  cuerpo del texto, y su altura ya está fijada, así que no mueve la geometría.

Y una regla muerta menos: el bloque de escritorio repetía `.acciones .btn{font-size:.95rem}`,
que era exactamente el valor base. Se quitó. Quedan **21 declaraciones, todas token**; el único
`font-size` literal que sobrevive en el archivo está dentro de un comentario.

Verificado en un banco de tres iframes a 390, 800 y 1280 (el de 390 mide 371 px útiles con su
barra, así que es una prueba más dura que la real): **cero desbordes horizontales** en las tres;
la nota de los 60 días en **una línea** en las tres, a ancho completo en móvil (331,8 px) y
`inline-flex` de 261,1 px en escritorio; el badge "Ahorras" **en la misma línea que el precio**
en las dos tarjetas que lo llevan; "Sugerida" sin cortarse; los cuatro motivos con la misma
altura exacta (72,8 / 73,8 px en móvil, 174,9 px los cuatro en escritorio); las tres tarjetas de
consulta a la misma altura; el botón a 16 px, 52,2 px de alto en móvil y 50 en escritorio, sin
desbordar; la dirección en dos líneas y el resumen en una. Copia previa:
`maqueta-vista1-salvia.ANTES-ESCALA.html`.

**Auditoría 2 · hallazgo 05, hecho. Fuera el punto de "Sugerida".** Había un círculo de 5 px
en salvia `#5A7060` delante de la palabra, y era el **tercer aviso del mismo hecho**: la tarjeta
sugerida ya lleva `border-color:var(--marca)`, un contorno en arcilla marcada que es una señal
de TARJETA y pesa más que cualquier etiqueta, y ya lleva la palabra. El punto era además el más
débil de los tres —a 5 px no se lee como forma sino como una mota— y metía un tercer tono en una
señal que ya se decía en dos: arcilla el contorno, salvia honda `#3E4F44` el texto.

Un punto de estado se gana su sitio cuando hay un **juego** de estados y el color es lo único que
los separa (en línea / ausente / desconectado). Aquí hay un estado, en una tarjeta de tres, y con
palabra. La palabra sola queda separada por posición (`margin-left:auto`, al borde derecho), por
tamaño (12,5 frente a los 14,1 del nombre) y por color; sobre la tarjeta elegida `#F2E7D9` da
**7,15:1**. Con el punto fuera, `display:inline-flex`, `align-items:center` y `gap:.35rem` se
quedaron sin nada que alinear y también salieron.

Verificado comparando el archivo de antes y el de después en dos iframes a 1280: **geometría
idéntica** salvo lo que debía cambiar. La etiqueta pasa de 64,1 a **53,5 px** de ancho, que son
exactamente los 10,6 px que ocupaban el punto y su hueco; el `top` de la etiqueta dentro de la
cabecera sigue en 26,82 px, las tres tarjetas siguen a 128 px y el desfase entre el centro de la
etiqueta y el del nombre sigue en **-0,01 px**. A 390 y a 1280, cero desbordes. (De paso: la
etiqueta está 2,65 px por debajo del centro de la cabecera, pero eso ya pasaba antes y no es un
defecto — se alinea con el NOMBRE, no con la caja, que es más alta por el disco de la cifra.)
Copia previa: `maqueta-vista1-salvia.ANTES-PUNTO.html`.

**Defecto encontrado por Edgar · la divisoria doble. Arreglado.** Al elegir la tarjeta de
**1 consulta** aparecian dos rayas de arcilla a 2 px una de otra y de distinta longitud. La causa:
habia **dos reglas dibujando la misma divisoria** —el `border-bottom` de `.plan-cab` y el
`::before` de `.plan-pie`— y por encima de 820 px se dibujaban las dos.

Coincidian solo mientras el pie midiese igual en las tres tarjetas. La de 1 consulta no lleva
badge "Ahorras", y ese badge medi­a **25,16 px** frente a los **23,2** del precio: su pie era
1,95 px mas corto, `margin-top:auto` lo bajaba esos 1,95 px y las dos lineas se separaban. Sin
elegir no se notaba, porque las dos al 22 % de alfa se funden en una raya un poco mas gorda; al
elegir saltaban las dos a arcilla llena. Medido en la tarjeta 1 a 1280: linea de la cabecera a
68,14 px con sangrado 17,88, linea del pie a 70,09 con sangrado 16,80. Los 1,08 px de diferencia
de sangrado son exactamente el grosor del borde de la tarjeta — la cabecera mide su margen por
dentro del borde y el pie por fuera. En movil no pasaba: alli la de la cabecera estaba apagada.

Dos cambios:

- **Una sola divisoria, la del pie.** Se va el `border-bottom` de `.plan-cab` con sus tres reglas
  (la base, la de elegida y los dos apagados del bloque de movil). Se queda la del pie, que es la
  unica que dibuja en movil y la que funciona en las dos anchuras. El `margin:0 1.05rem` de la
  cabecera SI se queda: sin relleno propio en la tarjeta, es lo que la mete hacia dentro.
- **El badge deja de mandar en la altura de la fila:** `max-height:var(--t-cifra)`. El tope va
  contra el token que fija el precio, que tiene `line-height:1`, asi que las dos piezas miden
  exactamente lo mismo hoy y si manana se mueve la escala. El texto sigue centrado; lo unico que
  se encoge es el relleno vertical, 1 px.

Verificado a 390 y 1280 con la tarjeta 1 elegida: `border-bottom` de la cabecera en **0px/none**
en las dos anchuras, la divisoria a la **misma altura en las tres tarjetas** (71,04 px en movil,
67,05 en escritorio, 0,00 px de diferencia entre ellas), badge y precio ambos a **23,2 px** con
desfase **0** y sin recortarse, y cero desbordes. Efecto de propina: en movil las tres tarjetas
ahora miden **131,3 px las tres** — antes eran 131,3 / 133,3 / 133,3, una asimetria que no
habiamos visto. En escritorio bajan de 128 a 124,9. Copia previa:
`maqueta-vista1-salvia.ANTES-DIVISORIA.html`.

**Pedido por Edgar · las tarjetas de precio se vei­an chatas. Arreglado (opcion B).** En
escritorio media **240 x 125 px, proporcion 1,92**, casi 2:1, justo debajo de los cuatro motivos,
que son cuadrados de 176,8 x 174,9. El ojo compara las dos filas y las de precio se lei­an
aplastadas. Edgar acerto el diagnostico: **no era el ancho, era el alto** — y no era el contenido
sino el relleno. La tarjeta gasta 34 px en el disco de la cifra y 23,2 en el precio: 57 px de
contenido en 125 de caja. Ademas el aire estaba mal repartido: la divisoria tenia 12,8 px por
arriba y 14,4 por debajo.

Se le enseno una comparativa renderizada con cuatro versiones —la maqueta real cargada entera en
un iframe por opcion, para no perder tipografia ni fotos— y eligio la **B**: `1.15rem` a cada lado
de la divisoria y `1.8rem` en los dos extremos. La tarjeta queda en **240 x 153,7, proporcion
1,56**. Sigue siendo claramente otra cosa que el motivo, que es lo correcto: una es una foto y la
otra es un dato. Se descarto la C (168 px) porque quedaba a **7 px** de los 175 del motivo, y casi
igual pero no igual se lee como un descuadre, no como una decision.

**Y de paso, un corte que no cuadraba.** Las tarjetas pasan a rejilla de tres columnas en
`min-width:780`, pero el bloque que las apretaba llegaba hasta `819.98`: en esa franja de 40 px se
vei­an tres tarjetas de 240 px con relleno de movil —240 x 131, proporcion 1,83—, justo la forma
chata que se acababa de corregir. El corte baja a `779.98`, asi que "escritorio" significa lo
mismo para la rejilla y para la tarjeta.

Verificado a 390, 800 y 1280: a **800 y 1280 identicas** (240 x 153,7, proporcion 1,56, rejilla de
tres columnas de 240, 18,4 px de aire a cada lado de la divisoria), a 390 sin tocar (331,8 x 131,3,
que es lo correcto: alli la tarjeta va a ancho completo). En las tres anchuras las tres tarjetas
miden lo mismo, las divisorias a 0,00 px de diferencia, la nota de los 60 dias en una linea, el
boton en su sitio y cero desbordes. Copia previa: `maqueta-vista1-salvia.ANTES-ALTO.html`.

**Pedido por Edgar · la caja del consultorio, apretada por dentro y por fuera. Arreglado.**

*Fuera.* La caja salia a **17,6 px** del control de modalidad y a **36** de la linea que cierra
el bloque: estaba el doble de pegada arriba que abajo, y arriba es donde mas se nota, porque la
caja APARECE — se despliega al elegir presencial, asi que naciendo pegada al control parecia que
lo empujaba. Arriba pasa a **28,8 px**, el mismo valor que el relleno de las tarjetas de consulta.
Abajo se le anaden 12 px por **padding y no por margen**: el margen inferior de este bloque
colapsaria con el del `.grupo` que lo contiene —el mayor de los dos se come al otro— y no sumaria
nada. Con el padding la linea queda con **48 px por encima y 33 por debajo**, mas aire del lado
del bloque que acaba de terminar, que es a quien pertenece. Va en la transicion, asi que crece con
el despliegue y no da un salto al final.

*Dentro.* El relleno vertical sube de 19,2 a **28,8 px** (el horizontal se queda en 20,8, que ya
estaba bien) y la linea interior deja de tener 12,8 px por arriba y 14,4 por debajo: **18,4 a cada
lado**, igual que la divisoria de las tarjetas. Era la misma asimetria y estaba en los dos sitios
de la pantalla.

Verificado a 390 y 1280, abierta y cerrada. Abierta: caja de **760 x 185,6** en escritorio y
**350,2 x 249,6** en movil, 28,8 px de aire arriba, 48 abajo, 18,4 a cada lado de la linea
interna. Cerrada: alto **0**, `margin-top` y `padding-bottom` en **0**, opacidad 0, `inert`
puesto y el hueco entre el control y la linea vuelve a los 36 px de siempre — no queda ni un
pixel de rastro. Cero desbordes en las dos anchuras. Copia previa:
`maqueta-vista1-salvia.ANTES-LUGAR.html`.

**Modo oscuro. Hecho.** No habia ni una regla de `prefers-color-scheme` en todo el proyecto, asi
que se construyo desde cero.

*Como se dispara.* Solo `prefers-color-scheme`, **sin interruptor propio**. Un conmutador manual
obliga a guardar la preferencia, a pintar un control en la cabecera y a decidir que pasa cuando el
sistema dice una cosa y el usuario otra: tres problemas nuevos para un formulario que ademas va
empotrado en una landing que tampoco tiene interruptor. Con los tokens montados, anadirlo mas
adelante es un selector, no rehacer nada. Ademas `color-scheme:light dark` en `:root`, para que la
barra de desplazamiento, el foco nativo y los controles del sistema acompanen al tema.

*Seis literales que habia que tokenizar primero.* De los 19 colores escritos fuera de `:root`, la
mayoria son blancos sobre relleno de color y aguantan —el blanco sobre la banda de terracota da
7,64:1 tambien en oscuro—, pero seis cambian de sentido al apagar la luz y se convirtieron en
token: `--acc-txt` (lo que se escribe encima de la salvia), `--disco` y `--disco-off` (el disco de
dentro del boton, que en claro es un velo de luz sobre salvia oscura y en oscuro tiene que ser lo
contrario), `--pend-linea`, y `--foto` / `--foto-eleg` (los filtros de las imagenes). Sin eso el
bloque oscuro pareceria funcionar y dejaria seis agujeros.

De propina, la inversion del disco de las tarjetas quedo escrita con **los mismos dos tokens en el
otro orden**: en reposo es salvia con el contenido en `--acc-txt`, y elegido es `--acc-txt` con el
contenido en salvia. La regla ya no sabe en que tema esta.

*La unica decision de diseno real: la escalera cambia de sentido.* En claro la pagina es lo mas
claro y **elegir hunde** la tarjeta. Trasladado tal cual, en oscuro la elegida seria mas oscura que
sus vecinas y se leeria como un agujero. Aqui **elegir levanta**: el significado no cambia —"esto
es lo tuyo"—, cambia que direccion significa hacia delante, y en oscuro siempre es hacia la luz.

*La paleta.* Nada de negro puro ni blanco puro: el suelo es `#16181A`, un casi negro templado
hacia el verde de la tinta, y el texto `#EDE9E1`, hueso calido — sobre negro puro la Fraunces de
los titulares halona. La arcilla sube a `#C6A783` para poder dibujar sobre lo oscuro. Y la salvia
se invierte: en claro es oscura con blanco encima, en oscuro es clara (`#8AA891`) con la tinta de
la pagina encima, asi que **el boton pasa a ser lo mas luminoso de la pantalla**, que es
exactamente su trabajo.

*Todos los pares medidos con una calculadora WCAG, no a ojo.* Texto 14,70:1 sobre el suelo y
13,41 sobre la tarjeta, texto suave 7,86 y 7,17, "Sugerida" 8,36, inerte 4,85, boton 6,86, badge
9,17, blanco sobre la banda 7,64, foco 9,17, lineas 7,16. **Y los cuatro pares que en claro andaban
justos salen en oscuro iguales o mejor:** tarjeta elegida 1,22 -> **1,33**, divisoria interna 1,26
-> **1,53**, contorno de la sugerida 1,63 -> **2,49**, aro del avatar 3,11 -> **4,08**.

Verificado emulando el tema en Chrome a 1280 y a 390: en oscuro los 19 tokens resuelven, cero
fondos blancos sueltos en toda la pagina, la elegida levanta (`#31372E` sobre `#1E2120`), el disco
se invierte, el boton queda salvia clara con tinta, el canto de salvia del movil y la barra fija
siguen su token, cero desbordes. **Y en claro el resultado es identico al de antes del cambio**,
token por token: no hay regresion. Copia previa: `maqueta-vista1-salvia.ANTES-OSCURO.html`.

*Para verlo:* el tema sale del sistema. En Windows, Configuracion > Personalizacion > Colores >
Modo oscuro, y la pagina cambia en vivo sin recargar. En Chrome tambien vale DevTools >
Rendering > Emulate prefers-color-scheme.

**Modo oscuro · segunda version, corregida.** Edgar miro la primera y dijo que "no se distingue
muy bien en toda la vista". Tenia razon, y el barrido de la pantalla entera lo dejo claro:

| | Contraste contra la pagina | DL* |
|---|---|---|
| Lineas (bordes, separadores) | **7,85:1** | **62** |
| Superficies (tarjetas, cajas, lista, barra) | **1,10:1** | **4,3** |

La vista quedaba **dibujada a alambre**: fondo casi negro plano con todo delineado en arcilla
brillante, y como todas las lineas gritaban por igual, nada destacaba sobre nada. El error tiene
nombre: **maximice el contraste del borde en vez de igualarlo**. La WCAG pide 3:1 para el contorno
de un control y en claro esta en 3,49; yo lo habia puesto en 7,85. En claro esa reparticion
funciona porque el papel blanco ya hace de material por si solo; en oscuro no hay papel, asi que
el material lo tiene que poner la superficie.

Vale la pena anotar por que no lo vi antes: mi criterio habia sido la **paridad de ratio** con el
claro, y en las superficies la paridad de ratio no basta — el ojo discrimina mucho peor en el
extremo oscuro, asi que la medida util ahi es el DL*, no el cociente.

La correccion va al reves de lo que estaba: **subir las superficies y bajar las lineas.**

*Superficies.* `--suelo` baja a `#131517` para hacer sitio, `--sup` sube a `#20241F` y `--sup-eleg`
a `#333A2F`. Los escalones pasan de DL* 4,3 a **7,0** (pagina -> tarjeta) y se mantienen en **9,8**
(tarjeta -> elegida). Como referencia, el escalon de la elegida en claro es 7,9: ahora los dos
temas se leen al mismo nivel.

*Lineas.* `--linea` baja de `#C6A783` a `#9C7A56`, que reproduce el perfil del claro casi punto por
punto: **4,00:1** contra la tarjeta (claro 3,49) y **2,98** contra la elegida (claro 2,86). Las
internas suben de opacidad, de `.22` a `.30` y de `.44` a `.55`, porque una arcilla al 22 % sobre
superficie oscura desaparece. `--marca-dp` se queda alto a proposito: es un ICONO, no una linea.

*Fotos.* El `brightness(.88)` de la primera version las apagaba, y son lo unico con color de verdad
en la pantalla. Baja a `.95` en reposo y desaparece del estado elegido.

Verificado con un barrido de la vista entera: superficies a DL* **7,0 / 9,8 / 7,0 / 5,3 / 11,1**
(antes 4,3 / 9,8 / 4,3 / 4,2 / 8,4), lineas a **4,00 / 4,65 / 2,98 / 1,49** (antes 7,16 / 7,85 /
… / 1,53), texto intacto (15,12 sobre la pagina, 8,09 el suave, 9,71 el precio, 6,05 "Sugerida",
7,05 el boton). La distancia entre lo que gritan las lineas y lo que pesan las superficies pasa de
**14x a 6,7x**. Y en claro sigue saliendo identico token por token: pagina `#FFFFFF`, tarjeta
`#FFFFFF`, elegida `#F2E7D9`, borde `#A8825F`, banda `#8C6246`, barra `#E0CDB8`, boton `#5A7060`
con blanco, foto `saturate(0.8)`. Copia previa de esta segunda pasada:
`maqueta-vista1-salvia.ANTES-OSCURO2.html`.

**Modo oscuro · tercera correccion. El disco elegido se apagaba en vez de encenderse.** Edgar,
mirando la version corregida: "cuando selecciono no se si tendra a confundirse la persona que no
esta seleccionada". Tenia razon otra vez, y la causa estaba en una decision mia de la primera
version que sobre el papel parecia elegante.

La inversion del disco de la tarjeta se habia escrito con `--acc-txt`, el mismo token que se usa
para lo que va encima de la salvia: en reposo el disco era salvia con el contenido en `--acc-txt`
y elegido era `--acc-txt` con el contenido en salvia, asi que la regla no sabia en que tema estaba.
Medido, el resultado era este:

| El disco al elegir | Sin elegir | Elegida | Salto |
|---|---|---|---|
| Claro | L* 45,1 | L* **100** | **+54,9** |
| Oscuro | L* 66,1 | L* **6,7** | **-59,4** |

Mismo tamano de gesto, **direccion contraria**. En claro elegir ENCIENDE el disco —se vuelve lo
mas brillante de la tarjeta— y en oscuro lo APAGABA. La senal de "esta es la tuya" se leia como
"esta esta desactivada". Y contra su propia tarjeta el disco elegido daba 1,56:1: practicamente
desaparecia.

*El arreglo.* El disco elegido tiene ahora dos tokens propios en vez de heredar `--acc-txt`:
`--circ-eleg` (relleno) y `--circ-eleg-txt` (contenido). En claro valen `#FFFFFF` y `#5A7060`, que
es exactamente lo que ya habia. En oscuro valen `#EDE9E1` —el hueso del texto, lo mas luminoso de
esa paleta— y `#3E4F44`, la salvia honda del tema claro.

Verificado en oscuro: el salto pasa de **-59,4 a +26,4** de L*, en la misma direccion que el claro;
el disco elegido pasa de **1,56:1 a 9,71:1** contra su tarjeta (el normal esta en 6,07), la cifra
se lee a 7,21:1 y el aro da 4,53:1 contra la tarjeta elegida. El salto es menor que los +55 del
claro porque el disco en reposo ya parte de L*66, pero lo que hace que se lea como "elegida" es la
direccion, no el tamano. En claro sigue todo identico: salto +54,9, disco `#FFFFFF` con `#5A7060`,
cifra 5,36:1, aro 4,39:1. Copia previa: `maqueta-vista1-salvia.ANTES-DISCO.html`.

**Pedido por Edgar · el aro de salvia para todo lo elegido, solo en oscuro. Hecho.** Le gusto el
contorno verde del control de modalidad —`.seg-ind`, un aro de 2,5 px en `--acc`— y pidio ese
mismo borde en todo lo seleccionado, pero solo en el tema oscuro.

Salio de un token porque `--linea-f` se usa exactamente en los cinco sitios que significan
"elegido o senalado": el borde de la tarjeta elegida, el de la fila de motivo elegida, los dos
`:hover` de ambas, y la divisoria interna de la tarjeta elegida. En el bloque oscuro pasa a
`var(--acc)` y ya esta.

Ademas de gustarle, resuelve algo que en oscuro molestaba mas que en claro: **la arcilla es el
color con el que esta dibujada toda la estructura**, asi que una tarjeta elegida con borde de
arcilla solo se distinguia de sus vecinas por el grosor, de 1 a 2 px. Con la salvia lo elegido
tiene color propio y no solo peso. En claro se queda la arcilla, que es lo que pidio: alli el
papel blanco ya hace de material y el borde no compite con nada.

**Y destapo un conflicto que llevaba escondido desde siempre.** `.planes .card.sugerida` pesa mas
que `.card[aria-checked="true"]` —tres clases contra una clase y un atributo—, asi que el borde de
la sugerida ganaba al de la elegida. No se notaba porque `--marca` y `--linea-f` valian lo mismo:
las tres tarjetas tenian `#9C7A56` en todos los estados. En cuanto lo elegido pasa a salvia, la
sugerida seria **la unica que no cambia de color al elegirla** — y es la que mas gente va a elegir.
Se anadio `.planes .card.sugerida[aria-checked="true"]{border-color:var(--linea-f)}`: elegir gana
a sugerir.

Verificado en oscuro a 1280: el borde de lo elegido es `#8AA891`, **exactamente el mismo color que
el aro del segmentado**; funciona en la tarjeta normal Y en la sugerida; las no elegidas siguen en
arcilla `#9C7A56` a 1 px; la fila de motivo elegida tambien; y la divisoria interna de la elegida
acompana. Contraste **7,05:1 contra la pagina y 4,53:1 contra el propio relleno de la elegida**.
En claro no se mueve nada: `--linea-f` sigue en `#A8825F`, igual que `--marca`, asi que la regla
nueva resuelve al mismo valor que ya habia. Cero desbordes. Copia previa:
`maqueta-vista1-salvia.ANTES-AROVERDE.html`.

**Pedido por Edgar · borde mas grueso en lo elegido, y el borde que faltaba en las terapias de
movil. Hecho, con un cambio de tecnica.**

*El grosor.* El camino obvio era engordar el `border`, y tenia dos problemas medidos. Uno:
**Chrome trunca el grosor de borde a pixeles fisicos enteros**, asi que a 1x un borde de 2,5 px se
pinta exactamente igual que uno de 2 —los dos ocupan 2 pixeles— y el cambio no se veria en un
monitor normal. Dos: a 3 px si se ve, pero la tarjeta elegida pierde 2 px de caja interior y sus
precios se descuadran **1,74 px** respecto a los de sus dos vecinas, que es justo la clase de
defecto que llevamos toda la semana quitando.

La salida es un **aro interior** (`box-shadow: inset`) en vez de un borde mas gordo. No participa
en la maquetacion, asi que las tres tarjetas conservan su borde de 1 px y su geometria identica, y
ademas el aro no se trunca como el borde. El borde de 1 px cambia de color y el aro anade 2 px por
dentro: **3 px continuos** contra el 1 px de las no elegidas. Se aplico igual a la tesela de motivo
de escritorio. Y de paso mejora lo que ya habia: el desalineamiento del precio pasa de **0,87 px a
0,00**, y en movil las tres tarjetas pasan a medir lo mismo (antes la elegida era 1,74 px mas alta
por su borde de 2 px).

*Las terapias en movil.* Aqui no podia ser un `border` de verdad, y no por gusto: las cuatro
terapias en movil son **filas dentro de una sola caja**, no cuatro cajas. Un borde real le comeria
2,5 px de ancho y de alto a la fila elegida, asi que su foto y su nombre quedarian desplazados
respecto a los de sus tres vecinas, y ademas se doblaria con el borde de la lista en los costados.
El mismo aro interior lo resuelve: 3 px, y la caja lo recorta en las esquinas redondeadas igual que
recorta todo lo demas. Verificado: los cuatro anchos y las cuatro posiciones de foto y nombre son
identicos con la fila elegida puesta.

*Un canto que sobraba.* En movil la tarjeta de consulta elegida llevaba un canto de salvia de 3 px
a la izquierda. Existia porque el borde era de arcilla y hacia falta una senal de salvia; ahora en
oscuro el borde YA es salvia, asi que el canto solo conseguia que el costado izquierdo midiera
5,5 px de verde contra los 2,5 de los otros tres. Se apaga solo en oscuro; en claro se queda,
porque alli el aro es de arcilla y el canto sigue siendo la senal de accion.

Verificado en los cuatro cruces (claro/oscuro x 390/1280): aro de 2 px en tarjetas y teselas y de
3 px en las filas de la lista, en `--linea-f` —arcilla en claro, salvia en oscuro— sin escribir el
color dos veces; desalineamiento de precios y cifras **0,00** en todos; alturas y anchos identicos
entre hermanas; cero desbordes. Copia previa: `maqueta-vista1-salvia.ANTES-GROSOR.html`.

**Pedido por Edgar · la esquina comida y el canto verde. Hecho.** Sobre una captura de la fila
"Acompanar un duelo" elegida, senalo dos cosas: que la esquina no tenia el mismo grosor y se veia
"comida" —en los dos temas—, y que habia que quitar el canto verde porque no combinaba con la
seleccion.

*La esquina.* `.lista` tiene 16 px de radio y `overflow:hidden`, pero las filas no tenian radio
ninguno: el aro de la primera y de la ultima era un rectangulo recto y la curva de la caja le
RECORTABA las esquinas. Ahora las dos filas de los extremos llevan su propia curva, y va **menos
el pixel del borde de la caja** —16 fuera, 15 dentro—, que es como se anida una esquina dentro de
otra para que las dos curvas queden paralelas.

**Al ponerlo se rompio escritorio, y valio la pena comprobarlo:** `.fila:first-child` pesa mas que
el `.fila` del bloque de escritorio, y **la especificidad gana a la media query**, asi que las
teselas de los extremos se quedaban con media curva (`15px 15px 0 0`) en vez de sus cuatro
esquinas. Los dos radios se movieron dentro del `@media(max-width:759.98px)`, que es el unico sitio
donde hay caja que recorte. Es el mismo tropiezo que ya tenia anotado la regla del `border-top`
unas lineas mas abajo.

*El canto.* Se va, y no solo de la lista: tambien de las tarjetas de consulta en movil, y en los
dos temas. Tenia sentido cuando la seleccion no traia linea propia —el relleno calido decia
"elegido" y el canto lo volvia inequivoco—, pero ahora la seleccion SI trae linea, el aro de 3 px,
y el canto solo conseguia que el lado izquierdo se viese distinto de los otros tres porque se le
superponia. Con el se van tambien la media consulta que lo apagaba en escritorio y la que lo
apagaba en oscuro: **la seleccion se dice ahora de UNA manera en toda la pantalla, un aro.** Y el
`border-radius:0` que forzaba el foco tambien sale, porque ahora las filas de los extremos tienen
curva propia y el anillo la sigue solo.

Verificado en los cuatro cruces. Movil: caja a 16 px, primera fila `15px 15px 0 0`, ultima
`0 0 15px 15px`, las dos de en medio a 0; aro de 3 px en `--linea-f` —salvia en oscuro, arcilla en
claro—; `::before` en `none` en filas y tarjetas; los cuatro anchos y las cuatro posiciones de foto
identicos. Escritorio: las cuatro teselas a **16 px en las cuatro esquinas**, aro de 2 px en la
elegida, alturas identicas y desalineamiento de precios **0,00**. Cero desbordes en todos. Copia
previa: `maqueta-vista1-salvia.ANTES-ESQUINAS.html`.

**Decision de Edgar · la linea de lo elegido pasa a salvia TAMBIEN en claro.** Lo pregunto el, y
la respuesta es que si, y no solo por coherencia visual: corrige en claro el mismo defecto que se
habia corregido en oscuro.

Tres motivos, y el primero es que **lo dice el propio archivo**: sus comentarios reparten los dos
colores en "ARCILLA · dibuja: lineas, aros en reposo, precio" y "SALVIA · decide: boton, aro
elegido, barra, foco". Que la tarjeta elegida se marcara en arcilla contradecia la regla que el
diseno se habia puesto. Segundo: el aro del control de modalidad (`.seg-ind`) **ya era salvia en
claro**, asi que "elegido" se decia en salvia en la modalidad y en arcilla en los motivos y en las
consultas — la misma incoherencia que se quito en oscuro. Y tercero, el de fondo: la arcilla es el
color con el que esta dibujada toda la estructura, asi que con ella la elegida se distinguia de sus
vecinas **solo por el grosor de la linea**.

Y sube el contraste: **5,36:1 contra la pagina** frente a los 3,49 de la arcilla, y **4,39:1 contra
su propio relleno** frente a 2,86.

*El efecto secundario bueno:* `--linea-f` pasa a definirse **una sola vez**, como `var(--acc)` en el
bloque claro. Como `--acc` ya cambia de valor en el bloque oscuro, la linea de lo elegido sigue a
la salvia del tema sola, y la redefinicion que habia en oscuro desaparece. Un token, una
definicion, los dos temas.

Verificado en los dos. Claro: aro del segmentado, aro del motivo elegido, borde y aro de la tarjeta
elegida y su divisoria interna, los cinco en **`#5A7060`**; las no elegidas siguen en arcilla
`#A8825F`. Oscuro: los mismos cinco en **`#8AA891`**, no elegidas en `#9C7A56`, e identico a como
estaba antes del cambio. Cero desbordes. Copia previa:
`maqueta-vista1-salvia.ANTES-SALVIACLARO.html`.

### Pendiente, por orden acordado

0. **Auditoría 2.** Queda **solo el 03**, que es la decisión de color de Edgar. Todo en
   `auditoria-vista1-b.html`.


1. **09 · La otra mitad, aplazada por la propia auditoría.** No hay **modo oscuro**, y esto es
   un formulario de salud que se abre de noche desde la cama; se hace definiendo los tokens en
   un bloque aparte, no regla por regla, cuando el diseño en claro esté cerrado. Y no hay
   **estados de carga ni de error**: la vista 1 no envía nada, así que hoy no se nota, pero al
   portarla a `reservar/` los va a necesitar.

### Decisión abierta para Edgar

**10 · La salvia no existe en la landing.** La paleta de `style.css` es terracota
`#A67B5B`, pizarra `#2C3E50` y cremas, sin ningún verde, y la reserva usa salvia
`#5A7060` como color de acción. Recomendación: devolver el papel de "decide" a la pizarra
suave `#55697A` y dejar la arcilla dibujando las líneas. La alternativa es subir la salvia
a la landing, pero hay que hacerlo entero. No se toca sin que Edgar lo decida, porque
afecta a las dos páginas.

## Para retomar manana · 4 de septiembre

**Lo acordado con Edgar al cerrar el 3 de septiembre:**

1. **Montar con codigo de verdad.** Se acabo la maqueta de un solo archivo: toca portar la vista 1
   a `reservar/`, que sigue con la version del 26 de agosto en sus cuatro archivos (`index.html`,
   `reservar.css`, `reservar.js`, `supabase.js`). Los estados de **carga** y de **error** se
   construyen aqui, no antes: la maqueta no envia nada, asi que hoy no se notan, pero la vista real
   los necesita.
2. **Hacer los pasos 2, 3 y 4.**
3. **El paso 4 queda confirmado respecto al paso 1**, es decir, hereda de la vista 1 lo que ya esta
   decidido: la escala tipografica de seis tokens, los radios, los iconos en sprite, la paleta con
   su modo oscuro y la senal unica de "elegido" (un aro de salvia).
4. **NO TOCAR LA LANDING todavia.** Es explicito. `index.html` de la raiz ya tiene un cambio hecho
   y **sin commitear** —los cuatro motivos en minuscula, en los `<h3>` y en los datos
   estructurados, rama `rediseno-editorial`, copia previa en `index.ANTES-MINUSCULAS.html`—; ese se
   queda como esta hasta que Edgar diga.

**Lo que sigue pendiente y NO se toca sin el:**

- **El color** (hallazgo 03 de la auditoria 2). Salvia frente a pizarra. Pesa mas que antes: la
  salvia ha quedado como el color de decidir en los DOS temas y en toda la vista, asi que cambiarla
  sigue siendo un token pero alcanza a mas sitios. Afecta tambien a la landing, que es justo lo que
  no se toca.
- **Confirmar con Daryeli** si "Centro Humanista Intellego" es el nombre real del consultorio y si
  hay un punto de referencia para una tercera linea de la direccion.

**Como levantar el entorno:**

```
cd "C:/Users/EDGAR/Desktop/Claude Cowork/WEB-DARYE1"
python -m http.server 8123
```

- Visor movil 390 + escritorio: `http://127.0.0.1:8123/ver-vista1.html`
- Auditoria vigente (2 de septiembre): `auditoria-vista1-b.html`

Si un cambio no aparece, el navegador lo tiene cacheado: los iframes del visor llevan `?v=` con un
numero, subirlo. El **modo oscuro** sale del sistema: en Windows, Configuracion > Personalizacion >
Colores > Modo oscuro, y la pagina cambia en vivo sin recargar.

**Estado al cerrar:** servidor parado, andamiaje de medicion borrado, 22 copias previas
`maqueta-vista1-salvia.ANTES-*.html` en la carpeta.

## Nada está commiteado

La maqueta, las auditorías y estos archivos siguen sin seguimiento. Y hay **un cambio real sin
commitear en `index.html`**, la landing: los cuatro motivos pasaron a minúscula (hallazgo 04 de
la primera auditoría), tanto en los `<h3>` como en los datos estructurados. Copia previa en
`index.ANTES-MINUSCULAS.html`. Rama `rediseno-editorial`.

## 4 de septiembre · El porte a `reservar/` — fase 1: la capa de tokens

**Lo primero que hay que saber:** `reservar/` NO estaba vacio ni a medias. Es el asistente
completo de cuatro pasos, funcionando contra Supabase —los cuatro motivos y los tres paquetes
salen de la base de datos, no estan escritos a mano— y con los pasos 2, 3 y 4 ya disenados y
comentados. Lo que tenian era las decisiones del 26 de agosto. Asi que "hacer los pasos 2, 3 y 4"
no es construirlos: es pasarlos por el lenguaje visual nuevo.

**Por que se puede repintar todo desde el `:root`:** `style.css`, el de la landing, no tiene ni un
solo color literal fuera de sus variables. Se comprobo. Eso significa que redefinir sus tokens
dentro de `reservar.css` repinta la pagina de reserva entera, botones heredados incluidos, SIN
TOCAR LA LANDING.

**Lo que se monto:**

- La paleta de la maqueta —salvia y arcilla— sustituye al verde bosque `#2F6B4F` que tenia esta
  pagina desde agosto, con el reparto intacto: la arcilla dibuja, la salvia decide.
- El modo oscuro completo, que esta pagina no tenia.
- La escala de seis peldanos. Los cuatro nombres de `style.css` (`--text-xs`, `--text-sm`,
  `--text-base`, `--text-lg`) pasan a apuntar a los seis tokens, con lo que 54 declaraciones
  entraron en la escala sin tocar una sola regla; ademas se convirtieron 26 tamanos sueltos.
- Fraunces vuelve a la pagina de reserva y se carga en el `<head>`, que solo pedia Inter.

**Tres colisiones de nombres que hubo que resolver, y son la parte delicada:**

1. **`--linea` significaba cosas distintas en cada archivo.** En la maqueta es el contorno de un
   control, en arcilla entera; en la pagina real era un gris `#E4E8E6` que hacia de divisoria. Se
   separaron: 20 llamadas pasaron a `--linea-int` (divisorias y cajas tenues) y las 4 que si son
   contorno de control se quedaron. **De paso arregla un fallo de accesibilidad real:** las
   tarjetas y los modos son `<button>`, la WCAG pide 3:1 para el contorno de un control, y ese gris
   daba 1,2:1 contra el blanco. Ahora dan 3,49:1.
2. **`--linea-fuerte`** se repartio entre contorno de control (la mayoria) y hover o foco, que
   ahora es salvia.
3. **`--white` era la trampa gorda.** Se usaba en 27 sitios para dos cosas incompatibles: "la
   pagina", "la superficie de una tarjeta" y "la tinta que va ENCIMA de la salvia". En claro las
   tres coinciden y no se nota; en oscuro la primera version dejo el `body` pintado del color de la
   tarjeta, o sea la escalera de superficies aplanada. Se repartieron uno a uno: 4 a `--suelo`, 15 a
   `--sup`, 6 a `--acc-txt`, 1 a `--circ-eleg` y 1 a un `--mal-txt` nuevo.

**Y una regla de agosto que habia que borrar:** `.wz-body h1,h2,h3{font-weight:700}` existia para
COMPENSAR QUE LOS TITULARES ERAN INTER —una sans a 600 se queda blanda sosteniendo un titular—.
Con Fraunces de vuelta la compensacion sobra, y ademas estorbaba: al ser mas especifica que
`.wz-grupo-titulo` le ganaba y dejaba los titulos de grupo en 700.

**Verificado midiendo el DOM, no por captura.** Cada numero cae sobre el de la maqueta:

| | maqueta | pagina real |
|---|---|---|
| Borde en reposo, claro | 3,49:1 | 3,49:1 |
| Aro elegido sobre su relleno, claro | 4,39:1 | 4,39:1 |
| Escalon a la elegida, claro | DL* 7,9 | 7,9 |
| Pagina -> tarjeta, oscuro | DL* 7,0 | 7,0 |
| Tarjeta -> elegida, oscuro | DL* 9,8 | 9,8 |
| Borde en reposo, oscuro | 4,00:1 | 4,00:1 |
| Texto y texto suave, oscuro | 15,12 / 8,09 | 15,12 / 8,09 |

Toda la pagina se pinta con seis tamanos. El unico valor fuera es el "Bs" que acompana al importe,
a `.92em` de su cifra: es relativo a proposito, para que la unidad crezca con el numero.

**Nota para medir con Playwright en esta maquina:** el `devicePixelRatio` es 0,75, asi que
`setViewportSize` hay que pedirlo a 0,75x del ancho CSS que se quiere (960 para 1280, 292 para 390).
Sin eso se mide un ancho que no es y se leen fallos que no existen.

**Copias previas:** `index.ANTES-PORTE.html`, `reservar.ANTES-PORTE.css`, `reservar.ANTES-PORTE.js`,
`supabase.ANTES-PORTE.js`.

**Lo que queda de este porte:** el maquetado del paso 1 (filas de motivos en vez del `<select>`,
bloque que se abre, barra fija del movil, el aro de salvia, el disco con la cifra), los estados de
carga y error, los pasos 2-3-4 por el mismo filtro, y el paso 4 confirmado contra el paso 1. Los
nombres puente (`--primary-deep`, `--papel`, `--linea-fuerte`...) siguen en uso a proposito: se van
cambiando al nombre nuevo segun se toca cada regla.

## 4 de septiembre · El porte a `reservar/` — fase 2: el maquetado de la vista 1

Ya no es solo la pintura: la vista 1 de la pagina real ES la de la maqueta. Marcado, CSS y
JavaScript.

**Lo que cambia de forma:** los motivos dejan de ser un `<select>` y vuelven a ser filas con foto
—lista de 56 px en movil, tres columnas en escritorio—; vuelve el control deslizante de
Online/Presencial con su aro; la caja del consultorio se abre y se cierra con animacion; las
consultas salen en tarjetas con el disco de la cifra y el badge de ahorro; y aparece la barra fija
del movil con el boton anclado abajo. Los iconos van en un sprite `<symbol>`, asi que el mismo
dibujo existe una vez y lo usan el marcado y el JavaScript.

**Cuatro cambios al copiar el CSS, y solo cuatro,** todos de encaje y todos anotados en el archivo:
`var(--medida)` pasa a `var(--wz-ancho)` —ese nombre significaba el ancho de la PAGINA en la
maqueta y el de un CAMPO aqui, y confundirlos habria dejado la pagina de 512 px—; `main`, `h1` y
`.intro` se enganchan a `.wz-main`, `.wz-vista h1` y `.wz-intro`; se cae el cartel de "esto es una
maqueta"; y nada mas. Los nombres de clase se quedan como los escribio la maqueta (`.card`,
`.fila`, `.segs`, `.lugar`, `.planes`) porque se comprobo que no chocan con `style.css`: el unico
nombre comun es `.btn`, y ahi el choque es el que se quiere.

**La diferencia deliberada con la maqueta:** alli los cuatro motivos y los tres precios estaban
escritos a mano; aqui salen de Supabase. Se ven igual, cambia de donde vienen los datos. La
sugerida es el primer paquete, que es el escalon donde aparece el ahorro, igual que senalaba la
maqueta.

**Verificado comparando las dos paginas lado a lado, a la misma anchura y con el mismo estado:**

- Escritorio a 1280: **20 de 21 medidas identicas al pixel**
- Movil a 390: **12 de 12**
- Colores en modo oscuro: **17 de 17**
- Los pasos 2, 3 y 4 siguen funcionando: cinco dias, doce huecos, la barra en 2, cero errores

**LA UNICA DIFERENCIA QUE QUEDA, Y ES A PROPOSITO.** La caja del consultorio mide 186 px en la
maqueta y 170 aqui. Los 16 px son el margen superior por defecto que el navegador le pone a un
`<p>` y que el CSS de la maqueta nunca reseteo: no lo puso el diseno. El efecto es que alli la
caja queda descentrada —46 px de aire arriba contra los 28,8 de abajo, cuando su propia regla pide
28,8 en los cuatro lados—. Aqui sale simetrica. Si Edgar prefiere lo que vio, es una linea.

**Tres cosas que solo aparecieron al comparar,** y que eran divergencias reales:

1. **El interlineado del cuerpo.** La maqueta va a 1,5 y esta pagina heredaba el 1,7 de la landing.
   Alli el 1,7 es correcto —son parrafos que se leen seguidos—, pero aqui casi todo es de una
   linea: un nombre, un precio, una hora. Anadia 3,2 px a cada pieza.
2. **Los `h2`.** `style.css` los pone a `line-height:1.12`, que es lo que pide un titular de dos
   lineas, y el titulo de grupo es de una sola: medía 19 px en vez de 25.
3. **Las cifras tabulares.** Estaban en el `body` desde agosto, puestas para que las columnas de
   horas del paso 2 alinearan. Eso sigue siendo cierto, pero aplicadas a toda la pagina ensanchan
   cada digito: el badge de "Ahorras 15 $" medía 4 px mas que en la maqueta. Ahora van solo donde
   hay una COLUMNA de numeros que comparar.

**PARA EDGAR, una decision suya:** la base de datos devuelve los motivos en mayuscula inicial
—"Superar la Ansiedad"— y la maqueta los escribe en minuscula —"Superar la ansiedad"—, que es la
misma decision que el ya tomo en la landing (hallazgo 04 de la primera auditoria, cambio hecho y
sin commitear). No se toca por cuenta propia: el sitio donde arreglarlo es la base de datos, no una
transformacion en el JavaScript que oculte que el dato viene mal.

**Lo que falta:** los estados de carga y error, los pasos 2, 3 y 4 por el mismo filtro, y el paso 4
confirmado contra el paso 1.

## 4 de septiembre · Auditoria del PASO 2, y las tres direcciones que Edgar descarto

**VEREDICTO DE EDGAR, literal:** *"no se esa vista no me convence y ese calendario tampoco"*. Es
decir: no le convence ni el paso 2 tal y como esta, ni la direccion de rejilla-calendario en
ninguna de las tres variantes que se le enseñaron. **No se sabe todavia POR QUE**, y eso es lo
primero que hay que preguntarle al retomar: si le falla el aspecto, la densidad, la idea de ver
varios dias a la vez, o el patron entero de "elige un hueco en una rejilla".

Ojo con una cosa al retomar: en agosto ya rechazo el patron de asistente de formulario y la
correccion fue ir al patron de agenda (Calendly, Doctoralia). Ahora rechaza tambien la rejilla de
agenda. Conviene averiguar cual es la referencia que SI tiene en la cabeza antes de dibujar una
cuarta propuesta, en vez de producir una mas a ciegas.

### Un fallo corregido por el camino, y era del porte del paso 1

En movil, los pasos 2, 3 y 4 arrastraban **la barra fija del paso 1**: un boton muerto de "Ver
horarios" anclado abajo, tapando 79 px del ultimo renglon. Se acoto con `data-paso` en el `<body>`
—que arranca en "1" desde el marcado, porque en la primera carga nadie ha llamado aun a
`mostrar()`— y el CSS solo la enseña cuando vale 1. Verificado en los cinco pasos y en escritorio.

### La auditoria, con las medidas

Lo que esta BIEN y no conviene romper: el patron de dia+hora a la vez es el correcto, el contraste
cumple en todo lo medido, los objetivos tactiles son de 50 px y la escala tipografica esta en los
seis peldaños.

Grave:

1. **El 67 % de la disponibilidad esta escondida.** `HORAS_VISIBLES = 4` en `reservar.js`: cada dia
   enseña 4 horas y esconde el resto tras "+N mas". Los dias reales tienen 12.
2. **"+N mas" lleva el color de "elegido"**: su fondo es `--sup-eleg`, el relleno que significa
   "esta es tu tarjeta" en el paso 1.
3. **Las columnas quedan dentadas y una sale vacia.** Medido: 2, 4, 4, 0, 4. El domingo es una
   pildora gris flotando arriba con 285 px de vacio debajo.
4. **La hora esta escrita en el tamaño de lo accesorio**: 14,08 px (`--t-aux`) frente a los 16,8 del
   numero del dia. La decision principal de la pantalla es el texto mas pequeño que hay.

Serio:

5. Catorce cajas identicas de 86x50, sin agrupacion por franja del dia: no hay jerarquia ninguna.
6. **Cuatro radios**: 8 px huecos y flechas, 10 px botones, 16 px resumen, 999 px la pastilla del
   paso 1. El 8 y el 16 SI son del sistema (`--r-sm` y `--r`); el intruso es el 10.
7. **"Atras" es invisible**: `border-color: rgba(0,0,0,0)` y fondo transparente, solo texto. Y mide
   211 px contra los **481 de "Continuar"**, que es un elemento estirado solo porque sobra ancho.
8. Dos formas de boton en el mismo flujo: pastilla con disco en el paso 1, rectangulo de 10 px aqui.
9. Jerarquia invertida: el rango de fechas es un `<h2>` a 14,08 px y el numero del dia, dentro, a 16,8.

Menor: un guion medio en el rango de fechas y un `&mdash;` en el aviso del temporizador; el resumen
repite el paso 1 entero y es la mancha de color mas grande de la pantalla; y los huecos transicionan
a 140 ms cuando todo lo demas va a `--paso` (200 ms).

### Las tres direcciones · `comparativa-paso2.html`

**SE CONSERVA EL ARCHIVO** aunque no se eligiera ninguna, porque es el registro renderizado de lo
que ya se descarto y evita volver a proponerlo. Carga `style.css` y `reservar.css` de verdad, usa
la disponibilidad real de Supabase del 4 de septiembre (30 huecos: jueves 2, viernes 12, sabado 4,
domingo 0, lunes 12) y los paneles estan topados a 760 px, el ancho real del contenido.

- **A · Columnas completas.** La rejilla de ahora enseñando las 30 horas, cabeceras quietas y
  bloque desplazable, el domingo apagado entero. La mas compacta: **426 px de alto**.
- **B · Franjas del dia.** Filas de mañana, tarde y noche. Retícula regular por construccion. Se
  descarto sola al medirla: **936 px de alto**, mas del doble que la A, porque una tarde con seis
  huecos los apila en vertical.
- **C · Un dia a la vez.** Riel de dias con cuantas horas tiene cada uno escrito en palabras, y
  debajo ese dia agrupado por franja. Era la recomendacion final. **503 px.**

### Sobre las skills

Edgar pidio expresamente `frontend-design` y la de *taste*. Conviene saber que **la skill de taste
declara fuera de alcance los asistentes de varios pasos y la UI densa de producto**: de ella solo
aplica lo transversal —consistencia de forma y de color, estados, contraste, la prohibicion de
guiones largos—, no sus reglas de landing. Y `ui-ux-pro-max` propone para "Booking App" azul
confianza y verde disponible, que choca con la marca; lo aprovechable es el principio de que
disponible, ocupado y elegido tienen que ser estados distinguibles.
