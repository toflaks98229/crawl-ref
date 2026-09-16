# Terrain the Dwarf Fortress way — and what to build it in

Two questions, in order: what DF actually does for terrain, generation and
motion alike; and which language or engine suits it. The second question is
answered with measurements taken here rather than with received opinion —
`web/terrainbench.mjs` and `web/capabilities.html` are the working code, and
every number below comes out of them.

---

## 1. What DF generates, and in what order

**Elevation** comes from **midpoint displacement**: a grid of
`2 × MeshSize − 1` points is seeded with weighted random values, the space
between is smoothed, and noise is added per an X and a Y variance. Setting
variance to 400 in X and 50 in Y gives a world that varies east-west far more
than north-south — which is to say the shape of the world is a parameter, not
a seed.

**Five scalar fields** carry everything: elevation, rainfall, temperature,
drainage and volcanism (savagery and good/evil ride alongside). Rainfall is
biased by rain shadow. Drainage says how fast water leaves.

**Rivers and erosion** are carved rather than drawn: the algorithm picks out
the bases of mountains, runs a temporary path downhill always preferring the
lowest neighbour, and **digs the current square down when no neighbour is
lower**, until it reaches ocean or sticks. Lakes form, loops are repaired, and
flow volume is summed afterwards to work out which rivers are tributaries of
which.

**Biomes are not placed.** They are read off the fields by threshold — rainfall
≥ 66/100 with drainage < 50 is a swamp, and so on. Then civilizations and
history run on top.

**Rejection** is the last stage and the one worth stealing: a long list of
parameters describe what the world must contain, and any world failing any one
of them is thrown away and re-rolled. Shape the generator loosely, then reject
hard.

> The insight for us: **DF generates fields, not features.** A swamp is what
> happens when two scalars cross. That is exactly the shape of `resolveFX`,
> which already accumulates per cell and resolves to a glyph at the end. The
> mapping layer we would need is a layer we already wrote.

Scale, for calibration: a medium DF world is 129×129 region tiles, each region
tile covering 16×16 local blocks. So 2049² is roughly a medium world one step
below region resolution — the size the benchmark below uses.

---

## 2. What DF animates — almost nothing, on purpose

This is the finding that matters most, and it cuts against the question as
posed. DF has no terrain animation system.

- Water is `≈` and `~` in blues and white. A toggle shows the 1–7 fill level as
  a white digit. Things falling in make splashes and ripples.
- Snow and ice are white and cyan tiles. Rain washes a tile clean of blood and
  vomit. Cold freezes standing water, rivers included.
- Magma is the same fluid system with a different palette.

The motion is **emergent, not scripted**. The 0–7 value in each tile genuinely
changes every tick, and the renderer is a pure `value → (glyph, colour)` map
with no timeline in it at all. Water looks alive because it *is* moving, not
because anything is playing an animation of water moving.

That is the opposite of all seven primitives this project started from. A
`bolt::draw` beam has a life, plays out and is discarded; it is a scripted
effect. Terrain needs the other kind: a persistent scalar field that the
renderer reads every frame. The good news is that `resolveFX` is already a
value-to-glyph resolver — it climbs the `HOTTER` colour chain and thickens the
glyph past three and five overlaps. Pointing it at a persistent grid instead of
a transient effect list is a small change, not a new system.

---

## 3. Where DF's cost goes, and the trap in it

DF is **single-threaded** and bounded by single-thread CPU clock. And by its
own wiki, **water is the single largest FPS drain in the game**: every square
carrying flow is recalculated every tick, and players are advised outright not
to build mist generators or pump stacks.

So the most admired terrain simulation in the genre is also the one whose
terrain simulation kills it — and it is written in C++. **Being in a fast
language did not save it.** That is reason enough to measure before choosing a
language rather than after.

---

## 4. What we measured

`node web/terrainbench.mjs`. Three kernels, each written twice — once in
JavaScript and once in C compiled to `wasm32` — from the same xorshift32, so
each pair is checksum-compared before its times are reported. A row whose
checksums disagree is not a measurement.

Node v22, no GPU, medians of 3–7 runs.

| kernel | scale | JS ms | wasm ms | wasm/JS |
|---|---|---|---|---|
| diamond-square | 257² = 66k | 1.50 | 0.39 | 0.26× |
| diamond-square | 513² = 263k | 5.02 | 0.84 | 0.17× |
| diamond-square | 1025² = 1,051k | 21.6 | 3.49 | 0.16× |
| diamond-square | 2049² = 4,198k | 84.8 | 14.0 | 0.16× |
| gen + carve | 513², 200 rivers | 10.5 | 2.65 | 0.25× |
| gen + carve | 1025², 800 rivers | 28.5 | 5.93 | 0.21× |
| fluid tick | 128×128×3 = 49k, 40% wet | 0.44 | 0.21 | 0.47× |
| fluid tick | 256×256×4 = 262k, 40% wet | 2.03 | 1.03 | 0.51× |
| fluid tick | 256×256×4 = 262k, 90% wet | 2.71 | 1.34 | 0.49× |

