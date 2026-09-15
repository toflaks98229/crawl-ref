# Project conventions

`crawl-ref/` is the upstream Dungeon Crawl Stone Soup tree — follow its own
style there. Everything below governs new work, which lives in `experiments/`.

## Visual style: console text cells, not square tiles

Every grid-based visual — game boards, maps, effect surfaces, anything laid out
in character cells — is styled as **cmd/console text**, not as a square tile
grid.

**1. Cells are taller than they are wide.** A console character cell is the
VGA text-mode 8×16 box: width 1, height 2. Do not draw square cells. Express it
as a token so it stays tunable:

```css
--cell-w: clamp(22px, 5.2vw, 30px);
--cell-ratio: 2;                                  /* console cell: 1 wide, 2 tall */
--cell-h: calc(var(--cell-w) * var(--cell-ratio));
```

Anything computing visual distance across the grid has to correct for this, or
circles come out as ovals. Crawl does exactly this in `orb_animation`
(`view.cc:519`), where the metric is `dx*dx*4/9 + dy*dy` — x counts less
because cells are taller than wide.

**2. Every character occupies exactly one cell — including CJK.** This is the
one thing NOT to inherit from cmd. A real console gives 한글, 漢字, かな and
emoji two columns, which breaks grid alignment the moment any non-Latin text
appears. Here a wide glyph is compressed to fit its single cell instead.

Measure the glyph's advance against the half-width advance and scale the
difference away on the x axis:

```js
var s = advance(ch) > advance("M") * 1.02 ? advance("M") / advance(ch) : 1;
span.style.transform = "scaleX(" + s + ")";
```

`experiments/ascii-anim/web/cellgrid.js` implements this, caches per character,
and handles emoji and box-drawing the same way. Reuse it rather than
reimplementing; `cellgrid-test.html` is its proof, showing the same string laid
out both ways.

Re-measure after webfonts load (`document.fonts.ready`) — advances measured
against a fallback face are wrong.
