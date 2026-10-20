"""Package code only. Runtime data and credentials must never enter a release."""
from pathlib import Path
import os
import shutil
import tempfile
import re

root=Path(__file__).resolve().parents[1]
# Use a fresh temporary directory for every package; never reuse stale dist files.
with tempfile.TemporaryDirectory(prefix='lingxi-package-') as tmp:
    destination=Path(tmp)/'package';destination.mkdir()
    for name in ('backend','frontend','scripts','deploy'):
        shutil.copytree(root/name,destination/name,ignore=shutil.ignore_patterns('__pycache__','*.pyc','.venv','storage','.env','*.db','*.db-wal','*.db-shm'))
    release=os.environ.get('GITHUB_SHA','local')
    if not re.fullmatch(r'[A-Za-z0-9_-]+',release):raise SystemExit('Invalid release identifier')
    (destination/'RELEASE').write_text(release,encoding='utf-8')
    target=root/'dist';target.mkdir(exist_ok=True)
    shutil.make_archive(str(target/'blog-release'),'gztar',root_dir=destination)
print('Prepared dist/blog-release.tar.gz (code only; no storage or secrets)')
