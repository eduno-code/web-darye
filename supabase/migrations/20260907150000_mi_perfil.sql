-- ============================================================
-- MI PERFIL
--
-- Devuelve la ficha de quien está dentro. Existe por una razón muy concreta:
-- desde que reservar exige cuenta, el paso "tus datos" dejó de tener sentido
-- como formulario —pregunta lo que ya sabemos— y pasa a ser un resumen: a
-- nombre de quién va la cita y a qué teléfono llamará Daryeli si hay que
-- moverla. Para enseñar eso hace falta poder leerlo, y hasta ahora ninguna
-- función devolvía la propia ficha.
--
-- POR QUÉ UNA FUNCIÓN Y NO ABRIR LA TABLA. Sería más corto dar un select sobre
-- clients con una política que compare auth_user_id, pero eso abre la tabla
-- entera: cualquier columna que se añada mañana queda legible sin que nadie lo
-- decida. Con una función se devuelve exactamente lo que la pantalla necesita,
-- y ampliar la lista es un acto deliberado. Es el mismo criterio que sigue todo
-- el proyecto y por el que ninguna tabla de pacientes está abierta.
--
-- NO DEVUELVE EL id DE LA FICHA. El navegador no lo necesita para nada: todas
-- las funciones deducen de quién son por la sesión. Un identificador que se
-- entrega sin usarse es superficie de ataque regalada.
--
-- Y NO HACE FALTA UNA FUNCIÓN PARA ESCRIBIR. Corregir el nombre o el teléfono
-- se hace actualizando los metadatos de la cuenta y volviendo a llamar a
-- asegurar_mi_ficha(), que ya sabe copiarlos a la ficha validándolos. Una
-- función menos que mantener, y una sola definición de qué es un nombre válido.
-- ============================================================

create or replace function public.mi_perfil()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $func$
declare
  v_c public.clients%rowtype;
begin
  if (select auth.uid()) is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in',
      'message', 'Entra en tu cuenta para ver tus datos.');
  end if;

  select * into v_c from public.clients c where c.id = app.mi_ficha();

  -- Cuenta sin ficha. Se distingue de "no has entrado" a propósito: la pantalla
  -- tiene que poder mandar a completar los datos en vez de mandar a entrar otra
  -- vez a quien ya está dentro.
  if v_c.id is null then
    return jsonb_build_object('ok', false, 'error', 'perfil_incompleto',
      'message', 'Nos falta completar tus datos.');
  end if;

  return jsonb_build_object(
    'ok',           true,
    'nombre',       v_c.full_name,
    'correo',       v_c.email,
    'telefono',     v_c.phone,
    'nacionalidad', v_c.nationality,
    'pais',         v_c.country
  );
end;
$func$;

revoke execute on function public.mi_perfil() from public, anon;
grant  execute on function public.mi_perfil() to authenticated;
