"""Optional font maintenance: regenerate WOFF2 from the licensed, unchanged TTF.

Requires fonttools[woff] in a local Python environment. Publication uses the
committed asset; this script is not part of the site or CI build. Generated with
fontTools 4.66.1 and Brotli 1.2.0. No glyphs, weights or layout features are removed.
"""
from pathlib import Path
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
source = root / "vendor/fonts/dm-sans-variable.ttf"
destination = root / "vendor/fonts/dm-sans-variable.woff2"
original = TTFont(source, recalcTimestamp=False)
original.flavor = "woff2"
original.save(destination)
decoded = TTFont(destination, recalcTimestamp=False)
assert original.getGlyphOrder() == decoded.getGlyphOrder(), "Glyph order changed"
assert original.getBestCmap() == decoded.getBestCmap(), "Character coverage changed"
assert set(original.keys()) == set(decoded.keys()), "Font tables changed"
for tag in original.keys():
    if tag not in {"GlyphOrder", "glyf", "loca", "head"}:
        assert original.getTableData(tag) == decoded.getTableData(tag), tag
for name in original.getGlyphOrder():
    before, after = original["glyf"][name], decoded["glyf"][name]
    assert before.getCoordinates(original["glyf"]) == after.getCoordinates(decoded["glyf"]), name
    before_hints = before.program.getBytecode() if hasattr(before, "program") else b""
    after_hints = after.program.getBytecode() if hasattr(after, "program") else b""
    assert before_hints == after_hints, name
print(f"Preserved {len(original.getBestCmap())} codepoints and all font tables: "
      f"{source.stat().st_size:,} bytes TTF → {destination.stat().st_size:,} bytes WOFF2")
