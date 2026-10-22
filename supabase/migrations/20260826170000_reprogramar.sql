-- ============================================================
-- REPROGRAMAR UNA CITA
--
-- Quien no puede el jueves a las 9 muchas veces sí puede el viernes a las 11.
-- Obligarle a cancelar y empezar de cero es donde se pierden las citas, y ahora
-- importa el doble: sin retención ni pago por delante, cancelar no le cuesta
-- nada a nadie, así que hay que hacer que mover la cita sea aún más fácil que
-- abandonarla.
--
-- El movimiento es una sola sentencia UPDATE a propósito. Liberar el hueco viejo
-- y tomar el nuevo en dos pasos dejaría una ventana —por breve que sea— en la
-- que otra persona podría colarse en el horario que se acaba de soltar, y la
-- cita se quedaría sin sitio al que volver.
-- ============================================================

create or replace function public.reschedule_booking(
  p_token     text,
  p_starts_at timestamptz
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
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
      v_cita.mode::text
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
$$;

revoke execute on function public.reschedule_booking(text, timestamptz) from public;
grant  execute on function public.reschedule_booking(text, timestamptz) to anon, authenticated;
