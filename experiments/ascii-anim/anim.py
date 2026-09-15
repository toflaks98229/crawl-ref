"""Crawl's ASCII animation primitives, lifted out of the game engine.

Each class below is a direct port of a routine in crawl-ref/source. The point
is to show that the animation logic is *separable* from the game: it only ever
needs a grid, a (glyph, colour) overlay list, and a frame delay.

Ported from:
  view.cc:448  shake_viewport_animation   -> ShakeViewport
  view.cc:469  banish_animation           -> BanishDissolve
  view.cc:519  orb_animation              -> OrbPulse
  view.cc:754  flash_tile                 -> Buffer.flash_tile
  view.cc:787  draw_ring_animation        -> Ring
  view.cc:225  _flash_view                -> FlashView
  beam.cc:721  bolt::draw                 -> Bolt
  beam.cc:6985 bolt::explode radial sweep -> Explosion
"""

from __future__ import annotations

import random
from dataclasses import dataclass

from crawl_data import DCHAR, ansi, RESET, vault_colour


# ---------------------------------------------------------------------------
# The view buffer: Crawl's crawl_view_buffer + the glyph overlay list.
# ---------------------------------------------------------------------------


@dataclass
class Cell:
    glyph: str
    colour: int


class Buffer:
    """A screen_cell_t grid plus the glyph_overlays vector from view.cc:745."""

    def __init__(self, rows: list[str], colour_of=vault_colour):
        self.h = len(rows)
        self.w = max(len(r) for r in rows)
        self.base = [
            [Cell(r[x] if x < len(r) else " ", colour_of(r[x] if x < len(r) else " "))
             for x in range(self.w)]
            for r in rows
        ]
        self.overlays: list[tuple[int, int, Cell]] = []
        self.flash_colour: int | None = None

    # view.cc:779 view_clear_overlays()
    def clear_overlays(self) -> None:
        self.overlays.clear()

    # view.cc:748 view_add_glyph_overlay()
    def add_glyph_overlay(self, x: int, y: int, glyph: str, colour: int) -> None:
        if 0 <= x < self.w and 0 <= y < self.h:
            self.overlays.append((x, y, Cell(glyph, colour)))

    # view.cc:754 flash_tile()
    def flash_tile(self, x: int, y: int, colour: int) -> None:
        self.add_glyph_overlay(x, y, DCHAR["fired_zap"], colour)

    def solid(self, x: int, y: int) -> bool:
        """feat_is_solid(): walls block ring/explosion propagation."""
        if not (0 <= x < self.w and 0 <= y < self.h):
            return True
        return self.base[y][x].glyph in "xcvbGT#"

    def render(self, offset=(0, 0)) -> str:
        """Composite base + overlays into an ANSI string (one frame)."""
        grid = [[Cell(c.glyph, c.colour) for c in row] for row in self.base]
        for x, y, cell in self.overlays:
            if 0 <= x < self.w and 0 <= y < self.h:
                grid[y][x] = cell

        ox, oy = offset
        lines = []
        for y in range(self.h):
            sy = y - oy
            out, cur = [], None
            for x in range(self.w):
                sx = x - ox
                if 0 <= sy < self.h and 0 <= sx < self.w:
                    cell = grid[sy][sx]
                else:
                    cell = Cell(" ", 0)
                col = cell.colour if self.flash_colour is None else self.flash_colour
                if col != cur:
                    out.append(ansi(col))
                    cur = col
                out.append(cell.glyph)
            out.append(RESET)
            lines.append("".join(out))
        return "\n".join(lines)


# ---------------------------------------------------------------------------
# geometry helpers (coord.cc)
# ---------------------------------------------------------------------------


def rdist(a, b) -> int:
    """grid_distance() == coord_def::rdist() == Chebyshev distance."""
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]))


def ray(src, dst) -> list[tuple[int, int]]:
    """A straight line of cells, as find_ray()/fallback_ray() would produce."""
    (x0, y0), (x1, y1) = src, dst
    dx, dy = x1 - x0, y1 - y0
    steps = max(abs(dx), abs(dy))
    if steps == 0:
        return [src]
    return [
        (round(x0 + dx * i / steps), round(y0 + dy * i / steps))
        for i in range(1, steps + 1)
    ]


# beam.cc:6900 _radial_sweep(): rings of increasing Chebyshev radius, so an
# explosion paints centre-out one ring per frame.
def radial_sweep(r: int) -> list[list[tuple[int, int]]]:
    result = [[(0, 0)]]
    for rad in range(1, r + 1):
        work = []
        for d in range(-rad, rad + 1):
            if d not in (rad, -rad):
                work.append((-rad, d))
                work.append((rad, d))
            work.append((d, -rad))
            work.append((d, rad))
        result.append(work)
    return result


# ---------------------------------------------------------------------------
# Animations. Each yields (frame_string, delay_ms).
# ---------------------------------------------------------------------------


class Animation:
    """view.h:46 class animation -- frames + frame_delay + a per-cell callback."""

    frames = 10
    frame_delay = 50
    name = "animation"

    def play(self, buf: Buffer):
        raise NotImplementedError


class Bolt(Animation):
    """bolt::draw() -- one glyph per cell along the ray, redrawn each step."""

    name = "bolt"

    def __init__(self, src, dst, colour=12, glyph=None, draw_delay=25,
                 trail=True):
        self.src, self.dst = src, dst
        self.colour = colour
        self.glyph = glyph or DCHAR["fired_zap"]
        self.frame_delay = draw_delay
        self.trail = trail  # Crawl does not clean up old positions (view.cc:726)

    def play(self, buf: Buffer):
        buf.clear_overlays()
        for pos in ray(self.src, self.dst):
            if buf.solid(*pos):
                break
            if not self.trail:
                buf.clear_overlays()
            buf.add_glyph_overlay(pos[0], pos[1], self.glyph, self.colour)
            yield buf.render(), self.frame_delay


