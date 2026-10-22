"""Frozen all-source A0 evaluation. Runs outside the immutable training runtime."""
import argparse, hashlib, json, os, time
from pathlib import Path
from dataclasses import replace
import numpy as np

ROOT=Path('/root/project/lingbot-va/worktree/artifacts/full-perception-20261020')
OUT=ROOT/'model-evaluation-20261022'
RUNTIME=ROOT/'recovery-20261021/runtime-c031f56'

def digest(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for b in iter(lambda:f.read(8*1024*1024),b''):h.update(b)
 return h.hexdigest()
def write(path,data):
 path=Path(path); path.parent.mkdir(parents=True,exist_ok=True)
 tmp=path.with_suffix('.partial'); tmp.write_text(json.dumps(data,indent=2,allow_nan=False)); tmp.replace(path)
def qdigest(q):
 h=hashlib.sha256()
 for k,v in sorted(q.items()):
  v=np.asarray(v); h.update(k.encode()+str(v.shape).encode()+str(v.dtype).encode()+v.tobytes())
 return h.hexdigest()
def project(x,K):
 y=np.einsum('nij,nj->ni',K,x)
 valid=np.isfinite(y).all(-1)&(x[:,2]>1e-6)
 uv=np.full((len(x),2),np.nan); uv[valid]=y[valid,:2]/y[valid,2:]
 return uv,valid

def freeze(reader,row,index):
 from benchmarks.full_perception_campaign.data import request_for,seed_for
 from train.data.transforms import NormalizeEpisodeGeometry,CenterCropTo16,NormalizeRGB
 from train.data.queries import _query_context
 req=request_for(row,seed_for(20261020,row['sample_id'],'evaluation'),evaluation=True)
 req=replace(req,recipe=replace(req.recipe,query_count=0))
 # Bind real H5 bytes before decoding; do not silently substitute an episode.
 assert Path(req.uri).stat().st_size==row['byte_size']
 assert digest(req.uri)==row['content_digest']
 sample=reader.read(req); sample['request']=req
 scale=float(sample['_episode_geometry_scale']);center=sample['_episode_geometry_center'].copy()
 rgb={k:np.asarray(v) for k,v in sample['rgb'].items()}
 for trans in (NormalizeEpisodeGeometry(),CenterCropTo16(),NormalizeRGB()):sample=trans(sample)
 ctx=_query_context(sample,req)
 assert ctx['camera_valid'].all()
 world=sample['point_world']; T=len(req.frame_indices);V=len(req.camera_names)
 poses=np.stack([np.broadcast_to(sample['T_wc'][n],(T,4,4)) for n in req.camera_names],axis=1)
 K=np.transpose(ctx['intrinsics'],(1,0,2,3)); times=np.asarray(sample['timestamps'],np.float32)
 vt=np.stack([np.asarray(sample.get('view_timestamps',{}).get(n,times),np.float32) for n in req.camera_names],axis=1)
 records=[]; parts=[]
 for src in range(V):
  xyz=world[0] @ ctx['camera_from_world'][src,0,:3,:3].T+ctx['camera_from_world'][src,0,:3,3]
  uv,valid=project(xyz,np.broadcast_to(K[0,src],(len(xyz),3,3)))
  H,W=ctx['image_shapes'][src]
  good=ctx['source_evidence'][src,0]&ctx['valid'].all(0)&valid&(uv[:,0]>=0)&(uv[:,0]<=W-1)&(uv[:,1]>=0)&(uv[:,1]<=H-1)
  candidates=np.flatnonzero(good)
  rng=np.random.default_rng(seed_for(20261022,row['sample_id'],src,'all-source-2048-v1'))
  ids=np.sort(rng.choice(candidates,min(2048,len(candidates)),replace=False))
  if not len(ids):raise ValueError(f'empty source {index} {src}')
  target=np.einsum('vtij,tpj->tpvi',ctx['camera_from_world'][:,:,:3,:3],world[:,ids])+ctx['camera_from_world'][:,:,None,:3,3].transpose(1,2,0,3)
  proj=np.einsum('tvij,tpvj->tpvi',K,target); targetuv=proj[...,:2]/proj[...,2:]
  shapes=np.array(ctx['image_shapes']);inside=np.isfinite(targetuv).all(-1)&(target[...,2]>0)
  inside&=(targetuv[...,0]>=0)&(targetuv[...,0]<=shapes[None,None,:,1]-1)&(targetuv[...,1]>=0)&(targetuv[...,1]<=shapes[None,None,:,0]-1)
  vis=ctx['visible'][:,:,ids].transpose(1,2,0)&inside
  shape=(T,len(ids),V);n=int(np.prod(shape));dynamic=np.broadcast_to(ctx['dynamic'][ids][None,:,None],shape)
  q=dict(uv=np.broadcast_to((uv[ids]/[W-1,H-1])[None,:,None,:],(*shape,2)).reshape(-1,2).astype(np.float32),
   t_src=np.full(n,vt[0,src],np.float32),v_src=np.full(n,src,np.int64),
   t_tgt=np.broadcast_to(times[:,None,None],shape).reshape(-1).copy(),
   t_cam=np.broadcast_to(vt[:,None,:],shape).reshape(-1).copy(),
   v_cam=np.broadcast_to(np.arange(V)[None,None,:],shape).reshape(-1).copy(),
   target_xyz_cam=target.reshape(-1,3).astype(np.float32),visibility=vis.reshape(-1).copy(),
   point_id=np.broadcast_to(ids[None,:,None],shape).reshape(-1).copy(),is_dynamic=dynamic.reshape(-1).copy(),is_hard=(dynamic|~vis).reshape(-1).copy())
  parts.append(q);records.append(dict(source=src,source_name=req.camera_names[src],available_points=len(candidates),points=len(ids),dynamic_points=int(ctx['dynamic'][ids].sum()),point_ids=ids.tolist()))
 q={k:np.concatenate([p[k] for p in parts]) for k in parts[0]}
 meta=dict(index=index,family=row['family'],sample_id=row['sample_id'],group_id=row['group_id'],language=row.get('language',''),
  request=req.to_dict(),sources=records,queries=len(q['uv']),query_sha256=qdigest(q),h5_sha256=row['content_digest'],scale=scale,center=center.tolist(),frame_stride=2)
 folder=OUT/'clips'/f'{index:03d}';folder.mkdir(parents=True,exist_ok=True)
 old=folder/'frozen.json'
 if old.exists():assert json.loads(old.read_text())==meta,'Frozen query identity changed'
 else:write(old,meta)
 np.savez_compressed(folder/'queries.npz',**q,poses=poses,K=K,center=center,scale=scale,timestamps=times)
 sample['queries']=q
 return sample,meta,q,poses,K,rgb

def score(q,p,cl,vl,meta,poses,K):
 T=16; p=p.astype(np.float64); g=q['target_xyz_cam'].astype(np.float64)
 cl=cl.astype(np.float64);vl=vl.astype(np.float64)
 assert np.isfinite(p).all() and np.isfinite(cl).all() and np.isfinite(vl).all()
 dp=max(float(np.abs(p[:,2]).mean()),1e-6); dg=max(float(np.abs(g[:,2]).mean()),1e-6)
 alpha=float(np.abs(g[:,2]).mean()/dp); s=meta['scale']; c=np.array(meta['center'])
 slog=lambda x:np.sign(x)*np.log1p(np.abs(x))
 geom=np.abs(slog(p/dp)-slog(g/dg)).mean(-1)
 confidence=np.clip(1/(1+np.exp(-np.clip(cl.astype(float),-80,80))),1e-4,1-1e-4)
 terms=dict(xyz_loss=confidence*geom,confidence_loss=-.2*np.log(confidence),visibility_loss=.1*(np.maximum(vl,0)-vl*q['visibility']+np.log1p(np.exp(-np.abs(vl)))))
 terms['loss']=sum(terms.values());errs=np.linalg.norm(p*alpha-g,axis=1);zerrs=np.abs(p[:,2]*alpha-g[:,2]); rows=[];offset=0;cons=[]
 for src in meta['sources']:
  N=src['points'];n=T*N*3;sl=slice(offset,offset+n);pred=p[sl].reshape(T,N,3,3);gt=g[sl].reshape(T,N,3,3)
  world=(np.einsum('tvij,tpvj->tpvi',poses[:,:,:3,:3],pred*alpha)+poses[:,None,:,:3,3])*s+c
  for a,b in ((0,1),(0,2),(1,2)):
   diff=np.linalg.norm(world[:,:,a]-world[:,:,b],axis=-1)
   cons.append(dict(source=src['source'],target_a=a,target_b=b,count=diff.size,sum=float(diff.sum()),mean_m=float(diff.mean())))
  for target in range(3):
   idx=offset+np.arange(n).reshape(T,N,3)[:,:,target].ravel();tf=np.repeat(np.arange(T),N)
   puv,valid=project(p[idx],K[tf,target]);guv,_=project(g[idx],K[tf,target]);visible=q['visibility'][idx];good=visible&valid
   px=np.linalg.norm(puv-guv,axis=-1);pen=np.where(valid,px,1e6)
   dy=q['is_dynamic'][idx];motionmask=dy.reshape(T,N)[0]
   trackp=p[idx].reshape(T,N,3)*alpha;trackg=g[idx].reshape(T,N,3)
   motion=np.linalg.norm((trackp-trackp.mean(0))-(trackg-trackg.mean(0)),axis=-1)[:,motionmask]/dg
   r=dict(source=src['source'],target=target,source_name=src['source_name'],target_name=meta['request']['camera_names'][target],
    points=N,queries=len(idx),**{k:float(v[idx].mean()) for k,v in terms.items()},
    xyz_m=float(errs[idx].mean()*s),xyz_relative=float(errs[idx].mean()/dg),depth_relative=float(zerrs[idx].mean()/dg),
    dynamic_xyz_relative=float(errs[idx][dy].mean()/dg) if dy.any() else None,static_xyz_relative=float(errs[idx][~dy].mean()/dg) if (~dy).any() else None,
    dynamic_queries=int(dy.sum()),static_queries=int((~dy).sum()),motion_relative=float(motion.mean()) if motion.size else None,
    pixel_epe=float(px[good].mean()) if good.any() else None,pixel_count=int(good.sum()),visible_count=int(visible.sum()),
    pixel_epe_penalized=float(pen[visible].mean()) if visible.any() else None,
    invalid_projection_fraction=float((~valid)[visible].mean()) if visible.any() else None,
    visibility_accuracy=float(((vl[idx]>=0)==visible).mean()))
   if target==src['source']:
    anchor=idx[:N];au,av=project(p[anchor],np.broadcast_to(K[0,target],(N,3,3)));h,w=meta['request']['image_shapes'][target]
    aerr=np.where(av,np.linalg.norm(au-q['uv'][anchor]*[w-1,h-1],axis=-1),1e6)
    r.update(source_pixel_mean=float(aerr.mean()),source_pixel_p90=float(np.quantile(aerr,.9)),source_invalid_fraction=float((~av).mean()),source_depth_relative=float(zerrs[anchor].mean()/dg))
   rows.append(r)
  offset+=n
 return dict(index=meta['index'],family=meta['family'],group_id=meta['group_id'],sample_id=meta['sample_id'],queries=len(p),
  points=[x['points'] for x in meta['sources']],alpha=alpha,pred_depth=dp,gt_depth=dg,groups=rows,cross_view_consistency=cons)

def run(args):
 import torch
 from benchmarks.full_perception_campaign.run import build
 from benchmarks.mvtracker_audit.gpu_slot import gpu_slot
 from train.data.storage.simulator_replay_v6 import SimulatorReplayV6Source
 from train.data.collate import collate_phase1a,_map_tensors
 with gpu_slot('/root/project/lingbot-va/artifacts/gpu-owner',args.gpu):
  torch.set_num_threads(4);torch.set_num_interop_threads(1)
  receipt=json.loads((ROOT/'runs/A0/checkpoints/latest.json').read_text());assert receipt['step']==2048
  assert digest(receipt['path'])==receipt['sha256']
  config=json.loads((ROOT/'runs/A0/config.json').read_text());module,opt,params=build(config,ROOT);del opt,params
  state=torch.load(receipt['path'],map_location='cpu',mmap=True,weights_only=False)
  assert state['step']==2048 and state['complete_rollout']
  assert state['signature']==json.loads((ROOT/'runs/A0/done-2048.json').read_text())['signature']
  module.load_state_dict(state['model'],strict=True);del state
  module.eval();model=module.model;dec=model.point_decoder
  rows=json.loads((ROOT/'cohorts.json').read_text())['dev'];reader=SimulatorReplayV6Source(max_open_files=2)
  selected=json.loads((OUT/'protocol.json').read_text())['indices']
  indices=selected[args.shard::args.shards]
  if args.limit:indices=indices[:args.limit]
  for index in indices:
   folder=OUT/'clips'/f'{index:03d}'
   if (folder/'metrics.json').exists() and json.loads((folder/'metrics.json').read_text()).get('inference_mode')=='original_full_forward':continue
   begin=time.monotonic();sample,meta,q,poses,K,rgb=freeze(reader,rows[index],index)
   print(json.dumps(dict(event='frozen',index=index,points=[r['points'] for r in meta['sources']],queries=meta['queries'])),flush=True)
   # Save raw video inputs for reproducible plots; only compressed CPU arrays.
   np.savez_compressed(folder/'rgb.npz',**rgb)
   batch=_map_tensors(collate_phase1a([sample]),lambda t:t.to('cuda'));del sample,rgb
   with torch.inference_mode(),torch.autocast('cuda',dtype=torch.bfloat16):
    pred=module(batch).point_outputs[0]
   p=pred.mean.float().cpu().numpy();cl=pred.confidence_logits.float().cpu().numpy();vl=pred.visibility.float().cpu().numpy()
   if (folder/'metrics.json').exists():
    prior=folder/'chunked-reference';prior.mkdir(exist_ok=True)
    for name in ('metrics.json','predictions.npz'):
     if not (prior/name).exists():(folder/name).rename(prior/name)
   report=score(q,p,cl,vl,meta,poses,K)
   np.savez_compressed(folder/'predictions.npz',xyz=p,confidence_logits=cl,visibility_logits=vl)
   report.update(inference_mode='original_full_forward',forward_calls=1,seconds=time.monotonic()-begin,checkpoint_sha256=receipt['sha256'],query_sha256=meta['query_sha256'])
   write(folder/'metrics.json',report)
   print(json.dumps(dict(event='completed',index=index,seconds=report['seconds'],mean_loss=float(np.mean([r['loss'] for r in report['groups']])))),flush=True)
   del batch,pred;torch.cuda.empty_cache()
  reader.close()
 if all(json.loads(p.read_text()).get('inference_mode')=='original_full_forward' for p in (OUT/'clips').glob('*/metrics.json')) and len(list((OUT/'clips').glob('*/metrics.json')))==20:print('All 20 clips complete',flush=True)
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--gpu',type=int,required=True);ap.add_argument('--shard',type=int,default=0);ap.add_argument('--shards',type=int,default=2);ap.add_argument('--limit',type=int)
 run(ap.parse_args())
