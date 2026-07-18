# Handoff: 8-bit refresh for Hibol Minesweeper

## Overview
Visual refresh of the infinite-mode Minesweeper (Vue 3 app in `hibol-minesweeper/`): an 8-bit pixel-art treatment, redesigned header/footer info layout, new mine and flag icons, and a "jostled neighbors" effect when a mine explodes. **The existing color palette is unchanged** — this is a typography/shape/layout/icon refresh, not a recolor.

## About the design file
`design-reference.dc.html` in this folder is a **design reference**, built as an isolated HTML mockup — not production code to copy in. Recreate the design directly inside the existing Vue components (`App.vue`, `MineGrid.vue`, `MineCell.vue`, `game.js`, `style.css`), following the codebase's existing patterns (scoped `<style>` per component, the existing `game.js` cell-state model, etc.). Do not introduce a new framework or restructure the app — this is a styling/markup pass on top of the current architecture.

## Fidelity
**High-fidelity.** Colors, fonts, and cell geometry below should be treated as final values, not placeholders. The pixel-art icon grids are given as exact coordinate maps — implement them precisely (as inline SVG `<rect>` grids is the recommended approach, see "Icons" below).

## What changed vs. today
1. **Header/footer layout** — info is redistributed (see "Layout" below); this replaces the current single centered header row + single footer row.
2. **Typography** — pixel fonts replace the system-ui default.
3. **Cell borders** — pixelated (stepped/staircase corners) instead of plain 1px borders.
4. **Mine icon** — replaces the 💣 emoji with a pixel-art spiked naval mine.
5. **Flag icon** — replaces the 🚩 emoji with a pixel-art flag-on-pole (still a flag shape, just redrawn in pixel art — not a new metaphor).
6. **Exploded mine behavior** — a revealed mine simply shows the new mine icon and stays. (An earlier idea of a "gunpowder scorch mark" that replaces the mine was explored and **rejected** — do not implement it. Just show the icon, same as today, only restyled.)
7. **Jostled neighbors** — when a mine is revealed/triggered, its already-revealed neighboring cells get a small random rotation, as if physically bumped by the blast.

## Layout

### Header (top)
- Title `HIBOL MINESWEEPER`, centered, VT323, ~26px, color `#222`.
- Below it, centered, the two mode buttons (`Classic Game` / `Infinite Game`, i.e. the existing `startClassicGame`/`startInfiniteGame` buttons) restyled as pixel buttons (see "Pixel button" token below).
- 2px solid `#333` border under the whole header block.
- Nothing else in the header — no stats here.

### Footer (bottom, infinite mode only — same `v-if="game.mode === 'infinite'"` as today)
- 2px solid `#333` border above the footer.
- Row 1: the danger bar (`Danger:` label + the existing `.danger-bar`/`.danger-bar-fill`), centered, max-width ~340px.
- Row 2, directly under it: the three counters as **plain text, not boxed** — no border/background/button-chip around them (earlier drafts boxed each stat like a button; that read as clickable and was rejected). Format: `CASES {revealedCount} · DRAPEAUX {flaggedCount} · MINES {minesTriggeredCount}`, VT323, 16px, color `#333`, letter-spacing 1px, centered.
- Both rows stacked vertically, centered, gap ~8px, padding `10px 12px`.

This replaces the current single-row header (title + status + flags + buttons) and single-row footer (danger + stats all inline) — the same data, redistributed as above.

## Typography
- **Chrome/labels/buttons/header title**: `VT323` (Google Font). Import: `https://fonts.googleapis.com/css2?family=VT323&family=Press+Start+2P&display=swap`.
- **Cell numbers only** (the 1–8 neighbor-mine count): `Press Start 2P` (Google Font, same import above), 14px, to read bolder/blockier than the rest of the UI. Keep the existing per-number colors unchanged:
  - 1 `#1565c0`, 2 `#2e7d32`, 3 `#c62828`, 4 `#6a1b9a`, 5 `#8d4004`, 6 `#00838f`, 7 `#000`, 8 `#616161`.

## Cell styling
Current cell (`MineCell.vue`): `28px` (`--cell-size`), background `#d5d5d5` unrevealed / `#eee` revealed, `1px solid #999` / `#ccc` border. Keep these colors and size. Add:
```css
clip-path: polygon(
  0 4px, 4px 4px, 4px 0,
  calc(100% - 4px) 0, calc(100% - 4px) 4px, 100% 4px,
  100% calc(100% - 4px), calc(100% - 4px) calc(100% - 4px), calc(100% - 4px) 100%,
  4px 100%, 4px calc(100% - 4px), 0 calc(100% - 4px)
);
```
This gives each cell staircase-cut corners (a pixel-art silhouette) instead of a square/rounded corner. Applies to both revealed and unrevealed cells. Scale the `4px` notch proportionally if the cell size changes.

