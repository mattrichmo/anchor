"""Create the extension-only store ZIP and the complete developer handoff."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json,hashlib
ROOT=Path(__file__).resolve().parents[1]
v=json.loads((ROOT/'package.json').read_text())['version']
release=ROOT/'release';release.mkdir(exist_ok=True)
store=release/f'anchor-{v}-chrome-store.zip'
with ZipFile(store,'w',ZIP_DEFLATED,compresslevel=9) as z:
    for p in sorted((ROOT/'extension').rglob('*')):
        if p.is_file():z.write(p,p.relative_to(ROOT/'extension'))
full=release/f'anchor-{v}-complete.zip'
exclude={'node_modules','.venv','__pycache__','.git','test-results','release'}
with ZipFile(full,'w',ZIP_DEFLATED,compresslevel=9) as z:
    for p in sorted(ROOT.rglob('*')):
        if p.is_file() and not any(part in exclude for part in p.relative_to(ROOT).parts):
            z.write(p,Path('Anchor')/p.relative_to(ROOT))
    z.write(store,Path('Anchor')/'store'/store.name)
for path in [store,full]:print(f'{path.name}: {path.stat().st_size:,} bytes; sha256 {hashlib.sha256(path.read_bytes()).hexdigest()}')
