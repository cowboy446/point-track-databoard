import numpy as np
from eval_a0 import score
T,N,V=16,4,3
src=[];q={k:[] for k in ('target_xyz_cam','visibility','is_dynamic','uv')}
for s in range(3):
 src.append(dict(points=N,source=s,source_name=f'v{s}'))
 g=np.zeros((T,N,V,3));g[...,2]=2;g[...,0]=np.arange(N)[None,:,None]*.1
 q['target_xyz_cam'].append(g.reshape(-1,3));q['visibility'].append(np.ones(T*N*V,bool));q['is_dynamic'].append(np.tile(np.repeat([1,1,0,0],V),T).astype(bool));q['uv'].append(g.reshape(-1,3)[:,:2]/2/99)
q={k:np.concatenate(v) for k,v in q.items()};p=q['target_xyz_cam'].copy();poses=np.broadcast_to(np.eye(4),(T,3,4,4));K=np.broadcast_to(np.eye(3),(T,3,3,3));meta=dict(scale=2,center=[1,2,3],sources=src,request=dict(camera_names=['v0','v1','v2'],image_shapes=[[100,100]]*3),index=0,family='fixture',group_id='fixture',sample_id='fixture')
cl=np.full(len(p),2.);vl=np.full(len(p),3.)
r=score(q,p*2,cl,vl,meta,poses,K)
assert all(abs(g['xyz_m'])<1e-10 for g in r['groups'])
assert len(r['groups'])==9 and sum(g['queries'] for g in r['groups'])==len(p)
p2=p.copy();p2.reshape(3,T,N,V,3)[0,:,:,1]*=2
r2=score(q,p2,cl,vl,meta,poses,K)
assert r2['groups'][1]['xyz_loss']>r['groups'][1]['xyz_loss']+.01
p3=p.copy();p3[0,2]=-2;r3=score(q,p3,cl,vl,meta,poses,K)
assert r3['groups'][0]['pixel_count']==T*N-1
assert r3['groups'][0]['pixel_epe_penalized']>=1e6/(T*N)
assert r3['groups'][0]['queries']==T*N
print('PASS: shared scale recovery, 9-group query accounting, isolated group scaling retained, invalid projection penalized without dropping XYZ')
