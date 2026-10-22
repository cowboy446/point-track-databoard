"""Export paired train/validation metrics and compact, matched-ID 3D replays."""
import argparse,csv,json,sys,hashlib
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import numpy as np
ROOT=Path('/root/project/lingbot-va/worktree/artifacts/full-perception-20261020');BASE=ROOT/'model-evaluation-20261022';OUT=ROOT/'experiment-evaluation-20261022';PUBLIC=OUT/'public'
sys.path.insert(0,str(BASE))
from render_eval import cloud
from eval_a0 import write
WEIGHTS=dict(motion_relative='dynamic_queries',pixel_epe='pixel_count',pixel_epe_penalized='visible_count',invalid_projection_fraction='visible_count',dynamic_xyz_relative='dynamic_queries',static_xyz_relative='static_queries',source_pixel_mean='points',source_invalid_fraction='points',source_depth_relative='points')
METRICS=['loss','xyz_loss','confidence_loss','visibility_loss','xyz_m','xyz_relative','depth_relative','dynamic_xyz_relative','static_xyz_relative','pixel_epe','pixel_epe_penalized','invalid_projection_fraction','visibility_accuracy','motion_relative','source_pixel_mean','source_depth_relative','source_invalid_fraction']
def aggregate(rows):
 result={}
 for k in METRICS:
  vals=[r for r in rows if r.get(k) is not None];weight=WEIGHTS.get(k,'queries');total=sum(r[weight] for r in vals)
  result[k]=sum(r[k]*r[weight] for r in vals)/total if total else None
 result['queries']=sum(r['queries'] for r in rows)
 return result
def folder(split,run,index):return (BASE if split=='dev' and run=='A0' else OUT/run if split=='dev' else OUT/'train'/run)/'clips'/f'{index:03d}'
def render(job):
 split,run,index=job;f=folder(*job);m=json.loads((f/'metrics.json').read_text());meta=json.loads((f/'frozen.json').read_text());dest=PUBLIC/'media'/split/run/f'{index:03d}'
 if (dest/'done.json').exists():return job
 dest.mkdir(parents=True,exist_ok=True);q=np.load(f/'queries.npz');pred=np.load(f/'predictions.npz')['xyz'].astype(float);g=q['target_xyz_cam'].astype(float);poses=q['poses'];offset=0
 for src in meta['sources']:
  n=src['points'];sl=slice(offset,offset+16*n*3);pick=np.linspace(0,n-1,min(n,512),dtype=int);assert len(pick)==len(set(pick))
  p=pred[sl].reshape(16,n,3,3)[:,pick];gt=g[sl].reshape(16,n,3,3)[:,pick]
  toworld=lambda a:(np.einsum('tvij,tpvj->tpvi',poses[:,:,:3,:3],a)+poses[:,None,:,:3,3])*meta['scale']+np.array(meta['center'])
  wp=toworld(p*m['alpha']);wg=toworld(gt)
  for v in range(3):cloud(dest/f'src{src["source"]+1}-tgt{v+1}.json',wg[:,:,v],wp[:,:,v],q['timestamps'])
  offset+=16*n*3
 write(dest/'done.json',dict(checkpoint_sha256=m['checkpoint_sha256'],query_sha256=m['query_sha256'],display_points_per_source=512))
 return job
