"""Readonly local startup helper. Never prints a password or token."""
import pathlib,sqlite3,sys
path=pathlib.Path(sys.argv[1]).resolve()/'archive.db'
configured=False
if path.is_file():
    with sqlite3.connect(f'{path.as_uri()}?mode=ro',uri=True) as db:
        if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='admin_settings'").fetchone():
            configured=bool(db.execute('SELECT 1 FROM admin_settings WHERE id=1').fetchone())
print(configured)
