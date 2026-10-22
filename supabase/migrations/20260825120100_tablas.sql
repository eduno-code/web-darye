-- ============================================================
-- 0002 — Tablas
--
-- Regla que atraviesa todo el esquema: aquí NO se guarda nada clínico.
-- Nombre, correo, teléfono y tipo de sesión. No hay campo de "motivo de
-- consulta" ni notas del cliente, porque esa caja de texto convertiría la
-- base de datos en un historial clínico y dispararía el listón legal.
-- Lo único parecido es internal_notes en appointments, que escribe Daryeli
-- y nunca sale del panel.
--
-- Las horas se guardan siempre en UTC (timestamptz). La zona de presentación
-- es America/Caracas y vive en settings, no incrustada en el esquema.
-- ============================================================


-- ---------- CATÁLOGOS ----------

-- Los cuatro servicios de la landing. El precio vive aquí y NO viaja en el
-- formulario: create_booking lo lee de esta tabla, así que manipularlo desde
-- el navegador no cambia lo que se cobra.
create table public.services (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  modality     public.session_modality not null default 'individual',
  duration_min int  not null check (duration_min between 15 and 240),
  price_usd    numeric(10,2) not null check (price_usd >= 0),
  active       boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);


-- ---------- PAQUETES ----------

-- Catálogo de bonos. Un paquete no es un precio más: es un pago único que
-- cubre varias citas, así que necesita su propia tabla y su propio saldo.
-- Se compran por modalidad — un bono individual no sirve para terapia de
-- pareja, que dura más y cuesta más.
create table public.packages (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  name           text not null,
  modality       public.session_modality not null,
  sessions_count int not null check (sessions_count between 2 and 20),
  price_usd      numeric(10,2) not null check (price_usd >= 0),

  -- Días de validez desde que se verifica el pago. Editable en el panel.
  valid_days     int not null default 60 check (valid_days > 0),

  active         boolean not null default true,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- El bono que compra una persona (client_packages) se declara más abajo,
-- después de la tabla clients a la que apunta: Postgres exige que la tabla
-- referenciada exista antes de crear la clave foránea.

-- Catálogo de bancos para el desplegable del pago móvil. En tabla y no en el
-- código para poder añadir o retirar un banco sin desplegar la web.
create table public.banks (
  code       text primary key,          -- código de 4 dígitos: 0102, 0105...
  name       text not null,
  active     boolean not null default true,
  sort_order int not null default 0
);


-- ---------- AGENDA ----------

-- Disponibilidad semanal recurrente: "los martes de 9 a 13".
create table public.availability_rules (
  id         uuid primary key default gen_random_uuid(),
  weekday    smallint not null check (weekday between 0 and 6),  -- 0 = domingo
  start_time time not null,
  end_time   time not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  constraint availability_rules_orden check (end_time > start_time)
);

-- Lo que se sale de la rutina: vacaciones, un día suelto libre, o una franja
-- extra abierta fuera del horario habitual.
-- Con start_time y end_time nulos, la excepción cubre el día entero.
create table public.availability_exceptions (
  id         uuid primary key default gen_random_uuid(),
  on_date    date not null,
  start_time time,
  end_time   time,
  kind       public.availability_kind not null default 'block',
  reason     text,
  created_at timestamptz not null default now(),
  constraint availability_exceptions_orden
    check (start_time is null or end_time is null or end_time > start_time)
);
create index availability_exceptions_fecha_idx
  on public.availability_exceptions (on_date);


-- ---------- PERSONAS ----------

-- auth_user_id queda vacía a propósito. Hoy se reserva como invitado y no
-- existen contraseñas que filtrar; esta columna es lo que permitirá enchufar
-- cuentas de cliente más adelante sin migrar una sola fila.
create table public.clients (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null check (length(btrim(full_name)) between 2 and 120),
  email        text not null,
  phone        text not null check (length(btrim(phone)) between 7 and 20),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Una persona = un correo. Normalizado, para que "Ana@X.com" y "ana@x.com "
-- no creen dos fichas y Daryeli vea el historial completo.
create unique index clients_email_key
  on public.clients (lower(btrim(email)));


-- ---------- BONOS COMPRADOS ----------

-- El bono concreto que compró una persona, con su saldo.
-- Todo se congela en el momento de la compra (modalidad, número de sesiones,
-- precio): que Daryeli reorganice el catálogo mañana no puede alterar lo que
-- alguien ya pagó.
create table public.client_packages (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients(id)  on delete restrict,
  package_id     uuid not null references public.packages(id) on delete restrict,
  modality       public.session_modality not null,
  sessions_total int not null check (sessions_total > 0),
  sessions_used  int not null default 0 check (sessions_used >= 0),
  price_usd      numeric(10,2) not null,
  status         public.package_status not null default 'pending_payment',

  -- Llave del cliente sin cuenta para agendar las sesiones que le quedan.
  manage_token   text not null unique default app.new_token(),

  -- El reloj de la caducidad arranca cuando Daryeli VERIFICA el pago, no
  -- cuando el cliente lo declara. Nadie pierde días esperando la validación.
  expires_at     timestamptz,

  purchased_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- La barrera contra gastar más sesiones de las compradas. La impone la base
  -- de datos: aunque dos reservas simultáneas intentaran consumir el último
  -- crédito, la segunda no pasa de aquí.
  constraint client_packages_saldo check (sessions_used <= sessions_total)
);

create index client_packages_cliente_idx on public.client_packages (client_id);
create index client_packages_caducidad_idx
  on public.client_packages (expires_at) where status = 'active';


-- ---------- CITAS ----------

create table public.appointments (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients(id)  on delete restrict,
  service_id      uuid not null references public.services(id) on delete restrict,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  status          public.appointment_status not null default 'pending_payment',

  -- Copia del precio en el momento de reservar. Que Daryeli suba la tarifa
  -- mañana no debe reescribir lo que costó una sesión de hace tres meses.
  price_usd       numeric(10,2) not null check (price_usd >= 0),

  -- Si viene de un bono, la cita consume un crédito y no lleva pago propio.
  -- Nulo = sesión suelta, que sí exige su comprobante.
  client_package_id uuid references public.client_packages(id) on delete restrict,

  -- Llave del cliente sin cuenta para consultar o cancelar SU cita.
  manage_token    text not null unique default app.new_token(),

  -- Hasta cuándo se le guarda el cupo mientras paga. Vencido, expire-holds
  -- lo libera solo.
  hold_expires_at timestamptz,

  internal_notes  text,          -- privado de Daryeli, nunca sale del panel
  cancelled_at    timestamptz,
  cancel_reason   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint appointments_orden check (ends_at > starts_at)
);

-- ANTI DOBLE RESERVA.
-- Lo impone Postgres, no el JavaScript: dos personas pulsando el mismo minuto
-- a la vez no pueden colisionar, porque la segunda transacción es rechazada
-- por la base de datos. Solo estorban las citas vivas — una cancelada o
-- rechazada libera el hueco de inmediato.
alter table public.appointments
  add constraint appointments_sin_solape
  exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
  where (status in ('pending_payment', 'confirmed'));

create index appointments_inicio_idx on public.appointments (starts_at);
create index appointments_cliente_idx on public.appointments (client_id);
-- Índice del cron que libera retenciones vencidas.
create index appointments_retencion_idx
  on public.appointments (hold_expires_at)
  where status = 'pending_payment';


-- ---------- PAGOS ----------

-- Se guarda lo mínimo del pago móvil: banco, referencia, fecha y monto.
-- NO se guarda la cédula ni el teléfono del emisor. Aparecen en la captura,
-- que es justo el archivo que se borra solo a los seis meses.
-- Un pago cubre O una sesión suelta O un paquete completo, nunca las dos
-- cosas. Por eso las dos referencias son opcionales y una restricción obliga
-- a que venga exactamente una: sin ella cabría un pago huérfano, que en la
-- práctica es dinero que entró y que el panel nunca mostraría.
create table public.payments (
  id                uuid primary key default gen_random_uuid(),
  appointment_id    uuid references public.appointments(id)     on delete cascade,
  client_package_id uuid references public.client_packages(id)  on delete cascade,
  bank_code        text not null references public.banks(code),
  reference_number text not null
                   check (length(btrim(reference_number)) between 4 and 30),
  paid_on          date not null,
  amount_bs        numeric(14,2) not null check (amount_bs > 0),

  -- Tasa del día. Es lo que hace comparables los totales de mes contra mes
  -- cuando el bolívar se mueve; sin esto el dashboard no significaría nada.
  exchange_rate    numeric(14,4) check (exchange_rate > 0),

  proof_path       text,         -- ruta dentro del bucket privado
  status           public.payment_status not null default 'declared',
  verified_at      timestamptz,
  verified_by      uuid references auth.users(id),
  reject_reason    text,
  created_at       timestamptz not null default now(),

  constraint payments_un_solo_destino check (
    (appointment_id is not null and client_package_id is null) or
    (appointment_id is null and client_package_id is not null)
  )
);

create index payments_cita_idx    on public.payments (appointment_id);
create index payments_paquete_idx on public.payments (client_package_id);
create index payments_estado_idx  on public.payments (status);

-- Una referencia bancaria no puede usarse dos veces en el mismo banco.
-- Cierra el fraude más obvio: pagar una sesión y declarar ese mismo
-- comprobante en varias reservas.
create unique index payments_referencia_key
  on public.payments (bank_code, btrim(reference_number));


-- ---------- LEGAL Y CONFIGURACIÓN ----------

-- La prueba de que la persona aceptó, y qué texto exacto aceptó. Guardar la
-- versión importa: si mañana cambia el consentimiento, hay que poder demostrar
-- cuál estaba vigente el día de cada reserva.
-- La IP se guarda como hash, no en claro: sirve para acreditar el acto sin
-- convertirse en un dato personal más que proteger.
create table public.consents (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  version        text not null,
  accepted_at    timestamptz not null default now(),
  ip_hash        text
);

-- Clave/valor: datos de pago móvil de Daryeli, zona horaria, duración de la
-- retención, anticipación mínima y versión vigente del consentimiento.
create table public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Quién entra al panel. El rol deja la puerta abierta a sumar terapeutas o
-- una asistente sin rehacer el esquema.
create table public.admin_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  role       public.admin_role not null default 'assistant',
  created_at timestamptz not null default now()
);

-- Limitación de intentos por IP, para que nadie pueda sembrar la agenda de
-- reservas basura. La IP se almacena hasheada, igual que en consents.
create table public.booking_attempts (
  ip_hash      text not null,
  window_start timestamptz not null,
  count        int not null default 1,
  primary key (ip_hash, window_start)
);


-- ---------- DISPARADORES ----------

create trigger services_touch     before update on public.services
  for each row execute function app.touch_updated_at();
create trigger packages_touch     before update on public.packages
  for each row execute function app.touch_updated_at();
create trigger bonos_touch        before update on public.client_packages
  for each row execute function app.touch_updated_at();
create trigger clients_touch      before update on public.clients
  for each row execute function app.touch_updated_at();
create trigger appointments_touch before update on public.appointments
  for each row execute function app.touch_updated_at();
create trigger settings_touch     before update on public.settings
  for each row execute function app.touch_updated_at();
