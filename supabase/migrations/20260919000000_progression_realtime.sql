-- ═══════════════════════════════════════════════════════════════════════════
-- LIFE//OS — progression events + realtime sync
--
-- 1. Accept the new event types (classes, interests, daily contracts, weekly
--    goals). The server still stores events opaquely; the engine interprets them.
-- 2. Stream new events to the player's other devices via Supabase Realtime.
--    Realtime evaluates Row-Level Security per subscriber, so a device only
--    ever receives its own user's rows.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.game_events drop constraint if exists game_events_known_type;
alter table public.game_events add constraint game_events_known_type check (type in (
  'character.created', 'character.renamed', 'character.titleEquipped', 'character.classChosen',
  'profile.interestsSet',
  'quest.created', 'quest.edited', 'quest.retired', 'quest.completed',
  'campaign.created', 'campaign.chapterCleared', 'campaign.retired',
  'daily.issued', 'daily.completed',
  'weekly.goalSet', 'weekly.goalRemoved',
  'deed.undone'
));

-- Realtime (only where Supabase's realtime publication exists).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_events'
     ) then
    alter publication supabase_realtime add table public.game_events;
  end if;
end
$$;
