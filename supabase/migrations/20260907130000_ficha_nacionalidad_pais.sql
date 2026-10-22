-- ============================================================
-- DE DÓNDE ES Y DÓNDE VIVE
--
-- La ficha del paciente guarda hoy nombre, correo y teléfono. El formulario de
-- registro pregunta además nacionalidad y país de residencia, y esos dos datos
-- no tienen dónde caer: se piden y se tiran.
--
-- No son un adorno del formulario. Son EXACTAMENTE las dos variables de las
-- que depende cuánto cobra Daryeli, según la tabla de 20260905120000_tarifas:
--
--                      En Venezuela   Fuera (no ES)   En España
--   Venezolano/a          30 $           35 $           35 €
--   Otra nacionalidad       —            40 $           40 €
--
-- La nacionalidad pone la cifra, el país pone la moneda. Sin estas dos
-- columnas no hay forma de saber qué tarifa aplicar, así que las tarifas están
-- bloqueadas hasta que existan.
--
-- POR QUÉ AHORA Y NO DESPUÉS: la tabla está vacía. Añadir columnas a una tabla
-- sin filas es instantáneo y no obliga a decidir qué hacer con lo que ya había.
-- La misma migración con cincuenta pacientes dentro exige rellenarles el dato
-- a mano o inventárselo, y son datos que solo ellos saben.
-- ============================================================


-- ---------- LAS DOS COLUMNAS ----------

-- CÓDIGO ISO DE DOS LETRAS Y NO EL NOMBRE DEL PAÍS. El formulario enseña
-- "México" y "España", que es lo que una persona entiende, pero lo que se
-- guarda es MX y ES. El nombre es un mal identificador: se escribe con tilde y
-- sin ella, en mayúsculas y en minúsculas, y "Reino Unido" cambia de forma
-- según quién lo teclee. La tarifa se decide comparando exacto, y comparar
-- exacto contra texto libre es la manera segura de cobrarle mal a alguien.
--
-- Dos letras mayúsculas, validado. ZZ es el código que la propia norma ISO
-- 3166 reserva para uso libre, y aquí es la opción "Otro país" del desplegable:
-- no es Venezuela y no es España, que es todo lo que la tarifa necesita saber.
alter table public.clients
  add column if not exists nationality char(2),
  add column if not exists country      char(2);

alter table public.clients
  drop constraint if exists clients_nationality_iso,
  add  constraint clients_nationality_iso check (nationality ~ '^[A-Z]{2}$');

alter table public.clients
  drop constraint if exists clients_country_iso,
  add  constraint clients_country_iso check (country ~ '^[A-Z]{2}$');

comment on column public.clients.nationality is
  'Nacionalidad en ISO 3166-1 alfa-2. Pone la CIFRA de la tarifa. ZZ = otra.';
comment on column public.clients.country is
  'País de residencia en ISO 3166-1 alfa-2. Pone la MONEDA de la tarifa. ZZ = otro.';


-- ---------- POR QUÉ ADMITEN NULO, DE MOMENTO ----------
--
-- Lo natural sería exigirlas: una ficha sin nacionalidad no sabe cuánto pagar.
-- Pero hoy create_booking todavía crea fichas con nombre, correo y teléfono y
-- nada más. Ponerlas NOT NULL en esta migración rompería la reserva en el acto
-- —cada intento fallaría al insertar—, y la reserva es lo único que funciona.
--
-- Se quedan nulas hasta el paso siguiente, el que hace que la identidad salga
-- de la sesión: allí la ficha nace del registro, que sí pregunta las dos cosas,
-- y entonces exigirlas es gratis. Ese es el sitio donde poner el NOT NULL, no
-- este.
--
-- Mientras tanto una ficha sin estos datos no es un error: es una ficha vieja.
-- Quien lea la tarifa tendrá que decidir qué hacer con el nulo, y es mejor que
-- lo decida a la vista que heredar un valor por defecto que nadie eligió.


-- ---------- PERMISOS: NINGUNO ----------
--
-- No hace falta conceder nada. `clients` no es legible ni escribible por anon
-- ni por authenticated —lo prohíbe el revoke en bloque de 20260825120200 y no
-- hay ninguna política que lo abra—, así que estas dos columnas nacen tan
-- cerradas como el resto de la tabla. Solo las tocan las funciones security
-- definer, que es como se toca todo lo del paciente en este proyecto.
