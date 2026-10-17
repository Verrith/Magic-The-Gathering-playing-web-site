-- Run this in the Supabase SQL Editor. Enable Anonymous sign-ins in Auth settings.

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Planeswalker',
  life integer not null default 20,
  joined_at timestamptz not null default now(),
  unique(room_id,user_id)
);
create table if not exists public.game_objects (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  object_id text not null,
  zone text not null check(zone in ('battlefield','hand','library','graveyard','exile')),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(room_id,owner_id,object_id)
);
alter table public.game_objects replica identity full;
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  message text not null check(char_length(message) between 1 and 500),
  created_at timestamptz not null default now()
);

create or replace function public.is_room_member(target_room uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.players p where p.room_id=target_room and p.user_id=auth.uid());
$$;
revoke all on function public.is_room_member(uuid) from public;
grant execute on function public.is_room_member(uuid) to authenticated;

create or replace function public.create_room(p_name text default 'Planeswalker')
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.rooms; clean_name text; result jsonb; room_code text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  clean_name := left(coalesce(nullif(trim(p_name),''),'Planeswalker'),24);
  loop
    room_code := substr(md5(random()::text || clock_timestamp()::text || auth.uid()::text),1,8);
    exit when not exists(select 1 from public.rooms where code=room_code);
  end loop;
  insert into public.rooms(code) values(room_code) returning * into r;
  insert into public.players(room_id,user_id,name) values(r.id,auth.uid(),clean_name);
  select jsonb_build_object('id',r.id,'code',r.code,'userId',auth.uid(),'players',coalesce(jsonb_agg(jsonb_build_object('id',auth.uid(),'name',clean_name,'life',20)), '[]'::jsonb)) into result;
  return result;
end $$;

create or replace function public.join_room(p_code text,p_name text default 'Planeswalker')
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.rooms; clean_name text; result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into r from public.rooms where code=lower(trim(p_code));
  if not found then raise exception 'Salle inconnue'; end if;
  clean_name := left(coalesce(nullif(trim(p_name),''),'Planeswalker'),24);
  insert into public.players(room_id,user_id,name) values(r.id,auth.uid(),clean_name)
  on conflict(room_id,user_id) do update set name=excluded.name;
  select jsonb_build_object('id',r.id,'code',r.code,'userId',auth.uid(),'players',coalesce(jsonb_agg(jsonb_build_object('id',p.user_id,'name',p.name,'life',p.life)), '[]'::jsonb)) into result
  from public.players p where p.room_id=r.id;
  return result;
end $$;

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.game_objects enable row level security;
alter table public.chat_messages enable row level security;
revoke all on public.rooms,public.players,public.game_objects,public.chat_messages from anon;
grant select on public.players to authenticated;
grant select,insert,update,delete on public.game_objects to authenticated;
grant select,insert on public.chat_messages to authenticated;
grant update(name,life) on public.players to authenticated;
grant execute on function public.create_room(text),public.join_room(text,text) to authenticated;

drop policy if exists "Members can read players in their room" on public.players;
create policy "Members can read players in their room" on public.players for select to authenticated using(public.is_room_member(room_id));
drop policy if exists "Players can update their own profile" on public.players;
create policy "Players can update their own profile" on public.players for update to authenticated using(user_id=auth.uid() and public.is_room_member(room_id)) with check(user_id=auth.uid() and public.is_room_member(room_id));
drop policy if exists "Members can read public objects and own private objects" on public.game_objects;
create policy "Members can read public objects and own private objects" on public.game_objects for select to authenticated using(public.is_room_member(room_id) and (zone='battlefield' or owner_id=auth.uid()));
drop policy if exists "Players can add their own objects" on public.game_objects;
create policy "Players can add their own objects" on public.game_objects for insert to authenticated with check(owner_id=auth.uid() and public.is_room_member(room_id));
drop policy if exists "Players can update their own objects" on public.game_objects;
drop policy if exists "Members can move public objects" on public.game_objects;
create policy "Members can move public objects" on public.game_objects for update to authenticated using(public.is_room_member(room_id) and (zone='battlefield' or owner_id=auth.uid())) with check(public.is_room_member(room_id) and (zone='battlefield' or owner_id=auth.uid()));
drop policy if exists "Players can remove their own objects" on public.game_objects;
drop policy if exists "Members can remove public objects" on public.game_objects;
create policy "Members can remove public objects" on public.game_objects for delete to authenticated using(public.is_room_member(room_id) and (zone='battlefield' or owner_id=auth.uid()));
drop policy if exists "Members can read room chat" on public.chat_messages;
create policy "Members can read room chat" on public.chat_messages for select to authenticated using(public.is_room_member(room_id));
drop policy if exists "Members can send room chat" on public.chat_messages;
create policy "Members can send room chat" on public.chat_messages for insert to authenticated with check(user_id=auth.uid() and public.is_room_member(room_id));

-- Realtime row events are used for player presence/life and public battlefield objects.
do $$ begin
  alter publication supabase_realtime add table public.players;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.game_objects;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.chat_messages;
exception when duplicate_object then null;
end $$;
