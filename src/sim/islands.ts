import type { Layout, Plot, Tile } from './world';

/**
 * Hand-authored islands (Pass 4). Each map is three layers of text, one character per tile:
 *
 *  - terrain: `~` deep sea, `-` shallow sea, `*` reef, `o` lagoon (inland water),
 *             `s` sand, `g` grass, `j` jungle, `k` rock
 *  - heights: `.` or `0`–`3` for land (water is always 0)
 *  - plots:   `.` not for sale (sea), otherwise a letter per plot of land you can own
 *
 * The dock is a sand tile on the south coast with water below it, where the pier runs out
 * to the ferry. Edit the text to reshape an island; `tests/islands.test.ts` checks the rules.
 */
export interface IslandDef {
  id: string;
  name: string;
  blurb: string;
  /** Tiny, small, medium or large: shown on the map and used to pick ferry sizes later. */
  scale: 'tiny' | 'small' | 'medium' | 'large';
  dock: Tile;
  /** Plot letters you own at the start. */
  start: string[];
  terrain: string[];
  heights: string[];
  plots: string[];
}

export type TerrainCode = '~' | '-' | '*' | 'o' | 's' | 'g' | 'j' | 'k';

export const ISLANDS: IslandDef[] = [
  {
    id: 'coconutKey',
    name: 'Coconut Key',
    blurb: 'A tiny island with one sheltered cove beach and a jungle hill.',
    scale: 'tiny',
    dock: { x: 13, y: 18 },
    start: ['A'],
  terrain: [
    '~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~--------~~~~~~~~~~~~',
    '~~~~---------------~*~~~',
    '~~~---ssss--------*****~',
    '~~~---sjjjs--ssss-*****~',
    '~~~--sgjjjjssjjgs-*****~',
    '~~~---sjjgkkgjjggs*****~',
    '~~----sjjjjjjjgggs--*~~~',
    '~----sggjjjjgjjgggs---~~',
    '~---sggggjjjjjggggs----~',
    '~--sgggggggggggggggs---~',
    '~--sggggggggggggggggs--~',
    '~--ssgggggggggggggggs--~',
    '~----sssgsggggggssss---~',
    '~-------sssggsssssss---~',
    '~~~-----sssssssssss---~~',
    '~~~~~~---sssssss------~~',
    '~~~~~~----ssss-------~~~',
    '~~~~~~~-----------~~~~~~',
    '~~~~~~~~-------~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~',
  ],
  heights: [
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........11..............',
    '.......1112..11.........',
    '.......11222211.........',
    '.......11222211.........',
    '.......11122111.........',
    '........111111..........',
    '.........1111...........',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
  ],
  plots: [
    '........................',
    '........................',
    '........................',
    '........................',
    '......CCCC..............',
    '......CCCCC..CCCC.......',
    '.....BCCCCCCCCCCD.......',
    '......BCCCCCCCCDDD......',
    '......BBCCCCCCCDDD......',
    '.....BBBBCCCCCDDDDD.....',
    '....BBBBBBCAAADDDDD.....',
    '...BBBBBBBAAAADDDDDD....',
    '...BBBBBBBAAAAADDDDDD...',
    '...BBBBBBAAAAAAADDDDD...',
    '.....BBBBAAAAAAADDDD....',
    '........BAAAAAAAADDD....',
    '........AAAAAAAAADD.....',
    '.........AAAAAAA........',
    '..........AAAA..........',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
  ],

  },
  {
    id: 'twinPalms',
    name: 'Twin Palms',
    blurb: 'Two jungle hills around a calm inner lagoon, with a long beach in the south.',
    scale: 'medium',
    dock: { x: 18, y: 29 },
    start: ['A'],
  terrain: [
    '~~~~~~~~~~~~~~~~****~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~******~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~******~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~******~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~----******--~~------~~~~~',
    '~~~~~~~~~-------****-----------~~~~~',
    '~~~----------s----sss------ss---~~~~',
    '~~---------ssgssssgggs---ssjs---~~~~',
    '~~---ss----sjjggggggggsssgjjjs---~~~',
    '~~--sjjssssjjjgggssgggjjjjgjjs----~~',
    '~~--sjjjjjjjggjssoossggjjjjjjjs----~',
    '~~--sjjjjjggjjsoooooosjjjjjggjjs----',
    '~~--sjgjkkjjgjsoooooosjjjggjjggjs---',
    '~---sjjjgjjjjsoooooooosjjgggjgjggs--',
    '----sjjjjjjjjsoooooooosjjgjgjjjjgs--',
    '---sjjggjjjjjjsoooooosgjjgjjjjjggs--',
    '--sggjjgjjgjjgsoooooosgggjggjjgggs--',
    '--sgggggjjgggggssoossgggggggggggs---',
    '-sgggggggggggggggssggggggggggggs----',
    '--sggggggggggggggggggggggggggggs---~',
    '---ssssggggggggggggggggggggggggs**~~',
    '-------sgggggggggggggggggggggggs***~',
    '~------sgggggggggggggggggggggggs***~',
    '~~---ssggggggggggggggggggggggggs**~~',
    '~~--sggggggggggggggggggggggssggs--~~',
    '~~--sssssgsssgggggggggggsss--sss--~~',
    '~~-----sssssssgggggsssssssss------~~',
    '~~-----ssss-sssgggssssssssss------~~',
    '~~~~~--sss--ssssssssssssssss--~~~~~~',
    '~~~~~-------sssssss-----------~~~~~~',
    '~~~~~-------ssssss------------~~~~~~',
    '~~~~~~~~~~-----------~~~~~~~~~~~~~~~',
    '~~~~~~~~~~----------~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  ],
  heights: [
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '.........................1111.......',
    '.....11....11..........111111.......',
    '.....11222211..........1112211......',
    '.....122222211........111222211.....',
    '.....122332211........1122222211....',
    '.....12233221..........122222211....',
    '.....12222221..........112222111....',
    '.....11222211..........11122111.....',
    '.....11111111..........11111111.....',
    '.......1111..............1111.......',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
  ],
  plots: [
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '.............D....EEE......EE.......',
    '...........DDDDDDFFEEE...EEEE.......',
    '.....DD....DDDDDDFFEEEEEEEEEEE......',
    '....DDDDDDDDDDDDFFFFEEEEEEEEEE......',
    '....DDDDDDDDDDDDF..FEEEEEEEEEEE.....',
    '....DDDDDDDDDDD......EEEEEEEEEEE....',
    '....DDDDDDDDDDD......EEEEEEEEEEEE...',
    '....DDDDDDDDDD........EEEEEEEEEEEE..',
    '....DDDDDDDDDD........EEEEEEEEEEEE..',
    '...DDDDDDDDDDDF......FEEEEEEEEEEEE..',
    '..DDDDDDDDDDDFF......FFEEEEEEEEEEE..',
    '..DDDDDDDBBBBFFFF..FFFFCCCCEEEEEE...',
    '.BBBBBBBBBBBBBFFFFFFFFCCCCCCCCCC....',
    '..BBBBBBBBBBBBFFFFFFFFCCCCCCCCCC....',
    '...BBBBBBBBBBBBFFFFFFCCCCCCCCCCC....',
    '.......BBBBBBBBAAAAAACCCCCCCCCCC....',
    '.......BBBBBBBBAAAAAACCCCCCCCCCC....',
    '.....BBBBBBBBBAAAAAAAACCCCCCCCCC....',
    '....BBBBBBBBBBAAAAAAAACCCCCCCCCC....',
    '....BBBBBBBBBBAAAAAAAACCCCC..CCC....',
    '.......BBBBBBBAAAAAAAACCCCCC........',
    '.......BBBB.BBAAAAAAAACCCCCC........',
    '.......BBB..BAAAAAAAAAACCCCC........',
    '............BAAAAAA.................',
    '............BAAAAA..................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
  ],
  },
];

export function islandDef(id: string): IslandDef {
  const d = ISLANDS.find((i) => i.id === id);
  if (!d) throw new Error(`Unknown island ${id}`);
  return d;
}

const PLOT_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Turn an island's text layers into the World's layout. */
export function islandLayout(id: string): Layout {
  const d = islandDef(id);
  const size = d.terrain.length;
  const letters = [...new Set(d.plots.join('').replace(/\./g, ''))].sort();
  const plots: Plot[] = letters.map((ch) => {
    let x0 = size;
    let y0 = size;
    let x1 = -1;
    let y1 = -1;
    d.plots.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c !== ch) return;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }),
    );
    return { id: PLOT_LETTERS.indexOf(ch), x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, owned: d.start.includes(ch), buyable: !d.start.includes(ch) };
  });
  return {
    id: d.id,
    name: d.name,
    size,
    dock: { ...d.dock },
    plots,
    terrain: d.terrain.join(''),
    heights: d.heights.join('').replace(/\./g, '0'),
    plotMap: d.plots.join(''),
  };
}
