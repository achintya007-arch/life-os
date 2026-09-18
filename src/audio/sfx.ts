/**
 * Synthesized sound effects — no audio files, no network.
 * Quiet by design: the loudest sound is reserved for leveling up and bosses.
 */

export type Sfx =
  | 'tick'
  | 'accept'
  | 'complete'
  | 'challenge'
  | 'boss'
  | 'levelUp'
  | 'achievement'
  | 'chapter'
  | 'campaign'
  | 'rankUp'
  | 'undo'
  | 'error';

const PREF_KEY = 'life-os.prefs.sound';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled: boolean;

  constructor() {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(PREF_KEY);
    } catch {
      /* storage blocked: default on */
    }
    this.enabled = stored !== 'off';
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    try {
      localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, start: number, dur: number, opts: { type?: OscillatorType; gain?: number; slideTo?: number } = {}) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, start);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, start + dur);
    const peak = opts.gain ?? 0.3;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(this.master!);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  /** Bell: inharmonic partials with fast decay. */
  private bell(freq: number, start: number, dur: number, gain = 0.2) {
    [1, 2.76, 5.4].forEach((m, i) => this.tone(freq * m, start, dur / (i + 1), { gain: gain / (i + 1.5) }));
  }

  private noise(start: number, dur: number, gain = 0.08, filterFreq = 2000) {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, start);
    filter.frequency.exponentialRampToValueAtTime(filterFreq * 4, start + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(filter).connect(g).connect(this.master!);
    src.start(start);
  }

  /** Rising hum while a boss quest is held. Returns a function that cuts it off. */
  charge(durationSec: number): () => void {
    const ctx = this.ensure();
    if (!ctx) return () => {};
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(660, t + durationSec);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + durationSec);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    return () => {
      const now = ctx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      osc.stop(now + 0.1);
    };
  }

  play(name: Sfx) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    switch (name) {
      case 'tick':
        this.tone(1320, t, 0.08, { type: 'sine', gain: 0.15 });
        this.tone(1980, t + 0.04, 0.1, { type: 'sine', gain: 0.08 });
        break;
      case 'accept':
        this.tone(440, t, 0.07, { type: 'triangle', gain: 0.18 });
        this.tone(660, t + 0.06, 0.12, { type: 'triangle', gain: 0.18 });
        break;
      case 'complete':
        this.tone(784, t, 0.1, { type: 'triangle', gain: 0.22 });
        this.tone(1175, t + 0.07, 0.22, { type: 'triangle', gain: 0.2 });
        this.bell(2350, t + 0.12, 0.4, 0.06);
        break;
      case 'challenge':
        this.noise(t, 0.18, 0.06, 900);
        [587, 784, 1175].forEach((f, i) => this.tone(f, t + 0.05 + i * 0.07, 0.25, { type: 'triangle', gain: 0.2 }));
        this.bell(2350, t + 0.26, 0.6, 0.08);
        break;
      case 'boss':
        this.tone(110, t, 1.2, { type: 'sine', gain: 0.6, slideTo: 40 });
        this.noise(t, 0.5, 0.12, 300);
        [392, 494, 587, 784].forEach((f) => this.tone(f, t + 0.25, 1.4, { type: 'triangle', gain: 0.1 }));
        this.bell(1568, t + 0.3, 1.6, 0.14);
        break;
      case 'levelUp':
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, t + i * 0.085, 0.35, { type: 'square', gain: 0.055 }));
        [523, 659, 784, 1047].forEach((f) => this.tone(f, t + 0.45, 1.3, { type: 'triangle', gain: 0.09 }));
        this.bell(2093, t + 0.45, 1.5, 0.15);
        this.noise(t + 0.4, 0.6, 0.04, 4000);
        break;
      case 'achievement':
        this.bell(1318, t, 0.9, 0.22);
        this.bell(1976, t + 0.12, 1.1, 0.18);
        break;
      case 'chapter':
        this.noise(t, 0.25, 0.05, 700);
        [392, 523, 659].forEach((f, i) => this.tone(f, t + i * 0.1, 0.5, { type: 'triangle', gain: 0.16 }));
        this.bell(1568, t + 0.3, 1.1, 0.12);
        break;
      case 'campaign':
        this.tone(98, t, 1.6, { type: 'sine', gain: 0.45, slideTo: 49 });
        [392, 523, 659, 784].forEach((f, i) => this.tone(f, t + 0.2 + i * 0.16, 0.6, { type: 'triangle', gain: 0.14 }));
        [523, 659, 784, 1047].forEach((f) => this.tone(f, t + 0.9, 2.2, { type: 'triangle', gain: 0.08 }));
        this.bell(2093, t + 0.9, 2.4, 0.16);
        break;
      case 'rankUp':
        this.tone(988, t, 0.12, { type: 'sine', gain: 0.14 });
        this.tone(1480, t + 0.08, 0.2, { type: 'sine', gain: 0.12 });
        break;
      case 'undo':
        this.tone(660, t, 0.1, { type: 'triangle', gain: 0.14, slideTo: 330 });
        break;
      case 'error':
        this.tone(160, t, 0.14, { type: 'sawtooth', gain: 0.06 });
        break;
    }
  }
}

export const sfx = new SoundEngine();
