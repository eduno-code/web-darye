-- ============================================================
-- LA IDENTIDAD SALE DE LA SESIÓN, NO DEL FORMULARIO
--
-- Hasta hoy, reservar funcionaba así: la persona escribía su nombre, su correo
-- y su teléfono, y la base creaba o actualizaba una ficha BUSCANDO POR EL
-- CORREO ESCRITO. Nadie comprobaba nada, porque las funciones estaban abiertas
-- a `anon`. Escribir el correo de otra persona bastaba para apuntarle una cita
-- a ella, y la cita quedaba colgada de un correo en lugar de una cuenta — por
-- eso mis_consultas() devolvía siempre listas vacías.
--
-- A partir de aquí la identidad la pone `auth.uid()`. El formulario deja de ser
-- una fuente de verdad sobre quién eres y pasa a ser lo que siempre debió ser:
-- una manera de elegir día y hora.
--
-- QUÉ CAMBIA, UNA LÍNEA CADA COSA:
--   · asegurar_mi_ficha()   nueva. Crea la ficha de quien acaba de entrar.
--   · create_booking()      pierde nombre/correo/teléfono y el acceso anónimo.
--   · buy_package()         lo mismo.
--   · book_from_package()   ahora comprueba que el bono sea tuyo.
--   · tiene_historial() y citas_sin_pagar() se miden por ficha y no por correo
--     y teléfono, con lo que dejan de esquivarse cambiando de correo.
--
-- LO QUE NO SE TOCA: get_booking, cancel_booking y reschedule_booking siguen
-- funcionando con el manage_token. Ese token viaja en el correo de
-- confirmación y tiene que servir aunque quien abra el enlace no tenga la
-- sesión iniciada en ese navegador. Cambiarlas ahora rompería el único camino
-- que hoy existe para gestionar una cita.
--
-- Y NO SE HACE UN REVOKE EN BLOQUE. La migración de 20260826160000 revocó
-- todas las funciones del esquema para volver a concederlas una por una, y en
-- esa lista se olvidó verify_payment: Daryeli lleva desde agosto sin poder
-- aprobar un comprobante. Aquí se revoca solo lo que se quiere cerrar, con
-- nombre y apellidos.
-- ============================================================