Two things fall straight out:

**Generation is not a performance question.** A whole DF-medium heightfield is
85ms in plain JavaScript, once, at world creation. Carving 800 rivers into a
1025² field is 28.5ms. There is nothing to optimise here.

**wasm's win is real but bounded** — 5–6× on the float-heavy generation,
**2× on the byte-array fluid tick**, because the fluid kernel is memory-bound
and the JIT does fine at it. 2× is the honest number for the per-frame work.

### The number that actually decides it

DF full-scans the map every tick. The alternative is an active set: touch only
the cells that moved last tick plus what they disturbed. Same rules, same
seeding, so the two are comparable tick for tick.

An instantaneous flood — 262k cells, 40% of the top plane dropped to 7/7 at
once:

| tick | active cells | ms | units moved |
|---|---|---|---|
| 1 | 26,303 | 9.30 | 168,405 |
| 2 | 118,972 | 17.5 | 171,326 |
| 3 | 168,276 | 6.73 | 172,705 |
| 10 | 4,273 | 0.11 | 198 |
| 15 | 0 | 0.00 | settled |

`full scan: 2.13ms/tick in JS, 1.06ms/tick in wasm — every tick, forever.`
`active set: 61.3ms for all 400 ticks in JS (0.15ms average).`

And the case that decides whether a map can have rivers at all — a spring
refilled to 7/7 every tick, forever, measured over the last 100 of 400 ticks:

```
steady state: 607 active cells, 0.03ms/tick
the same grid full-scanned: 2.13ms/tick  (75× the work, for the same water)
```

**The algorithm is worth 75×. The language is worth 2×.**

### The checks that make those numbers mean something

Two assertions run alongside:

- **conservation** — 184,121 units in, 184,121 out.
- **stability** — a reference full scan over the settled grid must move zero
  further units.

The stability check earned its place immediately: the first marking policy woke
only the destination cell and its neighbours, and left **624 units still
movable** on a grid it claimed had settled. Water that quietly stops moving
looks correct on screen and is not. Marking both ends of every move — the
source just lost fluid, so a neighbour level with it may now want to spill
in — fixed it. Without the assertion the speed figure above would have been a
measurement of a bug.

---

## 5. What a browser allows with no server

`web/capabilities.html`, opened over `file://` in Chromium:

| capability | over `file://` |
|---|---|
| Blob-URL Worker | **yes** — background work needs no server |
| Transferable ArrayBuffer | **yes** — 1MB handed over and back, source detached |
| SharedArrayBuffer | **no** — needs COOP/COEP headers, so it needs a server |
| wasm inlined as base64 | **yes** — instantiates and runs |
| `fetch()` of a sibling `.wasm` | **no** |

Three consequences:

1. **A worker is free.** Generation can run off the main thread with no server
   and no build step — which is precisely the thing DF, single-threaded,
   structurally cannot do.
2. **Give up SharedArrayBuffer**; hand grids across as transferable buffers
   instead. Measured working, zero-copy.
3. **wasm costs the single-file property nothing** — inline the module as
   base64. What does not work is fetching a `.wasm` sitting next to the page.

---

## 6. The answer on language: stay in JavaScript

In order of weight:

1. **The measured lever is the active set (75×), not the language (2×).**
   Spending the rewrite budget on the language buys the smaller number.
2. **The one-time costs already fit** — 85ms for a DF-medium heightfield,
   28.5ms for 1025² plus 800 rivers, in the slow language.
3. **The existing engine is the asset**: `cellgrid.js`'s single-cell CJK
   fitting (which the game survey found nothing else in this space does), the
   dirty-cell diff, the layer compositor. All JavaScript, all already written.
4. **A worker buys concurrency for no language cost** — the one structural
   advantage available over DF.

### When to reach for wasm

Named triggers, not "never":

- **Multi-pass hydraulic erosion.** One carve pass is 6ms; a hundred iterations
  of droplet or shallow-water erosion over 1M cells is where 5× turns a 2-second
  generation into a 10-second one.
- **A per-frame pass that genuinely cannot be reduced to an active set.**
  Whole-map temperature diffusion is the likely candidate, since every cell
  changes a little every tick.
- **Generation above ~4096².** Extrapolating, ~340ms in JS — still fine once,
  but measure rather than believe it.

The adoption cost is now known rather than guessed: `clang --target=wasm32 -O3
-nostdlib`, a **4,154-byte** module, **0.68ms** to instantiate, no toolchain
beyond clang, and inlined as base64 so nothing about delivery changes.
`web/terrainkernels.c` is a working template; keep the JS mirror as both the
reference implementation and the checksum oracle, exactly as the benchmark
does.

