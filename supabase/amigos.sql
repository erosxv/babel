-- Xibolete: aba Amigos (perfis, pedidos de amizade, conversas e sequência em dupla).
-- Como usar: no painel do Supabase, abra "SQL Editor", cole este arquivo inteiro e clique em "Run".
-- Pode rodar de novo sem problema: ele não apaga nada que já existe.
--
-- Regras de privacidade (RLS):
--  - cada pessoa só vê o próprio perfil e o de quem tem pedido de amizade com ela;
--  - achar alguém pelo código mostra só nome e avatar;
--  - só amigos aceitos podem trocar mensagens, e cada um só lê as próprias conversas.

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  code text unique not null check (code ~ '^[A-Z2-9]{6}$'),
  name text not null check (char_length(name) between 1 and 30),
  avatar text not null default '🦊' check (char_length(avatar) <= 8),
  stats jsonb not null default '{}'::jsonb check (pg_column_size(stats) < 8000),
  updated_at timestamptz not null default now()
);

create table if not exists public.friendships (
  requester uuid not null references public.profiles on delete cascade,
  addressee uuid not null references public.profiles on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  sender uuid not null default auth.uid() references public.profiles on delete cascade,
  receiver uuid not null references public.profiles on delete cascade,
  kind text not null default 'msg' check (kind in ('msg', 'doubt', 'nudge')),
  body text not null check (char_length(body) between 1 and 600),
  lang text check (char_length(lang) <= 4),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists messages_receiver on public.messages (receiver, created_at);
create index if not exists messages_sender on public.messages (sender, created_at);

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.messages enable row level security;

-- a and b have any friendship row between them (pending or accepted)
create or replace function public.related(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships f
    where (f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a));
$$;
create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships f where f.status = 'accepted'
    and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a)));
$$;
-- finding someone by their friend code shows only name and avatar
create or replace function public.find_by_code(c text) returns table (id uuid, name text, avatar text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.avatar from profiles p where p.code = upper(c) and auth.uid() is not null;
$$;
-- marks as read what a friend sent me
create or replace function public.mark_read(friend uuid) returns void
language sql security definer set search_path = public as $$
  update messages set read_at = now() where receiver = auth.uid() and sender = friend and read_at is null;
$$;

drop policy if exists "perfil: ver" on public.profiles;
drop policy if exists "perfil: criar" on public.profiles;
drop policy if exists "perfil: mudar" on public.profiles;
drop policy if exists "perfil: apagar" on public.profiles;
create policy "perfil: ver" on public.profiles for select to authenticated using (id = auth.uid() or public.related(id, auth.uid()));
create policy "perfil: criar" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "perfil: mudar" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "perfil: apagar" on public.profiles for delete to authenticated using (id = auth.uid());

drop policy if exists "amizade: ver" on public.friendships;
drop policy if exists "amizade: pedir" on public.friendships;
drop policy if exists "amizade: aceitar" on public.friendships;
drop policy if exists "amizade: desfazer" on public.friendships;
create policy "amizade: ver" on public.friendships for select to authenticated using (auth.uid() in (requester, addressee));
create policy "amizade: pedir" on public.friendships for insert to authenticated with check (requester = auth.uid() and status = 'pending');
create policy "amizade: aceitar" on public.friendships for update to authenticated using (addressee = auth.uid()) with check (addressee = auth.uid() and status = 'accepted');
create policy "amizade: desfazer" on public.friendships for delete to authenticated using (auth.uid() in (requester, addressee));

drop policy if exists "mensagem: ler" on public.messages;
drop policy if exists "mensagem: mandar" on public.messages;
drop policy if exists "mensagem: apagar" on public.messages;
create policy "mensagem: ler" on public.messages for select to authenticated using (auth.uid() in (sender, receiver));
create policy "mensagem: mandar" on public.messages for insert to authenticated with check (sender = auth.uid() and public.are_friends(sender, receiver));
create policy "mensagem: apagar" on public.messages for delete to authenticated using (sender = auth.uid());

grant select, insert, update, delete on public.profiles, public.friendships to authenticated;
grant select, insert, delete on public.messages to authenticated;
revoke all on public.profiles, public.friendships, public.messages from anon;
revoke execute on function public.related, public.are_friends, public.find_by_code, public.mark_read from anon, public;
grant execute on function public.related, public.are_friends, public.find_by_code, public.mark_read to authenticated;
