-- ============================================================
-- 0006 — Funciones públicas: calendario y reserva
--
-- Estas funciones son LA ÚNICA PUERTA que tiene el público a los datos.
-- Ninguna tabla sensible está expuesta (ver 0003_rls.sql), así que todo lo
-- que el navegador puede hacer es llamar a lo que hay aquí.
--
-- Todas son SECURITY DEFINER: se ejecutan con los permisos del dueño y por
-- tanto ven las tablas. Eso las convierte en la frontera de seguridad, así
-- que cada una valida por su cuenta y devuelve lo mínimo. En particular,
-- get_available_slots devuelve HORAS Y NADA MÁS: nunca quién reservó.
--
-- Todas llevan "set search_path = ''" y nombres completos. Sin eso, alguien
-- que pudiera crear una tabla en otro esquema podría secuestrar la resolución
-- de nombres dentro de una función que corre con permisos elevados.
-- ============================================================


-- ---------- AJUSTES QUE FALTABAN ----------

insert into public.settings (key, value) values
  -- Rejilla del calendario. Con 60 minutos, las horas caen redondas (9:00,
  -- 10:00, 11:00...): la individual ocupa 50 y deja 10 de respiro, y la de
  -- pareja ocupa los 60 exactos.
  ('slot_step_minutes', '60'::jsonb),

  -- Sal para hashear las IP. Se genera aquí y no se comparte: sin ella, un
  -- hash de IP sería reversible probando los 4.000 millones de direcciones.
  ('ip_salt', to_jsonb(encode(extensions.gen_random_bytes(16), 'hex'))),

  -- Límite de reservas por IP y hora, contra el sembrado de citas basura.
  ('max_bookings_per_hour', '5'::jsonb)
on conflict (key) do nothing;


-- ---------- AYUDAS INTERNAS ----------

create or replace function app.setting(p_key text)
returns jsonb
language sql stable security definer set search_path = ''
as $$ select value from public.settings where key = p_key; $$;

-- La IP del visitante, tal como la ve el proxy de Supabase. No es de fiar
-- como identidad, solo como señal para limitar abuso.
create or replace function app.client_ip()
returns text
language sql stable set search_path = ''
as $$
  select nullif(split_part(
    coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''),
  ',', 1), '');
$$;

