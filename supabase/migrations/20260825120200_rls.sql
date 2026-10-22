-- ============================================================
-- 0003 — Row Level Security y permisos
--
-- ESTA ES LA MIGRACIÓN QUE PROTEGE A LAS PACIENTES DE DARYELI.
--
-- La clave anónima de Supabase va dentro del JavaScript del navegador y
-- cualquiera puede leerla: es pública por diseño. La seguridad no está en
-- esconderla, está aquí. Si estas políticas están mal, la clave anónima es
-- una llave maestra para listar quién va a terapia y con qué frecuencia.
--
-- Modelo:
--   · anon          -> NO lee ninguna tabla de datos. Solo services y banks,
--                      y solo las columnas necesarias para pintar el formulario.
--                      Todo lo demás pasa por las funciones de 0005.
--   · authenticated -> solo puede algo si tiene fila en admin_profiles.
--                      Estar logueado NO basta: el día que existan cuentas de
--                      cliente también serán "authenticated", y no deben ver nada.
--   · service_role  -> se salta RLS. Vive solo en las Edge Functions.
-- ============================================================

-- ---------- QUIÉN ES ADMINISTRADOR ----------
-- Se define aquí y no en 0001 porque su cuerpo consulta admin_profiles, y
-- Postgres comprueba esa referencia en el momento de crear la función.
--
-- Es SECURITY DEFINER a propósito: se ejecuta con los permisos del dueño y
-- por tanto se salta RLS al leer admin_profiles. Sin eso, la política de
-- admin_profiles llamaría a una función que consulta admin_profiles, que
-- volvería a evaluar la política... y entraría en recursión infinita.
create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_profiles ap
    where ap.user_id = (select auth.uid())
  );
$$;

grant usage on schema public to anon, authenticated;

-- Punto de partida: nadie puede nada. A partir de aquí se concede a mano.
revoke all on all tables in schema public from anon, authenticated;

-- Y que siga siendo así con las tablas que se creen en el futuro, aunque a
-- alguien se le olvide revocar.
alter default privileges in schema public
  revoke all on tables from anon, authenticated;


-- ---------- RLS ACTIVADA EN TODO ----------
-- El proyecto ya tiene el disparador de RLS automática, pero se declara
-- explícitamente: la protección no debe depender de un ajuste del panel de
-- Supabase que alguien pueda desactivar sin darse cuenta.
alter table public.services                enable row level security;
alter table public.packages                enable row level security;
alter table public.client_packages         enable row level security;
alter table public.banks                   enable row level security;
alter table public.availability_rules      enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.clients                 enable row level security;
alter table public.appointments            enable row level security;
alter table public.payments                enable row level security;
alter table public.consents                enable row level security;
alter table public.settings                enable row level security;
alter table public.admin_profiles          enable row level security;
alter table public.booking_attempts        enable row level security;

-- Además se fuerza sobre el dueño de las tablas. Sin esto, una consulta hecha
-- con el rol propietario ignoraría las políticas.
alter table public.clients         force row level security;
alter table public.appointments    force row level security;
alter table public.payments        force row level security;
alter table public.consents        force row level security;
alter table public.client_packages force row level security;


-- ============================================================
-- LO ÚNICO PÚBLICO
-- ============================================================

-- Servicios: el visitante necesita nombre, duración y precio para elegir.
-- No se le conceden active, created_at ni updated_at.
grant select (id, slug, name, duration_min, price_usd, sort_order)
  on public.services to anon, authenticated;

create policy services_lectura_publica
  on public.services for select
  to anon, authenticated
  using (active);

-- Paquetes: el visitante necesita ver qué bonos existen y a qué precio.
grant select (id, slug, name, modality, sessions_count, price_usd, valid_days, sort_order)
  on public.packages to anon, authenticated;

create policy packages_lectura_publica
  on public.packages for select
  to anon, authenticated
  using (active);

-- OJO: client_packages —el saldo de cada persona— NO se abre a anon. Ese
-- listado dice quién compró terapia y cuántas sesiones lleva; se consulta
-- solo con el token del propio bono, a través de la función get_package.

-- Bancos: solo lo que alimenta el desplegable.
grant select (code, name, sort_order) on public.banks to anon, authenticated;

create policy banks_lectura_publica
  on public.banks for select
  to anon, authenticated
  using (active);

-- Nada más. Las citas, los clientes, los pagos y la agenda NO tienen ni una
-- sola política para anon, así que toda consulta directa devuelve cero filas.


-- ============================================================
-- EL PANEL
-- ============================================================

-- Función corta para no repetir la condición en veinte políticas.
-- app.is_admin() lee admin_profiles saltándose RLS (es SECURITY DEFINER),
-- lo que evita la recursión infinita de una política que se consulta a sí misma.

grant select, insert, update, delete on
  public.services,
  public.packages,
  public.client_packages,
  public.banks,
  public.availability_rules,
  public.availability_exceptions,
  public.clients,
  public.appointments,
  public.payments
to authenticated;

grant select, insert, update on public.settings       to authenticated;
grant select                 on public.consents       to authenticated;
grant select                 on public.admin_profiles to authenticated;

-- Gestión completa para quien esté en admin_profiles.
create policy services_admin    on public.services    for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy packages_admin    on public.packages    for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy bonos_admin       on public.client_packages for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy banks_admin       on public.banks       for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy reglas_admin      on public.availability_rules for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy excepciones_admin on public.availability_exceptions for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy clientes_admin    on public.clients     for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy citas_admin       on public.appointments for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy pagos_admin       on public.payments    for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy ajustes_admin     on public.settings    for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Los consentimientos son prueba legal: se leen, nunca se editan ni se borran
-- desde el panel. Solo los escribe create_booking.
create policy consentimientos_lectura on public.consents for select to authenticated
  using (app.is_admin());

-- Cada quien ve su propio perfil de administración. Alta y baja de personas
-- con acceso se hace desde el panel de Supabase, no desde la web.
create policy perfil_propio on public.admin_profiles for select to authenticated
  using (user_id = (select auth.uid()));

-- booking_attempts no se concede a nadie: solo lo toca create_booking por
-- dentro. Ni siquiera el panel necesita verlo.