-- ============================================================
-- 1 · LA FICHA NACE DE LA CUENTA
-- ============================================================
--
-- Se llama justo después de registrarse, y también después de cada inicio de
-- sesión. Lo segundo no es redundancia: si la llamada posterior al registro se
-- pierde — se cae la red, se cierra la pestaña —, quedaría una cuenta sin ficha
-- y una persona que no puede reservar sin saber por qué. Llamándola también al
-- entrar, el sistema se repara solo en el siguiente intento.
--
-- NO RECIBE PARÁMETROS A PROPÓSITO. Los datos extra — teléfono, nacionalidad,
-- país — viajan en los metadatos del registro (el `options.data` de signUp) y
-- se leen de auth.users. Si se pasaran por parámetro habría que reenviarlos en
-- cada llamada y guardarlos en el navegador mientras tanto; leyéndolos de su
-- sitio, la función se puede repetir cuantas veces haga falta y siempre
-- reconstruye lo mismo.
--
-- ESOS METADATOS SON TEXTO QUE ESCRIBIÓ EL USUARIO, así que se validan aquí con
-- las mismas reglas que la tabla. El correo es la excepción, y por eso es el
-- único dato que NO sale de los metadatos: se toma de auth.users, que es donde
-- lo puso el sistema de autenticación.
create or replace function public.asegurar_mi_ficha()
returns jsonb
language plpgsql security definer set search_path = ''
as $func$
declare
  v_uid    uuid := (select auth.uid());
  v_correo text;
  v_meta   jsonb;
  v_nombre text;
  v_tel    text;
  v_nac    text;
  v_pais   text;
  v_id     uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in',
      'message', 'Entra en tu cuenta antes de continuar.');
  end if;

  select u.email, coalesce(u.raw_user_meta_data, '{}'::jsonb)
    into v_correo, v_meta
    from auth.users u
   where u.id = v_uid;

  if v_correo is null then
    return jsonb_build_object('ok', false, 'error', 'no_email',
      'message', 'Tu cuenta no tiene un correo asociado.');
  end if;

  v_nombre := btrim(coalesce(v_meta ->> 'nombre', ''));
  v_tel    := btrim(coalesce(v_meta ->> 'telefono', ''));
  v_nac    := upper(btrim(coalesce(v_meta ->> 'nacionalidad', '')));
  v_pais   := upper(btrim(coalesce(v_meta ->> 'pais', '')));

  if length(v_nombre) < 2 or length(v_nombre) > 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name',
      'message', 'Escribe tu nombre completo.');
  end if;

  if length(v_tel) < 7 or length(v_tel) > 20 then
    return jsonb_build_object('ok', false, 'error', 'invalid_phone',
      'message', 'Escribe un teléfono de contacto.');
  end if;

  -- Dos letras mayúsculas o nada. Un código inventado se rechaza en vez de
  -- guardarse: una tarifa mal calculada es peor que un registro que falla.
  if v_nac !~ '^[A-Z]{2}$' or v_pais !~ '^[A-Z]{2}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_country',
      'message', 'Elige tu nacionalidad y el país donde vives.');
  end if;

  select c.id into v_id
    from public.clients c
   where c.auth_user_id = v_uid;

  if v_id is null then
    -- Una ficha con este correo pero sin cuenta detrás solo puede venir de las
    -- reservas anónimas de antes. NO se reclama automáticamente: mientras la
    -- confirmación de correo esté desactivada, cualquiera podría registrarse
    -- con el correo ajeno y heredar el historial de consultas de otra persona.
    -- Es exactamente el agujero que evitamos exigiendo cuenta, y no se abre por
    -- la puerta de atrás. Se avisa y lo resuelve Daryeli a mano — que en la
    -- práctica no va a pasar nunca, porque la tabla está vacía.
    if exists (
      select 1 from public.clients c
       where lower(btrim(c.email)) = app.norm_email(v_correo)
    ) then
      return jsonb_build_object('ok', false, 'error', 'correo_en_uso',
        'message', 'Ya existe una ficha con ese correo. Escríbele a Daryeli para unirla a tu cuenta.');
    end if;

    insert into public.clients (full_name, email, phone, nationality, country, auth_user_id)
    values (v_nombre, app.norm_email(v_correo), v_tel, v_nac, v_pais, v_uid)
    returning id into v_id;
  else
    -- Repetir la llamada refresca los datos. Es lo que hace que cambiar el
    -- teléfono en el perfil se note, sin escribir una función aparte.
    update public.clients
       set full_name   = v_nombre,
           phone       = v_tel,
           nationality = v_nac,
           country     = v_pais
     where id = v_id;
  end if;

  return jsonb_build_object('ok', true, 'ficha', v_id);
end;
$func$;

revoke execute on function public.asegurar_mi_ficha() from public, anon;
grant  execute on function public.asegurar_mi_ficha() to authenticated;


-- ============================================================
-- 2 · LOS LÍMITES SE MIDEN POR FICHA
-- ============================================================
--
-- Las versiones viejas recibían (correo, teléfono) y buscaban fichas que
-- coincidieran en cualquiera de los dos. Servían mientras no hubiera cuentas,
-- pero se esquivaban solas: bastaba escribir otro correo para recuperar el cupo
-- entero. Con la ficha atada a la sesión, el límite es un límite.

drop function if exists app.tiene_historial(text, text);
drop function if exists app.citas_sin_pagar(text, text);

