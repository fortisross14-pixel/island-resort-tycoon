// Run with: npm run playtest  (prints a day-by-day economy table; not part of `npm test`)
import { it } from 'vitest';
declare const process: { env: Record<string, string | undefined>; stdout: { write(s: string): void } };
import { runPlaytest, type Strategy } from '../src/sim/harness';

const days = Number(process.env.DAYS ?? 30);
it('playtest', () => {
  for (const strategy of (process.env.STRATEGY ?? 'starter,bot').split(',') as Strategy[]) {
    for (const seed of (process.env.SEEDS ?? '1').split(',').map(Number)) {
      const { log, analysis: a } = runPlaytest({ strategy, days, seed });
      const cols = ['day', 'money', 'profit', 'roomIncome', 'spending', 'costs', 'arrived', 'housed', 'turnedAway', 'rating', 'research', 'rooms', 'buildings', 'plots', 'avgSatisfaction', 'reviewStars', 'medal'] as const;
      const head = cols.map((c) => c.slice(0, 7).padStart(8)).join('');
      const rows = log.map((l) => cols.map((c) => String(l[c] ?? '-').padStart(8)).join(''));
      const brief = process.env.BRIEF ? [rows[0], rows[1], rows[4], rows[9], rows[14], rows[19], rows[29]].filter(Boolean) : rows;
      process.stdout.write(`\n== ${strategy} seed ${seed} ==\n${head}\n${brief.join('\n')}\n`);
      process.stdout.write(`reviews ${a.reviews}, avg ★${a.avgStars}\n`);
      process.stdout.write('payback: ' + a.payback.map((p) => `${p.kind}×${p.count} ${p.perDay}/day → ${p.days}d`).join(' | ') + '\n');
      process.stdout.write('complaints: ' + a.complaints.map(([t, n]) => `${t} (${n})`).join('; ') + '\n');
      process.stdout.write('praise: ' + a.praise.map(([t, n]) => `${t} (${n})`).join('; ') + '\n');
    }
  }
});
