-- ============================================================
-- 0008 — Online o presencial
--
-- Daryeli también atiende en consulta. Como el precio y los días son los
-- mismos que en online, esto NO necesita una tabla de sedes ni un horario
-- paralelo: basta con guardar en la cita cómo se atiende, y tener la
-- dirección en un ajuste.
--
-- Si algún día hubiera varios consultorios con horarios distintos, entonces
-- sí tocaría una tabla propia. Hoy sería complejidad sin uso.
-- ============================================================

create type public.session_mode as enum ('online', 'presencial');

alter table public.appointments
  add column mode public.session_mode not null default 'online';

-- Dirección del consultorio. A diferencia de las cuentas de cobro, esto sí va
-- en el repositorio: es la dirección pública de un centro profesional, no un
-- dato personal, y cualquiera que reserve presencial tiene que verla.
-- Editable desde el panel cuando exista.
insert into public.settings (key, value) values
  ('consultorio', jsonb_build_object(
     'name',      'Centro Humanista Intellego',
     'address',   'Calle 19, entre carreras 28 y 29',
     'city',      'Barquisimeto, estado Lara',
     'reference', '',
     'maps_url',  'https://www.google.com/maps/search/?api=1&query=Centro+Humanista+Intellego+Barquisimeto+Lara'
   ))
on conflict (key) do update set value = excluded.value;

-- La dirección tiene que poder leerla quien va a reservar presencial, así que
-- se expone junto al resto de lo público. No es dato sensible: es una consulta
-- profesional, no el domicilio de nadie.
create or replace function public.get_consultorio()
returns jsonb
language sql stable security definer set search_path = ''
as $$ select value from public.settings where key = 'consultorio'; $$;

revoke execute on function public.get_consultorio() from public;
grant execute on function public.get_consultorio() to anon, authenticated;


-- ---------- LA MODALIDAD ENTRA EN LA RESERVA ----------
-- Se reemplazan las dos funciones de creación para que acepten el modo. El
-- valor llega como texto y se valida contra el tipo: si alguien inventa un
-- modo por la API, la conversión falla y no se crea nada.

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
      (p_starts_at at time zone (app.setting('timezone') #>> '{}'))::date
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
      (p_starts_at at time zone (app.setting('timezone') #>> '{}'))::date
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


-- book_from_package hereda la modalidad de la cita anterior salvo que se
-- indique otra: quien va a consulta suele seguir yendo a consulta.
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
      (p_starts_at at time zone (app.setting('timezone') #>> '{}'))::date
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


-- get_booking también devuelve la modalidad y, si toca, la dirección: el
-- enlace del correo tiene que decirle a la persona adónde ir.
create or replace function public.get_booking(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_r jsonb;
begin
  select jsonb_build_object(
    'ok', true,
    'appointment', jsonb_build_object(
      'starts_at', a.starts_at, 'ends_at', a.ends_at, 'status', a.status,
      'service', s.name, 'duration', s.duration_min, 'price_usd', a.price_usd,
      'mode', a.mode,
      'hold_expires_at', a.hold_expires_at,
      'from_package', (a.client_package_id is not null)
    ),
    'client', jsonb_build_object('full_name', c.full_name, 'email', c.email),
    'payment', (
      select jsonb_build_object('status', p.status, 'declared_at', p.created_at,
                                'reject_reason', p.reject_reason)
        from public.payments p where p.appointment_id = a.id
       order by p.created_at desc limit 1
    ),
    'payment_info', case when a.status = 'pending_payment'
                         then app.setting('pago_movil') else null end,
    'consultorio', case when a.mode = 'presencial'
                        then app.setting('consultorio') else null end
  )
  into v_r
  from public.appointments a
  join public.services s on s.id = a.service_id
  join public.clients  c on c.id = a.client_id
  where a.manage_token = p_token;

  if v_r is null then
    return jsonb_build_object('ok', false, 'error', 'not_found',
      'message', 'No encontramos esa reserva.');
  end if;
  return v_r;
end;
$$;


-- ---------- PERMISOS ----------
-- Las firmas cambiaron, así que hay que conceder de nuevo. Las versiones
-- antiguas se retiran para que no queden dos caminos hacia lo mismo.
drop function if exists public.create_booking(text, text, text, text, timestamptz, boolean, text);
drop function if exists public.buy_package(text, text, text, text, text, timestamptz, boolean);
drop function if exists public.book_from_package(text, text, timestamptz);

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema app    from public, anon, authenticated;

grant execute on function public.get_available_slots(text, date, date)                                    to anon, authenticated;
grant execute on function public.create_booking(text, text, text, text, timestamptz, boolean, text, text) to anon, authenticated;
grant execute on function public.buy_package(text, text, text, text, text, timestamptz, boolean, text)    to anon, authenticated;
grant execute on function public.book_from_package(text, text, timestamptz, text)                         to anon, authenticated;
grant execute on function public.submit_payment(text, text, text, date, numeric, numeric, text)           to anon, authenticated;
grant execute on function public.get_booking(text)                                                        to anon, authenticated;
grant execute on function public.get_package(text)                                                        to anon, authenticated;
grant execute on function public.cancel_booking(text, text)                                               to anon, authenticated;
grant execute on function public.get_consultorio()                                                        to anon, authenticated;
grant execute on function public.verify_payment(uuid, boolean, text)                                      to authenticated;
