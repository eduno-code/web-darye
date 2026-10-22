-- ============================================================
-- EL HORARIO ES DEL PACIENTE
--
-- Hasta ahora el pago era la condición para tener el horario: la cita nacía en
-- pending_payment, se retenía dos horas y se cancelaba sola. Daryeli no trabaja
-- así — sus pacientes le pagan antes o después de la consulta — y el objetivo
-- del producto es educarlos para que paguen antes, no impedirles pagar después.
--
-- A partir de aquí la cita queda CONFIRMADA al reservar y el pago va por su
-- cuenta. Con una sola excepción: sesión online de alguien sin historial.
-- Ahí la cita nace pendiente y caduca en una hora, porque si no caducara,
-- exigir el pago por adelantado no significaría nada — el hueco ya sería suyo
-- sin haber pagado.
--
-- Lo que sustituye a la retención como defensa de la agenda: captcha, tope de
-- citas futuras sin pagar, ventana de reserva más corta, y el panel de Daryeli.
-- ============================================================

-- ------------------------------------------------------------
-- ¿Esta persona ya tiene relación con Daryeli?
--
-- La señal es haber pagado alguna vez, por cualquier método —incluido el
-- efectivo que registre Daryeli en el panel—, o tener una sesión ya realizada.
-- Se busca por correo normalizado O por teléfono: quien cambia de correo pero
-- mantiene el teléfono sigue siendo el mismo paciente.
--
-- Ojo con la dirección del riesgo: inventarse un correo nuevo devuelve "sin
-- historial", que es la regla MÁS estricta. No hay forma de ganar acceso
-- fingiendo ser nuevo; y para fingir ser conocido haría falta acertar el correo
-- y el teléfono de un paciente real a la vez.
-- ------------------------------------------------------------
create or replace function app.tiene_historial(p_email text, p_phone text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.appointments a
      join public.clients c on c.id = a.client_id
     where (
             c.email = app.norm_email(coalesce(p_email, ''))
             or (nullif(btrim(coalesce(p_phone, '')), '') is not null
                 and btrim(c.phone) = btrim(p_phone))
           )
       and (
             a.status = 'completed'
             or exists (
               select 1 from public.payments p
                where p.appointment_id = a.id and p.status = 'verified'
             )
           )
  )
  or exists (
    select 1
      from public.client_packages cp
      join public.clients c on c.id = cp.client_id
      join public.payments p on p.client_package_id = cp.id
     where p.status = 'verified'
       and (
             c.email = app.norm_email(coalesce(p_email, ''))
             or (nullif(btrim(coalesce(p_phone, '')), '') is not null
                 and btrim(c.phone) = btrim(p_phone))
           )
  );
$$;

-- ------------------------------------------------------------
-- Citas futuras que esta persona tiene sin pagar.
--
-- Una sesión que sale de un paquete cuenta como pagada: el paquete se abonó al
-- comprarlo. Las canceladas y rechazadas no cuentan — no ocupan hueco.
-- ------------------------------------------------------------
create or replace function app.citas_sin_pagar(p_email text, p_phone text)
returns int
language sql stable security definer set search_path = ''
as $$
  select count(*)::int
    from public.appointments a
    join public.clients c on c.id = a.client_id
   where a.starts_at > now()
     and a.status in ('pending_payment', 'confirmed')
     and a.client_package_id is null
     and (
           c.email = app.norm_email(coalesce(p_email, ''))
           or (nullif(btrim(coalesce(p_phone, '')), '') is not null
               and btrim(c.phone) = btrim(p_phone))
         )
     and not exists (
       select 1 from public.payments p
        where p.appointment_id = a.id and p.status = 'verified'
     );
$$;

