-- ============================================================
-- TASA DEL BCV, ACTUALIZADA SOLA
--
-- Quien paga por pago movil necesita saber CUANTOS BOLIVARES tiene que
-- transferir. Hasta ahora la pantalla decia "30 $ en su equivalente en
-- bolivares" y ahi acababa: la persona tenia que abrir otra pestana, buscar la
-- tasa y multiplicar. Ese es justo el punto donde se abandona una reserva.
--
-- POR QUE NO SE CONSULTA DESDE EL NAVEGADOR:
--   1. Si la fuente se cae o bloquea CORS, la pantalla de pago se rompe en el
--      peor momento posible.
--   2. Una tasa que cambia segun cuando la busque cada visitante genera
--      discusiones sobre cuanto habia que pagar. La tasa la fija el servidor,
--      igual que el precio.
--
-- La fuente es ve.dolarapi.com, que publica la tasa oficial del BCV en JSON.
-- El BCV no ofrece API propia: su web es HTML y su certificado falla a menudo.
-- Si la fuente no responde, NO se toca la tasa guardada: mejor una de ayer que
-- ninguna.
-- ============================================================

create extension if not exists http with schema extensions;

insert into public.settings (key, value) values
  ('usd_rate',        '0'::jsonb),
  ('usd_rate_at',     'null'::jsonb),
  ('usd_rate_source', '"ve.dolarapi.com · BCV"'::jsonb)
on conflict (key) do nothing;

create or replace function app.refrescar_tasa()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_resp   extensions.http_response;
  v_json   jsonb;
  v_tasa   numeric;
  v_fecha  timestamptz;
begin
  begin
    select * into v_resp
      from extensions.http(('GET',
        'https://ve.dolarapi.com/v1/dolares/oficial',
        array[extensions.http_header('User-Agent','psicconsciente/1.0')],
        null, null)::extensions.http_request);
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'sin_respuesta');
  end;

  if v_resp.status <> 200 then
    return jsonb_build_object('ok', false, 'error', 'http_' || v_resp.status);
  end if;

  begin
    v_json := v_resp.content::jsonb;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'json_invalido');
  end;

  -- "promedio" es la tasa oficial; "venta" queda de respaldo por si cambian el
  -- formato. Una tasa de cero o negativa se descarta: seria peor que no tener.
  v_tasa  := coalesce((v_json->>'promedio')::numeric, (v_json->>'venta')::numeric);
  v_fecha := (v_json->>'fechaActualizacion')::timestamptz;

  if v_tasa is null or v_tasa <= 0 then
    return jsonb_build_object('ok', false, 'error', 'tasa_invalida');
  end if;

  update public.settings set value = to_jsonb(v_tasa)  where key = 'usd_rate';
  update public.settings set value = to_jsonb(v_fecha) where key = 'usd_rate_at';

  return jsonb_build_object('ok', true, 'rate', v_tasa, 'at', v_fecha);
end;
$$;

-- ------------------------------------------------------------
-- Lo que ve el publico. Devuelve solo la tasa y su fecha: ningun dato sensible,
-- y asi el navegador no necesita leer la tabla settings, que sigue cerrada.
-- ------------------------------------------------------------
create or replace function public.get_exchange_rate()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'rate',   nullif((app.setting('usd_rate'))::numeric, 0),
    'at',     app.setting('usd_rate_at') #>> '{}',
    'source', app.setting('usd_rate_source') #>> '{}'
  );
$$;

revoke execute on function app.refrescar_tasa()      from public, anon, authenticated;
revoke execute on function public.get_exchange_rate() from public;
grant  execute on function public.get_exchange_rate() to anon, authenticated;

-- Primera carga, para no quedarse esperando al cron.
select app.refrescar_tasa();
