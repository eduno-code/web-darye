-- ============================================================
-- HORARIO DE NOCHE Y MODALIDAD POR FRANJA
--
-- Daryeli atiende de 9:00 a 18:00 en las dos modalidades, y ademas de 19:00 a
-- 22:00 de lunes a viernes SOLO ONLINE. Hasta ahora availability_rules no sabia
-- distinguir: una franja valia para todo el mundo, asi que no habia forma de
-- abrir la noche sin abrir tambien el consultorio.
--
-- Se anade una columna "mode": null = las dos modalidades, y un valor concreto
-- restringe la franja a esa. get_available_slots recibe la modalidad y filtra.
--
-- Importante: las tres funciones que crean citas revalidan el hueco contra
-- get_available_slots, asi que tienen que pasarle la modalidad tambien. Si no,
-- alguien podria reservar presencial a las 20:00 manipulando la peticion, o
-- --al reves-- una reserva online legitima de las 20:00 seria rechazada.
--
-- Nota horaria: las 19:00-21:00 de Caracas son la 1:00-3:00 de Madrid. El bloque
-- de noche NO es para Espana, que ya queda cubierta por el horario de tarde
-- (9:00-18:00 de Caracas son las 15:00-24:00 de Madrid). Es para quien esta en
-- Venezuela, Colombia o la costa este de EE. UU. y trabaja de dia.
-- ============================================================

alter table public.availability_rules
  add column if not exists mode public.session_mode;

comment on column public.availability_rules.mode is
  'null = la franja vale para online y presencial; un valor la restringe a esa modalidad.';

-- Horario nuevo: se borran las reglas vigentes y se ponen las tres franjas.
delete from public.availability_rules;

insert into public.availability_rules (weekday, start_time, end_time, active, mode) values
  -- Lunes a viernes, dia completo, las dos modalidades. Ultimo hueco: 17:00.
  (1, time '09:00', time '18:00', true, null),
  (2, time '09:00', time '18:00', true, null),
  (3, time '09:00', time '18:00', true, null),
  (4, time '09:00', time '18:00', true, null),
  (5, time '09:00', time '18:00', true, null),
  -- Bloque de noche, solo online. Ultimo hueco: 21:00, termina a las 21:50.
  (1, time '19:00', time '22:00', true, 'online'),
  (2, time '19:00', time '22:00', true, 'online'),
  (3, time '19:00', time '22:00', true, 'online'),
  (4, time '19:00', time '22:00', true, 'online'),
  (5, time '19:00', time '22:00', true, 'online'),
  -- Sabado por la manana, sin cambios.
  (6, time '08:00', time '12:00', true, null);

drop function if exists public.get_available_slots(text, date, date);

