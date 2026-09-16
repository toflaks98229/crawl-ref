# What else lives in a character grid

A survey of shipped ASCII games **outside** Crawl, for choosing the next
prototype. No Crawl code is examined here; everything below is external work,
looked at for what it proves is possible in a command-prompt-shaped screen.

Grouped by **what each genre asks the grid to do**, because that — not the
genre label — is what decides whether our engine can carry it. Each entry says
what the game is, what it proves, and what it would cost us given what
`horde.html` already has.

---

## A. The grid as a world map

The mode we are already in: one cell = one place, the camera sits above it.

### Dwarf Fortress (Bay 12, 2006 —)

**Is:** a colony simulation where every dwarf has moods, grudges and a
favourite gem, all read through a text grid. Roughly 700,000 lines by one
programmer over twenty years. In the MoMA collection. The ASCII was an
accident that stuck — it began as a throwaway called *Mutant Miner*, and Tarn
Adams kept it because "the development was so fast and we were not qualified
to draw". A tileset shipped with the 2022 Steam release; the text mode
remains.

**Proves:** the grid scales to a readout for a simulation far denser than
anything it can draw. The glyph stops being a picture of a thing and becomes
an index into a thing.

**Costs us:** nothing in engine, everything in content. The genre is years of
systems, not weeks of presentation.

### Cataclysm: Dark Days Ahead (community, 2013 —)

**Is:** post-apocalyptic survival in the same top-down grid — hunger, thirst,
morale, illness and body temperature tracked per turn, clothing in layers,
bionics, farming, buildable structures, and drivable, repairable vehicles on
a huge destructible map. Deliberately goalless.

**Proves:** a grid game can be *about* its inventory and its body model rather
than its map, and still be legible. Also that ten years of collaborative
content is what makes this genre, not the renderer.

**Costs us:** same as above. Worth reading for its UI density, not as a target.

---

## B. The grid as an arcade screen

Real-time, often scrolling, reflex-driven. Closest in feel to what we built.

### The Kroz series (Scott Miller / Apogee, 1987 —)

**Is:** Apogee's first game. A real-time action-adventure in text mode: the
player is a smiley face, trees are club signs, monsters are letters with
umlauts. Miller split 75 levels into three episodes and gave the first away —
which is where the shareware episode model comes from. It earned him roughly
$80,000–100,000.

**Proves:** action pacing works in a character grid with no animation system
at all — the movement *is* the animation. It is also the origin point for
treating CP437's symbol block as an art supply rather than as text.

**Costs us:** trivial. Everything Kroz does, `delve.html` already does faster.

### ASCII Patrol (msokalski, 2013 —)

**Is:** a *Moon Patrol* remake in text mode, and the most technically relevant
item in this list: it runs on Linux, Windows, Cygwin, DOS **and in a browser**,
installs as a PWA, takes touch input, and runs in monochrome or 16 colours.
Open source.

**Proves:** a horizontally scrolling arcade game in a character grid, in a
browser, at arcade framerates. It is the existence proof for the one thing our
renderer has not been asked to do.

**Costs us:** this is the one entry with a number attached. `web/BENCH.md`
already names the exact situation: run-length batching is "the fallback for
frames that must repaint everything (a zoom step, a camera jump)". **A
side-scroller makes every frame that frame** — the camera moves, so every cell
changes, and the dirty diff that the whole renderer is built around returns
nothing.

At our screen size (a touch over 5,000 cells — `F.w = cols - 2`,
`F.h = rows - 7`) the benchmark puts the dirty path near 1.5ms and the
batched full repaint near 5ms, on the no-GPU floor those figures were measured
on. So scrolling costs roughly 3× the render budget, permanently, and leaves
about 12ms a frame instead of 15ms for simulation and effects.

Affordable — but it spends the headroom the architecture exists to create,
and it does so on every frame rather than on zoom steps. Worth knowing before
choosing this one, not after.

