# Lantern Hours — presentation backlog

**Tiers 1 and 2 are done** (items 1-8). Tier 3 and 4 remain.

Ordered. Each item says what the code does *now*, so the gap is checkable
rather than a matter of taste. "Reuses" names machinery that already exists,
because almost none of this needs new systems.

---

## Tier 1 — the effects that read as placeholder

### ~~DONE~~ 1. The whip does not swing

**Now:** `fireArm` pushes a `line` effect with `x1 = you.x ± len, y1 = you.y`.
It is a horizontal ray that extends outward; the arm never moves through an
arc, and damage is a box test around the ray's midpoint.

**Do:** sweep the line through an angle across the effect's life — wind up
behind, pass through the front, follow through — and pick each cell's glyph
from the tangent, `-` `\` `|` `/`. Damage applies to the cells the arc has
already passed, so the front of the swing lands first.

**Reuses:** `delve.html` already does exactly this for axe cleave: an arc
ordered by angle from the wielder, revealed by progress, leaving its trail
behind it the way `bolt::draw` deliberately does not clean up. Lift that.

**Cost:** small. One new `fx` kind, ~25 lines.

### ~~DONE~~ 2. The fire is a rectangle that does not move

**Now:** `lightFire` seeds the whole bottom row of a `w × h` grid at full
heat, so the base is a hard-edged rectangle with a straight bottom, and the
source never changes. Propagation is the DOOM rule and looks right; the
footprint and the source do not.

**Do:** three separate changes, in order of payoff.
- Seed the source row from a **disc**, not a rectangle: heat falls off with
  distance from the blast centre, so the base is round and ragged.
- **Flicker the source** each tick — vary seed heat by ±2 per cell — so the
  flame is never the same shape twice.
- Add a slow **drift**, biasing the sideways term one way and rotating it
  over a few seconds, so the column leans like it is in a draught.

**Reuses:** `spreadFire` as written; only the seeding and the `rand - 1`
drift term change.

**Cost:** small. The disc and the flicker are a few lines each.

### ~~DONE~~ 3. `banish_animation` is the one primitive this game never uses

**Now:** of the seven ported at the start of the project, six are in play —
`bolt::draw` (whip, knives, arc), `bolt::explode` (fire pot),
`draw_ring_animation` (censer), `orb_animation` (lantern),
`shake_viewport_animation` and `flash_view_delay` (taking a hit). `banish`
is not called anywhere.

**Do:** two places want it.
- **Player death.** The field dissolves cell by cell, with rising
  probability, until nothing is left — then the panel. It is the animation
  Crawl wrote for exactly this feeling.
- **Foe arrival, reversed.** Run it backwards on the spawn ring so foes
  condense out of the dark instead of appearing whole. Currently they simply
  exist at `F.w * 0.62` and walk in.

**Reuses:** the port in `experiments/ascii-anim/anim.py` is the reference;
`breach.html` has a working JS version.

**Cost:** small for death, medium for spawn (needs a per-foe fade-in flag).

---

## Tier 2 — weight and readability

### ~~DONE~~ 4. Being hit does not move anything

**Now:** `hurtFoe` sets `m.hurt = 0.07`, which only swaps the foe's colour to
white for four frames. A foe struck by a battleaxe-equivalent and a foe
grazed by a knife look identical and neither moves.

**Do:** knock the foe back along the blow's direction, scaled by damage
against its own mass, and let it recover over ~0.15s. Heavy hits shove a
whole line of the crowd, which is most of what makes a survivors-like feel
good.

**Cost:** small. A `kx, ky` on each foe, decayed in `step`.

### ~~DONE~~ 5. Kills leave nothing behind

**Now:** a `pop` effect for 0.22s, a gem, and the foe is gone the same frame.
At a few hundred kills a minute the field has no memory of what happened.

**Do:** leave an ash mark — a dim `,` or `.` on the ground layer that fades
over a couple of seconds. Cheap, and it makes a cleared lane visible.

**Reuses:** the ground pass; ash is just a sparse overlay above it.

**Cost:** small, but watch the cap — a few hundred marks, oldest dropped.

### ~~DONE~~ 6. Damage numbers collide into nonsense

**Now:** every hit pushes its own `num`. Two foes struck in the same cell in
the same tick render as `3232`, which was visible in testing.

**Do:** aggregate per foe over a short window — hold a running total on the
foe for ~0.15s and emit one number when it closes. Fewer, larger, readable
numbers, and fewer effect entries.

**Cost:** small.

### ~~DONE~~ 7. Low health has no tell

**Now:** the HP bar shrinks. Nothing else changes, and the player's eyes are
on the field, not the bar.

**Do:** shift the frame colour toward red below a third, and pulse it on the
beat of the i-frame. The frame is already redrawn every frame and is the one
element always in peripheral vision.

**Reuses:** `drawShell`; one colour argument.

**Cost:** trivial.

### ~~DONE~~ 8. Pressure from off screen is invisible

**Now:** the field is 96 by 46 world units while foes walk in from a circle
wider than either — the same asymmetry that was making weapons aim at
nothing until it was fixed. A wall closing from above is unannounced.

**Do:** mark the frame edge where off-screen foes are massing: a character
per frame cell, brightness by how many are out there in that direction.

**Reuses:** the frame row and columns `drawShell` already paints.

**Cost:** small.

---

## Tier 3 — motion and moment

### 9. The player never moves

**Now:** `@` in one colour, changing only for the i-frame. It slides across
the grid without any sign of walking.

**Do:** a two-frame tell driven by movement — the simplest honest version is
alternating `@` with a second glyph on a short cycle while moving, and
holding still when not. The overhead sprite study argued facing should come
from the last move and never feed back into a roll; the same applies here.

**Cost:** trivial, and easy to overdo. One glyph swap.

### 10. Sparks arrive without travelling

**Now:** a gem inside the pickup radius lerps toward the player and vanishes
at 1.2 units. The pull reads, the arrival does not.

**Do:** a short trail behind a gem under pull, and a one-frame flash on the
player when it lands. Collecting is the loop's reward beat and currently has
no punctuation.

**Cost:** small.

### 11. Level-up is a flash and a menu

**Now:** `flash = 0.2`, then the panel.

**Do:** fire the `orb_animation` wave outward from the player first, then
open the panel — the lantern visibly brightening, which is what the panel's
title already claims is happening.

**Reuses:** the `wave` effect, unchanged.

**Cost:** trivial.

### 12. Nothing marks the minute

**Now:** `spawnWave` ramps `want` continuously from 45 to about 700. The
difficulty climbs smoothly and invisibly.

**Do:** a surge on each minute — a named wave, announced in the status line
for a few seconds, spawning a tighter ring. A single heavy foe at 3:00 and
5:00 gives the run a shape.

**Cost:** medium. The announcement is easy; a boss needs its own behaviour.

---

## Tier 4 — structural, later

### 13. Overlapping fires stack instead of merging

**Now:** each pot pushes a separate grid, capped at eight. Two pots on the
same ground run two simulations that do not interact, and the seams show.

**Do:** merge fires whose footprints overlap into one grid. Worth doing only
once fire is common enough to overlap often.

**Cost:** medium.

### 14. There is no sound

**Now:** none at all. Listed so it is a decision rather than an oversight —
a survivors-like leans on audio for the firing rhythm, and everything above
is trying to carry that visually on its own.

**Cost:** large, and a separate discipline.

---

## Not doing yet

**REXPaint `.xp` loading** and **FIGlet** were surveyed and deliberately
deferred: the first needs hand-drawn art before a parser is anything but dead
code, the second needs a per-font licence check. Both become worth it the day
there is a title screen.
