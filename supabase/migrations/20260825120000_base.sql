-- ============================================================
-- 0001 — Cimientos: extensiones, esquema privado, tipos y ayudas
--
-- El proyecto se creó con "Automatically expose new tables" APAGADO,
-- así que ninguna tabla es accesible desde internet salvo que se le
-- conceda permiso a mano en 0003_rls.sql. Esa es la denegación por
-- defecto sobre la que se apoya todo lo demás.
-- ============================================================

-- btree_gist permite mezclar igualdad y rangos en una restricción EXCLUDE.
-- Hoy la exclusión solo usa el rango de tiempo, pero el día que haya más de
-- una terapeuta habrá que añadir "therapist_id with =" y ya estará disponible.
create extension if not exists btree_gist with schema extensions;
-- pgcrypto aporta gen_random_bytes, con lo que se generan los tokens de gestión.
create extension if not exists pgcrypto with schema extensions;


-- ---------- ESQUEMA PRIVADO ----------
-- La Data API solo publica el esquema "public". Todo lo que viva aquí es
-- invisible desde fuera pase lo que pase con los permisos de las tablas.
create schema if not exists app;
revoke all on schema app from anon, authenticated;


-- ---------- TIPOS ----------
-- Estados de una cita. El ciclo normal es:
--   pending_payment -> confirmed -> completed
-- y las salidas son no_show (no se presentó), cancelled (la cancelan)
-- y rejected (Daryeli rechazó el comprobante).
create type public.appointment_status as enum (
  'pending_payment',
  'confirmed',
  'completed',
  'no_show',
  'cancelled',
  'rejected'
);

-- Un pago nace "declared": el cliente dice haber pagado y adjunta la captura.
-- Solo Daryeli lo mueve a verified o rejected.
create type public.payment_status as enum ('declared', 'verified', 'rejected');

-- La tarifa depende de la modalidad, no del servicio: ansiedad, autoestima y
-- duelo valen lo mismo y duran 50 minutos; pareja va aparte, 60 minutos.
-- Los paquetes se compran por modalidad, así que necesitan este eje.
create type public.session_modality as enum ('individual', 'pareja');

-- Ciclo de un bono de sesiones:
--   pending_payment -> active -> exhausted (gastado) o expired (caducado)
-- rejected si el comprobante no cuadra, cancelled si se anula a mano.
create type public.package_status as enum (
  'pending_payment',
  'active',
  'exhausted',
  'expired',
  'cancelled',
  'rejected'
);

-- Una excepción de agenda o bloquea una franja o abre una fuera de horario.
create type public.availability_kind as enum ('block', 'open');

create type public.admin_role as enum ('owner', 'assistant');


-- ---------- AYUDAS ----------

-- Token aleatorio de 48 caracteres hexadecimales (24 bytes de entropía).
-- Es lo único que permite a un cliente sin cuenta volver a su reserva, así
-- que tiene que ser imposible de adivinar: 192 bits no se recorren a fuerza
-- bruta. Va en el enlace del correo de confirmación.
create or replace function app.new_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select encode(extensions.gen_random_bytes(24), 'hex');
$$;

-- app.is_admin() vive en 0003_rls.sql, no aquí: su cuerpo consulta
-- public.admin_profiles y Postgres valida las referencias al crear la función.
-- Declararla antes que las tablas aborta la migración entera.

-- Mantiene updated_at al día sin que haya que acordarse en cada UPDATE.
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
