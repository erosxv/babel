-- Xibolete: backup do progresso na nuvem (uma linha por conta, com todo o progresso e o caderno).
-- Como usar: no painel do Supabase, abra "SQL Editor", cole este arquivo inteiro e clique em "Run".
-- Pode rodar de novo sem problema: ele não apaga nada que já existe.
--
-- Privacidade (RLS): cada pessoa só lê e escreve a própria linha. Ninguém mais vê o progresso de ninguém.

create table if not exists public.saves (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  saved_at timestamptz not null default now(),
  check (pg_column_size(data) < 3000000)
);

alter table public.saves enable row level security;

drop policy if exists "saves: own row" on public.saves;
create policy "saves: own row" on public.saves
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.saves to authenticated;
