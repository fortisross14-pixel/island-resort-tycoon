/**
 * The guided first day (Pass 3 onboarding): one short instruction at a time, ticked off by what
 * the player actually does, with the relevant dock button pulsing. Shown once per device for the
 * first scenario; Skip ends it, and it can be replayed from the menu.
 */
export interface CoachState {
  /** Footpath tiles laid since the guide started. */
  newPaths: number;
  rooms: number;
  food: number;
  playing: boolean;
  arrived: boolean;
  checkedIn: number;
  night: boolean;
}

interface Step {
  text: string;
  /** Dock button to pulse ('play' is the round play button). */
  target: 'build' | 'guests' | 'play' | null;
  done: (s: CoachState) => boolean;
}

const STEPS: Step[] = [
  { text: 'Tap Build, pick Paths, then draw a footpath from the dock', target: 'build', done: (s) => s.newPaths >= 3 },
  { text: 'Build a Basic Room beside your path (Rooms)', target: 'build', done: (s) => s.rooms >= 1 },
  { text: 'Guests get hungry: add a Snack Bar (Food)', target: 'build', done: (s) => s.food >= 1 },
  { text: 'Press play. The ferry docks early in the month', target: 'play', done: (s) => s.arrived },
  { text: 'Open Guests and drag a party onto a room', target: 'guests', done: (s) => s.checkedIn >= 1 },
  { text: 'Guests now spend and review. At the end of the month you get a report', target: null, done: (s) => s.night },
];

const DONE_KEY = 'irt.coach.done';

export class Coach {
  private el: HTMLElement;
  private step = -1;

  constructor(
    private root: HTMLElement,
    private onEnd: () => void = () => {},
  ) {
    this.el = document.createElement('div');
    this.el.className = 'coach glass';
    this.el.hidden = true;
    this.el.setAttribute('role', 'status');
    this.el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-skip]')) this.finish();
    });
    root.appendChild(this.el);
  }

  static get seen(): boolean {
    try {
      return localStorage.getItem(DONE_KEY) === '1';
    } catch {
      return false;
    }
  }

  get active(): boolean {
    return this.step >= 0;
  }

  start(): void {
    this.step = 0;
    this.render();
  }

  /** Re-check the current step against the game; advances through any already done. */
  update(s: CoachState): void {
    if (this.step < 0) return;
    let moved = false;
    while (this.step < STEPS.length && STEPS[this.step].done(s)) {
      this.step++;
      moved = true;
    }
    if (this.step >= STEPS.length) return this.finish();
    if (moved) this.render();
  }

  finish(): void {
    if (this.step < 0) return;
    this.step = -1;
    try {
      localStorage.setItem(DONE_KEY, '1');
    } catch {
      /* fine: it shows again next time */
    }
    this.render();
    this.onEnd();
  }

  private render(): void {
    for (const t of this.root.querySelectorAll('.coach-target')) t.classList.remove('coach-target');
    this.root.classList.toggle('coaching', this.step >= 0);
    if (this.step < 0) {
      this.el.hidden = true;
      return;
    }
    const st = STEPS[this.step];
    this.el.hidden = false;
    this.el.innerHTML = `<span class="coach-n">${this.step + 1}/${STEPS.length}</span><span class="coach-t">${st.text}</span><button data-skip>Skip</button>`;
    this.el.classList.remove('bump');
    void this.el.offsetWidth;
    this.el.classList.add('bump');
    if (st.target) {
      const sel = st.target === 'play' ? '[data-play]' : `[data-dock="${st.target}"]`;
      this.root.querySelector(sel)?.classList.add('coach-target');
    }
  }
}
