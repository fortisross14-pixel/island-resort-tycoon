# Audit (before Pass 3)

The build as of the expansion, checked against the seven skills in `.claude/skills/`. Measured on an
emulated iPhone 13 (390 × 844) with a 17-building resort. Severity is for a mobile release.
Mockups of three visual directions: https://claude.ai/artifact/DWV2tPXdZHqw1CWBi2FBFF

## Fix first

1. **Readability on phones:** 10–11 px text, 20–27 px tall controls (44 px minimum), and four
   colour pairs that fail contrast (worst 1.7:1).
2. **Draw calls:** 599 for 17 buildings; each building is 20–40 separate meshes.
3. **Feedback on key moments:** placing, medals, research and rating changes only show a toast;
   no sound.

## Already good

Touch model (one finger tool, two fingers pan and pinch, drag from the tray); safe-area insets;
a cheap simulation (0.011 ms per tick); instanced guests and terrain; render-on-demand while
paused; coin pops and eased plot rises; numbers next to every colour signal; versioned JSON saves
with autosave.

## Findings

| Area | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| UI | High | Text too small | 10 and 11 px labels | 12 px floor for meta, 15 px body; icons replace subtitles |
| UI | High | Touch targets too small | Speed buttons 22–28 × 20 px, tabs 26 px, close 25 × 27 px | 44 px hit areas |
| UI | High | Contrast fails | White on green 2.7:1, on coral 2.3:1, score bubble 1.7:1, gold stars 2.35:1 | Darker fills or dark text |
| UI | Med | Too much to read | 28 build cards in one row, cut-off subtitles, long hints | Categories, icon + price cards, info button or long-press |
| UI | Med | Overlays handled one by one | Seven overlays with separate state | One screen stack |
| UI | Med | HUD polls every frame | Clock, queue, research, locks, goals | Update from sim events |
| UI | Low | Tray not keyboard-usable | pointerdown only, no focus ring | click handlers, `:focus-visible` |
| UI | Low | English only | Strings in code, fixed widths | String table, content-sized cards |
| Feel | High | Placement has no feedback | Toast only | Pop, dust, "−cost" number, sound |
| Feel | Med | Big moments are flat | Medal, research, rating, ferry | Feedback tiers (medium, large) |
| Feel | Med | No audio | — | 6–8 short effects and a mute |
| Feel | Low | No reduce-motion | No settings screen | Settings; respect `prefers-reduced-motion` |
| Perf | High | Too many draw calls | 599 calls, 384 geometries | Merge per building by material; instance paths |
| Perf | Med | Pixel ratio 2 on phones | 4× the pixels of 1× | Cap 1.5 on touch, adapt from frame time |
| Perf | Med | Full rebuild on every edit | 6 ms per edit, growing | Incremental add/remove; shared geometries |
| Render | Med | Deprecated shadow type | "PCFSoftShadowMap has been removed" warning | `PCFShadowMap` |
| Perf | Low | No real-device numbers | Emulator only | 15-minute session on a mid-range phone |
| Render | Low | No tone mapping | Fine for flat shading | Optional, per visual style |
| Saves | Med | Old saves discarded | Version mismatch starts fresh | Migration chain + saved-file fixtures test |
| Saves | Med | Silent save failures | Storage full or private mode | One-time notice |
| Saves | Low | One copy only | No backup | Keep the previous autosave |
| Input | Low | Long-press unused | — | Long-press for details |
| Input | Low | Shortcuts hidden | Only in the README | Tooltips and a help sheet |
| Design | Med | No onboarding | Empty island and 28 buttons | Guided first day |
| Design | Med | Fun venues earn little | 30+ day payback unless next to rooms | GDD neighbour appeal |
| Design | Low | Research is a flat row | Gates not visible | Draw it as a tree |

## Visual directions

- **A · Lagoon Glass:** frosted glass over the sea, a five-icon dock, category sheets, details
  behind an info button. Closest to today; lowest effort.
- **B · Toybox Pop:** chunky outlined buttons, a colour per building family, bouncy rewards.
  Strongest game feel; needs feedback rules to stay calm late game.
- **C · Harbour Chart:** navy-on-chart-paper with signal flags; the interface stays at the edges,
  and an action ring opens around a tapped building. Most screen for the island; highest effort.

## After Pass 3 (Lagoon Glass)

Same iPhone 13 emulation and 17-building resort.

| Measure | Before | After |
|---|---|---|
| Draw calls | 599 | 158 |
| Geometries | 384 | 208 (per-building copies kept for quick edits) |
| Pixel ratio on phones | 2 | 1.5 |
| Smallest text | 10 px | 12 px |
| Tap targets under 44 px | 12+ | 0 |
| Contrast failures | 4 pairs | 0 known |
| Rebuild on a floor edit | 6 ms | 1.8 ms |

Fixed: text size, targets, contrast, card overload (categories + info button + long-press),
keyboard use of cards, placement feedback, big moments, audio, reduce-motion, draw calls, pixel
ratio, full rebuilds, the shadow-type warning, silent save failures, hidden shortcuts (menu),
old saves (migration chain + fixtures), one copy only (daily backup), overlays (Esc closes the top
layer), HUD polling (research and locks), onboarding (guided first day), research as a flat row
(tier tree), no tone mapping (replaced by day/night lighting keys).
Open: string table, neighbour appeal, real-device numbers.