-- ¿Ha venido antes? Cuenta como historial cualquier cita que no se anulara,
-- presencial u online: un paciente de siempre que quiere una videollamada no es
-- un desconocido.
create or replace function app.tiene_historial(p_client uuid)
returns boolean
language sql stable security definer set search_path = ''
as $func$
  select exists (
    select 1 from public.appointments a
     where a.client_id = p_client
       and a.cancelled_at is null
       and a.starts_at < now()
  );
$func$;

-- Citas futuras reservadas y sin pagar. Frena a quien va llenando la agenda sin
-- intención de aparecer.
create or replace function app.citas_sin_pagar(p_client uuid)
returns int
language sql stable security definer set search_path = ''
as $func$
  select count(*)::int from public.appointments a
   where a.client_id = p_client
     and a.status = 'pending_payment'
     and a.cancelled_at is null
     and a.starts_at >= now();
$func$;

revoke execute on function app.tiene_historial(uuid) from public, anon, authenticated;
revoke execute on function app.citas_sin_pagar(uuid) from public, anon, authenticated;


-- ============================================================
-- 3 · RESERVAR
-- ============================================================
--
-- La firma pierde tres parámetros y gana una precondición. Lo que antes se
-- preguntaba ahora se sabe.
--
-- Se conserva el captcha aunque exigir cuenta ya frena a la mayoría de los
-- scripts: quitar una defensa en la misma migración que cambia la identidad
-- sería cambiar dos cosas a la vez y no saber cuál falló. Si más adelante
-- estorba, se retira sola.

drop function if exists public.create_booking(text, text, text, text, timestamptz, boolean, text, text, boolean, text);

create or replace function public.create_booking(
  p_service_slug         text,
  p_starts_at            timestamptz,
  p_consent              boolean,
  p_mode                 text default 'online',
  p_client_package_token text default null,
  p_pago_ahora           boolean default true,
  p_captcha              text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $func$
declare
  v_serv    public.services%rowtype;
  v_cliente uuid;
  v_cita    uuid;
  v_token   text;
  v_termina timestamptz;
  v_version text := app.setting('consent_version') #>> '{}';
  v_bono    public.client_packages%rowtype;
  v_precio  numeric(10,2);
  v_vence   timestamptz;
  v_modo    public.session_mode;
  v_prepago boolean;
  v_pendientes int;
begin
  -- LO PRIMERO, ANTES QUE NADA: ¿quién eres? Sin sesión no hay reserva, y se
  -- dice con un error propio para que la pantalla sepa mandar a /entrar y
  -- volver al mismo hueco, en vez de enseñar un fallo genérico.
  if (select auth.uid()) is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in',
      'message', 'Entra en tu cuenta para reservar tu consulta.');
  end if;

  v_cliente := app.mi_ficha();

  -- Cuenta sin ficha. No debería pasar —asegurar_mi_ficha() corre al registrar
  -- y al entrar— pero si pasa, se dice qué falta en vez de fallar al insertar.
  if v_cliente is null then
    return jsonb_build_object('ok', false, 'error', 'perfil_incompleto',
      'message', 'Nos falta completar tus datos antes de reservar.');
  end if;

  if p_consent is not true then
    return jsonb_build_object('ok', false, 'error', 'consent_required',
      'message', 'Hay que aceptar el consentimiento informado para reservar.');
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

  if not app.captcha_ok(p_captcha) then
    return jsonb_build_object('ok', false, 'error', 'captcha_failed',
      'message', 'No pudimos verificar que eres una persona. Recarga la página e inténtalo otra vez.');
  end if;

  -- Ahora el tope cuenta las citas DE ESTA FICHA. Antes se contaban las del
  -- correo escrito, así que se reiniciaba escribiendo otro.
  v_pendientes := app.citas_sin_pagar(v_cliente);
  if v_pendientes >= (app.setting('max_citas_sin_pagar'))::int then
    return jsonb_build_object('ok', false, 'error', 'demasiadas_sin_pagar',
      'message', 'Ya tienes ' || v_pendientes || ' citas reservadas sin pagar. Paga alguna o escríbele a Daryeli antes de reservar otra.');
  end if;

  /* Prepago obligatorio: sesión ONLINE de alguien SIN historial.
     La asimetría que lo justifica: si un desconocido reserva presencial y no
     aparece, Daryeli perdió una hora pero no le dio nada. Si hace la sesión
     online, recibió el servicio completo y ella no tiene ningún resorte para
     cobrar. Se mide contra el historial ENTERO, no el online: un paciente
     presencial de siempre que quiere una videollamada no es un desconocido. */
  v_prepago := (v_modo = 'online')
               and not app.tiene_historial(v_cliente)
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

  if p_client_package_token is not null then
    select * into v_bono from public.client_packages
     where manage_token = p_client_package_token for update;

    if v_bono.id is null then
      return jsonb_build_object('ok', false, 'error', 'unknown_package',
        'message', 'No encontramos ese paquete.');
    end if;

    -- NUEVO: el bono tiene que ser TUYO. Antes la cita se apuntaba al dueño del
    -- bono viniera de donde viniera el token, porque no había forma de saber
    -- quién llamaba. Ahora sí la hay, y un token que se filtre no sirve para
    -- gastarle las sesiones a su dueño.
    if v_bono.client_id <> v_cliente then
      return jsonb_build_object('ok', false, 'error', 'package_not_yours',
        'message', 'Ese paquete no está a tu nombre.');
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

    v_precio := round(v_bono.price_usd / v_bono.sessions_total, 2);
    v_vence  := null;
  else
    v_precio := v_serv.price_usd;      -- el precio SIEMPRE de la tabla
    /* Solo las citas de prepago obligatorio caducan, y por eso mismo: si no
       caducaran, el hueco quedaría ocupado por alguien que nunca pagó. El resto
       no tiene retención — el horario es suyo desde el primer segundo. */
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
         cuenta. La excepción es el prepago obligatorio, donde la cita nace
         pendiente porque si no, exigir el pago por adelantado no significaría
         nada: el hueco ya sería suyo sin haber pagado. */
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
$func$;