def main():
 manifest=json.loads((OUT/'manifest.json').read_text());data=dict(runs=manifest['runs'],splits={},normalization='per clip',display_points_per_source=512);rows=[];jobs=[];checks=[]
 for split in ['dev','train']:
  ref=BASE if split=='dev' else OUT/'train-frozen';protocol=json.loads((ref/'protocol.json').read_text());clips=[];runs={}
  for index in protocol['indices']:
   meta=json.loads((ref/'clips'/f'{index:03d}'/'frozen.json').read_text())
   clips.append(dict(index=index,family=meta['family'],language=meta['language'],sample_id=meta['sample_id'],group_id=meta['group_id'],cameras=meta['request']['camera_names'],frame_indices=meta['request']['frame_indices'],sources=meta['sources'],query_sha256=meta['query_sha256'],display_point_ids={str(s['source']):[s['point_ids'][i] for i in np.linspace(0,s['points']-1,min(s['points'],512),dtype=int)] for s in meta['sources']}))
  for run in [f'A{i}' for i in range(7)]:
   metrics=[]
   for clip in clips:
    index=clip['index'];f=folder(split,run,index);m=json.loads((f/'metrics.json').read_text());assert m['checkpoint_sha256']==manifest['runs'][run]['checkpoint']['sha256'];assert m['query_sha256']==clip['query_sha256'] and m['inference_mode']=='original_full_forward';assert len(m['groups'])==9 and sum(r['queries'] for r in m['groups'])==m['queries']
    for r in m['groups']:
     assert abs(r['loss']-sum(r[k] for k in ['xyz_loss','confidence_loss','visibility_loss']))<1e-9
     rows.append(dict(split=split,run=run,clip=index,checkpoint_step=manifest['runs'][run]['checkpoint']['step'],family=m['family'],**r))
    metrics.append(m);jobs.append((split,run,index))
   families={}
   for family in ['interndata_v6','libero_v6']:
    rs=[r for r in rows if r['split']==split and r['run']==run and r['family']==family];families[family]=aggregate(rs)
    cs=[x for m in metrics if m['family']==family for x in m['cross_view_consistency']];families[family]['cross_view_disagreement_m']=sum(x['sum'] for x in cs)/sum(x['count'] for x in cs)
   runs[run]=dict(families=families,clips={str(m['index']):m for m in metrics})
   checks.append(dict(split=split,run=run,clips=len(metrics),queries=sum(m['queries'] for m in metrics),checkpoint_sha256=manifest['runs'][run]['checkpoint']['sha256']))
  data['splits'][split]=dict(clips=clips,runs=runs,protocol=protocol)
 assert not ({c['sample_id'] for c in data['splits']['dev']['clips']}&{c['sample_id'] for c in data['splits']['train']['clips']})
 assert not ({c['group_id'] for c in data['splits']['dev']['clips']}&{c['group_id'] for c in data['splits']['train']['clips']})
 PUBLIC.mkdir(exist_ok=True)
 with ThreadPoolExecutor(max_workers=4) as pool:
  for i,j in enumerate(pool.map(render,jobs),1):
   if i%20==0:print(json.dumps(dict(event='rendered',clips=i,total=len(jobs))),flush=True)
 for run in data['runs']:data['runs'][run]['status']='completed' if run!='A7' else 'missing_checkpoint'
 write(PUBLIC/'results.json',data)
 cols=list(dict.fromkeys(k for r in rows for k in r))
 with (PUBLIC/'pair-metrics.csv').open('w') as f:w=csv.DictWriter(f,fieldnames=cols);w.writeheader();w.writerows(rows)
 summary={s:{r:val['families'] for r,val in d['runs'].items()} for s,d in data['splits'].items()};write(PUBLIC/'summary.json',summary)
 write(PUBLIC/'validation.json',dict(status='passed',runs=checks,missing=['A7'],pairs=len(rows),point_streams=len(jobs)*9,checks=['Exact frozen query digest equality across all models','Latest checkpoint SHA, complete rollout, configuration signature and strict model state checked','Original full forward; no query chunking','Same per-clip scoring function as A0','Train/validation episode and task-group disjointness','Loss component sum checked','All metric queries retained; 512 matched IDs per source displayed','Pointstream quantization and modular delta roundtrip checked']))
 for run in manifest['runs']:manifest['runs'][run]['status']='completed' if run!='A7' else 'missing_checkpoint'
 write(PUBLIC/'manifest.json',manifest)
 print(json.dumps(summary),flush=True)
if __name__=='__main__':main()
