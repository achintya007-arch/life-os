# LIFE//OS

**A real-life RPG. Your life is the game; you are the main character.**

**▶ Play it: [life-os-game.vercel.app](https://life-os-game.vercel.app)** (phone and desktop. Play instantly as a guest, and sync across devices when you want to)

Your real goals become quests. Doing them earns XP. XP grows a character with levels, attributes, titles and a history worth looking back on. A Game Master watches your progress, reacts to it, and nudges you toward the things you've been avoiding.

LIFE//OS isn't a habit tracker with a coat of paint. There are **no streaks to lose and no guilt**. Coming back after time away is *rewarded*, not punished. Small deeds get a quiet nod, and big ones get a moment.

---

## The game

### Quests & XP

Every quest has a tier. The tier sets the reward and how the game reacts.

| Tier | XP | Meant for | Reward |
| --- | --- | --- | --- |
| Tiny | 10 | Two minutes. Drink water, make the bed. | A soft tick |
| Quest | 50 | A real session. Practice, study, train. | A chime and a toast |
| Challenge | 150 | The hard thing you keep putting off. | A bigger chime |
| **Boss** | 500 | A milestone. Ship it. Finish it. | Must be *held* to defeat. Full-screen moment |

Quests are either **one-time** or **daily rituals** that reset each day. Retiring a quest costs nothing, because priorities change.

**Rested XP:** if you come back after 3+ days away, your first deed earns **+50%**.

### Attributes

Each quest trains one of five attributes. The game suggests one based on the quest title.

| | Attribute | Domain |
| --- | --- | --- |
| STR | Strength | Movement, exercise, physical challenges |
| INT | Intellect | Study, learning, technical work |
| DEX | Dexterity | Practice, instruments, craft |
| VIT | Vitality | Sleep, food, recovery, routines |
| CHA | Charisma | People, voice, courage |

The attribute radar shows your character's shape at a glance.

### Levels

Two standard quests reach level 2. After that the curve stretches: level 10 → 11 takes 1,310 XP. Attribute rank *r* needs 25·(r−1)² attribute XP.

### Campaigns

Long-term goals are broken into chapters that are cleared in order. Each chapter is worth +150 XP. Finishing a campaign adds a +500 XP bonus and a full-screen ceremony.

### Achievements & titles

There are 18 achievements, 7 of them secret: you find those by playing, not by reading a checklist. Several grant **equippable titles** that appear under your name.

### The Game Master

A local narrator with a voice. It greets you based on how long you've been away and reacts to what you just did. It spotlights a quest you've been avoiding and offers a "side story" to get you started. It also proposes new quests aimed at your weakest attributes.

It is **deterministic and runs entirely on-device**: no LLM, no network calls.

### The Chronicle

Your history, month by month: XP earned, levels gained, a calendar heat map, rituals kept, your biggest win, and the full log.

### Reward rhythm

Rewards are tiered on purpose:

- **Everyday deeds:** a sound, a floating +XP, and a toast with **undo**.
- **Rank-ups and common achievements:** quiet toasts, grouped together.
- **Campaign chapter cleared:** a cinematic banner that never blocks input.
- **Level up, boss defeated, campaign complete:** one full-screen ceremony per action. Anything else earned by the same action rides along on that screen instead of queueing more screens.

All sound is synthesized with WebAudio (no audio files) and can be muted.

---

## One character, every device

LIFE//OS is **local-first**: the game always runs on your device, instantly and offline. Syncing across devices is optional.

| | Guest save | Synced account |
| --- | --- | --- |
| Account needed | No. Open the app and play | Email + one-time code (no password) |
| Where the save lives | This browser only | Your account in the cloud, cached on each device |
| Works offline | Yes | Yes. Progress queues and syncs when you're back |
| Phone + laptop | Separate saves | **The same character** |
| Clearing site data | Erases the character ⚠️ | Harmless. Sign in again and it all comes back |

**Guest → account:** play as long as you like, then open ☰ System and choose **Create account & sync**. Your save is backed up, uploaded, **verified against the server**, and only then is the device switched over. If anything fails partway, your guest save is untouched and you can retry safely, because uploads are idempotent.

If you sign in on a device that already has a *different* guest character, you choose what happens: **merge** its progress into your account character, or **keep** the account character and leave the guest save as an on-device backup. Nothing is ever silently overwritten.

**The status light** in the top bar always tells you where your progress is: `● SYNCED` · `↻ SYNCING` · `○ OFFLINE · SAVED LOCALLY` · `! SIGN IN TO SYNC` · `◇ GUEST SAVE`.

**Your data is yours.** Export a versioned save file at any time. Importing into an account can only *merge*, never overwrite. Before anything that could replace a save (import, restore, new game, sign-out with unsynced progress), an automatic **on-device backup** is taken, and you can restore it from ☰ System → Backups.

---

## Architecture

```
            IDENTITY (Supabase Auth: email OTP)
                           │
                     USER · PROFILE
                           │
                LIFE//OS GAME ENGINE  ← unchanged; the only place game rules live
                           │
                      EVENT STORE
                 ┌─────────┴─────────┐
           local cache +        cloud event log
           offline queue      (Postgres, per-user, RLS)
```

```
src/
  engine/   pure, deterministic game rules: no React, no DOM, fully tested
    types.ts         events (source of truth) → projected state → effects
    commands.ts      validate intent → produce events (clock + ids injected)
    project.ts       fold events into state; emit effects for the UI
    validate.ts      structural validation of untrusted events (imports, cloud)
    leveling.ts  achievements.ts  titles.ts  gameMaster.ts  chronicle.ts  infer.ts
  store/    GameStore, guest persistence, save files, on-device backups
  sync/     accounts & sync (knows nothing about game rules)
    accountStore.ts  local cache + offline queue (same EventStore interface as guests)
    syncEngine.ts    push pending → pull after cursor → converge
    migration.ts     guest → account linking (backup, upload, verify)
    cloud.ts         Supabase adapter (lazy-loaded)
  app/      Runtime: which save is active, sign in/out, import, restore; sync scheduler
  ui/       React: HQ panels, views, celebration director, save & account UI
supabase/migrations/   the database schema, RLS policies and RPCs
```

**Event-sourced.** No number is ever mutated directly:

```
COMMAND → validate → EVENT → append to log → project → EFFECTS → celebrate
```

Completing a quest appends an event. That event becomes XP transactions, and the transactions are projected into level, attributes, achievements and titles. This gives you history, **undo** (by replaying the log), and auditability. Replaying a log always reproduces exactly the same state.

### How sync works

Because the game is event-sourced, sync moves **events, never derived state**:

```
device: pending events ──push_events (idempotent)──▶ cloud assigns per-user seq
device: pull seq > cursor ──▶ cache ──▶ replay ──▶ identical state on every device
```

- **Canonical order is the server sequence, not device clocks.** A device can only reference an event after receiving it, so arrival order preserves cause and effect. A phone with a slow clock can't orphan a quest completion. Pushes for one user are serialized under a row lock, so a pull can never skip an event that commits late.
- **Idempotent and retry-safe.** Event ids are UUIDs, and the server ignores ids it already has. A lost response is simply retried.
- **Offline-first.** Every action is written to the local cache synchronously and queued. Sync runs in the background: after play (debounced), on reconnect, when the app regains focus, and every minute while visible, with exponential backoff while offline.
- **Conflicts.** Independent progress on two devices merges naturally, so you get *Quest A + Quest B*. A true conflict, such as the same one-time quest or the same day's ritual completed on two offline devices, is resolved deterministically by the engine's existing rules: the first completion in canonical order counts. The device whose completion didn't count is **told**. Nothing is deleted, and both events stay in the permanent history.
- **Robustness.** Malformed remote events are skipped without advancing past them silently, and they are counted. A corrupted local cache is kept aside and rebuilt from the cloud.

### Data model

| Table | Holds | Access |
| --- | --- | --- |
| `auth.users` | identity (managed by Supabase Auth) | Supabase only |
| `profiles` | `user_id`, `display_name`, timestamps | read own; update own `display_name` |
| `game_events` | `user_id`, `event_id`, `seq`, `type`, `at`, `payload` (the full engine event), `schema_version`, `device_id` | read own; **no direct writes** |
| `sync_state` | per-user `last_seq` counter | read own; no direct writes |

The only write paths are two `SECURITY DEFINER` functions that act strictly on `auth.uid()`: `push_events(events, device_id)` and `delete_my_account()`. Events are immutable, and history is corrected by appending (`deed.undone`).

### Security

- Row-Level Security on every table. User A can never read or write User B's events, profile or sync state. The tests prove this against the real migration in real Postgres.
- Supabase's broad default grants are explicitly revoked. Clients cannot `INSERT`/`UPDATE`/`DELETE` any table, even their own rows.
- The browser only receives the project URL and the **publishable anon key**, which are public by design. The service-role key and database credentials are never used by the app and never committed.
- A strict Content-Security-Policy allows network access only to this origin and Supabase.
- Signing out removes the account's cached data from the device. Unsynced progress is kept as a local backup, never discarded.

### Stack

React 19 · TypeScript (strict) · Vite · Vitest · plain CSS · Supabase (Postgres + Auth), whose client is lazy-loaded so guests never download it · PGlite for database tests · Chakra Petch + JetBrains Mono (self-hosted). Static SPA on Vercel.

---

## Run it

Requires Node 20+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 86 tests: engine, database authorization, sync, migration, runtime
npm run typecheck  # strict TypeScript
npm run build      # typecheck + production build → dist/
```

Without environment variables the app runs **guest-only**, which is perfect for working on the game itself. To enable accounts locally, create `.env.local`:

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable anon key>
```

Both values are public. **Never** put the service-role key or a database password in a `VITE_` variable: anything with that prefix ships to the browser.

In development, the browser console exposes `lifeos` (the runtime) and `lifeosSeed()`, which loads about two weeks of demo history ending five days ago so you can see the comeback flow.

### Database

The schema lives in `supabase/migrations/`. Apply it to a Supabase project with the Supabase CLI (`supabase db push`) or by running the SQL in the dashboard's SQL editor. For email sign-in codes, the **Magic Link** email template must include `{{ .Token }}` (the 6-digit code). The link in the email also works when it's opened in the same browser.

### Deploy

Vercel builds on every push to `main`. The production environment needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. `vercel.json` sets the Vite build, the SPA fallback, immutable caching for hashed assets, and the security headers. Routes are hash-based (`/#/chronicle`), so refreshing any page is safe.

---

## Status

**v0.2: one world, every device.** Accounts, cloud saves, cross-device sync, offline play and guest → account migration are in, on top of the v0.1 game (Character, quests, campaigns, achievements, Game Master, Chronicle, reward ceremonies). Phones (iPhone 13 at 390×844) and desktop are both first-class targets.

### Current limitations

- **Sign-in emails** use Supabase's built-in mailer, which is rate-limited to a few emails per hour per project. That's fine for personal use, but a public launch should configure custom SMTP (for example Resend) in Supabase Auth settings.
- **Sign-in is email-code only.** Google and Apple sign-in plug into the same Supabase Auth, and the rest of the app doesn't change.
- **Sync is pull-based** (on focus, on reconnect, every minute while visible), not realtime push. A deed on your phone reaches an open laptop within about a minute, or instantly when you switch back to it.
- **Accounts have no "new game"** that keeps the account. Delete the account, or keep playing the character.
- **Unsynced progress on a device whose session expired** stays queued locally until you sign in again on that device. It is never lost, and the status light shows it.

## Where it's going

- A Game Master with more personality and memory, with an optional AI mode that runs only on explicit opt-in.
- Real-world signals: phone shortcuts, NFC "deed buttons" and activity detection feeding events into the log.
- End-to-end encrypted sync (the server only needs to order events, not read them).
- A Chronicle that becomes a story of the year you'd actually want to reread.

The guiding question for every feature: **does this make real life more rewarding to engage with?** If it only adds bookkeeping, it doesn't ship.
