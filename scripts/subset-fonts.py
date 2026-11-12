#!/usr/bin/env python3
"""Regenerate the small, preloaded faces from the complete checked-in fonts.

Requires fonttools[woff]==4.62.1 in a Python environment; run from the repo root.
The complete faces remain available for every character outside these ranges.
"""

from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont


RANGES = ((0, 0xFF), (0x2000, 0x206F), (0x20A0, 0x21FF), (0x2212, 0x2212))

for source in sorted(Path("src/assets/fonts").glob("*-Variable.woff2")):
    font = TTFont(source)
    characters = {
        codepoint for codepoint in font.getBestCmap()
        if any(start <= codepoint <= end for start, end in RANGES)
    }
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]  # Retain every available OpenType feature.
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=characters)
    subsetter.subset(font)
    destination = source.with_name(source.name.replace("-Variable", "-Latin"))
    font.save(destination)
    print(f"{destination.name}: {source.stat().st_size} → {destination.stat().st_size} bytes")