### The ncurses cabinet — bastet, nsnake, nInvaders, moon-buggy

**Is:** the standing terminal arcade repertoire. `bastet` is the one worth
singling out: a Tetris whose bag algorithm deliberately hands you the worst
possible piece, which is a design idea rather than a port.

**Proves:** small, complete, single-mechanic games are the natural unit here.
None of them need more than a grid and a key handler.

**Costs us:** days each. Useful as calibration for how much a prototype should
weigh.

### Curse of War (Alexey Nikolaev, 2013)

**Is:** a real-time strategy game in ncurses where you do **not** control
units. You place infrastructure, secure resources and direct population flow;
the armies move themselves across grid terrain (plains, forest, mountain,
water). Single and multiplayer.

**Proves:** RTS survives the grid precisely by giving up unit micromanagement —
the resolution the grid cannot express is the resolution the design discards.
This is the same trade the Total War study made when it went to semantic zoom.

**Costs us:** low. `breach.html` and `field.html` already have the drag
selection, the semantic zoom and the aspect-corrected distance metric. What is
missing is an economy and an AI, not a renderer.

---

## C. The grid as a stage

Not a map at all — a fixed scene the camera holds while things perform in it.

### Stone Story RPG (Gabriel Santos / Martian Rex, 2019 EA, 1.0 in 2023)

**Is:** the most polished animated-ASCII game ever shipped. A side-scrolling
auto-RPG: the character walks and fights on its own, and the player manages
equipment, crafting and item timing instead of movement. It ships an in-game
scripting language, Stonescript, so players can automate their own tactics.

**Proves:** two things, both large. First, that hand-authored ASCII animation
at keyframe quality reads as *art* rather than as a fallback. Second, that
removing direct control is what buys the animation room to be seen — you
cannot appreciate a two-second attack animation while steering.

**Costs us:** significant, and it is the honest gap in our toolkit. Our seven
primitives are all *procedural* and *per-cell*: a beam, a ring, an explosion.
A stage wants authored, per-sprite, multi-frame animation, which means an art
format and an editor. `web/BACKLOG.md` already defers REXPaint `.xp` loading
for exactly this reason — the parser is dead code until there is art. This is
the genre that would make it live.

### Effulgence RPG (Andrei Fomin, released 2 December 2025)

**Is:** a party-based turn-based RPG built entirely from text symbols, where
defeated enemies break into particles that feed a matter printer that prints
your next weapon. Compared, accurately, to Dwarf Fortress and Geometry Wars at
the same time. 87% positive.

**Proves:** that a 2025 audience will buy ASCII as a *look* and not a
concession — and that particle-density presentation is now the differentiator,
which is the bet our layer system already makes.

**Costs us:** the combat framing is cheap; the shimmer is not. Its glyphs move
in a way our fixed cell grid cannot do without sub-cell positioning.

---

## D. The grid as an instrument panel

The fiction is that you are looking at a terminal. The interface *is* the
diegesis.

### Duskers (Misfits Attic, 2016; sequel announced 2026)

**Is:** you are a drone operator. You never see the derelict ships directly —
you type commands (`navigate 1 r2`, `gather`) and read what comes back on a
grainy CRT. The command set is small enough to memorise and combines in ways
the designers did not plan.

**Proves:** the strongest argument in this whole list for our specific
architecture. Duskers is terrifying *because* the interface is impoverished:
you infer the monster from a motion sensor blip. Our CLAUDE.md rule — no HTML
chrome, every panel drawn in the same grid as the game — stops being an
aesthetic constraint and becomes the horror mechanic.

**Costs us:** almost nothing new. `panel`, `putStr`, `hfill`, the `[1] Name`
menus and the `═ ║ ╔` / single-line frame split already exist and are exactly
this UI. What is missing is a command parser and a fog model. It has no
per-frame effect load at all, so the whole `putFX`/`resolveFX` layer sits
idle — which is either a saving or a waste, depending on the design.

