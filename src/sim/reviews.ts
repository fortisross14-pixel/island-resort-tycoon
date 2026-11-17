/**
 * Reviews and the star rating (M5). GDD: "At the end of a stay, a guest leaves a
 * review (1 to 5 stars and one line of text). Reviews feed the resort's rating, and
 * the rating decides how many guests come and how rich they are."
 */

export interface Review {
  id: number;
  day: number;
  guestType: string;
  stars: number;
  text: string;
  /** The building the review is about, so tapping it can jump the camera there. */
  buildingId: number | null;
}

/** Something a guest will remember when writing their review. */
export interface Memory {
  buildingId: number | null;
  /** Positive = a highlight, negative = a complaint. Bigger = more memorable. */
  weight: number;
  text: string;
}

/** The rating is the rolling average of this many reviews (GDD Quality ranking). */
export const RATING_WINDOW = 50;
/** A new resort starts as if it had a few middling reviews, so one review can't swing it wildly. */
export const PRIOR_REVIEWS = 4;
export const PRIOR_STARS = 2.5;

export function starsFor(satisfaction: number): number {
  return Math.max(1, Math.min(5, Math.round(satisfaction / 20 + 0.4)));
}

/** "Loved the Buffet, but the line at the Snack Bar was huge." */
export function reviewText(stars: number, memories: Memory[]): { text: string; buildingId: number | null } {
  const best = memories.filter((m) => m.weight > 0).sort((a, b) => b.weight - a.weight)[0];
  const worst = memories.filter((m) => m.weight < 0).sort((a, b) => a.weight - b.weight)[0];
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (best && worst) {
    const text = stars >= 3 ? `${cap(best.text)}, but ${worst.text}.` : `${cap(worst.text)}, though ${best.text}.`;
    return { text, buildingId: (stars >= 3 ? best : worst).buildingId };
  }
  if (worst) return { text: `${cap(worst.text)}.`, buildingId: worst.buildingId };
  if (best) return { text: `${cap(best.text)}!`, buildingId: best.buildingId };
  return {
    text: stars >= 4 ? 'A lovely, relaxing stay!' : stars >= 3 ? 'A pleasant enough stay.' : 'Not much to do here.',
    buildingId: null,
  };
}

export function rating(reviews: Review[]): number {
  const recent = reviews.slice(-RATING_WINDOW);
  const sum = recent.reduce((s, r) => s + r.stars, 0) + PRIOR_STARS * PRIOR_REVIEWS;
  return sum / (recent.length + PRIOR_REVIEWS);
}
