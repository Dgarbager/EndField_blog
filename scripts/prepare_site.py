"""Prepare static files for publication; dist is generated and untracked."""
from pathlib import Path
from urllib.parse import urlsplit
import os
import shutil
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
site_url = os.environ.get("SITE_URL", "").rstrip("/")
parsed = urlsplit(site_url)
if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.query or parsed.fragment or parsed.username or parsed.password:
    raise SystemExit("SITE_URL must be an http(s) public site URL without credentials, query or fragment")
# The CI runner starts clean; existing output is merged without deleting user files.
shutil.copytree(root / "public", root / "dist", dirs_exist_ok=True)
feed = ET.parse(root / "dist" / "rss.xml")
for link in feed.findall(".//link"):
    if link.text and link.text.startswith("http://127.0.0.1:8770"):
        link.text = site_url + link.text[len("http://127.0.0.1:8770"):]
feed.write(root / "dist" / "rss.xml", encoding="utf-8", xml_declaration=True)
print("Prepared dist/ with the configured public RSS address")