-- ------------------------------------------------------------
-- Captcha de Cloudflare Turnstile.
--
-- Mientras turnstile_secret esté vacío la función deja pasar todo: así se puede
-- desarrollar y probar sin claves, y activarlo es pegar el secreto en settings.
-- ES LA ÚNICA CAPA QUE FRENA UN SCRIPT — no publicar la página sin ella.
--
-- Se valida desde Postgres con la extensión http, la misma que trae la tasa del
-- BCV, para no depender de desplegar Edge Functions.
-- ------------------------------------------------------------
create or replace function app.captcha_ok(p_token text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_secret text := app.setting('turnstile_secret') #>> '{}';
  v_resp   extensions.http_response;
begin
  if coalesce(btrim(v_secret), '') = '' then
    return true;                       -- todavía sin configurar
  end if;
  if coalesce(btrim(coalesce(p_token, '')), '') = '' then
    return false;
  end if;

  begin
    select * into v_resp
      from extensions.http(('POST',
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        array[extensions.http_header('User-Agent', 'psicconsciente/1.0')],
        'application/x-www-form-urlencoded',
        'secret=' || extensions.urlencode(v_secret) ||
        '&response=' || extensions.urlencode(p_token)
      )::extensions.http_request);
  exception when others then
    -- Cloudflare caído no puede dejar a Daryeli sin reservas.
    return true;
  end;

  if v_resp.status <> 200 then
    return true;
  end if;
  return coalesce((v_resp.content::jsonb ->> 'success')::boolean, false);
end;
$$;

-- ------------------------------------------------------------
-- ¿Esta referencia bancaria ya se usó?
--
-- Existe un índice único de banco + referencia que impide reusar un comprobante
-- viejo, pero hoy el rechazo llega al enviar el formulario, con todo relleno.
-- Esto permite avisar mientras se escribe. Devuelve un booleano y nada más:
-- no filtra de quién era el pago ni cuándo.
-- ------------------------------------------------------------
create or replace function public.reference_taken(p_bank_code text, p_reference text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.payments
     where bank_code = p_bank_code
       and btrim(reference_number) = btrim(p_reference)
  );
$$;

drop function if exists public.create_booking(text, text, text, text, timestamptz, boolean, text, text);

create or replace function public.create_booking(
  p_service_slug    text,
  p_full_name       text,
  p_email           text,
  p_phone           text,
  p_starts_at       timestamptz,
  p_consent         boolean,
  p_mode            text default 'online',
  p_client_package_token text default null,
  p_pago_ahora      boolean default true,
  p_captcha         text default null
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
  v_prepago boolean;
  v_pendientes int;
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

  -- Captcha. Es la unica capa que frena a un script: el limite por IP se
  -- esquiva con datos moviles y el de citas sin pagar con otro correo.
  if not app.captcha_ok(p_captcha) then
    return jsonb_build_object('ok', false, 'error', 'captcha_failed',
      'message', 'No pudimos verificar que eres una persona. Recarga la página e inténtalo otra vez.');
  end if;

  -- Tope de citas futuras sin pagar. Un paciente real reserva una; quien quiera
  -- ocupar la agenda necesita un correo Y un telefono distintos por cada dos.
  v_pendientes := app.citas_sin_pagar(p_email, p_phone);
  if v_pendientes >= (app.setting('max_citas_sin_pagar'))::int then
    return jsonb_build_object('ok', false, 'error', 'demasiadas_sin_pagar',
      'message', 'Ya tienes ' || v_pendientes || ' citas reservadas sin pagar. Paga alguna o escríbele a Daryeli antes de reservar otra.');
  end if;

  /* Prepago obligatorio: sesion ONLINE de alguien SIN historial.
     La asimetria que lo justifica: si un desconocido reserva presencial y no
     aparece, Daryeli perdio una hora pero no le dio nada. Si hace la sesion
     online, recibio el servicio completo y ella no tiene ningun resorte para
     cobrar. Se mide contra el historial ENTERO, no el online: un paciente
     presencial de siempre que quiere una videollamada no es un desconocido. */
  v_prepago := (v_modo = 'online')
               and not app.tiene_historial(p_email, p_phone)
               and p_client_package_token is null;

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
    /* Solo las citas de prepago obligatorio caducan, y por eso mismo: si no
       caducaran, el hueco quedaria ocupado por alguien que nunca pago. El resto
       no tiene retencion — el horario es suyo desde el primer segundo. */
    v_vence  := case when v_prepago
                     then now() + interval '60 minutes'
                     else null end;
  end if;

  begin
    insert into public.appointments (
      client_id, service_id, starts_at, ends_at, price_usd,
      client_package_id, status, hold_expires_at, mode
    ) values (
      v_cliente, v_serv.id, p_starts_at, v_termina, v_precio,
      v_bono.id,
      /* Confirmada de entrada: el horario es del paciente y el pago va por su
         cuenta. La excepcion es el prepago obligatorio, donde la cita nace
         pendiente porque si no, exigir el pago por adelantado no significaria
         nada: el hueco ya seria suyo sin haber pagado. */
      (case when v_prepago then 'pending_payment' else 'confirmed' end)::public.appointment_status,
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
      'status', case when v_prepago then 'pending_payment' else 'confirmed' end
    ),
    'prepago', v_prepago,
    'pago_ahora', coalesce(p_pago_ahora, true),
    'hold_expires_at', v_vence,
    'payment_info', case when v_bono.id is null then app.setting('pago_movil') else null end,
    'consultorio', case when v_modo = 'presencial' then app.setting('consultorio') else null end
  );
end;
$$;

-- Permisos: cambió la firma de create_booking y hay funciones nuevas.
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema app    from public, anon, authenticated;

grant execute on function public.get_available_slots(text, date, date, text)                                              to anon, authenticated;
grant execute on function public.create_booking(text, text, text, text, timestamptz, boolean, text, text, boolean, text)  to anon, authenticated;
grant execute on function public.buy_package(text, text, text, text, text, timestamptz, boolean, text)                    to anon, authenticated;
grant execute on function public.book_from_package(text, text, timestamptz, text)                                         to anon, authenticated;
grant execute on function public.submit_payment(text, text, text, date, numeric, numeric, text)                           to anon, authenticated;
grant execute on function public.get_booking(text)                                                                        to anon, authenticated;
grant execute on function public.get_package(text)                                                                        to anon, authenticated;
grant execute on function public.cancel_booking(text, text)                                                               to anon, authenticated;
grant execute on function public.get_consultorio()                                                                        to anon, authenticated;
grant execute on function public.get_exchange_rate()                                                                      to anon, authenticated;
grant execute on function public.reference_taken(text, text)                                                              to anon, authenticated;
