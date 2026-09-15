"""Load real Dungeon Crawl Stone Soup data for reuse outside the game binary.

Everything here reads the repository's own data files -- no game build needed.
Sources:
  * dat/mons/*.yaml        monster glyph + colour + stats (683 files)
  * dat/des/**/*.des       hand-authored ASCII vault maps (144 files)
  * defines.h              the 16-colour COLOURS enum
  * viewchar.cc            CSET_ASCII dungeon-character table
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field

import yaml

SOURCE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "crawl-ref", "source"
)
SOURCE = os.path.normpath(SOURCE)

# ---------------------------------------------------------------------------
# Colour: enum COLOURS in defines.h:202, mapped to ANSI SGR codes.
# ---------------------------------------------------------------------------

COLOURS = [
    "black", "blue", "green", "cyan", "red", "magenta", "brown", "lightgrey",
    "darkgrey", "lightblue", "lightgreen", "lightcyan", "lightred",
    "lightmagenta", "yellow", "white",
]

_ALIASES = {"lightgray": "lightgrey", "darkgray": "darkgrey", "grey": "lightgrey"}

# Crawl's colour order is the CGA/DOS order, which is also the ANSI order
# except that ANSI swaps blue and red. Map index -> ANSI 8/16 colour number.
_ANSI_INDEX = [0, 4, 2, 6, 1, 5, 3, 7]


def colour_index(name: str) -> int:
    """'lightgreen' -> 10. Unknown / random colours fall back to lightgrey."""
    name = _ALIASES.get(name, name)
    try:
        return COLOURS.index(name)
    except ValueError:
        # etc_* / 'colour' / 'random' placeholders in the yaml files.
        return COLOURS.index("lightgrey")


def ansi(colour: int) -> str:
    """Colour index -> ANSI escape prefix."""
    bright = colour >= 8
    base = _ANSI_INDEX[colour % 8]
    return f"\033[{1 if bright else 0};{30 + base}m"


RESET = "\033[0m"


# ---------------------------------------------------------------------------
# Dungeon characters: CSET_ASCII block of viewchar.cc's dchar_table.
# Only the entries the animation code actually uses are listed; the full table
# is parsed out of viewchar.cc by dchar_table_from_source() below.
# ---------------------------------------------------------------------------

DCHAR = {
    "wall": "#",
    "floor": ".",
    "door_closed": "+",
    "statue": "8",
    "tree": "7",
    "cloud": "0",
    "item_gold": "$",
    "item_weapon": ")",
    "item_armour": "[",
    "stairs_down": ">",
    "stairs_up": "<",
    "altar": "_",
    "fountain": "~",
    # the five glyphs every ASCII animation is built out of:
    "fired_bolt": "*",
    "fired_zap": "*",
    "fired_burst": "*",
    "fired_missile": "*",
    "explosion": "#",
}


def dchar_table_from_source() -> list[str]:
    """Parse the CSET_ASCII row of dchar_table[] straight out of viewchar.cc.

    Proves the table is machine-extractable rather than needing a build.
    """
    text = open(os.path.join(SOURCE, "viewchar.cc"), encoding="utf-8").read()
    start = text.index("// CSET_ASCII")
    end = text.index("// CSET_UNICODE", start) if "// CSET_UNICODE" in text[start:] \
        else text.index("};", start)
    block = text[start:end]
    block = re.sub(r"//[^\n]*", "", block)          # strip trailing comments
    block = re.sub(r"#if[^\n]*|#endif", "", block)  # keep TAG_MAJOR_VERSION==34 entries
    return re.findall(r"'(\\?.)'", block)


# ---------------------------------------------------------------------------
# Monsters
# ---------------------------------------------------------------------------


@dataclass
class Monster:
    name: str
    glyph: str
    colour: int
    hd: int = 0
    speed: int = 10
    raw: dict = field(default_factory=dict, repr=False)


def load_monsters(limit: int | None = None) -> list[Monster]:
    """Read dat/mons/*.yaml into glyph/colour records."""
    out = []
    mons_dir = os.path.join(SOURCE, "dat", "mons")
    for fn in sorted(os.listdir(mons_dir)):
        if not fn.endswith(".yaml"):
            continue
        with open(os.path.join(mons_dir, fn), encoding="utf-8") as fh:
            data = yaml.safe_load(fh)
        if not isinstance(data, dict) or "glyph" not in data:
            continue
        g = data["glyph"]
        out.append(Monster(
            name=data.get("name", fn[:-5]),
            glyph=str(g.get("char", "x"))[:1],
            colour=colour_index(str(g.get("colour", "lightgrey"))),
            hd=data.get("hd", 0) or 0,
            speed=data.get("speed", 10) or 10,
            raw=data,
        ))
        if limit and len(out) >= limit:
            break
    return out


# ---------------------------------------------------------------------------
# Vault maps (.des)
# ---------------------------------------------------------------------------


@dataclass
class Vault:
    name: str
    rows: list[str]
    source: str

    @property
    def width(self) -> int:
        return max((len(r) for r in self.rows), default=0)

    @property
    def height(self) -> int:
        return len(self.rows)


def load_vaults(min_size: int = 0) -> list[Vault]:
    """Extract every MAP...ENDMAP block from dat/des/**/*.des."""
    vaults: list[Vault] = []
    des_root = os.path.join(SOURCE, "dat", "des")
    for dirpath, _dirs, files in os.walk(des_root):
        for fn in sorted(files):
            if not fn.endswith(".des"):
                continue
            path = os.path.join(dirpath, fn)
            name = "?"
            rows: list[str] | None = None
            with open(path, encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    line = line.rstrip("\n")
                    if line.startswith("NAME:"):
                        name = line.split(":", 1)[1].strip()
                    elif line.strip() == "MAP":
                        rows = []
                    elif line.strip() == "ENDMAP":
                        if rows and len(rows) >= min_size:
                            vaults.append(Vault(name, rows,
                                                os.path.relpath(path, SOURCE)))
                        rows = None
                    elif rows is not None:
                        rows.append(line)
    return vaults


# Glyph -> colour for rendering a raw vault map. Derived from the feature
# colours in feature-data.h; 'x'/'c' walls are lightgrey, water blue, etc.
VAULT_COLOURS = {
    "x": 8, "c": 7, "v": 12, "b": 11, "w": 1, "W": 9, "l": 12, "t": 2,
    ".": 7, "+": 6, "=": 6, "@": 15, "$": 14, "<": 15, ">": 15, "_": 15,
    "{": 11, "}": 11, "(": 7, "[": 7, ")": 7, "0": 7, "G": 8, "T": 11,
    "1": 13, "2": 13, "3": 13, "4": 13, "5": 13, "9": 13,
}


def vault_colour(ch: str) -> int:
    return VAULT_COLOURS.get(ch, 7)
