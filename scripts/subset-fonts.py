#!/usr/bin/env python3
"""Regenerate the small faces from the complete checked-in fonts.

Requires fonttools[woff]==4.62.1 in a Python environment; run from the repo root.
Each family gets two small faces with disjoint ranges, declared after its
complete face in src/assets/css/styles.css:

- *-Core.woff2: ASCII and the few symbols the site sets, limited to the weights it
  uses (Geist 400-900, Geist Mono 400-700). Base layout preloads the upright two,
  so a first visit downloads about half the font bytes it used to.
- *-LatinExtra.woff2: the rest of Latin-1, punctuation, currencies and arrows with
  every weight. A browser fetches it only for a page that sets one of these.

The complete faces cover only the characters outside these ranges. Without that
range, Safari downloaded every complete face on every page as well (about 70 KB).
All kerning, hinting and available OpenType features are retained. The script
prints the unicode-range for each face; paste it into styles.css when CORE changes.
"""

from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer


LATIN = ((0, 0xFF), (0x2000, 0x206F), (0x20A0, 0x21FF), (0x2212, 0x2212))
CORE = (
    (0, 0x7F),  # ASCII
    (0xA0, 0xA0), (0xA3, 0xA3), (0xA9, 0xA9), (0xB7, 0xB7), (0xD7, 0xD7),  # nbsp £ © · ×
    (0x2013, 0x2014), (0x2018, 0x2019), (0x201C, 0x201D),  # dashes, curly quotes
    (0x2022, 0x2022), (0x2026, 0x2026), (0x20AC, 0x20AC),  # • … €
    (0x2190, 0x2193), (0x2197, 0x2197), (0x2212, 0x2212),  # ← ↑ → ↓ ↗ −
)
# Weights the site sets: Geist 400 to 900 (bold text inside a heading), Geist Mono 400
# to 500, kept to 700 for headroom. A weight outside its range renders at the nearest end.
WEIGHTS = {"Geist": (400, 900), "Geist-Italic": (400, 900), "GeistMono": (400, 700)}


def covered(codepoint, ranges):
    return any(start <= codepoint <= end for start, end in ranges)


def unicode_range(codepoints):
    runs = []
    for codepoint in sorted(codepoints):
        if runs and codepoint == runs[-1][1] + 1:
            runs[-1][1] = codepoint
        else:
            runs.append([codepoint, codepoint])
    return ", ".join(f"U+{a:X}" if a == b else f"U+{a:X}-{b:X}" for a, b in runs)


def write(source, destination, characters, weights=None):
    font = TTFont(source)
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]  # Retain every available OpenType feature.
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=characters)
    subsetter.subset(font)
    if weights:
        font = instancer.instantiateVariableFont(font, {"wght": weights})
        font.flavor = "woff2"
    font.save(destination)
    print(f"{destination.name}: {source.stat().st_size} → {destination.stat().st_size} bytes")


core_points = {c for c in range(0x2300) if covered(c, CORE)}
extra_points = {c for c in range(0x2300) if covered(c, LATIN) and c not in core_points}
print(f"Core unicode-range: {unicode_range(core_points)}")
print(f"LatinExtra unicode-range: {unicode_range(extra_points)}")
rest = set(range(0x110000)) - core_points - extra_points
print(f"Complete-face unicode-range: {unicode_range(rest)}")

for source in sorted(Path("src/assets/fonts").glob("*-Variable.woff2")):
    family = source.name.removesuffix("-Variable.woff2")
    cmap = TTFont(source).getBestCmap()
    write(source, source.with_name(f"{family}-Core.woff2"),
          {c for c in cmap if c in core_points}, WEIGHTS[family])
    write(source, source.with_name(f"{family}-LatinExtra.woff2"),
          {c for c in cmap if c in extra_points})
