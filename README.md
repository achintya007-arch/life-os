# LIFE//OS

**A real-life RPG. Your life is the game; you are the main character.**

**▶ Play it: [life-os-game.vercel.app](https://life-os-game.vercel.app)** (works on phone and desktop, no account needed)

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

## Local-first, private by default

- **Your data never leaves your device.** Everything is stored in your browser's `localStorage`. There are no accounts, servers, analytics or tracking.
- **Back it up yourself:** export and import a save file from the System menu (☰). Use this to move between devices, since phone and laptop saves are separate.
- **Nothing is lost silently.** An unreadable save is quarantined and kept, never overwritten.

> ⚠️ Clearing your browser's site data erases your character. Export a save now and then.

---

## Architecture

```
src/
  engine/   pure, deterministic game rules: no React, no DOM, fully tested
    types.ts         events (source of truth) → projected state → effects
    commands.ts      validate intent → produce events (clock + ids injected)
    project.ts       fold events into state; emit effects for the UI
    leveling.ts      level + attribute curves
    achievements.ts  titles.ts  gameMaster.ts  chronicle.ts  infer.ts
  store/    event-log persistence (localStorage) + GameStore
  ui/       React: HQ panels, views, celebration director
  audio/    WebAudio-synthesized SFX
  styles/   design tokens + HUD system
  dev/      demo-history seed (development builds only)
```

**Event-sourced.** No number is ever mutated directly:

```
COMMAND → validate → EVENT → append to log → project → EFFECTS → celebrate
```

Completing a quest appends an event. That event becomes XP transactions, and the transactions are projected into level, attributes, achievements and titles. This gives you history, **undo** (by replaying the log), and auditability. Replaying a saved log always reproduces exactly the same state, and that's covered by the tests.

**Future integrations plug in here:**

- `EventStore` is a three-method interface. IndexedDB, SQLite or opt-in sync could replace `localStorage` without touching the engine.
- `gameMaster.ts` takes state in and returns narration. An AI-backed Game Master could implement the same interface, but only with explicit permission, because this data is personal.
- Each deed records its local date and hour, so future activity detection, phone or NFC triggers only need to emit commands.

### Stack

React 19 · TypeScript (strict) · Vite · Vitest · plain CSS (no UI framework) · Chakra Petch + JetBrains Mono (self-hosted via Fontsource). The app is a static SPA hosted on Vercel.

---

## Run it

Requires Node 20+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine tests (44)
npm run typecheck  # strict TypeScript
npm run build      # typecheck + production build → dist/
npm run preview    # serve the production build locally
```

In development, the browser console exposes `lifeos` (the store) and `lifeosSeed()`. The seed loads about two weeks of demo history ending five days ago, so you can see the comeback flow.

### Deploy

It's a static build with no environment variables and no backend. `vercel.json` sets the Vite build, the SPA fallback and long-lived caching for hashed assets. Any static host that serves `dist/` works. Routes are hash-based (`/#/chronicle`), so refreshing any page is safe.

---

## Status

**v0.1: playable vertical slice.** The Character screen, quests, campaigns, achievements, Game Master, Chronicle and reward ceremonies are complete. The layout is designed for both phones (iPhone 13 at 390×844 is a first-class target) and desktop.

## Where it's going

- A Game Master with more personality and memory, with an optional AI mode that runs only on explicit opt-in.
- Real-world signals: phone shortcuts, NFC "deed buttons" and activity detection feeding events into the log.
- Optional encrypted sync between your own devices.
- A Chronicle that becomes a story of the year you'd actually want to reread.

The guiding question for every feature: **does this make real life more rewarding to engage with?** If it only adds bookkeeping, it doesn't ship.
