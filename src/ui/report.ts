import type { Review } from '../sim/reviews';
import type { NightLine, NightReport } from '../sim/sim';

export interface ReportHandlers {
  onStartDay(): void;
  /** Tapped a review: show where it happened. */
  onReview(review: Review): void;
}

export function starsText(n: number): string {
  const full = Math.round(n);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

const coin = '<span class="coin-icon"></span>';

function money(n: number): string {
  const sign = n < 0 ? '−' : '+';
  return `${sign}${Math.abs(n).toLocaleString('en-US')}`;
}

function line(l: NightLine): string {
  return `<li><span>${l.name}<small>${l.detail}</small></span><b class="${l.amount < 0 ? 'neg' : ''}">${money(l.amount)}</b></li>`;
}

/**
 * The night report (GDD): "A one-screen summary: revenue by building, the best and
 * worst moments, new reviews, and the change in star rating. Then you build, research
 * and set prices before the next ferry."
 */
export class NightReportView {
  private el: HTMLElement;
  private pill: HTMLButtonElement;
  private report: NightReport | null = null;

  constructor(
    root: HTMLElement,
    private h: ReportHandlers,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'report-backdrop';
    this.el.hidden = true;
    root.appendChild(this.el);
    this.pill = document.createElement('button');
    this.pill.className = 'report-pill';
    this.pill.hidden = true;
    this.pill.textContent = 'Back to the night report';
    this.pill.addEventListener('click', () => this.restore());
    root.appendChild(this.pill);
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-start]')) return this.h.onStartDay();
      const rv = t.closest<HTMLElement>('[data-review]');
      if (rv && this.report) {
        const review = this.report.reviews.find((r) => r.id === Number(rv.dataset.review));
        if (review && review.buildingId !== null) {
          this.minimise();
          this.h.onReview(review);
        }
      }
    });
  }

  get open(): boolean {
    return this.report !== null;
  }

  show(r: NightReport): void {
    this.report = r;
    const delta = r.ratingAfter - r.ratingBefore;
    const trend = Math.abs(delta) < 0.05 ? 'steady' : delta > 0 ? `up ${delta.toFixed(1)}` : `down ${Math.abs(delta).toFixed(1)}`;
    const s = r.stats;
    const reviews = r.reviews.length
      ? r.reviews
          .map(
            (rv) =>
              `<li${rv.buildingId !== null ? ` data-review="${rv.id}" class="link" title="Show on the map"` : ''}><span class="stars">${starsText(rv.stars)}</span><span>“${rv.text}”</span><small>${rv.guestType === 'couple' ? 'Couple' : 'Backpacker'}</small></li>`,
          )
          .join('')
      : '<li class="muted">No one checked out today.</li>';
    this.el.innerHTML = `
      <section class="report" role="dialog" aria-label="Night report">
        <header>
          <small>End of day ${r.day}</small>
          <h2 class="${r.profit < 0 ? 'neg' : ''}">${coin}${money(r.profit)}</h2>
          <p>${r.profit >= 0 ? 'Profit today' : 'Loss today'}</p>
        </header>
        <div class="cols">
          <div>
            <h3>Income</h3>
            <ul class="lines">${r.income.map(line).join('') || '<li class="muted">Nothing yet</li>'}</ul>
            <h3>Costs</h3>
            <ul class="lines">${r.costs.map(line).join('') || '<li class="muted">None</li>'}</ul>
          </div>
          <div>
            <h3>Rating</h3>
            <p class="rating-line"><span class="stars">${starsText(r.ratingAfter)}</span> <b>${r.ratingAfter.toFixed(1)}</b> <small>${trend}</small></p>
            <h3>Guests</h3>
            <p>${s.arrived} arrived · ${s.housed} checked in · ${s.turnedAway} gave up · ${r.checkingOut} checking out</p>
            <p>Tomorrow’s ferry: about <b>${r.nextArrivals}</b> parties</p>
            <p>Research: <b>+${r.researchPoints}</b> points</p>
            ${r.best ? `<p class="moment good">▲ ${r.best}</p>` : ''}
            ${r.worst ? `<p class="moment bad">▼ ${r.worst}</p>` : ''}
          </div>
        </div>
        <h3>Reviews</h3>
        <ul class="reviews">${reviews}</ul>
        <button class="start" data-start>Start day ${r.day + 1} ▸</button>
      </section>`;
    this.el.hidden = false;
    this.pill.hidden = true;
  }

  hide(): void {
    this.report = null;
    this.el.hidden = true;
    this.pill.hidden = true;
  }

  private minimise(): void {
    this.el.hidden = true;
    this.pill.hidden = false;
  }

  private restore(): void {
    if (!this.report) return;
    this.el.hidden = false;
    this.pill.hidden = true;
  }
}
