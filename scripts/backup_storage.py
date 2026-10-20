"""Use SQLite's online backup API; run as the storage owner."""
from pathlib import Path
from datetime import datetime
import os,sqlite3
root=Path(__file__).resolve().parents[1]
storage=Path(os.environ.get('STORAGE_DIR',root/'storage')).resolve()
source=storage/'archive.db'
if not source.is_file():raise SystemExit('No database to back up')
backups=Path(os.environ.get('BACKUP_DIR',storage.parent/'backups'));backups.mkdir(parents=True,exist_ok=True)
target=backups/('archive-'+datetime.now().strftime('%Y%m%d-%H%M%S-%f')+'.db')
with sqlite3.connect(f'{source.as_uri()}?mode=ro',uri=True) as reader, sqlite3.connect(target) as writer:
    reader.backup(writer)
try:target.chmod(0o600)
except OSError:pass
print(target)
print('Also back up the uploads directory; database backup does not include images.')
