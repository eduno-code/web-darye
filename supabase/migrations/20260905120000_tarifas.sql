-- ============================================================
-- TARIFAS: UN PRECIO POR SERVICIO Y POR TARIFA, CON SU MONEDA
--
-- Hasta ahora había un solo precio por servicio (services.price_usd) y uno por
-- paquete. Daryeli cobra distinto según dónde vive la persona y de dónde es:
--
--                    En Venezuela   Fuera (no ES)   En España   Resto
--   Venezolano/a        30 $           35 $           35 €        —
--   Otra                  —              ?            40 €        ?
--
-- Y no cambia solo la cifra: cambia la MONEDA y cambia QUÉ PAQUETES existen.
-- La validez sí es la misma en todas: 60 días.
--
-- Los bonos individuales de 4 y 6 sesiones son de UNA SOLA tarifa, la general
-- de España. Las tres tarifas de venezolano usan los de 3 y 5 —da igual que
-- una cobre en euros—, porque lo que decide el catálogo es la tarifa, no la
-- moneda. Y ve_espana resulta ser ve_exterior con el símbolo cambiado: 35, 85,
-- 135, 45, 100 y 150, las mismas cifras en euros.
--
-- POR QUÉ UNA TABLA Y NO UNA COLUMNA MÁS:
-- "price_usd_exterior" habría resuelto dos tarifas y se habría roto en la
-- tercera, que ya existe. Con una fila por (tarifa, cosa) caben las que hagan
-- falta sin volver a migrar, y Daryeli las edita desde el panel.
--
-- Y resuelve gratis lo del catálogo distinto: un paquete SE OFRECE en una
-- tarifa si tiene fila de precio en ella. Si no la tiene, no aparece. No hacen
-- falta dos catálogos ni una columna de "disponible en", basta la ausencia.
--
-- Esta migración NO toca services.price_usd, packages.price_usd ni ninguna
-- función. Todo lo que hay hoy sigue funcionando igual; el cambio de las RPC
-- va aparte, cuando el paso 1 sepa preguntar la tarifa.
-- ============================================================


-- ---------- LAS TARIFAS ----------