### ASCII Sector (Christian Knudsen / Laserbrain, 2007)

**Is:** a free *Wing Commander: Privateer* remake in ASCII. Trade, fight and
explore a galaxy; space combat is real-time, on-foot combat is turn-based,
and menus are mouse-driven.

**Proves:** you can switch time models *inside one game* — real-time where the
grid is a viewport, turn-based where it is a map — and players accept it.
Also that a full commercial-scale genre (space sim) fits in the grid.

**Costs us:** medium. The real-time/turn-based split is already half-built:
`delve.html` runs Crawl's aut clock in real time, `horde.html` runs continuous
time, and both share the same renderer.

---

## E. The grid as prose

### A Dark Room (Michael Townsend / Doublespeak, 2013)

**Is:** a minimalist text adventure that begins with one button, *stoke fire*,
and slowly becomes a resource game, then a map, then something else. Written
after Townsend played *Candy Box!*. Ported to iOS by Amir Rajan and charted #1
six months later. Open source.

**Proves:** the most successful game in this survey uses almost no grid. Its
power is in **withholding** — every new line of text is an event because there
are so few of them.

**Costs us:** it would waste the engine entirely. Listed because it is the
counter-argument to everything else here: our advantage is density, and
density is not always the win.

---

## F. The grid as a shared room

### BBS door games — TradeWars 2002 (1984), LORD (1989)

**Is:** the original online multiplayer. TradeWars 2002 (Gary Martin) was a
persistent multiplayer space economy whose ANSI art and ANSI *animations* were
drawn by Drew Markham. Legend of the Red Dragon (Robinson Technologies) gave
each player a few turns a day in a shared world; its 1992 sequel added
real-time multiplayer in a top-down ANSI view.

**Proves:** asynchronous persistence — a handful of turns a day in a world
other people are also changing — was invented here, and it is a structure no
one in the ASCII space is currently using. Also that ANSI animation as a
*framing* device (the intro sequence, the arrival) predates all of this.

**Costs us:** high. It needs a server, and it is the only entry in this list
that cannot be a single HTML file.

---

## G. The grid as a renderer for something that is not a grid

### Illuminascii (2015)

**Is:** a first-person shooter drawn in text. Random levels, permadeath, XP,
a hunger clock. Enemies are floating letters; the world mixes conventional
geometry with ASCII.

**Proves:** the character cell survives being a framebuffer for a 3D scene —
this is the aalib idea taken into a real engine. It also shows the failure
mode: reviewers noted the enemies read as "just simple floating letters",
which is what happens when the glyph carries no information the 3D scene does
not already carry.

**Costs us:** a new renderer. But note the one thing that transfers directly:
a raycaster into a 1:2 cell grid needs exactly the aspect correction we
already apply everywhere (`dx*dx*4/9 + dy*dy`, lifted from `orb_animation`).
Everyone who tries this hits that problem; we solved it on day one.

---

## H. The bar for presentation

### Cogmind (Grid Sage Games, 2015 —)

**Is:** the state of the art, and the only entry here worth studying as
technique rather than as genre. Nearly a thousand procedural particle effects,
all defined in **external text files** rather than code.

**Two findings worth stealing outright:**

1. **Animation length is scaled to the weight of the event.** Weak weapons
   animate in 100–200ms; heavy weapons and explosions get 300–1500ms. Effects
   in a fast game cause a pacing problem, and this is the fix: not "make
   everything faster", but "spend the time where it means something". Ours do
   vary by weapon — 0.17s for a knife, 0.22s for the whip arc, 0.42s for the
   fire pot, 0.85s for the lantern wave — but each is a fixed constant. None
   of them scale with the damage actually dealt or with the weapon's level, so
   a level-1 fire pot and a level-5 one land with exactly the same weight.
2. **Effects are data, not code.** A thousand distinct effects is only
   possible because adding one is editing a text file. Ours are JS objects
   with hand-written cases in `resolveFX`.

