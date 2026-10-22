-- ============================================================
-- LO QUE LA CUENTA TIENE QUE PODER VER
--
-- La pantalla de "Mis consultas" necesita dos cosas que hoy no se pueden
-- preguntar: en qué anda el pago de cada cita, y qué bonos tiene comprados.
--
-- No hace falta nada para ESCRIBIR. Cancelar y reprogramar ya existen y van con
-- el manage_token, que mis_consultas() devuelve en cada cita; la pantalla de la
-- cuenta se limita a enlazar a reservar/?cita=TOKEN, que ya sabe hacer todo eso.
-- Toda esta migración es de lectura.
-- ============================================================


-- ============================================================
-- 1 · MIS CONSULTAS, AHORA CON EL ESTADO DEL PAGO
-- ============================================================
--
-- EL PROBLEMA QUE ARREGLA. Una cita de prepago nace 'pending_payment' y SIGUE
-- siendo 'pending_payment' después de que la persona declare su pago móvil: solo
-- cambia cuando Daryeli verifica el comprobante, que puede tardar horas. En ese
-- rato, una lista que solo mire el estado de la cita le dice "Pendiente de pago"
-- a alguien que ya pagó. Suena a reproche, y encima invita a pagar dos veces.
--
-- Con el estado del pago al lado, la pantalla puede decir "Comprobante en
-- revisión", que es la verdad y además tranquiliza.
--
-- LAS DOS VÍAS DEL PAGO. Un pago cuelga de la cita O del bono, nunca de los dos
-- —lo impone el check payments_un_solo_destino—. Así que una cita pagada suelta
-- se busca por appointment_id, y una que salió de un bono por el
-- client_package_id de ese bono. Mirar solo la primera vía dejaría sin estado a
-- todas las citas de paquete, que son justo las que más tardan en confirmarse.
create or replace function public.mis_consultas()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $func$
declare
  v_ficha    uuid;
  v_proximas jsonb;
  v_pasadas  jsonb;
begin
  if (select auth.uid()) is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in',
      'message', 'Entra en tu cuenta para ver tus consultas.');
  end if;

  v_ficha := app.mi_ficha();

  -- Cuenta recién creada que aún no ha reservado. No es un error: es la
  -- pantalla vacía, y la pantalla necesita saber distinguirla de un fallo.
  if v_ficha is null then
    return jsonb_build_object('ok', true, 'proximas', '[]'::jsonb, 'pasadas', '[]'::jsonb);
  end if;

  with mias as (
    select a.id, a.starts_at, a.ends_at, a.status, a.price_usd, a.mode,
           a.manage_token, a.cancelled_at, a.hold_expires_at,
           a.client_package_id,
           s.name as servicio, s.duration_min,
           (select p.status::text
              from public.payments p
             where (a.client_package_id is null  and p.appointment_id    = a.id)
                or (a.client_package_id is not null and p.client_package_id = a.client_package_id)
             order by p.created_at desc
             limit 1) as pago
      from public.appointments a
      join public.services s on s.id = a.service_id
     where a.client_id = v_ficha
  )
  select
    /* Próxima = todavía no ha empezado y no está cancelada. Se ordena hacia
       adelante: la primera de la lista es la que toca. */
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'starts_at', m.starts_at, 'ends_at', m.ends_at,
               'servicio', m.servicio, 'duracion', m.duration_min,
               'modalidad', m.mode::text, 'estado', m.status::text,
               'precio_usd', m.price_usd, 'token', m.manage_token,
               'de_paquete', m.client_package_id is not null,
               'pago', m.pago,
               'reserva_vence', m.hold_expires_at
             ) order by m.starts_at asc)
        from mias m
       where m.cancelled_at is null
         and m.starts_at >= now()
    ), '[]'::jsonb),

    /* Pasada = ya ocurrió, o se canceló. Se ordena hacia atrás: lo más
       reciente arriba, que es lo que se busca en un historial. */
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'starts_at', m.starts_at, 'ends_at', m.ends_at,
               'servicio', m.servicio, 'duracion', m.duration_min,
               'modalidad', m.mode::text, 'estado', m.status::text,
               'precio_usd', m.price_usd, 'token', m.manage_token,
               'de_paquete', m.client_package_id is not null,
               'pago', m.pago,
               'cancelada_el', m.cancelled_at
             ) order by m.starts_at desc)
        from mias m
       where m.cancelled_at is not null
          or m.starts_at < now()
    ), '[]'::jsonb)
  into v_proximas, v_pasadas;

  return jsonb_build_object(
    'ok', true,
    'proximas', v_proximas,
    'pasadas', v_pasadas
  );
end;
$func$;

revoke execute on function public.mis_consultas() from public, anon;
grant  execute on function public.mis_consultas() to authenticated;


-- ============================================================
-- 2 · MIS PAQUETES
-- ============================================================
--
-- Los bonos comprados, con su saldo. Sin esto, alguien que compró cuatro
-- sesiones no tiene forma de saber cuántas le quedan ni cuándo caducan: el dato
-- existe pero solo se alcanza con get_package(token), y ese token está en un
-- correo de hace semanas.
--
-- SE DEVUELVE EL manage_token igual que en las citas, y por el mismo motivo: es
-- la credencial que ya usan get_package y create_booking, así que la pantalla
-- puede enlazar a lo que ya funciona sin una sola función nueva. Y no regala
-- nada: ese token le llegó a la persona por correo el día que compró.
--
-- SE ENSEÑAN TAMBIÉN LOS CADUCADOS Y AGOTADOS, no solo los activos. Un bono que
-- se acabó de usar explica dónde fueron cuatro sesiones del historial; uno que
-- caducó sin gastarse explica una pregunta que si no acabaría en el WhatsApp de
-- Daryeli. Ordenados por fecha de compra, lo último arriba.
create or replace function public.mis_paquetes()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $func$
declare
  v_ficha uuid;
  v_lista jsonb;
begin
  if (select auth.uid()) is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in',
      'message', 'Entra en tu cuenta para ver tus paquetes.');
  end if;

  v_ficha := app.mi_ficha();

  if v_ficha is null then
    return jsonb_build_object('ok', true, 'paquetes', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id',             cp.id,
           'nombre',         pk.name,
           'modalidad',      cp.modality::text,
           'sesiones_total', cp.sessions_total,
           'sesiones_usadas', cp.sessions_used,
           /* Se calcula aquí y no en el navegador: la resta es la misma, pero
              así solo hay un sitio donde pueda estar mal. */
           'sesiones_libres', cp.sessions_total - cp.sessions_used,
           'estado',         cp.status::text,
           'caduca',         cp.expires_at,
           'precio_usd',     cp.price_usd,
           'comprado_el',    cp.purchased_at,
           'token',          cp.manage_token,
           /* Mismo criterio que en las citas: mientras el pago no esté
              verificado, el bono no se puede usar y conviene decir por qué. */
           'pago', (select p.status::text
                      from public.payments p
                     where p.client_package_id = cp.id
                     order by p.created_at desc
                     limit 1)
         ) order by cp.purchased_at desc), '[]'::jsonb)
    into v_lista
    from public.client_packages cp
    join public.packages pk on pk.id = cp.package_id
   where cp.client_id = v_ficha;

  return jsonb_build_object('ok', true, 'paquetes', v_lista);
end;
$func$;

revoke execute on function public.mis_paquetes() from public, anon;
grant  execute on function public.mis_paquetes() to authenticated;