class Explosion(Animation):
    """bolt::explode() draw pass -- one radial ring per frame."""

    name = "explosion"

    def __init__(self, centre, radius=3, colour=12, explode_delay=50,
                 hole_in_the_middle=False):
        self.centre, self.radius = centre, radius
        self.colour = colour
        self.frame_delay = explode_delay
        self.hole = hole_in_the_middle

    def play(self, buf: Buffer):
        cx, cy = self.centre
        for line in radial_sweep(self.radius):
            visible = False
            for dx, dy in line:
                if (dx, dy) == (0, 0) and self.hole:
                    continue
                x, y = cx + dx, cy + dy
                if buf.solid(x, y):
                    continue
                buf.add_glyph_overlay(x, y, DCHAR["explosion"], self.colour)
                visible = True
            if visible:
                yield buf.render(), self.frame_delay
        # view.cc: "Delay after entire explosion has been drawn" == delay * 3
        yield buf.render(), self.frame_delay * 3
        buf.clear_overlays()
        yield buf.render(), 0


class Ring(Animation):
    """draw_ring_animation() -- expanding or contracting ring of flash_tiles."""

    name = "ring"

    def __init__(self, centre, radius=5, colour=11, colour_alt=None,
                 outward=True, delay=45):
        self.centre, self.radius = centre, radius
        self.colour, self.colour_alt = colour, colour_alt
        self.outward = outward
        self.frame_delay = delay

    def play(self, buf: Buffer):
        cx, cy = self.centre
        rng = range(0, self.radius + 1) if self.outward \
            else range(self.radius, -1, -1)
        for i in rng:
            for y in range(cy - i, cy + i + 1):
                for x in range(cx - i, cx + i + 1):
                    if rdist((cx, cy), (x, y)) != i or buf.solid(x, y):
                        continue
                    col = self.colour
                    if self.colour_alt is not None and random.randint(0, 1):
                        col = self.colour_alt
                    buf.flash_tile(x, y, col)
            yield buf.render(), self.frame_delay
            buf.clear_overlays()
        yield buf.render(), 0


class ShakeViewport(Animation):
    """shake_viewport_animation (view.cc:448): jitter the whole viewport."""

    name = "shake"
    frames = 5
    frame_delay = 40

    def play(self, buf: Buffer):
        for _ in range(self.frames):
            off = (random.randint(-1, 1), random.randint(-1, 1))
            yield buf.render(offset=off), self.frame_delay
        yield buf.render(), 0


class BanishDissolve(Animation):
    """banish_animation (view.cc:469): cells wink out with rising probability.

    Crawl's version extends `frames` while any cell is still visible, so the
    animation runs until the map has fully dissolved.
    """

    name = "banish"

    def __init__(self, player=None, frame_delay=60):
        self.player = player
        self.frame_delay = frame_delay

    def play(self, buf: Buffer):
        hidden: set[tuple[int, int]] = set()
        frame = 0
        remaining = True
        while remaining and frame < 10:
            remaining = False
            buf.clear_overlays()
            for y in range(buf.h):
                for x in range(buf.w):
                    if (x, y) == self.player:
                        continue
                    if (x, y) in hidden:
                        buf.add_glyph_overlay(x, y, " ", 0)
                        continue
                    # view.cc:504  if (!random2(10 - current_frame))
                    if random.randrange(max(1, 10 - frame)) == 0:
                        hidden.add((x, y))
                        buf.add_glyph_overlay(x, y, " ", 0)
                    else:
                        remaining = True
            yield buf.render(), self.frame_delay
            frame += 1
        buf.clear_overlays()


class OrbPulse(Animation):
    """orb_animation (view.cc:519): a ring of darkness sweeping out and back.

    Note the elliptical distance metric -- dx*dx*4/9 + dy*dy -- which corrects
    for terminal cells being roughly twice as tall as they are wide.
    """

    name = "orb"

    def __init__(self, centre, colour=5):
        self.centre = centre
        self.colour = colour

    def play(self, buf: Buffer):
        cx, cy = self.centre
        for frame in range(10):
            rng = (10 - frame) if frame > 5 else frame
            delay = 3 * (6 - rng) * (6 - rng)
            lo, hi = rng * rng, (rng + 2) * (rng + 2)
            buf.clear_overlays()
            for y in range(buf.h):
                for x in range(buf.w):
                    dx, dy = x - cx, y - cy
                    dist = dx * dx * 4 // 9 + dy * dy
                    if lo <= dist < hi:
                        buf.add_glyph_overlay(x, y, buf.base[y][x].glyph,
                                              self.colour)
            yield buf.render(), delay
        buf.clear_overlays()
        yield buf.render(), 0


class FlashView(Animation):
    """flash_view_delay() (view.cc:249): recolour every cell for one beat."""

    name = "flash"

    def __init__(self, colour=4, delay=150, times=2):
        self.colour, self.frame_delay, self.times = colour, delay, times

    def play(self, buf: Buffer):
        for _ in range(self.times):
            buf.flash_colour = self.colour
            yield buf.render(), self.frame_delay
            buf.flash_colour = None
            yield buf.render(), self.frame_delay


ANIMATIONS = {
    cls.name: cls
    for cls in (Bolt, Explosion, Ring, ShakeViewport, BanishDissolve, OrbPulse,
                FlashView)
}
