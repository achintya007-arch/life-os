-- ═══════════════════════════════════════════════════════════════════════════
-- LIFE//OS — accounts, cloud persistence, cross-device sync
--
-- The server is a secure, append-only event log. It stores the player's
-- canonical events and assigns each one a per-user sequence number (the
-- canonical replay order). It contains NO game rules: XP, levels and
-- achievements are derived on-device by the LIFE//OS engine by replaying
-- the log, exactly as before.
--
-- Security model
--   • Row-Level Security on every table: a user can only ever see own rows.
--   • Clients cannot INSERT/UPDATE/DELETE tables directly. The only write
--     paths are the SECURITY DEFINER functions below, which act strictly on
--     auth.uid() — the caller cannot choose whose data they touch.
--   • Events are immutable. History is corrected by appending (deed.undone),
--     never by rewriting.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────── profiles ───────────────────────────
-- One per auth user. Identity-level data only (the character lives in events).
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 64),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ─────────────────────────── game_events ───────────────────────────
create table if not exists public.game_events (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  event_id   text        not null,
  -- Per-user canonical order, assigned by push_events under a row lock.
  seq        bigint      not null,
  type       text        not null,
  -- Device-reported time the event happened (informational; seq is the order).
  at         timestamptz not null,
  -- The complete LIFE//OS event, exactly as the engine produced it.
  payload    jsonb       not null,
  -- Event schema version, for future migrations of the event format.
  schema_version smallint not null default 1,
  device_id  text,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id),
  unique (user_id, seq),
  constraint game_events_id_len check (char_length(event_id) between 1 and 128),
  constraint game_events_payload_matches check (payload ->> 'id' = event_id and payload ->> 'type' = type),
  constraint game_events_payload_size check (octet_length(payload::text) <= 16384),
  constraint game_events_known_type check (type in (
    'character.created', 'character.renamed', 'character.titleEquipped',
    'quest.created', 'quest.edited', 'quest.retired', 'quest.completed',
    'campaign.created', 'campaign.chapterCleared', 'campaign.retired',
    'deed.undone'
  ))
);

-- ─────────────────────────── sync_state ───────────────────────────
-- Holds the per-user sequence counter. Locking this row serializes pushes
-- for one user, so seq order always equals commit order: a device pulling
-- "seq > cursor" can never skip an event that commits late.
create table if not exists public.sync_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  last_seq   bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- ─────────────────────────── row-level security ───────────────────────────
alter table public.profiles    enable row level security;
alter table public.game_events enable row level security;
alter table public.sync_state  enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "game_events: read own" on public.game_events;
create policy "game_events: read own" on public.game_events
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "sync_state: read own" on public.sync_state;
create policy "sync_state: read own" on public.sync_state
  for select to authenticated using (user_id = auth.uid());

-- Least privilege. Supabase grants broad table privileges to anon/authenticated
-- by default; take them back and grant only what each role needs.
revoke all on public.profiles, public.game_events, public.sync_state from anon, authenticated;
grant select on public.game_events, public.sync_state to authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, updated_at) on public.profiles to authenticated;

-- ─────────────────────────── profile bootstrap ───────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  insert into public.sync_state (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────── push_events ───────────────────────────
-- Idempotently append events for the CALLER. Returns (event_id, seq) for every
-- submitted id — including ones that already existed — so a client whose
-- previous response was lost can safely retry and learn the assigned seqs.
create or replace function public.push_events(p_events jsonb, p_device_id text default null)
returns table (event_id text, seq bigint)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid   uuid := auth.uid();
  v_base  bigint;
  v_added bigint;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'p_events must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_events) > 500 then
    raise exception 'too many events in one push (max 500)' using errcode = '22023';
  end if;
  if p_device_id is not null and char_length(p_device_id) > 64 then
    raise exception 'device id too long' using errcode = '22023';
  end if;

  -- Serialize this user's pushes (see sync_state comment).
  insert into public.sync_state (user_id) values (v_uid) on conflict do nothing;
  select s.last_seq into v_base from public.sync_state s where s.user_id = v_uid for update;

  with incoming as (
    select e, ord
    from jsonb_array_elements(p_events) with ordinality as t (e, ord)
  ),
  first_of_each as (
    -- Collapse duplicate ids inside one batch (first occurrence wins).
    select distinct on (e ->> 'id') e, ord from incoming order by e ->> 'id', ord
  ),
  fresh as (
    select f.e, f.ord
    from first_of_each f
    where not exists (
      select 1 from public.game_events g where g.user_id = v_uid and g.event_id = f.e ->> 'id'
    )
  ),
  numbered as (
    select e, v_base + row_number() over (order by ord) as s from fresh
  )
  insert into public.game_events (user_id, event_id, seq, type, at, payload, device_id)
  select v_uid, e ->> 'id', s, e ->> 'type', (e ->> 'at')::timestamptz, e, p_device_id
  from numbered;

  get diagnostics v_added = row_count;
  update public.sync_state set last_seq = v_base + v_added, updated_at = now() where user_id = v_uid;

  return query
    select g.event_id, g.seq
    from public.game_events g
    where g.user_id = v_uid
      and g.event_id in (select x ->> 'id' from jsonb_array_elements(p_events) as x);
end;
$$;

-- ─────────────────────────── delete_my_account ───────────────────────────
-- Permanently deletes the caller's auth user; every table cascades.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from auth.users where id = v_uid;
end;
$$;

-- Functions are executable by PUBLIC by default in Postgres. Lock them down.
revoke all on function public.push_events(jsonb, text) from public, anon;
revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.push_events(jsonb, text) to authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- Profiles & sync_state for users that existed before this migration.
insert into public.profiles (user_id) select id from auth.users on conflict do nothing;
insert into public.sync_state (user_id) select id from auth.users on conflict do nothing;