-- Se guarda el hash, nunca la IP. Sirve para contar intentos y para acreditar
-- el consentimiento, sin convertirse en un dato personal más que custodiar.
create or replace function app.ip_hash()
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when app.client_ip() is null then null
    else encode(extensions.digest(
           app.client_ip() || (app.setting('ip_salt') #>> '{}'), 'sha256'), 'hex')
  end;
$$;

-- Normaliza el correo para que "Ana@X.com " y "ana@x.com" sean la misma ficha.
create or replace function app.norm_email(p_email text)
returns text
language sql immutable set search_path = ''
as $$ select lower(btrim(p_email)); $$;

-- ¿Cuántas reservas lleva esta IP en la última hora? Devuelve true si se pasó.
create or replace function app.rate_limited()
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_ip    text := app.ip_hash();
  v_win   timestamptz := date_trunc('hour', now());
  v_max   int := (app.setting('max_bookings_per_hour'))::int;
  v_count int;
begin
  -- Sin IP no se puede limitar; se deja pasar y ya lo frena el captcha.
  if v_ip is null then return false; end if;

  insert into public.booking_attempts (ip_hash, window_start, count)
  values (v_ip, v_win, 1)
  on conflict (ip_hash, window_start)
    do update set count = public.booking_attempts.count + 1
  returning count into v_count;

  -- Limpieza oportunista de ventanas viejas.
  delete from public.booking_attempts where window_start < now() - interval '2 days';

  return v_count > v_max;
end;
$$;


-- ============================================================
-- EL CALENDARIO
-- ============================================================
--
-- Devuelve los instantes libres para un servicio, entre dos fechas.
-- Es la función más expuesta del sistema y la que más disciplina exige:
-- responde con una lista de horas y nada más. Ni un nombre, ni un correo,
-- ni cuántas citas hay. Si esto devolviera filas de appointments, cualquiera
-- podría reconstruir la agenda de una psicóloga con sus pacientes.
--
-- El horario de Daryeli está en hora de Caracas; aquí se convierte a UTC.
-- El navegador lo pasará luego a la zona de quien mire.
create or replace function public.get_available_slots(
  p_service_slug text,
  p_from date,
  p_to   date
)
returns setof timestamptz
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tz     text := app.setting('timezone') #>> '{}';
  v_dur    int;
  v_step   int  := (app.setting('slot_step_minutes'))::int;
  v_notice int  := (app.setting('min_notice_hours'))::int;
  v_window int  := (app.setting('booking_window_days'))::int;
  v_desde  date;
  v_hasta  date;
begin
  select s.duration_min into v_dur
    from public.services s
   where s.slug = p_service_slug and s.active;

  if v_dur is null then
    return;                       -- servicio inexistente: lista vacía
  end if;

  -- El rango pedido se recorta al permitido. Así nadie puede pedir la agenda
  -- de los próximos diez años ni ver huecos del pasado.
  v_desde := greatest(p_from, (now() at time zone v_tz)::date);
  v_hasta := least(p_to, ((now() + (v_window || ' days')::interval) at time zone v_tz)::date);

  if v_desde > v_hasta then
    return;
  end if;

  return query
  with dias as (
    select d::date as dia
    from generate_series(v_desde, v_hasta, interval '1 day') as g(d)
  ),
  -- Franjas de trabajo: el horario semanal, más las aperturas puntuales.
  franjas as (
    select dias.dia as dia, r.start_time as abre, r.end_time as cierra
      from dias
      join public.availability_rules r
        on r.active
       and r.weekday = extract(dow from dias.dia)::int
    union all
    select e.on_date,
           coalesce(e.start_time, time '00:00'),
           coalesce(e.end_time,   time '23:59')
      from public.availability_exceptions e
     where e.kind = 'open'
       and e.on_date between v_desde and v_hasta
  ),
  -- Se trocean en huecos del tamaño de la sesión.
  --
  -- generate_series no admite el tipo "time", así que la serie se recorre
  -- sobre timestamps sin zona (fecha + hora local de Caracas) y solo al final
  -- se convierte a timestamptz con "at time zone". Hacerlo al revés daría
  -- horas desplazadas.
  huecos as (
    select (h.local at time zone v_tz) as comienza,
           (h.local at time zone v_tz) + (v_dur || ' minutes')::interval as termina
      from franjas f
      cross join lateral generate_series(
        (f.dia + f.abre)::timestamp,
        (f.dia + f.cierra)::timestamp - (v_dur || ' minutes')::interval,
        (v_step || ' minutes')::interval
      ) as h(local)
  )
  select distinct hu.comienza
    from huecos hu
   where
     -- Antelación mínima: nadie coge un hueco para dentro de diez minutos.
     hu.comienza >= now() + (v_notice || ' hours')::interval
     -- Ni más allá de la ventana de reserva.
     and hu.comienza <= now() + (v_window || ' days')::interval
     -- Fuera lo bloqueado: vacaciones, días libres, franjas cerradas.
     and not exists (
       select 1
         from public.availability_exceptions e
        where e.kind = 'block'
          and e.on_date = (hu.comienza at time zone v_tz)::date
          and (
            e.start_time is null
            or (hu.comienza at time zone v_tz)::time < e.end_time
               and (hu.termina at time zone v_tz)::time > e.start_time
          )
     )
     -- Y fuera lo ya cogido. Solo estorban las citas vivas.
     and not exists (
       select 1
         from public.appointments a
        where a.status in ('pending_payment', 'confirmed')
          and tstzrange(a.starts_at, a.ends_at, '[)')
              && tstzrange(hu.comienza, hu.termina, '[)')
     )
   order by hu.comienza;
end;
$$;


-- ============================================================
-- CREAR UNA RESERVA
-- ============================================================
--
-- Reserva una sesión suelta y deja el cupo retenido mientras el cliente paga.
-- Devuelve el token de gestión y los datos de pago móvil.
--
-- Puntos donde esta función se planta:
--   · el precio SIEMPRE sale de la tabla services, nunca del parámetro;
--   · el horario se revalida contra get_available_slots, así que no vale
--     inventarse las 3 de la madrugada aunque se llame a la API a mano;
--   · el consentimiento es obligatorio y queda registrado con su versión;
--   · si dos personas van al mismo hueco, la restricción EXCLUDE resuelve
--     y aquí se traduce a un error legible.
create or replace function public.create_booking(
  p_service_slug    text,
  p_full_name       text,
  p_email           text,
  p_phone           text,
  p_starts_at       timestamptz,
  p_consent         boolean,
  p_client_package_token text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_serv      public.services%rowtype;
  v_cliente   uuid;
  v_cita      uuid;
  v_token     text;
  v_termina   timestamptz;
  v_hold      int := (app.setting('hold_minutes'))::int;
  v_version   text := app.setting('consent_version') #>> '{}';
  v_bono      public.client_packages%rowtype;
  v_precio    numeric(10,2);
  v_vence     timestamptz;
begin
  -- --- validaciones de entrada ---
  if p_consent is not true then
    return jsonb_build_object('ok', false, 'error', 'consent_required',
      'message', 'Hay que aceptar el consentimiento informado para reservar.');
  end if;

  if length(btrim(coalesce(p_full_name, ''))) < 2 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name',
      'message', 'Escribe tu nombre completo.');
  end if;

  if app.norm_email(coalesce(p_email, '')) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_email',
      'message', 'Ese correo no parece válido.');
  end if;

  if length(btrim(coalesce(p_phone, ''))) < 7 then
    return jsonb_build_object('ok', false, 'error', 'invalid_phone',
      'message', 'Escribe un teléfono de contacto.');
  end if;

  select * into v_serv from public.services where slug = p_service_slug and active;
  if v_serv.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_service',
      'message', 'Ese tipo de sesión no está disponible.');
  end if;

  -- --- límite de abuso ---
  if app.rate_limited() then
    return jsonb_build_object('ok', false, 'error', 'rate_limited',
      'message', 'Demasiadas reservas seguidas. Inténtalo dentro de un rato.');
  end if;

  -- --- el horario tiene que estar realmente libre y dentro de la agenda ---
  if not exists (
    select 1 from public.get_available_slots(
      p_service_slug,
      (p_starts_at at time zone (app.setting('timezone') #>> '{}'))::date,
      (p_starts_at at time zone (app.setting('timezone') #>> '{}'))::date
    ) as s(t) where s.t = p_starts_at
  ) then
    return jsonb_build_object('ok', false, 'error', 'slot_unavailable',
      'message', 'Ese horario ya no está disponible. Elige otro, por favor.');
  end if;

  v_termina := p_starts_at + (v_serv.duration_min || ' minutes')::interval;

  -- --- cliente: se reutiliza la ficha si ya existe ese correo ---
  insert into public.clients (full_name, email, phone)
  values (btrim(p_full_name), app.norm_email(p_email), btrim(p_phone))
  on conflict (lower(btrim(email))) do update
     set full_name = excluded.full_name,
         phone     = excluded.phone
  returning id into v_cliente;

  -- --- ¿viene con bono? ---
  if p_client_package_token is not null then
    select * into v_bono
      from public.client_packages
     where manage_token = p_client_package_token
       for update;

    if v_bono.id is null then
      return jsonb_build_object('ok', false, 'error', 'unknown_package',
        'message', 'No encontramos ese paquete.');
    end if;
    if v_bono.status <> 'active' then
      return jsonb_build_object('ok', false, 'error', 'package_not_active',
        'message', 'Ese paquete no está activo.');
    end if;
    if v_bono.expires_at is not null and v_bono.expires_at < now() then
      return jsonb_build_object('ok', false, 'error', 'package_expired',
        'message', 'Ese paquete ya caducó.');
    end if;
    if v_bono.sessions_used >= v_bono.sessions_total then
      return jsonb_build_object('ok', false, 'error', 'package_exhausted',
        'message', 'Ya usaste todas las sesiones de ese paquete.');
    end if;
    if v_bono.modality <> v_serv.modality then
      return jsonb_build_object('ok', false, 'error', 'package_modality',
        'message', 'Ese paquete no sirve para este tipo de sesión.');
    end if;

    -- La cita se apunta al DUEÑO del bono, no a quien rellenó el formulario.
    -- El token es la credencial del paquete; si se usa, manda su titular.
    -- Así nadie gasta créditos ajenos apuntándolos a otra ficha.
    v_cliente := v_bono.client_id;

    v_precio := round(v_bono.price_usd / v_bono.sessions_total, 2);
    v_vence  := null;                       -- ya está pagado: sin retención
  else
    v_precio := v_serv.price_usd;           -- el precio SIEMPRE de la tabla
    v_vence  := now() + (v_hold || ' minutes')::interval;
  end if;

  -- --- la cita ---
  begin
    insert into public.appointments (
      client_id, service_id, starts_at, ends_at, price_usd,
      client_package_id, status, hold_expires_at
    ) values (
      v_cliente, v_serv.id, p_starts_at, v_termina, v_precio,
      v_bono.id,
      -- El casteo es obligatorio: un CASE devuelve text y la columna es un
      -- tipo enumerado, que Postgres no convierte solo.
      (case when v_bono.id is null then 'pending_payment' else 'confirmed' end)::public.appointment_status,
      v_vence
    )
    returning id, manage_token into v_cita, v_token;
  exception when exclusion_violation then
    return jsonb_build_object('ok', false, 'error', 'slot_taken',
      'message', 'Alguien acaba de tomar ese horario. Elige otro, por favor.');
  end;

  -- --- consumo del crédito, si venía con bono ---
  if v_bono.id is not null then
    update public.client_packages
       set sessions_used = sessions_used + 1,
           status = (case when sessions_used + 1 >= sessions_total
                          then 'exhausted' else 'active' end)::public.package_status
     where id = v_bono.id;
  end if;

  -- --- la prueba del consentimiento ---
  insert into public.consents (appointment_id, version, ip_hash)
  values (v_cita, v_version, app.ip_hash());

  return jsonb_build_object(
    'ok', true,
    'manage_token', v_token,
    'appointment', jsonb_build_object(
      'id',        v_cita,
      'starts_at', p_starts_at,
      'ends_at',   v_termina,
      'service',   v_serv.name,
      'duration',  v_serv.duration_min,
      'price_usd', v_precio,
      'status',    case when v_bono.id is null then 'pending_payment' else 'confirmed' end
    ),
    'hold_expires_at', v_vence,
    'payment_info', case when v_bono.id is null
                         then app.setting('pago_movil') else null end
  );
end;
$$;


-- ---------- PERMISOS ----------
-- Postgres concede EXECUTE a PUBLIC por defecto al crear una función. Eso
-- incluiría a anon en TODO lo de arriba, ayudas internas incluidas. Se revoca
-- y se concede solo lo que debe ser público.
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema app    from public, anon, authenticated;

grant execute on function public.get_available_slots(text, date, date) to anon, authenticated;
grant execute on function public.create_booking(text, text, text, text, timestamptz, boolean, text) to anon, authenticated;
