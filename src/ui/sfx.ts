/**
 * Tiny synthesized sound effects (WebAudio, no files). Each effect is a few oscillator notes with
 * a short envelope, so they stay soft and never clip. The context starts on the first user
 * gesture, as browsers require.
 */
export type Sfx = 'coin' | 'place' | 'horn' | 'chime' | 'error' | 'fanfare' | 'tap';

type Note = { f: number; t: number; d: number; type?: OscillatorType; g?: number; to?: number };

const RECIPES: Record<Sfx, Note[]> = {
  tap: [{ f: 660, t: 0, d: 0.05, type: 'sine', g: 0.08 }],
  coin: [
    { f: 988, t: 0, d: 0.07, type: 'square', g: 0.05 },
    { f: 1319, t: 0.06, d: 0.14, type: 'square', g: 0.05 },
  ],
  place: [
    { f: 220, t: 0, d: 0.12, type: 'triangle', g: 0.2, to: 120 },
    { f: 523, t: 0.04, d: 0.1, type: 'sine', g: 0.08 },
  ],
  horn: [
    { f: 147, t: 0, d: 0.7, type: 'sawtooth', g: 0.06 },
    { f: 185, t: 0, d: 0.7, type: 'sawtooth', g: 0.04 },
  ],
  chime: [
    { f: 784, t: 0, d: 0.25, type: 'sine', g: 0.1 },
    { f: 1175, t: 0.09, d: 0.35, type: 'sine', g: 0.08 },
  ],
  error: [
    { f: 196, t: 0, d: 0.09, type: 'square', g: 0.05 },
    { f: 165, t: 0.1, d: 0.14, type: 'square', g: 0.05 },
  ],
  fanfare: [
    { f: 523, t: 0, d: 0.14, type: 'triangle', g: 0.14 },
    { f: 659, t: 0.13, d: 0.14, type: 'triangle', g: 0.14 },
    { f: 784, t: 0.26, d: 0.14, type: 'triangle', g: 0.14 },
    { f: 1047, t: 0.39, d: 0.5, type: 'triangle', g: 0.16 },
  ],
};

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private last = new Map<Sfx, number>();
  enabled = true;

  constructor() {
    const unlock = () => {
      this.ensure();
      void this.ctx?.resume();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
  }

  private ensure(): void {
    if (this.ctx) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
  }

  play(name: Sfx): void {
    if (!this.enabled || !this.ctx || !this.master || this.ctx.state !== 'running') return;
    // The same effect at most every 70 ms, so a burst of coins doesn't buzz.
    const now = this.ctx.currentTime;
    if (now - (this.last.get(name) ?? -1) < 0.07) return;
    this.last.set(name, now);
    for (const n of RECIPES[name]) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const t0 = now + n.t;
      o.type = n.type ?? 'sine';
      o.frequency.setValueAtTime(n.f, t0);
      if (n.to) o.frequency.exponentialRampToValueAtTime(n.to, t0 + n.d);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(n.g ?? 0.1, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.d);
      o.connect(g).connect(this.master);
      o.start(t0);
      o.stop(t0 + n.d + 0.02);
    }
  }
}
