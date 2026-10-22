"""Freeze a common 20-episode training-set diagnostic before inference."""
import json,sys
from pathlib import Path
import numpy as np
import torch
ROOT=Path('/root/project/lingbot-va/worktree/artifacts/full-perception-20261020');BASE=ROOT/'model-evaluation-20261022';OUT=ROOT/'experiment-evaluation-20261022/train-frozen'
sys.path.insert(0,str(BASE))
import eval_a0 as E
from train.data.storage.simulator_replay_v6 import SimulatorReplayV6Source
torch.set_num_threads(1);torch.set_num_interop_threads(1)
rows=json.loads((ROOT/'cohorts.json').read_text())['train'];indices=[]
for family in ['interndata_v6','libero_v6']:
 groups=set()
 for i,row in enumerate(rows):
  if row['family']!=family or row['group_id'] in groups:continue
  indices.append(i);groups.add(row['group_id'])
  if len(groups)==10:break
assert len(indices)==20
protocol=dict(indices=indices,split='train',selection='First episode from each of the first ten distinct training task groups per family, in frozen campaign ordering; chosen before inference.',frames=16,stride=2,max_points_per_source=2048,source_time='first sampled frame',target_views='all three',target_frames='all sixteen',scale='one per clip',evaluation_window='central window; episode belongs to training set, but this is a frozen diagnostic query draw, not replay of an exact training batch')
OUT.mkdir(parents=True,exist_ok=True);E.OUT=OUT
if (OUT/'protocol.json').exists():assert json.loads((OUT/'protocol.json').read_text())==protocol
else:E.write(OUT/'protocol.json',protocol)
reader=SimulatorReplayV6Source(max_open_files=2)
for i in indices:
 if (OUT/'clips'/f'{i:03d}'/'queries.npz').exists():continue
 sample,meta,q,poses,K,rgb=E.freeze(reader,rows[i],i)
 np.savez_compressed(OUT/'clips'/f'{i:03d}'/'rgb.npz',**rgb)
 print(json.dumps(dict(event='frozen',index=i,queries=len(q['uv']),points=[s['points'] for s in meta['sources']])) ,flush=True)
 del sample,meta,q,poses,K,rgb
reader.close();E.write(OUT/'done.json',dict(status='completed',clips=20))
