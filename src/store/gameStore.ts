/**
 * GameStore: owns the event log, the projected state, and persistence.
 * UI dispatches commands; the store validates (engine), appends, projects,
 * persists, and returns the effects to celebrate.
 */
import { execute, type Command, type CommandContext } from '../engine/commands';
import { applyEvent, replay } from '../engine/project';
import type { Effect, GameEvent, GameState } from '../engine/types';
import type { EventStore } from './eventStore';

export type DispatchResult = { ok: true; effects: Effect[]; events: GameEvent[] } | { ok: false; error: string };

type Listener = () => void;

export class GameStore {
  private events: GameEvent[];
  private state: GameState;
  private listeners = new Set<Listener>();

  constructor(
    private readonly persistence: EventStore,
    private readonly context: () => CommandContext = defaultContext,
    initialEvents?: GameEvent[],
  ) {
    this.events = initialEvents ?? persistence.load();
    this.state = replay(this.events);
  }

  getState = (): GameState => this.state;
  getEvents = (): readonly GameEvent[] => this.events;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  dispatch(command: Command): DispatchResult {
    const result = execute(this.state, command, this.context(), this.events);
    if (!result.ok) return result;

    const nextEvents = [...this.events, ...result.events];
    let nextState = this.state;
    const effects: Effect[] = [];

    if (result.events.some((e) => e.type === 'deed.undone')) {
      nextState = replay(nextEvents);
    } else {
      for (const e of result.events) {
        const applied = applyEvent(nextState, e);
        nextState = applied.state;
        effects.push(...applied.effects);
      }
    }

    // Persist before publishing: if saving fails, the action didn't happen.
    try {
      this.persistence.save(nextEvents);
    } catch {
      return { ok: false, error: 'Could not save progress. Storage may be full or blocked.' };
    }

    this.events = nextEvents;
    this.state = nextState;
    this.emit();
    return { ok: true, effects, events: result.events };
  }

  /** Replace the whole log (import / reset). */
  replaceAll(events: GameEvent[]): void {
    const state = replay(events);
    this.persistence.save(events);
    this.events = events;
    this.state = state;
    this.emit();
  }

  private emit() {
    for (const l of this.listeners) l();
  }
}

function defaultContext(): CommandContext {
  return { now: new Date(), newId: () => crypto.randomUUID() };
}