-- ============================================================
-- 4 · COMPRAR UN BONO
-- ============================================================
--
-- Mismo tratamiento que reservar: la identidad sale de la sesión. Se reescribe
-- entera y no solo la cabecera porque su versión vigente es de antes de que
-- existiera app.mi_ficha(), y dejarla a medias sería peor que rehacerla.

drop function if exists public.buy_package(text, text, text, text, text, timestamptz, boolean, text);

create or replace function public.buy_package(
  p_package_slug text,
  p_service_slug text,
  p_starts_at    timestamptz,
  p_consent      boolean,
  p_mode         text default 'online'
)
returns jsonb
language plpgsql security definer set search_path = ''
as $func$
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
  if (select auth.uid()) is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in',
      'message', 'Entra en tu cuenta para comprar un paquete.');
  end if;

  v_cliente := app.mi_ficha();
  if v_cliente is null then
    return jsonb_build_object('ok', false, 'error', 'perfil_incompleto',
      'message', 'Nos falta completar tus datos antes de comprar.');
  end if;

  if p_consent is not true then
    return jsonb_build_object('ok', false, 'error', 'consent_required',
      'message', 'Hay que aceptar el consentimiento informado para reservar.');
  end if;

  begin
    v_modo := coalesce(p_mode, 'online')::public.session_mode;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'error', 'invalid_mode',
      'message', 'Elige si la sesión es online o presencial.');
  end;

  select * into v_paq from public.packages where slug = p_package_slug and active;
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

  insert into public.client_packages (
    client_id, package_id, modality, sessions_total, sessions_used, price_usd, status
  ) values (
    v_cliente, v_paq.id, v_paq.modality, v_paq.sessions_count, 1, v_paq.price_usd, 'pending_payment'
  )
  returning id, manage_token into v_bono, v_bonotok;

  v_termina := p_starts_at + (v_serv.duration_min || ' minutes')::interval;
  -- OJO: hold_minutes vale 0 desde 20260826130000, que es como Edgar apagó la
  -- retención del cupo. Con 0 esto tiene que quedarse en NULL, no en "ahora
  -- mismo": expire_holds ignora los nulos, pero una fecha ya pasada haría que
  -- la tarea de las tareas programadas cancelara la compra a los cinco minutos.
  -- El case no es decorativo, es lo que impide ese desastre.
  v_vence  := case when v_hold > 0
                   then now() + (v_hold || ' minutes')::interval
                   else null end;

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

  -- La forma de la respuesta se conserva EXACTA. reservar.js lee estos nombres
  -- por su nombre, y esta migración cambia quién puede llamar, no qué contesta.
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
$func$;


