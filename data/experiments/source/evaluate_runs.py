"""Evaluate A1--A6 against the exact frozen A0 all-source query protocol."""
import argparse,json,os,sys,time
from pathlib import Path
import numpy as np
ROOT=Path('/root/project/lingbot-va/worktree/artifacts/full-perception-20261020')
BASE=ROOT/'model-evaluation-20261022'
OUT=ROOT/'experiment-evaluation-20261022'
sys.path.insert(0,str(BASE))
import eval_a0 as E

def run(args):
 import torch
 from benchmarks.full_perception_campaign.run import build,binding
 from benchmarks.mvtracker_audit.gpu_slot import gpu_slot
 from train.data.storage.simulator_replay_v6 import SimulatorReplayV6Source
 from train.data.collate import collate_phase1a,_map_tensors
 E.OUT=(OUT/args.run if args.split=='dev' else OUT/'train'/args.run)
 reference=BASE if args.split=='dev' else OUT/'train-frozen'
 spec=json.loads((OUT/'manifest.json').read_text())['runs'][args.run]
 receipt=spec['checkpoint'];config=spec['config'];folder=ROOT/'runs'/args.run
 with gpu_slot('/root/project/lingbot-va/artifacts/gpu-owner',args.gpu):
  torch.set_num_threads(4);torch.set_num_interop_threads(4)
  assert Path(receipt['path']).stat().st_size==receipt['bytes']
  assert E.digest(receipt['path'])==receipt['sha256']
  sig=binding(ROOT,config)
  module,opt,params=build(config,ROOT);del opt,params
  state=torch.load(receipt['path'],map_location='cpu',mmap=True,weights_only=False)
  assert state['step']==receipt['step'] and state['complete_rollout'] and state['signature']==sig
  module.load_state_dict(state['model'],strict=True);del state;module.eval()
  rows=json.loads((ROOT/'cohorts.json').read_text())[args.split];reader=SimulatorReplayV6Source(max_open_files=2)
  indices=json.loads((reference/'protocol.json').read_text())['indices']
  for index in indices:
   clip=E.OUT/'clips'/f'{index:03d}';metric=clip/'metrics.json'
   if metric.exists():
    prior=json.loads(metric.read_text());assert prior['checkpoint_sha256']==receipt['sha256'];continue
   start=time.monotonic();sample,meta,q,poses,K,rgb=E.freeze(reader,rows[index],index);del rgb
   expected=json.loads((reference/'clips'/f'{index:03d}'/'frozen.json').read_text())
   assert meta==expected,'A0 query population changed'
   batch=_map_tensors(collate_phase1a([sample]),lambda t:t.to('cuda'));del sample
   with torch.inference_mode(),torch.autocast('cuda',dtype=torch.bfloat16):pred=module(batch).point_outputs[0]
   xyz=pred.mean.float().cpu().numpy();cl=pred.confidence_logits.float().cpu().numpy();vl=pred.visibility.float().cpu().numpy()
   report=E.score(q,xyz,cl,vl,meta,poses,K)
   np.savez_compressed(clip/'predictions.npz',xyz=xyz,confidence_logits=cl,visibility_logits=vl)
   report.update(split=args.split,run=args.run,checkpoint_step=receipt['step'],checkpoint_sha256=receipt['sha256'],query_sha256=meta['query_sha256'],inference_mode='original_full_forward',forward_calls=1,seconds=time.monotonic()-start)
   E.write(metric,report)
   print(json.dumps(dict(event='clip_complete',run=args.run,index=index,seconds=report['seconds'],loss=float(np.mean([r['loss'] for r in report['groups']])))),flush=True)
   del batch,pred,xyz,cl,vl;torch.cuda.empty_cache()
  reader.close()
 E.write(E.OUT/'done.json',dict(status='completed',split=args.split,run=args.run,checkpoint=receipt,clips=len(indices),queries=sum(json.loads((E.OUT/'clips'/f'{i:03d}'/'metrics.json').read_text())['queries'] for i in indices),scale='one per clip',signature=sig))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--split',choices=['dev','train'],default='dev');p.add_argument('--run',required=True);p.add_argument('--gpu',type=int,required=True);run(p.parse_args())