create or replace function public.get_available_slots(
  p_service_slug text,
  p_from date,
  p_to   date,
  p_mode text default null
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
  v_modo   public.session_mode;
begin
  -- Modalidad pedida. Si no llega ninguna, v_modo se queda en null y abajo solo
  -- entran las franjas sin modalidad: nunca se ensena de mas por descuido.
  if p_mode is not null then
    begin
      v_modo := p_mode::public.session_mode;
    exception when invalid_text_representation then
      return;
    end;
  end if;

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
       -- Franja sin modalidad = vale para las dos. Con modalidad, solo para esa:
       -- asi el bloque de noche existe para online y no para presencial.
       and (r.mode is null or r.mode = v_modo)
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

create or replace function public.create_booking(
  p_service_slug    text,
  p_full_name       text,
  p_email           text,
  p_phone           text,
  p_starts_at       timestamptz,
  p_consent         boolean,
  p_mode            text default 'online',
  p_client_package_token text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_serv    public.services%rowtype;
  v_cliente uuid;
  v_cita    uuid;
  v_token   text;
  v_termina timestamptz;
  v_hold    int  := (app.setting('hold_minutes'))::int;
  v_version text := app.setting('consent_version') #>> '{}';
  v_bono    public.client_packages%rowtype;
  v_precio  numeric(10,2);
  v_vence   timestamptz;
  v_modo    public.session_mode;
begin
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

  begin
    v_modo := coalesce(p_mode, 'online')::public.session_mode;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'error', 'invalid_mode',
      'message', 'Elige si la sesión es online o presencial.');
  end;

  select * into v_serv from public.services where slug = p_service_slug and active;
  if v_serv.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_service',
      'message', 'Ese tipo de sesión no está disponible.');
  end if;

  if app.rate_limited() then
    return jsonb_build_object('ok', false, 'error', 'rate_limited',
      'message', 'Demasiadas reservas seguidas. Inténtalo dentro de un rato.');
  end if;

  if not exists (
    select 1 from public.get_available_slots(
      p_service_slug,
      (p_starts_at at time zone (app.setting('timezone') #>> '{}'))::date,
      (p_starts_at at time zone (app.setting('timezone') #>> '{}'))::date,
      v_modo::text
    ) as s(t) where s.t = p_starts_at
  ) then
    return jsonb_build_object('ok', false, 'error', 'slot_unavailable',
      'message', 'Ese horario ya no está disponible. Elige otro, por favor.');
  end if;

  v_termina := p_starts_at + (v_serv.duration_min || ' minutes')::interval;

  insert into public.clients (full_name, email, phone)
  values (btrim(p_full_name), app.norm_email(p_email), btrim(p_phone))
  on conflict (lower(btrim(email))) do update
     set full_name = excluded.full_name, phone = excluded.phone
  returning id into v_cliente;

  if p_client_package_token is not null then
    select * into v_bono from public.client_packages
     where manage_token = p_client_package_token for update;

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

    -- La cita se apunta al DUEÑO del bono, no a quien rellenó el formulario:
    -- el token es la credencial del paquete y manda su titular.
    v_cliente := v_bono.client_id;
    v_precio  := round(v_bono.price_usd / v_bono.sessions_total, 2);
    v_vence   := null;
  else
    v_precio := v_serv.price_usd;      -- el precio SIEMPRE de la tabla
    v_vence  := now() + (v_hold || ' minutes')::interval;
  end if;

  begin
    insert into public.appointments (
      client_id, service_id, starts_at, ends_at, price_usd,
      client_package_id, status, hold_expires_at, mode
    ) values (
      v_cliente, v_serv.id, p_starts_at, v_termina, v_precio,
      v_bono.id,
      (case when v_bono.id is null then 'pending_payment' else 'confirmed' end)::public.appointment_status,
      v_vence, v_modo
    )
    returning id, manage_token into v_cita, v_token;
  exception when exclusion_violation then
    return jsonb_build_object('ok', false, 'error', 'slot_taken',
      'message', 'Alguien acaba de tomar ese horario. Elige otro, por favor.');
  end;

  if v_bono.id is not null then
    update public.client_packages
       set sessions_used = sessions_used + 1,
           status = (case when sessions_used + 1 >= sessions_total
                          then 'exhausted' else 'active' end)::public.package_status
     where id = v_bono.id;
  end if;

  insert into public.consents (appointment_id, version, ip_hash)
  values (v_cita, v_version, app.ip_hash());

  return jsonb_build_object(
    'ok', true,
    'manage_token', v_token,
    'appointment', jsonb_build_object(
      'id', v_cita, 'starts_at', p_starts_at, 'ends_at', v_termina,
      'service', v_serv.name, 'duration', v_serv.duration_min,
      'price_usd', v_precio, 'mode', v_modo,
      'status', case when v_bono.id is null then 'pending_payment' else 'confirmed' end
    ),
    'hold_expires_at', v_vence,
    'payment_info', case when v_bono.id is null then app.setting('pago_movil') else null end,
    'consultorio', case when v_modo = 'presencial' then app.setting('consultorio') else null end
  );
end;
$$;

create or replace function public.buy_package(
  p_package_slug text,
  p_service_slug  text,
  p_full_name     text,
  p_email         text,
  p_phone         text,
  p_starts_at     timestamptz,
  p_consent       boolean,
  p_mode          text default 'online'
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_paq     public.packages%rowtype;
  v_serv    public.services%rowtype;
  v_cliente uuid;
  v_bono    uuid;
  v_bonotok text;
  v_cita    uuid;
  v_citatok text;
  v_termina timestamptz;
  v_hold    int  := (app.setting('hold_minutes'))::int;
  v_version text := app.setting('consent_version') #>> '{}';
  v_vence   timestamptz;
  v_modo    public.session_mode;
begin
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

  begin
    v_modo := coalesce(p_mode, 'online')::public.session_mode;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'error', 'invalid_mode',
      'message', 'Elige si la sesión es online o presencial.');
  end;

  select * into v_paq  from public.packages where slug = p_package_slug and active;
  if v_paq.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_package',
      'message', 'Ese paquete no está disponible.');
  end if;

  select * into v_serv from public.services where slug = p_service_slug and active;
  if v_serv.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_service',
      'message', 'Ese tipo de sesión no está disponible.');
  end if;

  if v_paq.modality <> v_serv.modality then
    return jsonb_build_object('ok', false, 'error', 'modality_mismatch',
      'message', 'Ese paquete no corresponde a este tipo de sesión.');
  end if;

  if app.rate_limited() then
    return jsonb_build_object('ok', false, 'error', 'rate_limited',
      'message', 'Demasiadas reservas seguidas. Inténtalo dentro de un rato.');
  end if;

  if not exists (
    select 1 from public.get_available_slots(
      p_service_slug,
      (p_starts_at at time zone (app.setting('timezone') #>> '{}'))::date,
      (p_starts_at at time zone (app.setting('timezone') #>> '{}'))::date,
      v_modo::text
    ) as s(t) where s.t = p_starts_at
  ) then
    return jsonb_build_object('ok', false, 'error', 'slot_unavailable',
      'message', 'Ese horario ya no está disponible. Elige otro, por favor.');
  end if;

  insert into public.clients (full_name, email, phone)
  values (btrim(p_full_name), app.norm_email(p_email), btrim(p_phone))
  on conflict (lower(btrim(email))) do update
     set full_name = excluded.full_name, phone = excluded.phone
  returning id into v_cliente;

  insert into public.client_packages (
    client_id, package_id, modality, sessions_total, sessions_used, price_usd, status
  ) values (
    v_cliente, v_paq.id, v_paq.modality, v_paq.sessions_count, 1, v_paq.price_usd, 'pending_payment'
  )
  returning id, manage_token into v_bono, v_bonotok;

  v_termina := p_starts_at + (v_serv.duration_min || ' minutes')::interval;
  v_vence   := now() + (v_hold || ' minutes')::interval;

  begin
    insert into public.appointments (
      client_id, service_id, starts_at, ends_at, price_usd,
      client_package_id, status, hold_expires_at, mode
    ) values (
      v_cliente, v_serv.id, p_starts_at, v_termina,
      round(v_paq.price_usd / v_paq.sessions_count, 2),
      v_bono, 'pending_payment', v_vence, v_modo
    )
    returning id, manage_token into v_cita, v_citatok;
  exception when exclusion_violation then
    return jsonb_build_object('ok', false, 'error', 'slot_taken',
      'message', 'Alguien acaba de tomar ese horario. Elige otro, por favor.');
  end;

  insert into public.consents (appointment_id, version, ip_hash)
  values (v_cita, v_version, app.ip_hash());

  return jsonb_build_object(
    'ok', true,
    'package_token', v_bonotok,
    'manage_token',  v_citatok,
    'package', jsonb_build_object(
      'name', v_paq.name, 'sessions_total', v_paq.sessions_count,
      'price_usd', v_paq.price_usd, 'valid_days', v_paq.valid_days
    ),
    'appointment', jsonb_build_object(
      'starts_at', p_starts_at, 'ends_at', v_termina,
      'service', v_serv.name, 'mode', v_modo
    ),
    'amount_due_usd', v_paq.price_usd,
    'hold_expires_at', v_vence,
    'payment_info', app.setting('pago_movil'),
    'consultorio', case when v_modo = 'presencial' then app.setting('consultorio') else null end
  );
end;
$$;

create or replace function public.book_from_package(
  p_package_token text,
  p_service_slug  text,
  p_starts_at     timestamptz,
  p_mode          text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_bono    public.client_packages%rowtype;
  v_serv    public.services%rowtype;
  v_cita    uuid;
  v_citatok text;
  v_termina timestamptz;
  v_version text := app.setting('consent_version') #>> '{}';
  v_modo    public.session_mode;
begin
  select * into v_bono from public.client_packages
   where manage_token = p_package_token for update;

  if v_bono.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_package',
      'message', 'No encontramos ese paquete.');
  end if;
  if v_bono.status = 'pending_payment' then
    return jsonb_build_object('ok', false, 'error', 'package_unpaid',
      'message', 'Tu paquete todavía está pendiente de verificar el pago.');
  end if;
  if v_bono.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'package_not_active',
      'message', 'Ese paquete ya no está activo.');
  end if;
  if v_bono.expires_at is not null and v_bono.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'package_expired',
      'message', 'Ese paquete caducó el ' || to_char(v_bono.expires_at, 'DD/MM/YYYY') || '.');
  end if;
  if v_bono.sessions_used >= v_bono.sessions_total then
    return jsonb_build_object('ok', false, 'error', 'package_exhausted',
      'message', 'Ya usaste todas las sesiones de este paquete.');
  end if;

  select * into v_serv from public.services where slug = p_service_slug and active;
  if v_serv.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_service',
      'message', 'Ese tipo de sesión no está disponible.');
  end if;
  if v_serv.modality <> v_bono.modality then
    return jsonb_build_object('ok', false, 'error', 'modality_mismatch',
      'message', 'Tu paquete no sirve para este tipo de sesión.');
  end if;

  if p_mode is not null then
    begin
      v_modo := p_mode::public.session_mode;
    exception when invalid_text_representation then
      return jsonb_build_object('ok', false, 'error', 'invalid_mode',
        'message', 'Elige si la sesión es online o presencial.');
    end;
  else
    select a.mode into v_modo
      from public.appointments a
     where a.client_package_id = v_bono.id
     order by a.created_at desc limit 1;
    v_modo := coalesce(v_modo, 'online');
  end if;

  if not exists (
    select 1 from public.get_available_slots(
      p_service_slug,
      (p_starts_at at time zone (app.setting('timezone') #>> '{}'))::date,
      (p_starts_at at time zone (app.setting('timezone') #>> '{}'))::date,
      v_modo::text
    ) as s(t) where s.t = p_starts_at
  ) then
    return jsonb_build_object('ok', false, 'error', 'slot_unavailable',
      'message', 'Ese horario ya no está disponible. Elige otro, por favor.');
  end if;

  v_termina := p_starts_at + (v_serv.duration_min || ' minutes')::interval;

  begin
    insert into public.appointments (
      client_id, service_id, starts_at, ends_at, price_usd,
      client_package_id, status, mode
    ) values (
      v_bono.client_id, v_serv.id, p_starts_at, v_termina,
      round(v_bono.price_usd / v_bono.sessions_total, 2),
      v_bono.id, 'confirmed', v_modo
    )
    returning id, manage_token into v_cita, v_citatok;
  exception when exclusion_violation then
    return jsonb_build_object('ok', false, 'error', 'slot_taken',
      'message', 'Alguien acaba de tomar ese horario. Elige otro, por favor.');
  end;

  update public.client_packages
     set sessions_used = sessions_used + 1,
         status = (case when sessions_used + 1 >= sessions_total
                        then 'exhausted' else 'active' end)::public.package_status
   where id = v_bono.id;

  insert into public.consents (appointment_id, version, ip_hash)
  values (v_cita, v_version, app.ip_hash());

  return jsonb_build_object(
    'ok', true,
    'manage_token', v_citatok,
    'appointment', jsonb_build_object(
      'starts_at', p_starts_at, 'ends_at', v_termina,
      'service', v_serv.name, 'status', 'confirmed', 'mode', v_modo
    ),
    'sessions_left', v_bono.sessions_total - v_bono.sessions_used - 1,
    'consultorio', case when v_modo = 'presencial' then app.setting('consultorio') else null end
  );
end;
$$;

-- Se rehacen los permisos: la firma de get_available_slots cambio.
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema app    from public, anon, authenticated;

grant execute on function public.get_available_slots(text, date, date, text)                              to anon, authenticated;
grant execute on function public.create_booking(text, text, text, text, timestamptz, boolean, text, text) to anon, authenticated;
grant execute on function public.buy_package(text, text, text, text, text, timestamptz, boolean, text)    to anon, authenticated;
grant execute on function public.book_from_package(text, text, timestamptz, text)                         to anon, authenticated;
grant execute on function public.submit_payment(text, text, text, date, numeric, numeric, text)           to anon, authenticated;
grant execute on function public.get_booking(text)                                                        to anon, authenticated;
grant execute on function public.get_package(text)                                                        to anon, authenticated;
grant execute on function public.cancel_booking(text, text)                                               to anon, authenticated;
grant execute on function public.get_consultorio()                                                        to anon, authenticated;
