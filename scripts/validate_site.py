"""Validate committed frontend references and runtime layout."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit
import re
import xml.etree.ElementTree as ET

BASE = Path(__file__).resolve().parents[1]
ROOT = BASE / 'frontend'
class References(HTMLParser):
    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key not in ('src','href') or not value:
                continue
            parsed = urlsplit(value)
            if parsed.scheme or parsed.netloc or not parsed.path or parsed.path.startswith(('/api/','/uploads/')) or parsed.path == '/rss.xml':
                continue
            target = (ROOT / unquote(parsed.path).lstrip('/')).resolve()
            if not target.is_relative_to(ROOT.resolve()) or not target.exists():
                raise ValueError(f'Missing local reference: {value}')
for page in ('index.html','post.html','admin.html'):
    References().feed((ROOT / page).read_text(encoding='utf-8'))
for svg in (ROOT / 'assets').glob('*.svg'):
    ET.parse(svg)
for stylesheet in (ROOT / 'assets').rglob('*.css'):
    for reference in re.findall(r'url\([\'"]?([^\)\'\"]+)', stylesheet.read_text(encoding='utf-8')):
        if reference.startswith(('data:','http:','https:','#')):
            continue
        path = (stylesheet.parent / reference.split('?')[0]).resolve()
        if not path.is_relative_to(ROOT.resolve()) or not path.is_file():
            raise ValueError(f'Missing CSS asset: {stylesheet.name}: {reference}')
for required in ('backend/main.py','backend/requirements.txt','deploy/lingxi-blog.service','deploy/nginx-blog.conf','scripts/activate_release.sh'):
    assert (BASE / required).is_file(), required
print('PASS: three pages, local script/style/image/font references, SVG and deployment layout')
