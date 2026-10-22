-- ============================================================
-- 0004 — Datos iniciales
--
-- Todo lo de aquí es editable desde el panel. Son los valores de arranque,
-- no constantes del sistema: si Daryeli sube la tarifa o cambia su horario,
-- lo hace ella sin tocar código ni volver a desplegar.
-- ============================================================


-- ---------- SERVICIOS ----------
-- Los cuatro de la landing. Ansiedad, autoestima y duelo son individuales:
-- misma duración y mismo precio. Pareja va aparte porque dura más.
insert into public.services (slug, name, modality, duration_min, price_usd, sort_order) values
  ('ansiedad',   'Superar la Ansiedad',        'individual', 60, 30.00, 1),
  ('autoestima', 'Fortalecer tu Autoestima',   'individual', 60, 30.00, 2),
  ('pareja',     'Sanar en Pareja',            'pareja',     60, 45.00, 3),
  ('duelo',      'Acompañar un Duelo',         'individual', 60, 30.00, 4);


-- ---------- PAQUETES ----------
-- 60 días de validez desde que se verifica el pago.
-- El precio por sesión sale más barato que la suelta, que es el sentido del
-- bono: 25 $ frente a 30 $ en individual, y 30-33 $ frente a 45 $ en pareja.
insert into public.packages (slug, name, modality, sessions_count, price_usd, valid_days, sort_order) values
  ('individual-3', 'Paquete de 3 sesiones individuales', 'individual', 3,  75.00, 60, 1),
  ('individual-5', 'Paquete de 5 sesiones individuales', 'individual', 5, 125.00, 60, 2),
  ('pareja-3',     'Paquete de 3 sesiones de pareja',    'pareja',     3, 100.00, 60, 3),
  ('pareja-5',     'Paquete de 5 sesiones de pareja',    'pareja',     5, 150.00, 60, 4);


-- ---------- BANCOS ----------
-- Este catálogo es el banco DESDE el que paga el cliente, así que tiene que
-- estar la plaza completa. Las cuentas donde cobra Daryeli son otra cosa y
-- viven en settings.
insert into public.banks (code, name, sort_order) values
  ('0102', 'Banco de Venezuela',        1),
  ('0134', 'Banesco',                   2),
  ('0105', 'Mercantil',                 3),
  ('0108', 'BBVA Provincial',           4),
  ('0172', 'Bancamiga',                 5),
  ('0191', 'BNC Banco Nacional de Crédito', 6),
  ('0114', 'Bancaribe',                 7),
  ('0115', 'Banco Exterior',            8),
  ('0128', 'Banco Caroní',              9),
  ('0104', 'Venezolano de Crédito',    10),
  ('0138', 'Banco Plaza',              11),
  ('0151', 'BFC Banco Fondo Común',    12),
  ('0156', '100% Banco',               13),
  ('0157', 'DelSur',                   14),
  ('0163', 'Banco del Tesoro',         15),
  ('0166', 'Banco Agrícola de Venezuela', 16),
  ('0168', 'Bancrecer',                17),
  ('0169', 'Mi Banco',                 18),
  ('0171', 'Banco Activo',             19),
  ('0174', 'Banplus',                  20),
  ('0175', 'Banco Bicentenario',       21),
  ('0177', 'Banfanb',                  22),
  ('0137', 'Sofitasa',                 23),
  ('0146', 'Bangente',                 24);


-- ---------- HORARIO ----------
-- Convención: 0 = domingo, 1 = lunes ... 6 = sábado.
-- Las horas son SIEMPRE hora de Caracas. El calendario las convierte a la
-- zona de cada visitante, así que esta franja de lunes a viernes ya cubre de
-- 15:00 a 23:00 en Madrid, que es la ventana útil para quien vive en España.
insert into public.availability_rules (weekday, start_time, end_time) values
  (1, '09:00', '17:00'),   -- lunes
  (2, '09:00', '17:00'),   -- martes
  (3, '09:00', '17:00'),   -- miércoles
  (4, '09:00', '17:00'),   -- jueves
  (5, '09:00', '17:00'),   -- viernes
  (6, '08:00', '12:00');   -- sábado


-- ---------- AJUSTES ----------
insert into public.settings (key, value) values

  -- Zona en la que Daryeli define su horario y en la que se le muestra todo
  -- en el panel. Los clientes ven las horas convertidas a la suya.
  ('timezone', '"America/Caracas"'::jsonb),

  -- Dos horas para pagar antes de que el cupo se libere solo. Suficiente para
  -- ir al banco sin dejar la agenda bloqueada media semana.
  ('hold_minutes', '120'::jsonb),

  -- Antelación mínima para reservar: nadie coge un hueco para dentro de diez
  -- minutos.
  -- 4 y no 12: con el horario de 9:00 a 17:00 el ultimo hueco empieza a las
  -- 16:00, asi que 12 horas de antelacion hacian imposible reservar el mismo
  -- dia a cualquier hora, y a partir de las 21:00 tampoco se veia el primer
  -- hueco de la manana siguiente. 4 deja las 2 horas de retencion para pagar
  -- mas 2 de margen para que Daryeli revise el comprobante.
  ('min_notice_hours', '4'::jsonb),

  -- Hasta cuándo se puede reservar hacia adelante.
  ('booking_window_days', '60'::jsonb),

  -- Los comprobantes se borran solos pasado este plazo. Lo que no se guarda
  -- no se puede filtrar.
  ('proof_retention_months', '6'::jsonb),

  -- Versión del consentimiento vigente. Al cambiar el texto hay que subir
  -- este número, porque cada reserva guarda cuál aceptó.
  ('consent_version', '"2026-08-v1"'::jsonb),

  -- Cuentas donde cobra Daryeli. SE RELLENAN APARTE, no en el repositorio:
  -- ver supabase/datos-privados.sql.example. La cédula no tiene por qué vivir
  -- en git, aunque luego se muestre en la página de reserva.
  ('pago_movil', '[]'::jsonb);
