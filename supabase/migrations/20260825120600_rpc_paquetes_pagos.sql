-- ============================================================
-- 0007 — Paquetes, pagos y gestión de la propia cita
--
-- Segunda mitad de la lógica pública. Mismas reglas que en 0006: SECURITY
-- DEFINER, search_path vacío, y cada función devuelve lo mínimo.
--
-- El hilo que sostiene todo esto es el manage_token. El cliente no tiene
-- cuenta, así que su token ES su credencial: 24 bytes aleatorios que llegan
-- por correo. Toda función que toque datos de una persona empieza por
-- resolver ese token, y solo actúa sobre lo que cuelga de él.
-- ============================================================


-- ============================================================
-- COMPRAR UN PAQUETE
-- ============================================================
--
-- Crea el bono y agenda de una vez la primera sesión. Las demás las pedirá
-- cuando quiera con book_from_package, sin volver a pagar.
--
-- El bono nace en pending_payment y no vale para nada hasta que Daryeli
-- verifica el comprobante. La primera cita retiene el cupo mientras tanto.
create or replace function public.buy_package(
  p_package_slug text,
  p_service_slug  text,
  p_full_name     text,
  p_email         text,
  p_phone         text,
  p_starts_at     timestamptz,
  p_consent       boolean
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

  -- Un bono individual no sirve para terapia de pareja: dura más y cuesta más.
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

  -- El bono. Todo congelado: si Daryeli reorganiza el catálogo mañana, esto
  -- no cambia. expires_at sigue nulo: el reloj arranca al verificar el pago.
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
      client_package_id, status, hold_expires_at
    ) values (
      v_cliente, v_serv.id, p_starts_at, v_termina,
      round(v_paq.price_usd / v_paq.sessions_count, 2),
      v_bono, 'pending_payment', v_vence
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
      'name',           v_paq.name,
      'sessions_total', v_paq.sessions_count,
      'price_usd',      v_paq.price_usd,
      'valid_days',     v_paq.valid_days
    ),
    'appointment', jsonb_build_object(
      'starts_at', p_starts_at,
      'ends_at',   v_termina,
      'service',   v_serv.name
    ),
    'amount_due_usd',  v_paq.price_usd,
    'hold_expires_at', v_vence,
    'payment_info',    app.setting('pago_movil')
  );
end;
$$;


-- ============================================================
-- AGENDAR CON UN BONO YA PAGADO
-- ============================================================
--
-- El cliente entra con el enlace de su paquete y elige la siguiente sesión.
-- No vuelve a escribir sus datos ni a pagar: se reutiliza todo lo del bono.
create or replace function public.book_from_package(
  p_package_token text,
  p_service_slug  text,
  p_starts_at     timestamptz
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
begin
  select * into v_bono
    from public.client_packages
   where manage_token = p_package_token
     for update;

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
      client_package_id, status
    ) values (
      v_bono.client_id, v_serv.id, p_starts_at, v_termina,
      round(v_bono.price_usd / v_bono.sessions_total, 2),
      v_bono.id, 'confirmed'
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
      'starts_at', p_starts_at,
      'ends_at',   v_termina,
      'service',   v_serv.name,
      'status',    'confirmed'
    ),
    'sessions_left', v_bono.sessions_total - v_bono.sessions_used - 1
  );
end;
$$;