**Costs us:** finding 1 is a few lines and should probably happen regardless
of which prototype comes next. Finding 2 is a refactor with a real payoff
only past a few dozen effects.

---

## I. The authoring layer

### ZZT (Tim Sweeney, 1991) and MegaZeux (Gregory Janson, 1994)

**Is:** ZZT was a text-mode adventure game **and** a complete game creation
system — every copy shipped the world editor, and objects were programmed in
an embedded scripting language. It funded Epic MegaGames' next game and, by
extension, Epic. MegaZeux followed the same shareware-plus-free-editor shape
three years later. Both spawned modding communities that outlived them by
decades.

**Proves:** the most durable thing you can build in a character grid is not a
game but a **toolkit** — and that the reason is the grid itself. Content is
cheap to author when a level is a text file, so the editor is worth more than
any single level shipped with it. (Cogmind's text-file effects, Stone Story's
Stonescript and Cataclysm's JSON content are the same insight, thirty years
later.)

**Costs us:** large, and it is a different project. But it is the one item
here that reframes the whole question: our seven primitives plus the layer
system plus the cell grid are already closer to a toolkit than to a game.

---

## Adjacent, not ASCII: Desktop Survivors 98 (Brandon Hesslau, 2025)

A Vampire-Survivors-like played **on your actual Windows desktop** — your
cursor is the hero, the weapons are CD Player, MS Paint, Minesweeper and the
Recycle Bin, and Clippy shows up as a sword. Not a character grid at all, but
it is the nearest neighbour to what we built and it wins on exactly the axis
we are working: the interface *is* the world, so every UI element can be a
weapon. That is the idea to take — not the aesthetic.

---

## What recurs across all of them

1. **The grid's real advantage is authoring cost, not looks.** ZZT, Cogmind,
   Cataclysm and Stone Story all independently arrive at "content lives in
   text files". Dwarf Fortress exists at all because nobody had to draw.
2. **Every one that animates well gives up direct control to do it.** Stone
   Story auto-battles, Cogmind is turn-based, Duskers is issued orders.
   Real-time direct control is the hardest case for animation, and it is the
   one we picked.
3. **The successful ones are narrow.** bastet is one idea. A Dark Room is one
   button. The two sprawling ones, Dwarf Fortress and Cataclysm, took a decade
   and a community each.
4. **Nobody else solved the CJK cell problem.** Every game here is
   ASCII/CP437 and sidesteps it. `cellgrid.js` is, as far as this survey
   found, the only piece of work in this space that fits wide glyphs into one
   cell.

## Ranked for what comes next

Given `horde.html`'s engine — cell grid with 1:2 console cells, dirty-diff
canvas, Z-layers with `putFX`/`resolveFX`, seven primitives, UI drawn not
marked up:

**1. The instrument panel (Duskers-shaped).** Highest payoff per unit of new
code. Every piece of UI machinery we built to satisfy "the screen is one grid"
is already the thing this genre needs, and the constraint that has been a
discipline becomes the point. Needs: a command parser, a fog/sensor model, and
tension pacing. Needs no new rendering at all.

**2. The grid-flow RTS (Curse of War-shaped).** Reuses the semantic zoom and
drag selection from `breach.html` / `field.html`, which are currently the two
most finished studies we are not using for anything. Needs: an economy, a flow
model, terrain.

**3. The arcade scroller (ASCII Patrol-shaped).** The one that would teach us
something about the renderer, because scrolling defeats the dirty diff and
forces the full-repaint path we have measured but never lived in.

**Not recommended:** the colony/survival sims (scope is a decade), the
prose game (wastes the engine), the BBS shape (needs a server).

**Do regardless of choice:** Cogmind's finding 1 — scale animation duration to
the weight of the blow. It is a small change to `horde.html` and it is the
single most-cited technique for making an effect-heavy game not feel slow.

