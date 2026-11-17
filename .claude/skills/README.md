# Project skills

Seven game-dev skills from [gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills)
(commit `c6ca6c4`, 2026-11-12), Apache-2.0: see `LICENSE-awesome-gamedev-agent-skills` and
`NOTICE-awesome-gamedev-agent-skills`. Copied unchanged.

| Skill | Why it's here |
|---|---|
| `game-ui-ux` | HUD and menu layout, safe areas, screen stack, text size, contrast, accessibility |
| `game-feel` | Juice: eased pops, number pops, shake, feedback tiers, reduce-motion options |
| `input-systems` | Touch controls, actions over raw keys, accessibility checklist for controls |
| `performance-optimization` | Frame budgets, draw calls, pooling, measuring on target hardware |
| `save-systems` | Versioned saves, migrations, backups, telling the player when a save fails |
| `threejs-scene-setup` | Renderer, loop, resize, pixel-ratio budget, disposal (three r187) |
| `threejs-materials-lighting` | Lights, shadows, tone mapping (three r187) |

Left out on purpose: `camera-systems` (follow and orbit cameras; this game has a fixed-corner
pan and zoom camera) and the engine- and genre-specific skills.

The audit of the game against these skills is in `docs/AUDIT.md`.