-- ============================================================
-- 5 · USAR UNA SESIÓN DEL BONO
-- ============================================================
--
-- Esta no cambia de firma: el token del paquete sigue siendo la manera de
-- decir de qué bono se descuenta. Lo que cambia es que ahora, además, hay que
-- ser su dueño. El token dejó de ser la única prueba de nada.

create or replace function public.book_from_package(
  p_package_token text,
  p_service_slug  text,
  p_starts_at     timestamptz,
  p_mode          text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $func$
declare
  v_bono    public.client_packages%rowtype;
  v_serv    public.services%rowtype;
  v_cliente uuid;
  v_cita    uuid;
  v_citatok text;
  v_termina timestamptz;
  v_version text := app.setting('consent_version') #>> '{}';
  v_modo    public.session_mode;
begin
  if (select auth.uid()) is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in',
      'message', 'Entra en tu cuenta para usar tu paquete.');
  end if;

  v_cliente := app.mi_ficha();
  if v_cliente is null then
    return jsonb_build_object('ok', false, 'error', 'perfil_incompleto',
      'message', 'Nos falta completar tus datos antes de reservar.');
  end if;

  select * into v_bono from public.client_packages
   where manage_token = p_package_token for update;

  if v_bono.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_package',
      'message', 'No encontramos ese paquete.');
  end if;

  -- El mismo mensaje que "no existe", a propósito. Decir "existe pero no es
  -- tuyo" le confirmaría a quien prueba tokens al azar que acertó con uno.
  if v_bono.client_id <> v_cliente then
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
$func$;


-- ============================================================
-- 6 · QUIÉN PUEDE LLAMAR A QUÉ
-- ============================================================
--
-- Las tres funciones que crean citas pierden `anon`. Es el cambio que hace que
-- "hay que tener cuenta para reservar" sea una regla del sistema y no una
-- costumbre de la pantalla: aunque alguien llame a la API a mano, sin sesión no
-- pasa de aquí.
--
-- LO QUE SIGUE ABIERTO A VISITANTES, y por qué:
--   · get_available_slots  · los horarios libres se ven antes de decidir nada.
--     Cerrarlos obligaría a registrarse para mirar, que es justo el paso que no
--     queremos poner por delante.
--   · get_exchange_rate, get_consultorio, reference_taken  · datos públicos.
--   · get_booking, cancel_booking, reschedule_booking, submit_payment  · van
--     con manage_token, y ese enlace tiene que abrirse desde el correo aunque
--     no haya sesión en ese navegador.

revoke execute on function public.create_booking(text, timestamptz, boolean, text, text, boolean, text) from public, anon;
grant  execute on function public.create_booking(text, timestamptz, boolean, text, text, boolean, text) to authenticated;

revoke execute on function public.buy_package(text, text, timestamptz, boolean, text) from public, anon;
grant  execute on function public.buy_package(text, text, timestamptz, boolean, text) to authenticated;

revoke execute on function public.book_from_package(text, text, timestamptz, text) from public, anon;
grant  execute on function public.book_from_package(text, text, timestamptz, text) to authenticated;
