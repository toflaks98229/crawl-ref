#!/usr/bin/env python3
"""Sanity checks for the extracted data + ported animations.

    python3 test_anim.py
"""

from __future__ import annotations

import os
import random
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import anim
import crawl_data
import demo

ANSI_RE = re.compile(r"\033\[[0-9;]*m")
FAILURES: list[str] = []


def check(label: str, cond: bool, detail: str = "") -> None:
    print(f"{'PASS' if cond else 'FAIL'}  {label}" + (f"  [{detail}]" if detail else ""))
    if not cond:
        FAILURES.append(label)


def main() -> int:
    random.seed(1)

    mons = crawl_data.load_monsters()
    check("monster yaml parses", len(mons) > 600, f"{len(mons)} monsters")
    check("glyphs are single chars", all(len(m.glyph) == 1 for m in mons))
    check("colours in range", all(0 <= m.colour < 16 for m in mons))

    vaults = crawl_data.load_vaults()
    check("vault maps parse", len(vaults) > 5000, f"{len(vaults)} maps")
    check("vault rows non-empty", all(v.height > 0 for v in vaults))

    dchars = crawl_data.dchar_table_from_source()
    check("dchar ASCII table extracted", len(dchars) > 60, f"{len(dchars)} glyphs")

    # radial_sweep must match beam.cc: ring n has 8n cells.
    sweep = anim.radial_sweep(3)
    check("radial_sweep ring sizes",
          [len(r) for r in sweep] == [1, 8, 16, 24],
          str([len(r) for r in sweep]))

    vault = next(v for v in vaults
                 if v.name == "elethiomel_arrival_fortress_basement")
    rows, placed = demo.populate(vault, mons)
    check("monsters placed on floor", len(placed) == 6)

    for name in anim.ANIMATIONS:
        buf = demo.build_buffer(rows, placed)
        before = ANSI_RE.sub("", buf.render())
        frames = list(demo.make(name, buf).play(buf))
        plain = [ANSI_RE.sub("", f) for f, _ in frames]
        coloured = [f for f, _ in frames]

        check(f"{name}: produces frames", len(frames) >= 4, f"{len(frames)}")
        check(f"{name}: frames differ",
              len(set(coloured)) > 1, f"{len(set(coloured))} distinct")
        check(f"{name}: geometry preserved",
              all(len(f.split("\n")) == buf.h for f in plain))
        # orb and flash only recolour, so their plain text is unchanged.
        if name in ("orb", "flash"):
            check(f"{name}: recolour only", all(f == before for f in plain))
        check(f"{name}: overlays cleaned up",
              name == "bolt" or not buf.overlays,
              f"{len(buf.overlays)} left")

    print()
    if FAILURES:
        print(f"{len(FAILURES)} failure(s): {', '.join(FAILURES)}")
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
