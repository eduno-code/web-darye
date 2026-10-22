-- ============================================================
-- PAGOS: MÉTODO Y MONEDA
--
-- La tabla se construyó suponiendo que todo pago es pago móvil: bank_code,
-- reference_number y amount_bs eran obligatorios. Daryeli también cobra en
-- efectivo en dólares —poco, pero ocurre— y eso no tiene banco, ni número de
-- referencia, ni bolívares. Con el esquema anterior era literalmente
-- imposible de guardar.
--
-- Dos consecuencias que justifican el cambio:
--   1. Sus métricas de ingresos ignoraban el efectivo por completo.
--   2. El historial de un paciente que siempre paga en efectivo estaba vacío,
--      así que el sistema lo trataba como a un desconocido.
--
-- amount_usd se guarda en LOS DOS métodos, no solo en efectivo. En pago móvil
-- se deduce del monto en bolívares y la tasa del día. Así "cuánto facturé esta
-- semana" es una suma y no una conversión caso por caso.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type public.payment_method as enum ('pago_movil', 'efectivo');
  end if;
end $$;

alter table public.payments
  add column if not exists method     public.payment_method not null default 'pago_movil',
  add column if not exists amount_usd numeric(10,2);

comment on column public.payments.method is
  'pago_movil: transferencia declarada por el cliente. efectivo: cobro en mano que registra Daryeli.';
comment on column public.payments.amount_usd is
  'Importe en dólares. Se rellena en los dos métodos para que las métricas sean una suma.';

-- Los tres campos de pago móvil dejan de ser obligatorios: un pago en efectivo
-- no los tiene. La coherencia la impone el CHECK de más abajo, no el NOT NULL.
alter table public.payments
  alter column bank_code        drop not null,
  alter column reference_number drop not null,
  alter column amount_bs        drop not null;

alter table public.payments
  drop constraint if exists payments_coherencia_metodo;

-- Impide guardar un pago a medias por cualquiera de las dos vías. Sin esto,
-- relajar los NOT NULL habría abierto la puerta a un pago móvil sin referencia.
alter table public.payments
  add constraint payments_coherencia_metodo check (
    (method = 'pago_movil'
       and bank_code        is not null
       and reference_number is not null
       and amount_bs        is not null)
    or
    (method = 'efectivo'
       and bank_code        is null
       and reference_number is null
       and amount_bs        is null
       and amount_usd       is not null)
  );

alter table public.payments
  drop constraint if exists payments_amount_usd_check;
alter table public.payments
  add constraint payments_amount_usd_check check (amount_usd is null or amount_usd > 0);
