-- Botón "Cargar Cashea": solicitudes que la página deja y que el agente de la Mac mini atiende.
-- Pégalo en Supabase → SQL Editor → Run (después de schema.sql).

create table if not exists public.solicitudes_cashea (
  id          bigint generated always as identity primary key,
  creada_en   timestamptz not null default now(),
  creada_por  uuid default auth.uid() references auth.users(id),
  estado      text not null default 'pendiente',   -- pendiente · procesando · listo · error · vencida
  mensaje     text,
  resultado   jsonb,
  atendida_en timestamptz
);

-- Latido del agente: la página lo usa para saber si la Mac mini está escuchando.
create table if not exists public.agente_cashea (
  id       int primary key default 1,
  visto_en timestamptz not null default now(),
  version  text
);

alter table public.solicitudes_cashea enable row level security;
alter table public.agente_cashea      enable row level security;

drop policy if exists "solicitudes lectura"   on public.solicitudes_cashea;
drop policy if exists "solicitudes crear"     on public.solicitudes_cashea;
drop policy if exists "solicitudes atender"   on public.solicitudes_cashea;
create policy "solicitudes lectura" on public.solicitudes_cashea for select to authenticated using (true);
create policy "solicitudes crear"   on public.solicitudes_cashea for insert to authenticated with check (estado = 'pendiente');
create policy "solicitudes atender" on public.solicitudes_cashea for update to authenticated using (true) with check (true);

drop policy if exists "agente lectura"  on public.agente_cashea;
drop policy if exists "agente escribir" on public.agente_cashea;
drop policy if exists "agente cambiar"  on public.agente_cashea;
create policy "agente lectura"  on public.agente_cashea for select to authenticated using (true);
create policy "agente escribir" on public.agente_cashea for insert to authenticated with check (true);
create policy "agente cambiar"  on public.agente_cashea for update to authenticated using (true) with check (true);

do $$ begin
  alter publication supabase_realtime add table public.solicitudes_cashea;
exception when duplicate_object then null; end $$;
