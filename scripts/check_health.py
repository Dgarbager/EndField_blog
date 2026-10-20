from pathlib import Path
import json,sys,urllib.request
expected=Path(sys.argv[1]).read_text(encoding='utf-8').strip()
try:
    data=json.load(urllib.request.urlopen('http://127.0.0.1:8001/api/health',timeout=2))
    assert data.get('status')=='ok' and data.get('version')==expected
except Exception:
    raise SystemExit(1)
