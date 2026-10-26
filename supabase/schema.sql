-- Cierre de caja · Uniformes Caracas
-- Pégalo en Supabase → SQL Editor → Run.

create table if not exists public.cierres (
  fecha          date primary key,
  data           jsonb not null,
  estado         text,
  ventas_usd     numeric,
  diferencia_usd numeric,
  updated_at     timestamptz not null default now(),
  updated_by     uuid default auth.uid() references auth.users(id)
);

create table if not exists public.cashea (
  fecha      date primary key,
  facturado  numeric,
  financiado numeric,
  ordenes    integer,
  leido_en   timestamptz not null default now()
);

alter table public.cierres enable row level security;
alter table public.cashea  enable row level security;

-- Solo usuarios con sesión iniciada (los que tú creas en Authentication → Users).
drop policy if exists "cierres lectura" on public.cierres;
drop policy if exists "cierres escritura" on public.cierres;
drop policy if exists "cierres cambios" on public.cierres;
create policy "cierres lectura"   on public.cierres for select to authenticated using (true);
create policy "cierres escritura" on public.cierres for insert to authenticated with check (true);
create policy "cierres cambios"   on public.cierres for update to authenticated using (true) with check (true);

drop policy if exists "cashea lectura" on public.cashea;
drop policy if exists "cashea escritura" on public.cashea;
drop policy if exists "cashea cambios" on public.cashea;
create policy "cashea lectura"   on public.cashea for select to authenticated using (true);
create policy "cashea escritura" on public.cashea for insert to authenticated with check (true);
create policy "cashea cambios"   on public.cashea for update to authenticated using (true) with check (true);

-- Para que la página se actualice sola cuando llegan datos nuevos.
do $$ begin
  alter publication supabase_realtime add table public.cierres;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.cashea;
exception when duplicate_object then null; end $$;