**Not Rust, for this.** Rust is the better language and the wrong trade here: it
adds cargo, `wasm-bindgen` and a build pipeline to win the same 2–5× that 200
lines of C already wins with one clang invocation. Revisit if a kernel ever
justifies a real toolchain.

---

## 7. The answer on engine: none

| candidate | why not |
|---|---|
| **Godot 4 / Unity** | A scene graph, a node tree and an asset pipeline, all of which we would bypass to draw characters into one canvas. The single rule this project has — the screen is one grid, drawn not marked up — is the thing an engine most wants to take away. |
| **Bevy (Rust ECS)** | The ECS is a genuine fit for a colony sim's entity soup, but it costs the browser story a build pipeline and costs us `cellgrid.js`. |
| **bracket-lib (Rust)** | The closest fit by far — a CP437 console with OpenGL/WebGL/wasm back-ends, built for exactly this. The reason not to: it *is* the renderer, so adopting it means replacing `cellgrid.js`, and the CJK single-cell fitting is the one piece we could not get back. |
| **libtcod / BearLibTerminal / notcurses** | Native only. Adopting one ends the open-the-HTML-file delivery every study in this repo relies on. |

What to take from libtcod is its **algorithm set** — field of view, pathfinding,
noise — not its runtime. Those are a few hundred lines each and are the part
that actually transfers.

---

## 8. So what the prototype looks like

- **Fields, not features.** Elevation, rainfall, temperature, drainage and
  volcanism as `Float32Array` layers; biome by threshold, DF-style.
  `diamond_square` is step one and is written.
- **Rivers by carving**, on the wiki's downhill-and-dig rule. `carve_rivers` is
  written and measured.
- **Reject, don't tune.** Generate loosely, test the result against what the
  world must contain, re-roll on failure. It is cheap at 85ms a world.
- **Generate in a worker**, hand the buffers back transferable. Verified from
  `file://`.
- **Fluid on an active set, never a full scan.** The `cur`/`next` index queues
  plus a mark byte are the design, not an optimisation. Mark both ends of every
  move and their laterals. **Ship the stability assertion with the code, not
  just with the benchmark.**
- **Render by mapping the field, not by scripting an effect.** Water depth 1–7
  onto the existing `RAMP`, heat onto the existing `HOTTER` chain, snow and ice
  onto the palette's whites and cyans. Terrain motion then falls out of the
  simulation the way it does in DF, and costs the renderer nothing beyond the
  dirty diff it already does.
- **Keep the layer rule.** A water level is a `GROUND` write; a splash is `FX`.
  That split is what stops a flood erasing the frame.

---

## Files

| file | what |
|---|---|
| `web/terrainkernels.c` | the three kernels, C → wasm32; the build line is in its header |
| `web/terrainbench.mjs` | the JS mirrors, the A-B harness, the active-set test and the two assertions. Builds the `.wasm` on demand |
| `web/capabilities.html` | what a browser allows with no server. Open it over `file://` and over `http://` and compare |

---

## Sources

- World generation, midpoint displacement, rivers, biome thresholds —
  [DF wiki: World generation](https://dwarffortresswiki.org/index.php/DF2014:World_generation),
  [Advanced world generation](https://dwarffortresswiki.org/index.php/DF2014:advanced_world_generation)
- Fluid rules, 1–7 fill, pressure —
  [DF wiki: Flow](https://dwarffortresswiki.org/index.php/DF2014:Flow),
  [Pressure](https://dwarffortresswiki.org/index.php/DF2014:Pressure)
- Water display, depth digits, splashes —
  [DF wiki: Water](https://dwarffortresswiki.org/index.php/DF2014:Water)
- Weather, snow, freezing — [DF wiki: Weather](https://dwarffortresswiki.org/index.php/DF2014:Weather)
- Single-threading and water as the top FPS drain —
  [DF wiki: Maximizing framerate](https://dwarffortresswiki.org/index.php/DF2014:Maximizing_framerate)
- World sizes and tile hierarchy — [DF wiki: Tile](https://dwarffortresswiki.org/index.php/DF2014:Tile)
- Why ASCII in the first place —
  [Stack Overflow blog](https://stackoverflow.blog/2021/12/31/700000-lines-of-code-20-years-and-one-developer-how-dwarf-fortress-is-built/)
- bracket-lib — [lib.rs](https://lib.rs/gh/thebracket/rltk_rs/rltk),
  [repo](https://github.com/amethyst/bracket-lib);
  libtcod and BearLibTerminal — [libtcod](https://alternativeto.net/software/libtcod/about),
  [BearLibTerminal](http://foo.wyrd.name/en:bearlibterminal)
- Erosion approaches, droplet vs shallow-water, on GPU —
  [GameDev.net writeup](https://gamedev.net/blogs/entry/2277785-real-time-hydraulic-erosion-using-compute-shaders-opengl/2271113/)