---

## Sources

- Cogmind particle effects — [Grid Sage Games devblog](https://www.gridsagegames.com/blog/2014/03/particle-effects/), [more](https://www.gridsagegames.com/blog/2014/04/ascii-particle-effects/), [genre innovation](https://www.gridsagegames.com/cogmind/innovation.html)
- Stone Story RPG — [Wikipedia](https://en.wikipedia.org/wiki/Stone_Story_RPG)
- ASCII Sector — [RogueBasin](https://www.roguebasin.com/index.php/ASCII_Sector)
- Dwarf Fortress — [Wikipedia](https://en.wikipedia.org/wiki/Dwarf_Fortress), [Stack Overflow blog on its construction](https://stackoverflow.blog/2021/12/31/700000-lines-of-code-20-years-and-one-developer-how-dwarf-fortress-is-built/), [MoMA](https://www.moma.org/collection/works/164920)
- Cataclysm: DDA — [Wikipedia](https://en.wikipedia.org/wiki/Cataclysm:_Dark_Days_Ahead), [cataclysmdda.org](https://cataclysmdda.org/)
- Kroz — [Wikipedia](https://en.wikipedia.org/wiki/Kroz), [Hardcore Gaming 101](https://www.hardcoregaming101.net/kroz/), [source](https://github.com/tangentforks/kroz)
- ZZT — [Wikipedia](https://en.wikipedia.org/wiki/ZZT), [How-To Geek](https://www.howtogeek.com/713532/before-fortnite-there-was-zzt-meet-epics-first-game/); MegaZeux — [Tropedia](https://tropedia.fandom.com/wiki/MegaZeux)
- ASCII Patrol — [ascii-patrol.com](http://ascii-patrol.com/), [source](https://github.com/msokalski/ascii-patrol)
- Curse of War — [project page](https://a-nikolaev.github.io/curseofwar/), [source](https://github.com/a-nikolaev/curseofwar)
- Duskers — [Wikipedia](https://en.wikipedia.org/wiki/Duskers), [Steam](https://store.steampowered.com/app/254320/Duskers/), [sequel](https://www.gamingonlinux.com/2026/06/the-awesome-spooky-sci-fi-drone-game-duskers-is-getting-a-sequel/)
- A Dark Room — [Wikipedia](https://en.wikipedia.org/wiki/A_Dark_Room), [source](https://github.com/doublespeakgames/adarkroom)
- BBS door games — [TradeWars history](http://www.bbsdocumentary.com/library/PROGRAMS/DOORS/TRADEWARS/tradewars.html), [LORD](https://en.wikipedia.org/wiki/Legend_of_the_Red_Dragon), [Break Into Chat wiki](https://breakintochat.com/wiki/BBS_door_game)
- Illuminascii — [Steam](https://store.steampowered.com/app/376130/Illuminascii/), [Kotaku](https://kotaku.com/illuminascii-is-a-first-person-shooter-made-of-text-1723778224)
- Effulgence RPG — [Steam](https://store.steampowered.com/app/3302080/Effulgence_RPG/), [PC Gamer](https://www.pcgamer.com/games/rpg/effulgence-rpg-is-a-game-made-entirely-of-ascii-art-where-you-convert-your-enemies-raw-parts-into-new-weapons-and-if-that-doesnt-convince-you-to-give-its-demo-a-look-i-dont-know-what-will/)
- ncurses arcade — [awesome-ttygames](https://github.com/ligurio/awesome-ttygames), [MakeTechEasier roundup](https://maketecheasier.com/terminal-based-cli-games-linux/)
- Desktop Survivors 98 — [Wikipedia](https://en.wikipedia.org/wiki/Desktop_Survivors_98), [PC Gamer](https://www.pcgamer.com/games/roguelike/desktop-survivors-98-is-an-action-roguelike-that-moves-at-the-speed-of-your-mouse-which-is-to-say-pretty-fast/)
