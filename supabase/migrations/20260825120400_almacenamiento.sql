-- ============================================================
-- 0005 — Bucket privado de comprobantes
--
-- Las capturas del pago móvil son el archivo más sensible del sistema:
-- llevan cédula, teléfono, banco y saldo de quien paga. Y como es una
-- consulta de psicología, la mera existencia del archivo revela que esa
-- persona va a terapia.
--
-- Por eso el bucket es privado y NADIE tiene acceso directo:
--   · anon          -> sin política alguna. No sube ni lee.
--   · authenticated -> solo lectura, y solo si está en admin_profiles.
--   · service_role  -> escribe, desde las Edge Functions.
--
-- El cliente nunca escribe directo en el bucket. Pide permiso a la Edge
-- Function upload-proof-url, que valida su manage_token contra la base de
-- datos y le devuelve una URL de subida firmada para UNA ruta concreta. Sin
-- token válido no hay subida, y una URL firmada no sirve para subir a otro
-- sitio ni para leer nada.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,                      -- privado: sin esto, la URL del archivo sería pública
  5242880,                    -- 5 MB: una captura de móvil no pesa más
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


-- Daryeli ve los comprobantes desde el panel. Su sesión genera enlaces
-- firmados de vida corta; el archivo nunca queda accesible por URL directa.
create policy comprobantes_lectura_admin
  on storage.objects for select
  to authenticated
  using (bucket_id = 'payment-proofs' and app.is_admin());

-- Puede borrar un comprobante concreto — por ejemplo uno rechazado que no
-- tiene sentido conservar. El borrado masivo por antigüedad lo hace el cron
-- purge-proofs con service_role.
create policy comprobantes_borrado_admin
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'payment-proofs' and app.is_admin());

-- No se crea ninguna política de INSERT ni de UPDATE. Es deliberado: sin
-- política, PostgREST y el API de Storage rechazan la operación. La única vía
-- de escritura es service_role desde la Edge Function, que sí valida quién
-- está subiendo.