-- ============================================================
-- DECLARAR UN PAGO
-- ============================================================
--
-- El cliente dice haber pagado y adjunta la referencia. NADA se da por bueno
-- aquí: el pago nace en "declared" y solo Daryeli lo mueve a verified.
--
-- El token puede ser el de una cita suelta o el de un paquete; se resuelve
-- solo. Se guarda lo mínimo del pago móvil —banco, referencia, fecha, monto—
-- y nunca la cédula ni el teléfono del emisor: eso está en la captura, que
-- es justo lo que se borra a los seis meses.
create or replace function public.submit_payment(
  p_token         text,
  p_bank_code     text,
  p_reference     text,
  p_paid_on       date,
  p_amount_bs     numeric,
  p_exchange_rate numeric default null,
  p_proof_path    text    default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_cita uuid;
  v_bono uuid;
  v_est  public.appointment_status;
  v_pest public.package_status;
begin
  if p_amount_bs is null or p_amount_bs <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount',
      'message', 'Escribe el monto que pagaste.');
  end if;
  if length(btrim(coalesce(p_reference, ''))) < 4 then
    return jsonb_build_object('ok', false, 'error', 'invalid_reference',
      'message', 'Escribe el número de referencia de la transacción.');
  end if;
  if p_paid_on is null or p_paid_on > (now() at time zone (app.setting('timezone') #>> '{}'))::date then
    return jsonb_build_object('ok', false, 'error', 'invalid_date',
      'message', 'La fecha del pago no puede ser futura.');
  end if;
  if not exists (select 1 from public.banks where code = p_bank_code and active) then
    return jsonb_build_object('ok', false, 'error', 'unknown_bank',
      'message', 'Selecciona el banco desde el que pagaste.');
  end if;

  select id, status into v_cita, v_est
    from public.appointments where manage_token = p_token;

  if v_cita is null then
    select id, status into v_bono, v_pest
      from public.client_packages where manage_token = p_token;
    if v_bono is null then
      return jsonb_build_object('ok', false, 'error', 'not_found',
        'message', 'No encontramos esa reserva.');
    end if;
    if v_pest <> 'pending_payment' then
      return jsonb_build_object('ok', false, 'error', 'not_pending',
        'message', 'Ese paquete no está esperando un pago.');
    end if;
  else
    if v_est <> 'pending_payment' then
      return jsonb_build_object('ok', false, 'error', 'not_pending',
        'message', 'Esa cita no está esperando un pago.');
    end if;
    -- Si la cita cuelga de un paquete, el pago va al paquete, no a la cita:
    -- un comprobante cubre el bono entero.
    select client_package_id into v_bono from public.appointments where id = v_cita;
    if v_bono is not null then v_cita := null; end if;
  end if;

  begin
    insert into public.payments (
      appointment_id, client_package_id, bank_code, reference_number,
      paid_on, amount_bs, exchange_rate, proof_path, status
    ) values (
      v_cita, v_bono, p_bank_code, btrim(p_reference),
      p_paid_on, p_amount_bs, p_exchange_rate, p_proof_path, 'declared'
    );
  exception when unique_violation then
    -- Índice único (banco, referencia): un mismo comprobante no puede
    -- declararse en dos reservas distintas.
    return jsonb_build_object('ok', false, 'error', 'duplicate_reference',
      'message', 'Esa referencia ya fue declarada en otra reserva. Revisa el número.');
  end;

  -- Mientras Daryeli revisa, el cupo deja de tener cuenta atrás: no sería
  -- justo liberarlo cuando la persona ya pagó y solo falta la validación.
  if v_cita is not null then
    update public.appointments set hold_expires_at = null where id = v_cita;
  else
    update public.appointments set hold_expires_at = null where client_package_id = v_bono;
  end if;

  return jsonb_build_object('ok', true,
    'message', 'Recibimos tu comprobante. Daryeli lo revisa y te confirma por correo.');
end;
$$;


-- ============================================================
-- CONSULTAR Y CANCELAR LO PROPIO
-- ============================================================

-- Lo que ve el cliente al abrir el enlace de su cita. Solo su cita.
create or replace function public.get_booking(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_r jsonb;
begin
  select jsonb_build_object(
    'ok', true,
    'appointment', jsonb_build_object(
      'starts_at', a.starts_at,
      'ends_at',   a.ends_at,
      'status',    a.status,
      'service',   s.name,
      'duration',  s.duration_min,
      'price_usd', a.price_usd,
      'hold_expires_at', a.hold_expires_at,
      'from_package',    (a.client_package_id is not null)
    ),
    'client', jsonb_build_object('full_name', c.full_name, 'email', c.email),
    'payment', (
      select jsonb_build_object('status', p.status, 'declared_at', p.created_at,
                                'reject_reason', p.reject_reason)
        from public.payments p
       where p.appointment_id = a.id
       order by p.created_at desc limit 1
    ),
    'payment_info', case when a.status = 'pending_payment'
                         then app.setting('pago_movil') else null end
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

-- Lo que ve el cliente al abrir el enlace de su paquete: saldo y sesiones.
create or replace function public.get_package(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_r jsonb;
begin
  select jsonb_build_object(
    'ok', true,
    'package', jsonb_build_object(
      'name',           pk.name,
      'modality',       cp.modality,
      'sessions_total', cp.sessions_total,
      'sessions_used',  cp.sessions_used,
      'sessions_left',  cp.sessions_total - cp.sessions_used,
      'status',         cp.status,
      'expires_at',     cp.expires_at,
      'price_usd',      cp.price_usd
    ),
    'client', jsonb_build_object('full_name', c.full_name, 'email', c.email),
    'appointments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'starts_at', a.starts_at, 'status', a.status, 'service', s.name)
               order by a.starts_at)
        from public.appointments a
        join public.services s on s.id = a.service_id
       where a.client_package_id = cp.id
    ), '[]'::jsonb),
    'payment_info', case when cp.status = 'pending_payment'
                         then app.setting('pago_movil') else null end
  )
  into v_r
  from public.client_packages cp
  join public.packages pk on pk.id = cp.package_id
  join public.clients  c  on c.id  = cp.client_id
  where cp.manage_token = p_token;

  if v_r is null then
    return jsonb_build_object('ok', false, 'error', 'not_found',
      'message', 'No encontramos ese paquete.');
  end if;
  return v_r;
end;
$$;

-- Cancelar la propia cita. Si venía de un bono, el crédito se devuelve.
create or replace function public.cancel_booking(p_token text, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_a      public.appointments%rowtype;
  v_notice int := (app.setting('min_notice_hours'))::int;
begin
  select * into v_a from public.appointments where manage_token = p_token for update;

  if v_a.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found',
      'message', 'No encontramos esa reserva.');
  end if;
  if v_a.status in ('cancelled', 'rejected', 'completed', 'no_show') then
    return jsonb_build_object('ok', false, 'error', 'not_cancellable',
      'message', 'Esa cita ya no se puede cancelar.');
  end if;
  if v_a.starts_at < now() + (v_notice || ' hours')::interval then
    return jsonb_build_object('ok', false, 'error', 'too_late',
      'message', 'Faltan menos de ' || v_notice ||
                 ' horas: escríbele a Daryeli por WhatsApp para reprogramar.');
  end if;

  update public.appointments
     set status = 'cancelled', cancelled_at = now(),
         cancel_reason = coalesce(p_reason, 'Cancelada por el cliente'),
         hold_expires_at = null
   where id = v_a.id;

  -- El crédito vuelve al bono. Si estaba agotado, revive.
  if v_a.client_package_id is not null then
    update public.client_packages
       set sessions_used = greatest(sessions_used - 1, 0),
           status = case when status = 'exhausted' then 'active'::public.package_status
                         else status end
     where id = v_a.client_package_id;
  end if;

  return jsonb_build_object('ok', true, 'message', 'Tu cita fue cancelada.');
end;
$$;


-- ============================================================
-- TAREAS PROGRAMADAS
-- ============================================================
-- Viven en el esquema app: las llama el cron con service_role, nunca el
-- público. No se les concede EXECUTE a nadie.

-- Libera los cupos cuya retención venció sin que llegara el comprobante.
create or replace function app.expire_holds()
returns int
language plpgsql security definer set search_path = ''
as $$
declare v_n int;
begin
  with vencidas as (
    update public.appointments
       set status = 'cancelled', cancelled_at = now(),
           cancel_reason = 'Retención vencida sin pago'
     where status = 'pending_payment'
       and hold_expires_at is not null
       and hold_expires_at < now()
    returning client_package_id
  )
  select count(*) into v_n from vencidas;

  -- Un paquete cuya primera cita expiró sin pagarse no debe quedar colgando.
  update public.client_packages
     set status = 'cancelled'
   where status = 'pending_payment'
     and not exists (
       select 1 from public.appointments a
        where a.client_package_id = public.client_packages.id
          and a.status in ('pending_payment', 'confirmed')
     );

  return v_n;
end;
$$;

-- Caduca los bonos pasados sus días de validez.
create or replace function app.expire_packages()
returns int
language plpgsql security definer set search_path = ''
as $$
declare v_n int;
begin
  with caducados as (
    update public.client_packages
       set status = 'expired'
     where status = 'active'
       and expires_at is not null
       and expires_at < now()
    returning 1
  )
  select count(*) into v_n from caducados;
  return v_n;
end;
$$;


-- ============================================================
-- EL PANEL: VERIFICAR UN PAGO
-- ============================================================
--
-- Solo para quien esté en admin_profiles. Es una función y no un UPDATE
-- suelto porque aprobar un pago dispara tres cosas a la vez que deben ocurrir
-- juntas o no ocurrir: marcar el pago, confirmar la cita y activar el bono
-- arrancando su caducidad.
create or replace function public.verify_payment(
  p_payment_id uuid,
  p_approve    boolean,
  p_reason     text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_p    public.payments%rowtype;
  v_dias int;
begin
  if not app.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden',
      'message', 'No tienes permiso para verificar pagos.');
  end if;

  select * into v_p from public.payments where id = p_payment_id for update;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found',
      'message', 'No encontramos ese pago.');
  end if;
  if v_p.status <> 'declared' then
    return jsonb_build_object('ok', false, 'error', 'already_resolved',
      'message', 'Ese pago ya fue revisado.');
  end if;

  if p_approve then
    update public.payments
       set status = 'verified', verified_at = now(), verified_by = (select auth.uid())
     where id = v_p.id;

    if v_p.appointment_id is not null then
      update public.appointments
         set status = 'confirmed', hold_expires_at = null
       where id = v_p.appointment_id;
    end if;

    if v_p.client_package_id is not null then
      -- La caducidad arranca AHORA, no cuando el cliente declaró el pago:
      -- los días que tardó la revisión no se los come él.
      select pk.valid_days into v_dias
        from public.packages pk
        join public.client_packages cp on cp.package_id = pk.id
       where cp.id = v_p.client_package_id;

      update public.client_packages
         set status = 'active', expires_at = now() + (v_dias || ' days')::interval
       where id = v_p.client_package_id;

      update public.appointments
         set status = 'confirmed', hold_expires_at = null
       where client_package_id = v_p.client_package_id
         and status = 'pending_payment';
    end if;

    return jsonb_build_object('ok', true, 'message', 'Pago verificado y cita confirmada.');
  end if;

  -- Rechazo: se libera el cupo y se anula el bono si lo había.
  update public.payments
     set status = 'rejected', verified_at = now(),
         verified_by = (select auth.uid()), reject_reason = p_reason
   where id = v_p.id;

  if v_p.appointment_id is not null then
    update public.appointments
       set status = 'rejected', cancelled_at = now(),
           cancel_reason = coalesce(p_reason, 'Comprobante no válido'),
           hold_expires_at = null
     where id = v_p.appointment_id;
  end if;

  if v_p.client_package_id is not null then
    update public.client_packages set status = 'rejected'
     where id = v_p.client_package_id;
    update public.appointments
       set status = 'rejected', cancelled_at = now(),
           cancel_reason = coalesce(p_reason, 'Comprobante no válido'),
           hold_expires_at = null
     where client_package_id = v_p.client_package_id
       and status in ('pending_payment', 'confirmed');
  end if;

  return jsonb_build_object('ok', true, 'message', 'Pago rechazado y cupo liberado.');
end;
$$;


-- ---------- PERMISOS ----------
-- Postgres concede EXECUTE a PUBLIC al crear cada función: se revoca todo y
-- se concede una por una. Las de app.* no se conceden a nadie.
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema app    from public, anon, authenticated;

-- Y que las funciones futuras tampoco nazcan abiertas.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema app    revoke execute on functions from public;

grant execute on function public.get_available_slots(text, date, date)                               to anon, authenticated;
grant execute on function public.create_booking(text, text, text, text, timestamptz, boolean, text)  to anon, authenticated;
grant execute on function public.buy_package(text, text, text, text, text, timestamptz, boolean)     to anon, authenticated;
grant execute on function public.book_from_package(text, text, timestamptz)                          to anon, authenticated;
grant execute on function public.submit_payment(text, text, text, date, numeric, numeric, text)      to anon, authenticated;
grant execute on function public.get_booking(text)                                                   to anon, authenticated;
grant execute on function public.get_package(text)                                                   to anon, authenticated;
grant execute on function public.cancel_booking(text, text)                                          to anon, authenticated;

-- Solo el panel.
grant execute on function public.verify_payment(uuid, boolean, text) to authenticated;
