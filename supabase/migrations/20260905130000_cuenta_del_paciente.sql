-- ============================================================
-- LA CUENTA DEL PACIENTE
--
-- Reservar exige cuenta. Esa decisión es la que hace que esta migración sea
-- tan corta, y conviene entender por qué antes de tocarla.
--
-- Si se pudiera reservar sin cuenta, una persona tendría fichas sueltas en
-- `clients` creadas al vuelo con el correo que escribió cada vez, y la cuenta
-- tendría que salir a reclamarlas después. Eso obligaba a emparejar cuenta y
-- ficha POR CORREO, y a exigir el correo confirmado para que nadie pudiera
-- registrarse con el correo ajeno y quedarse con el historial de consultas de
-- otro. Dos funciones más y la parte delicada de todo el asunto.
--
-- Exigiendo cuenta, nada de eso existe. La ficha nace ya colgada de la sesión
-- que la creó, así que aquí solo hace falta leer hacia atrás por `auth.uid()`.
-- Sin emparejar por correo, sin reclamar nada y sin depender de que alguien
-- haya abierto un enlace del buzón.
--
-- Se mantiene el patrón de seguridad del proyecto: RLS activo con políticas
-- solo de administración (`app.is_admin()`), ninguna tabla abierta al
-- paciente, y todo lo suyo por funciones `security definer` que validan por su
-- cuenta. Si mañana cambia qué puede ver un paciente se toca una función, no
-- N políticas.
--
-- OJO, ESTA MIGRACIÓN NO BASTA POR SÍ SOLA. Devuelve las consultas de la ficha
-- vinculada a la sesión, y hoy `create_booking` todavía crea fichas sueltas a
-- partir del correo escrito a mano. Hasta que esa función pase a sacar la
-- identidad de `auth.uid()`, mis_consultas() devolverá listas vacías. Eso va
-- en la migración siguiente; esta es la base y no rompe nada mientras tanto.
-- ============================================================


-- ------------------------------------------------------------
-- LA FICHA DE QUIEN ESTÁ DENTRO
--
-- Interna: no se concede a nadie, solo la usa la función de abajo. Devuelve
-- NULL si no hay sesión o si esa cuenta todavía no ha reservado nunca, y ese
-- NULL es lo que distingue "no has entrado" de "no tienes consultas".
-- ------------------------------------------------------------
create or replace function app.mi_ficha()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select c.id
    from public.clients c
   where c.auth_user_id = (select auth.uid());
$$;

revoke execute on function app.mi_ficha() from public, anon, authenticated;


-- ------------------------------------------------------------
-- MIS CONSULTAS
--
-- Devuelve las consultas de quien está dentro, separadas en próximas y
-- pasadas, que es como las pide la pantalla: la siguiente cita destacada
-- arriba y el historial debajo.
--
-- LO IMPORTANTE ES QUE DEVUELVE EL `manage_token` DE CADA UNA. Ese token es la
-- credencial que ya usan get_booking, cancel_booking y reschedule_booking, así
-- que la pantalla de la cuenta no necesita ni una función nueva para ver el
-- detalle, cancelar o reprogramar: reutiliza las tres que ya funcionan en la
-- página de reserva. Cero lógica de negocio duplicada, que era el objetivo.
--
-- Y no regala nada: ese token ya le llegó a la persona por correo el día que
-- reservó. Lo que hace la cuenta es ahorrarle ir a buscarlo.
-- ------------------------------------------------------------
create or replace function public.mis_consultas()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
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
           s.name as servicio, s.duration_min
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
$$;

revoke execute on function public.mis_consultas() from public, anon;
grant  execute on function public.mis_consultas() to authenticated;
