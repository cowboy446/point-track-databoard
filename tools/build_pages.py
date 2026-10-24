"""Assemble the static site, retaining compact, lossless archive transports."""
from pathlib import Path
import shutil

root=Path(__file__).resolve().parents[1]
out=root/'_site'
if out.exists():shutil.rmtree(out)
out.mkdir()
for p in root.iterdir():
    if p.name.startswith('.') or p.name in {'_site','tools','__pycache__'}:continue
    if p.is_dir():shutil.copytree(p,out/p.name)
    elif p.suffix in {'.html','.txt'} or p.name in {'CNAME'}:shutil.copy2(p,out/p.name)
for name in ['data/experiments/results.json','data/evaluation/protocol.json']:
    (out/name).unlink(missing_ok=True)
# Large, independently fetched payloads are served from the same public source
# repository's raw CDN. Keep them in Git, outside the Pages publication bundle.
shutil.rmtree(out/'data/dense-20261024/predictions',ignore_errors=True)
print(f'Static site: {sum(p.stat().st_size for p in out.rglob("*") if p.is_file()):,} bytes')