## Icons
Both icons are drawn as a 9×9 pixel grid (not photographic, not emoji) — implement as an inline SVG with a 9×9 `viewBox`, one `<rect width="1" height="1">` per filled cell, `shape-rendering="crispEdges"`, scaled with CSS to fill the cell (e.g. `width: 70%; height: 70%` centered). This keeps them crisp at any cell size, unlike a rasterized image.

Grid legend: each row below is 9 characters = 9 columns (x=0..8), reading top (y=0) to bottom (y=8). `.` = empty/transparent.

### Mine icon (replaces 💣)
Colors: `X` = `#2b2b2b` (body + spikes, same color), `H` = `#5a5a5a` (highlight), `M` = `#444444` (mid-tone, part of the same highlight bevel).
```
. . . . X . . . .
. X . X X X . X .
. . X X X X X . .
. X X H M X X X .
X X X M X X X X X
. X X X X X X X .
. . X X X X X . .
. X . X X X . X .
. . . . X . . . .
```
This is a round mine body with 8 spikes (4 cardinal + 4 diagonal) and a small 2-pixel highlight for a subtle bevel.

### Flag icon (replaces 🚩)
Colors: `P` = pole/base = `#333333`, `F` = flag = `#d32f2f` (same red already used for the flag/wrong-flag state today).
```
. . . . . . . . .
. . P F F F F . .
. . P F F F . . .
. . P F F . . . .
. . P F . . . . .
. . P . . . . . .
. . P . . . . . .
. . P . . . . . .
. P P P . . . . .
```
A pole with a triangular flag at the top and a small base/foot at the bottom (columns 1–3, row 8).

## Jostled-neighbor effect
When a mine cell is revealed/triggered (in `revealCell`/`openCell` in `game.js`), give each of its **already-revealed** neighbor cells a small persistent random rotation, as if bumped by the explosion:
- Add a `tiltDeg` field to the cell object (default `0`), e.g. in the cell shape created by `createGrid`/`createInfiniteCell`.
- When a mine is opened, iterate `getNeighbors(game, cell)`; for each neighbor that `.revealed` and doesn't already have a `tiltDeg`, assign a random value in **-6deg to +6deg** (seeded or `Math.random()`, doesn't need to be reproducible — this is cosmetic).
- In `MineCell.vue`, apply `transform: rotate({{ cell.tiltDeg }}deg)` inline (this is a genuinely per-cell/per-render value, so a bound style is correct here, unlike the rest of the static CSS above).
- The tilt is permanent once applied — don't reset it, and don't re-roll it if the cell is affected by more than one exploding neighbor (first hit wins).
- The mine's own cell does **not** tilt — only its neighbors.

## Design tokens (unchanged from current app — do not introduce new colors)
- Backgrounds: page/header/footer `#fff`, board area `#f1f1f1`, unrevealed cell `#d5d5d5`, revealed cell `#eee`.
- Borders: `#333` (chrome/dividers), `#999` (unrevealed cell border, also used as pixel-button drop-shadow color), `#ccc` (revealed cell border).
- Text/number colors: see Typography section above.
- Flag/mine red: `#d32f2f`.
- Danger bar fill: `#c0392b` (existing `.danger-bar-fill` — keep as is).
- New icon-only colors (not used elsewhere in the app): mine `#2b2b2b`/`#5a5a5a`/`#444444`, flag pole/base `#333333` (same as chrome border, effectively reused).

### "Pixel button" style (mode buttons, Classic/Infinite)
```css
font-family: 'VT323', monospace;
font-size: 15px;
letter-spacing: 1px;
background: #eee;
border: 2px solid #333;
box-shadow: 2px 2px 0 #999; /* hard-edged, no blur */
padding: 4px 10px;
color: #222;
```

## Assets
No external image assets — both icons are drawn purely in code (SVG rects per the grids above, or an equivalent `box-shadow`/pixel-div technique if SVG isn't convenient). Fonts are Google Fonts (`VT323`, `Press Start 2P`), loaded via the `<link>` above — add to `index.html` `<head>` or import in `App.vue`.

## Files
- `design-reference.dc.html` — the design mockup (open directly in a browser). It shows: header/footer layout, cell grid with pixel borders, a flagged cell, a revealed/exploded mine cell, several jostled (rotated) neighbor cells, and enlarged icon previews at the bottom of the page.
- Source app being modified: `hibol-minesweeper/src/App.vue`, `hibol-minesweeper/src/components/MineGrid.vue`, `hibol-minesweeper/src/components/MineCell.vue`, `hibol-minesweeper/src/game/game.js`, `hibol-minesweeper/src/style.css`.
