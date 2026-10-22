"""CPU-only rescore of frozen A0 outputs: clip scale versus target-view/time scale."""
import csv, hashlib, json, sys
from pathlib import Path
import numpy as np

BASE=Path('/root/project/lingbot-va/worktree/artifacts/full-perception-20261020/model-evaluation-20261022')
OUT=BASE.parent/'scale-comparison-20261022'
sys.path.insert(0,str(BASE))
from render_eval import cloud
from eval_a0 import qdigest

def save(p,x):
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,indent=2,allow_nan=False)+'\n')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def project(p,K):
 h=np.einsum('nij,nj->ni',K,p);return h[:,:2]/h[:,2:]

def main():
 OUT.mkdir(exist_ok=True);clips=[];allrows=[];scalerows=[];validation=[]
 for index in [0,2,32,34]:
  folder=BASE/'clips'/f'{index:03d}';m=json.loads((folder/'frozen.json').read_text());old=json.loads((folder/'metrics.json').read_text())
  assert old['inference_mode']=='original_full_forward'
  z=np.load(folder/'queries.npz');pred=np.load(folder/'predictions.npz');p=pred['xyz'].astype(np.float64);g=z['target_xyz_cam'].astype(np.float64)
  excluded={'poses','K','center','scale','timestamps'};assert qdigest({k:z[k] for k in z.files if k not in excluded})==m['query_sha256']==old['query_sha256']
  N=len(p);frame=np.concatenate([np.repeat(np.arange(16),s['points']*3) for s in m['sources']]);target=z['v_cam'];group=frame*3+target
  counts=np.bincount(group,minlength=48);dp=np.bincount(group,weights=np.abs(p[:,2]),minlength=48)/counts;dg=np.bincount(group,weights=np.abs(g[:,2]),minlength=48)/counts
  dp=np.maximum(dp,1e-6);dg=np.maximum(dg,1e-6);alpha=dg/dp
  dpc=max(float(np.abs(p[:,2]).mean()),1e-6);dgc=max(float(np.abs(g[:,2]).mean()),1e-6);ac=dgc/dpc
  assert abs(ac-old['alpha'])<1e-10 and np.all(alpha>0)
  poses=z['poses'];K=z['K'][frame,target];s=m['scale'];c=np.array(m['center']);cl=pred['confidence_logits'].astype(float);vl=pred['visibility_logits'].astype(float)
  conf=np.clip(1/(1+np.exp(-np.clip(cl,-80,80))),1e-4,1-1e-4);pen=-.2*np.log(conf);bce=.1*(np.maximum(vl,0)-vl*z['visibility']+np.log1p(np.exp(-np.abs(vl))))
  slog=lambda x:np.sign(x)*np.log1p(np.abs(x))
  gl=conf*np.abs(slog(p/dpc)-slog(g/dgc)).mean(-1)+pen+bce
  ll=conf*np.abs(slog(p/dp[group,None])-slog(g/dg[group,None])).mean(-1)+pen+bce
  pc=p*ac;pl=p*alpha[group,None]
  eg=np.linalg.norm(pc-g,axis=-1)*s;el=np.linalg.norm(pl-g,axis=-1)*s
  valid=np.isfinite(p).all(-1)&(p[:,2]>1e-6);uv=project(p,K);gtuv=project(g,K);visible=z['visibility']&valid
  pix=np.linalg.norm(uv-gtuv,axis=-1)
  uv_difference=float(np.max(np.abs(project(pc[valid],K[valid])-project(pl[valid],K[valid]))))
  assert uv_difference<1e-7
  rows=[];offset=0
  for src in m['sources']:
   n=src['points'];sl=slice(offset,offset+16*n*3);pg=pc[sl].reshape(16,n,3,3);pt=pl[sl].reshape(16,n,3,3);gt=g[sl].reshape(16,n,3,3)
   toworld=lambda a:(np.einsum('tvij,tpvj->tpvi',poses[:,:,:3,:3],a)+poses[:,None,:,:3,3])*s+c
   wg,wl,wgt=map(toworld,[pg,pt,gt]);assert np.max(np.abs(wgt[:,:,0]-wgt[:,:,1]))<1e-4
   for v in range(3):
    idx=offset+np.arange(16*n*3).reshape(16,n,3)[:,:,v].ravel();b=next(r for r in old['groups'] if r['source']==src['source'] and r['target']==v)
    assert abs(eg[idx].mean()-b['xyz_m'])<1e-9 and abs(gl[idx].mean()-b['loss'])<1e-9
    row=dict(index=index,family=m['family'],source=src['source'],target=v,source_name=src['source_name'],target_name=m['request']['camera_names'][v],points=n,queries=len(idx),global_xyz_m=float(eg[idx].mean()),target_time_xyz_m=float(el[idx].mean()),global_loss=float(gl[idx].mean()),target_time_loss=float(ll[idx].mean()),pixel_epe=float(pix[idx][visible[idx]].mean()),pixel_count=int(visible[idx].sum()),alpha_global=ac,alpha_min=float(alpha.reshape(16,3)[:,v].min()),alpha_max=float(alpha.reshape(16,3)[:,v].max()))
    row['global_motion_m']=float(np.linalg.norm((wg[:,:,v]-wg[:,:,v].mean(0))-(wgt[:,:,v]-wgt[:,:,v].mean(0)),axis=-1).mean())
    row['target_time_motion_m']=float(np.linalg.norm((wl[:,:,v]-wl[:,:,v].mean(0))-(wgt[:,:,v]-wgt[:,:,v].mean(0)),axis=-1).mean())
    stem=f'media/{index:03d}/src{src["source"]+1}-tgt{v+1}';path=OUT/stem;path.parent.mkdir(parents=True,exist_ok=True)
    cloud(Path(str(path)+'-global.json'),wgt[:,:,v],wg[:,:,v],z['timestamps']);cloud(Path(str(path)+'-target-time.json'),wgt[:,:,v],wl[:,:,v],z['timestamps'])
    row.update(global_cloud=stem+'-global.bin.gz',target_time_cloud=stem+'-target-time.bin.gz',video=f'data/evaluation/media/{index:03d}/src{src["source"]+1}-tgt{v+1}.mp4')
    rows.append(row);allrows.append(row)
   offset+=16*n*3
  for t in range(16):
   for v in range(3):scalerows.append(dict(index=index,family=m['family'],target=v,target_name=m['request']['camera_names'][v],frame=t,original_frame=m['request']['frame_indices'][t],queries=int(counts[t*3+v]),alpha_global=ac,alpha_target_time=float(alpha[t*3+v]),pred_mean_abs_depth=float(dp[t*3+v]),gt_mean_abs_depth=float(dg[t*3+v])))
  clip=dict(index=index,family=m['family'],language=m['language'],cameras=m['request']['camera_names'],frame_indices=m['request']['frame_indices'],sources=m['sources'],queries=N,alpha_global=ac,alpha_target_time=alpha.reshape(16,3).tolist(),groups=rows)
  clips.append(clip);validation.append(dict(index=index,query_sha256=m['query_sha256'],predictions_sha256=sha(folder/'predictions.npz'),checkpoint_sha256=old['checkpoint_sha256'],max_pixel_coordinate_change_px=uv_difference,baseline_metrics_reproduced=True))
  print(index,float(eg.mean()),float(el.mean()),uv_difference,flush=True)
 families={}
 for fam in sorted({r['family'] for r in allrows}):
  rows=[r for r in allrows if r['family']==fam];keys=['global_xyz_m','target_time_xyz_m','global_loss','target_time_loss','global_motion_m','target_time_motion_m']
  families[fam]={k:float(np.average([r[k] for r in rows],weights=[r['queries'] for r in rows])) for k in keys};families[fam]['queries']=sum(r['queries'] for r in rows)
 save(OUT/'results.json',dict(clips=clips,families=families,selection=[0,2,32,34],grouping='target view and target frame, pooled across all source views',scale_count_per_clip=dict(global_clip=1,target_time=48)))
 save(OUT/'validation.json',dict(status='passed',clips=validation,checks=['Frozen query digest match','Original full-forward predictions reused','Original loss and XYZ reproduced for all 36 pairs','Target-view/time scales shared across three sources','Positive finite scales','Pixel invariance below 1e-7 px','Pointstream quantization and delta roundtrip checked'],source_sha256=sha(Path(__file__))))
 for name,rows in [('pair-metrics.csv',allrows),('scales.csv',scalerows)]:
  with (OUT/name).open('w') as f:w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
if __name__=='__main__':main()
