#!/usr/bin/env python3
"""Play Crawl's ASCII animations over a real Crawl vault map.

    python3 demo.py --list                     # what data we managed to load
    python3 demo.py explosion                  # play one animation
    python3 demo.py --all --dump out/          # write every frame to text files
    python3 demo.py bolt --no-colour --dump -  # frames to stdout, no ANSI
"""

from __future__ import annotations

import argparse
import os
import random
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import anim
import crawl_data

ANSI_RE = re.compile(r"\033\[[0-9;]*m")


def pick_vault(name: str | None):
    vaults = crawl_data.load_vaults()
    if name:
        for v in vaults:
            if name in v.name:
                return v, vaults
        sys.exit(f"no vault matching {name!r} (loaded {len(vaults)})")
    # Default: something roomy enough to see a radius-5 effect.
    good = [v for v in vaults if 30 <= v.width <= 78 and 14 <= v.height <= 24]
    return random.choice(good) if good else vaults[0], vaults


def populate(vault, monsters, count=6):
    """Drop real monster glyphs onto open floor, so the map is not empty."""
    rows = [list(r.ljust(vault.width)) for r in vault.rows]
    floor = [(x, y) for y, r in enumerate(rows)
             for x, c in enumerate(r) if c == "."]
    random.shuffle(floor)
    placed = []
    for (x, y), mon in zip(floor[:count], random.sample(monsters, count)):
        rows[y][x] = mon.glyph
        placed.append((x, y, mon))
    return ["".join(r) for r in rows], placed


def build_buffer(rows, placed):
    colours = {(x, y): m.colour for x, y, m in placed}

    buf = anim.Buffer(rows, colour_of=crawl_data.vault_colour)
    for (x, y), col in colours.items():
        buf.base[y][x].colour = col
    return buf


def centre_of(buf):
    floor = [(x, y) for y in range(buf.h) for x in range(buf.w)
             if buf.base[y][x].glyph == "."]
    return random.choice(floor) if floor else (buf.w // 2, buf.h // 2)


def longest_open_run(buf):
    """Find the longest unobstructed horizontal stretch, to fire a bolt down."""
    best = ((0, 0), (0, 0), 0)
    for y in range(buf.h):
        x = 0
        while x < buf.w:
            if buf.solid(x, y):
                x += 1
                continue
            start = x
            while x < buf.w and not buf.solid(x, y):
                x += 1
            if x - start > best[2]:
                best = ((start, y), (x - 1, y), x - start)
    return best[0], best[1]


def make(name, buf):
    c = centre_of(buf)
    if name == "bolt":
        src, dst = longest_open_run(buf)
        return anim.Bolt(src, dst, colour=12)
    if name == "explosion":
        return anim.Explosion(c, radius=4, colour=12)
    if name == "ring":
        return anim.Ring(c, radius=5, colour=11, colour_alt=9, outward=True)
    if name == "shake":
        return anim.ShakeViewport()
    if name == "banish":
        return anim.BanishDissolve(player=c)
    if name == "orb":
        return anim.OrbPulse(c)
    if name == "flash":
        return anim.FlashView(colour=4)
    sys.exit(f"unknown animation {name!r}; known: {', '.join(anim.ANIMATIONS)}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("animation", nargs="?", default="explosion")
    ap.add_argument("--all", action="store_true", help="play every animation")
    ap.add_argument("--list", action="store_true", help="report loaded data")
    ap.add_argument("--vault", help="substring of a vault NAME to use")
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--dump", help="write frames here ('-' for stdout) "
                                   "instead of animating")
    ap.add_argument("--no-colour", action="store_true")
    ap.add_argument("--speed", type=float, default=1.0)
    args = ap.parse_args()

    random.seed(args.seed)

    monsters = crawl_data.load_monsters()
    vault, vaults = pick_vault(args.vault)

    if args.list:
        dchars = crawl_data.dchar_table_from_source()
        print(f"monsters (dat/mons/*.yaml)   : {len(monsters)}")
        print(f"vault maps (dat/des/**/*.des): {len(vaults)}")
        print(f"  largest: {max(v.width * v.height for v in vaults)} cells")
        print(f"dchar ASCII glyphs (viewchar.cc CSET_ASCII): {len(dchars)}")
        print(f"animations ported            : {', '.join(anim.ANIMATIONS)}")
        print()
        print(f"sample vault: {vault.name} "
              f"({vault.width}x{vault.height}) from {vault.source}")
        by_glyph: dict[str, int] = {}
        for m in monsters:
            by_glyph[m.glyph] = by_glyph.get(m.glyph, 0) + 1
        top = sorted(by_glyph.items(), key=lambda kv: -kv[1])[:10]
        print("busiest monster glyphs: "
              + ", ".join(f"{g}x{n}" for g, n in top))
        return 0

    rows, placed = populate(vault, monsters)
    names = list(anim.ANIMATIONS) if args.all else [args.animation]

    for name in names:
        buf = build_buffer(rows, placed)
        frames = list(make(name, buf).play(buf))

        if args.dump:
            body = []
            for i, (frame, delay) in enumerate(frames):
                if args.no_colour:
                    frame = ANSI_RE.sub("", frame)
                body.append(f"--- {name} frame {i} (+{delay}ms) ---\n{frame}")
            text = "\n".join(body) + "\n"
            if args.dump == "-":
                sys.stdout.write(text)
            else:
                os.makedirs(args.dump, exist_ok=True)
                path = os.path.join(args.dump, f"{name}.txt")
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(text)
                print(f"{name}: {len(frames)} frames -> {path}")
            continue

        for frame, delay in frames:
            if args.no_colour:
                frame = ANSI_RE.sub("", frame)
            sys.stdout.write("\033[H\033[2J" + frame + "\n")
            sys.stdout.flush()
            time.sleep(delay / 1000.0 / max(args.speed, 0.01))
        time.sleep(0.3)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