-- Tabla y no un enum: los enum de Postgres se amplían mal —no se puede retirar
-- un valor, y añadirlo dentro de una transacción da guerra— y aquí hace falta
-- además guardar la moneda y un nombre legible para el panel.
create table public.price_tiers (
  code       text primary key,
  name       text not null,
  currency   text not null check (currency in ('USD', 'EUR')),
  active     boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.price_tiers is
  'Las tarifas que cobra Daryeli. La moneda es de la tarifa, no del servicio.';

insert into public.price_tiers (code, name, currency, active, sort_order) values
  ('ve_venezuela',   'Venezolano/a en Venezuela',          'USD', true,  1),
  ('ve_exterior',    'Venezolano/a fuera de Venezuela',    'USD', true,  2),
  ('ve_espana',      'Venezolano/a en España',             'EUR', true,  3),
  ('general_espana', 'Otra nacionalidad, en España',       'EUR', true,  4),
  -- Un mexicano viviendo en México, por ejemplo. Daryeli no dio esta lista
  -- suelta; sus cifras salen de aplicar la misma regla que cumplen las otras
  -- cuatro —la nacionalidad pone el número, el país pone la moneda—, así que
  -- son las de la tarifa general de España en dólares. Está pendiente de que
  -- ella lo confirme, pero no es un precio inventado: es el que se deduce.
  ('general_exterior', 'Otra nacionalidad, fuera de España', 'USD', true,  5);


-- ---------- LOS PRECIOS ----------

-- Una fila cubre O un servicio O un paquete, nunca los dos. Mismo patrón que
-- payments, que ya distingue así entre pago de sesión y pago de bono.
create table public.prices (
  id         uuid primary key default gen_random_uuid(),
  tier_code  text not null references public.price_tiers(code) on delete restrict,
  service_id uuid references public.services(id) on delete cascade,
  package_id uuid references public.packages(id) on delete cascade,
  amount     numeric(10,2) not null check (amount >= 0),

  -- Solo para paquetes. Nulo = vale el packages.valid_days de siempre, que es
  -- lo que pasa hoy: Edgar confirmó que TODOS los bonos son de 60 días en
  -- todas las tarifas, así que ninguna fila usa esta columna.
  -- Se deja puesta porque las listas iniciales de Daryeli sí traían plazos
  -- distintos por tarifa (3 y 4 meses en euros), y si eso vuelve, la validez
  -- pasa a ser de la tarifa y no del bono. Entonces solo hay que rellenarla.
  valid_days int check (valid_days > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint prices_un_solo_destino check (
    (service_id is not null and package_id is null) or
    (service_id is null and package_id is not null)
  ),
  -- valid_days no significa nada en una sesión suelta.
  constraint prices_validez_solo_paquetes check (
    package_id is not null or valid_days is null
  )
);

-- Un precio por tarifa y por cosa. Sin esto cabrían dos precios distintos para
-- lo mismo y la página elegiría uno al azar.
create unique index prices_tarifa_servicio_key
  on public.prices (tier_code, service_id) where service_id is not null;
create unique index prices_tarifa_paquete_key
  on public.prices (tier_code, package_id) where package_id is not null;

create index prices_tarifa_idx on public.prices (tier_code);

create trigger prices_touch before update on public.prices
  for each row execute function app.touch_updated_at();


-- ---------- LOS PAQUETES QUE FALTABAN ----------

-- En euros los bonos individuales son de 4 y 6 sesiones, no de 3 y 5. No son
-- los mismos con otro precio: son otros bonos, y por eso son filas nuevas.
-- Los de pareja sí coinciden (3 y 5 en todas partes) y se reutilizan.

-- price_usd deja de ser obligatorio: estos dos no tienen precio en dólares, y
-- ponerles uno falso para satisfacer el NOT NULL sería peor que dejarlo vacío.
-- El precio de verdad, para todas las tarifas, vive en prices.
alter table public.packages alter column price_usd drop not null;

comment on column public.packages.price_usd is
  'HEREDADO. El precio vigente vive en public.prices, una fila por tarifa. Se conserva mientras las RPC antiguas sigan leyéndolo.';

-- 60 días, como todos los demás.
insert into public.packages (slug, name, modality, sessions_count, price_usd, valid_days, sort_order) values
  ('individual-4', 'Paquete de 4 sesiones individuales', 'individual', 4, null, 60, 5),
  ('individual-6', 'Paquete de 6 sesiones individuales', 'individual', 6, null, 60, 6)
on conflict (slug) do nothing;


-- ---------- LAS CIFRAS ----------

-- Sesiones sueltas. Ansiedad, autoestima y duelo son individuales y valen lo
-- mismo entre sí; pareja va aparte.
insert into public.prices (tier_code, service_id, amount)
select p.tier, s.id, p.amount
from (values
  ('ve_venezuela',   'individual', 30.00),
  ('ve_exterior',    'individual', 35.00),
  ('ve_espana',      'individual', 35.00),
  ('general_espana', 'individual', 40.00),
  ('ve_venezuela',   'pareja',     45.00),
  ('ve_exterior',    'pareja',     45.00),
  ('ve_espana',        'pareja',     45.00),
  ('general_espana',   'pareja',     45.00),
  -- Deducidas: la tarifa general en dólares.
  ('general_exterior', 'individual', 40.00),
  ('general_exterior', 'pareja',     45.00)
) as p(tier, modalidad, amount)
join public.services s on s.modality::text = p.modalidad;

-- Paquetes. Sin valid_days: los 60 días son iguales en todas las tarifas y ya
-- están en packages.valid_days, así que repetirlos aquí sería tener el mismo
-- dato en dos sitios y arriesgarse a que un día dejen de coincidir.
insert into public.prices (tier_code, package_id, amount)
select p.tier, k.id, p.amount
from (values
  -- Dólares: bonos de 3 y 5 sesiones.
  ('ve_venezuela',   'individual-3',  75.00),
  ('ve_venezuela',   'individual-5', 125.00),
  ('ve_venezuela',   'pareja-3',     100.00),
  ('ve_venezuela',   'pareja-5',     150.00),
  ('ve_exterior',    'individual-3',  85.00),
  ('ve_exterior',    'individual-5', 135.00),
  ('ve_exterior',    'pareja-3',     100.00),
  ('ve_exterior',    'pareja-5',     150.00),
  -- Venezolano en España: las mismas cifras, en euros, y los mismos bonos.
  ('ve_espana',      'individual-3',  85.00),
  ('ve_espana',      'individual-5', 135.00),
  ('ve_espana',      'pareja-3',     100.00),
  ('ve_espana',      'pareja-5',     150.00),
  -- Euros, tarifa general: aquí los bonos individuales sí son de 4 y 6.
  ('general_espana', 'individual-4', 120.00),
  ('general_espana', 'individual-6', 150.00),
  ('general_espana', 'pareja-3',     100.00),
  -- OJO: 180 € entre 5 salen a 36 € la sesión, y el bono de 3 sale a 33 €. El
  -- bono grande es MÁS CARO por sesión que el pequeño, al revés que en todas
  -- las demás tarifas. Y en España la sesión de pareja suelta (45) y el bono
  -- de 3 (100) valen IGUAL para venezolanos y para el resto: la única casilla
  -- que se separa es esta. Casi seguro que son 150 y no 180.
  ('general_espana', 'pareja-5',     180.00),
  -- La misma tarifa general, en dólares, para quien no es venezolano y vive
  -- fuera de España. Deducidas de la regla, pendientes de que ella confirme.
  ('general_exterior', 'individual-4', 120.00),
  ('general_exterior', 'individual-6', 150.00),
  ('general_exterior', 'pareja-3',     100.00),
  ('general_exterior', 'pareja-5',     180.00)
) as p(tier, slug, amount)
join public.packages k on k.slug = p.slug;


-- ---------- QUIÉN PUEDE LEER ESTO ----------

-- Los precios son información pública: se enseñan en la página de reserva y en
-- la landing. Se abren igual que services y packages —columnas contadas y solo
-- las filas activas—, no de par en par.
alter table public.price_tiers enable row level security;
alter table public.prices      enable row level security;

grant select (code, name, currency, sort_order)
  on public.price_tiers to anon, authenticated;

create policy price_tiers_lectura_publica
  on public.price_tiers for select
  to anon, authenticated
  using (active);

grant select (id, tier_code, service_id, package_id, amount, valid_days)
  on public.prices to anon, authenticated;

-- Un precio se ve solo si su tarifa está encendida. Así apagar una tarifa la
-- retira entera de la página con un único UPDATE, sin borrar sus cifras.
create policy prices_lectura_publica
  on public.prices for select
  to anon, authenticated
  using (exists (
    select 1 from public.price_tiers t
    where t.code = prices.tier_code and t.active
  ));
