"""Check local references without installing packages."""
from pathlib import Path
from html.parser import HTMLParser
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1] / "public"

class Assets(HTMLParser):
    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in ("href", "src") and value and value.startswith("./"):
                target = (ROOT / value.split("#")[0].split("?")[0]).resolve()
                if not target.is_relative_to(ROOT.resolve()) or not target.is_file():
                    raise ValueError(f"Missing or invalid asset: {value}")

Assets().feed((ROOT / "index.html").read_text(encoding="utf-8"))
ET.parse(ROOT / "rss.xml")
for svg in (ROOT / "assets").glob("*.svg"):
    ET.parse(svg)
for theme in ("night", "day", "wuling"):
    for asset in ("avatar", "cnc-toolpath"):
        assert (ROOT / "assets" / f"{asset}-{theme}.svg").is_file()
print("PASS: HTML references, RSS, SVG assets and three theme variants")
