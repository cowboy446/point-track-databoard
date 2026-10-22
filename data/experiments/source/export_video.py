import json,gzip,sys,subprocess,hashlib
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image
ROOT=Path('/root/project/lingbot-va/worktree/artifacts/full-perception-20261020')
BASE=ROOT/'model-evaluation-20261022';EXP=ROOT/'experiment-evaluation-20261022';OUT=EXP/'video-ui'
sys.path.insert(0,str(BASE/'media-deps'));import imageio_ffmpeg
FF=imageio_ffmpeg.get_ffmpeg_exe()
data=json.loads((EXP/'public/results.json').read_text())
def job(item):
 split,c=item;index=c['index'];ref=(BASE if split=='dev' else EXP/'train-frozen')/'clips'/f'{index:03d}'
 rgb=np.load(ref/'rgb.npz');meta=json.loads((ref/'frozen.json').read_text());q=np.load(ref/'queries.npz');K=q['K'];names=c['cameras'];out=OUT/split/f'{index:03d}';out.mkdir(parents=True,exist_ok=True)
 sizes=[]
 for v,name in enumerate(names):
  a=np.asarray(rgb[name]);a=np.moveaxis(a,1,-1) if a.shape[1]==3 else a;H,W=a.shape[1:3];sizes.append([W,H]);w=480;h=round(H*w/W)//2*2
  dest=out/f'view{v+1}.mp4';cmd=[FF,'-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{w}x{h}','-r','8','-i','-','-an','-c:v','libx264','-threads','1','-preset','fast','-crf','24','-pix_fmt','yuv420p','-movflags','+faststart',str(dest)]
  proc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
  for frame in a:proc.stdin.write(np.asarray(Image.fromarray(frame).resize((w,h))).tobytes())
  proc.stdin.close();assert proc.wait()==0
 def project(x,v):
  y=np.einsum('tij,tpj->tpi',K[:,v],x);uv=y[...,:2]/y[...,2:];uv/=np.array(sizes[v]);ok=(x[...,2]>1e-6)&np.isfinite(uv).all(-1)
  return [[list(np.round(pt,6)) if good else None for pt,good in zip(row,mask)] for row,mask in zip(uv,ok)]
 for run in [f'A{i}' for i in range(7)]:
  f=(BASE if split=='dev' and run=='A0' else EXP/run if split=='dev' else EXP/'train'/run)/'clips'/f'{index:03d}'
  p=np.load(f/'predictions.npz')['xyz'];tracks={};offset=0;ids={}
  for src in meta['sources']:
   n=src['points'];subset=np.linspace(0,n-1,min(n,512),dtype=int);pick=subset[np.linspace(0,len(subset)-1,24,dtype=int)];ids[str(src['source'])]=[src['point_ids'][i] for i in pick];sl=slice(offset,offset+16*n*3)
   pr=p[sl].reshape(16,n,3,3)[:,pick];gt=q['target_xyz_cam'][sl].reshape(16,n,3,3)[:,pick]
   for v in range(3):tracks[f'{src["source"]}-{v}']={'gt':project(gt[:,:,v],v),'prediction':project(pr[:,:,v],v)}
   offset+=16*n*3
  obj={'run':run,'split':split,'clip':index,'frames':16,'track_ids':ids,'query_sha256':c['query_sha256'],'tracks':tracks};raw=json.dumps(obj,separators=(',',':'),allow_nan=False).encode();(out/f'{run}.json.gz').write_bytes(gzip.compress(raw,mtime=0))
 return {'split':split,'index':index,'videos':3,'models':7,'overlay_points_per_source':24}
OUT.mkdir(exist_ok=True)
with ThreadPoolExecutor(max_workers=4) as pool:records=list(pool.map(job,[(s,c) for s,d in data['splits'].items() for c in d['clips']]))
(OUT/'manifest.json').write_text(json.dumps({'clips':records,'frames':16,'playback_fps':8,'source':'Frozen evaluation RGB and saved predictions; no inference rerun','files':{str(p.relative_to(OUT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in OUT.rglob('*') if p.is_file() and p.name!='manifest.json'}},indent=2))
print('Exported',len(records),'clips',flush=True)
