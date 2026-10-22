-- ============================================================
-- DISPONIBILIDAD QUE PUEDE IGNORAR UNA CITA
--
-- Reprogramar plantea una pregunta distinta a reservar: no es "que huecos hay
-- libres" sino "que huecos habria libres si esta cita no existiera". Sin esa
-- distincion, la propia cita bloquea el horario que ocupa —mover al mismo hueco
-- fallaba— y, con sesiones largas, tambien los que solapa consigo misma: una
-- sesion de 90 minutos a las 10:00 no se podria mover a las 11:00.
--
-- El parametro lleva valor por defecto nulo, asi que las llamadas de
-- create_booking, buy_package y book_from_package siguen valiendo sin tocarlas.
-- ============================================================

drop function if exists public.get_available_slots(text, date, date, text);

create or replace function public.get_available_slots(
  p_service_slug text,
  p_from date,
  p_to   date,
  p_mode text default null,
  p_ignorar_cita uuid default null
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
          -- Al reprogramar la pregunta es otra: "que habria libre SI esta cita
          -- no existiera". Sin esto la propia cita bloquea su hueco y, con
          -- sesiones largas, tambien los que solapa consigo misma.
          and (p_ignorar_cita is null or a.id <> p_ignorar_cita)
          and tstzrange(a.starts_at, a.ends_at, '[)')
              && tstzrange(hu.comienza, hu.termina, '[)')
     )
   order by hu.comienza;
end;
$$;

grant execute on function public.get_available_slots(text, date, date, text, uuid) to anon, authenticated;

-- reschedule_booking pasa su propia cita para no estorbarse a si misma.
create or replace function public.reschedule_booking(
  p_token     text,
  p_starts_at timestamptz
)
returns jsonb
language plpgsql security definer set search_path = ''
as $r$
declare
  v_cita   public.appointments%rowtype;
  v_serv   public.services%rowtype;
  v_tz     text := app.setting('timezone') #>> '{}';
  v_termina timestamptz;
begin
  select * into v_cita from public.appointments where manage_token = p_token for update;
  if v_cita.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found',
      'message', 'No encontramos esa cita.');
  end if;

  if v_cita.status not in ('pending_payment', 'confirmed') then
    return jsonb_build_object('ok', false, 'error', 'estado_no_permite',
      'message', 'Esa cita ya no se puede mover. Escríbele a Daryeli.');
  end if;

  if v_cita.starts_at < now() then
    return jsonb_build_object('ok', false, 'error', 'ya_paso',
      'message', 'Esa cita ya pasó. Reserva una nueva.');
  end if;

  select * into v_serv from public.services where id = v_cita.service_id;

  -- El hueco nuevo se valida igual que uno recién reservado: mismo servicio,
  -- misma modalidad, misma antelación mínima y misma ventana.
  if not exists (
    select 1 from public.get_available_slots(
      v_serv.slug,
      (p_starts_at at time zone v_tz)::date,
      (p_starts_at at time zone v_tz)::date,
      v_cita.mode::text,
      v_cita.id
    ) as s(t) where s.t = p_starts_at
  ) then
    return jsonb_build_object('ok', false, 'error', 'slot_unavailable',
      'message', 'Ese horario no está disponible. Elige otro, por favor.');
  end if;

  v_termina := p_starts_at + (v_serv.duration_min || ' minutes')::interval;

  begin
    update public.appointments
       set starts_at = p_starts_at,
           ends_at   = v_termina
     where id = v_cita.id;
  exception when exclusion_violation then
    return jsonb_build_object('ok', false, 'error', 'slot_taken',
      'message', 'Alguien acaba de tomar ese horario. Elige otro, por favor.');
  end;

  return jsonb_build_object(
    'ok', true,
    'appointment', jsonb_build_object(
      'starts_at', p_starts_at, 'ends_at', v_termina,
      'service', v_serv.name, 'mode', v_cita.mode, 'status', v_cita.status
    )
  );
end;
$r$;

revoke execute on function public.reschedule_booking(text, timestamptz) from public;
grant  execute on function public.reschedule_booking(text, timestamptz) to anon, authenticated;
