"""Deterministic labelled videos and temporal point streams from saved outputs."""
import gzip,hashlib,json,os,struct,subprocess
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
BASE=Path('/root/project/lingbot-va/worktree/artifacts/full-perception-20261020/model-evaluation-20261022')
import sys
sys.path.insert(0,str(BASE/'media-deps'))
import imageio_ffmpeg
FFMPEG=imageio_ffmpeg.get_ffmpeg_exe()
FONT=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',15)
SMALL=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',12)
def save(path,obj):Path(path).write_text(json.dumps(obj,indent=2,allow_nan=False))
def cloud(path,gt,pred,times):
 xyz=np.concatenate((gt,pred),axis=1).astype(np.float64);T,N,_=xyz.shape
 lo=xyz.min((0,1));hi=xyz.max((0,1));offset=(hi+lo)/2;scale=max(float((hi-lo).max()/65000),1e-6)
 code=np.rint((xyz-offset)/scale).astype(np.int16);delta=code.copy();delta[1:]=(code[1:].astype(np.int32)-code[:-1].astype(np.int32)).astype(np.int16)
 colors=np.empty((T,N,3),np.uint8);colors[:,:N//2]=[49,181,191];colors[:,N//2:]=[242,135,90]
 arrays=[('xyz',delta.astype('<i2').tobytes()),('colors',colors.tobytes()),('valid',np.packbits(np.ones(T*N,np.uint8),bitorder='little').tobytes()),('timestamps',np.asarray(times,dtype='<f8').tobytes())]
 h=dict(frames=T,points=N,scale=scale,offset=offset.tolist(),bounds=[lo.tolist(),hi.tolist()],layout=[dict(name=k,bytes=len(v)) for k,v in arrays],sets=dict(ground_truth=[0,N//2],prediction=[N//2,N]),quantization_max_axis_error_m=scale/2)
 header=json.dumps(h,separators=(',',':')).encode();payload=b'QARC3D01'+struct.pack('<I',len(header))+header+b''.join(v for k,v in arrays)
 compressed=gzip.compress(payload,compresslevel=6,mtime=0);binary=path.with_suffix('.bin.gz');binary.write_bytes(compressed)
 save(path,dict(frames=T,points=N,data_file=binary.name,data_sha256=hashlib.sha256(compressed).hexdigest(),prediction_points=N//2,quantization_max_axis_error_m=scale/2))
 # Verify the same int16 modular delta reconstruction used by the browser.
 restore=delta.copy()
 for t in range(1,T):restore[t]=(restore[t].astype(np.int32)+restore[t-1].astype(np.int32)).astype(np.int16)
 assert np.array_equal(restore,code)
 assert np.abs(restore*scale+offset-xyz).max()<=scale*.501+1e-9

def slots(world,uv):
 moving=np.linalg.norm(world-world[0],axis=-1).max(0)>.001;selected=[]
 for cls in (False,True):
  pool=np.flatnonzero(moving==cls);chosen=[]
  if len(pool):chosen=[int(pool[0])]
  while len(chosen)<min(12,len(pool)):
   d=np.linalg.norm(uv[pool,None]-uv[chosen][None],axis=-1).min(1);d[np.isin(pool,chosen)]=-1;chosen.append(int(pool[np.argmax(d)]))
  selected.extend(chosen)
 if len(selected)<24:selected.extend(i for i in range(world.shape[1]) if i not in selected)
 return np.array(selected[:24])
def uv_project(x,K):
 h=np.einsum('tij,tpj->tpi',K,x);u=h[...,:2]/h[...,2:];u[(x[...,2]<=1e-6)|~np.isfinite(u).all(-1)]=np.nan;return u

def render(index):
 folder=BASE/'clips'/f'{index:03d}';out=BASE/'public'/'media'/f'{index:03d}';out.mkdir(parents=True,exist_ok=True)
 meta=json.loads((folder/'frozen.json').read_text());m=json.loads((folder/'metrics.json').read_text());q=np.load(folder/'queries.npz');p=np.load(folder/'predictions.npz');rgb=np.load(folder/'rgb.npz')
 names=meta['request']['camera_names'];poses=q['poses'];K=q['K'];s=meta['scale'];c=np.array(meta['center']);alpha=m['alpha'];offset=0;pairs=[]
 for src in meta['sources']:
  N=src['points'];n=16*N*3;sl=slice(offset,offset+n);a=p['xyz'][sl].reshape(16,N,3,3);g=q['target_xyz_cam'][sl].reshape(16,N,3,3)
  wp=(np.einsum('tvij,tpvj->tpvi',poses[:,:,:3,:3],a*alpha)+poses[:,None,:,:3,3])*s+c
  wg=(np.einsum('tvij,tpvj->tpvi',poses[:,:,:3,:3],g)+poses[:,None,:,:3,3])*s+c
  assert np.max(np.abs(wg[:,:,0]-wg[:,:,1]))<1e-4
  pick=slots(wg[:,:,0],q['uv'][sl].reshape(16,N,3,2)[0,:,0]);sid=src['source']
  for target in range(3):
   stem=f'src{sid+1}-tgt{target+1}';targetvideo=np.asarray(rgb[names[target]])
   if targetvideo.shape[1]==3:targetvideo=np.moveaxis(targetvideo,1,-1)
   H,W=targetvideo.shape[1:3];pw=480;ph=round(H*pw/W)//2*2;size=(pw*2,ph+68);u_gt=uv_project(g[:,:,target],K[:,target]);u_pr=uv_project(a[:,:,target],K[:,target]);factor=pw/W
   command=[FFMPEG,'-y','-loglevel','error','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s',f'{size[0]}x{size[1]}','-r','8','-i','-','-an','-c:v','libx264','-threads','1','-preset','fast','-crf','25','-pix_fmt','yuv420p','-movflags','+faststart',str(out/f'{stem}.mp4')]
   proc=subprocess.Popen(command,stdin=subprocess.PIPE)
   colors=[tuple(int(x) for x in Image.new('HSV',(1,1),(int(k*255/max(1,len(pick))),210,255)).convert('RGB').getpixel((0,0))) for k in range(len(pick))]
   for t in range(16):
    frame=Image.new('RGB',size,(246,248,249));draw=ImageDraw.Draw(frame)
    title=f'Source: {names[sid]} (frame 1)  >  Target: {names[target]}'
    draw.text((12,8),title,font=FONT,fill='#26363e')
    draw.text((12,31),f'Ground truth | {N:,} scored source points',font=SMALL,fill='#465861')
    draw.text((pw+12,31),f'Prediction | A0 / R00 step 2048 | frame {t+1}/16',font=SMALL,fill='#465861')
    im=Image.fromarray(targetvideo[t]).resize((pw,ph))
    for side,uv in enumerate((u_gt,u_pr)):
     frame.paste(im,(side*pw,56));overlay=ImageDraw.Draw(frame)
     for k,pid in enumerate(pick):
      pts=uv[:t+1,pid]*factor
      valid=np.isfinite(pts).all(-1)&(pts[:,0]>=0)&(pts[:,0]<pw)&(pts[:,1]>=0)&(pts[:,1]<ph)
      for j in range(1,len(pts)):
       if valid[j-1] and valid[j]:overlay.line([(float(pts[j-1,0]+side*pw),float(pts[j-1,1]+56)),(float(pts[j,0]+side*pw),float(pts[j,1]+56))],fill=colors[k],width=2)
      if valid[-1]:
       x,y=pts[-1]+[side*pw,56];overlay.ellipse((x-3,y-3,x+3,y+3),fill=colors[k],outline='white')
    proc.stdin.write(np.asarray(frame).tobytes())
    if t==15:frame.save(out/f'{stem}.jpg',quality=85)
   proc.stdin.close();assert proc.wait()==0
   cloud(out/f'{stem}.json',wg[:,:,target],wp[:,:,target],q['timestamps'])
   pairs.append(dict(source=sid,target=target,source_name=names[sid],target_name=names[target],video=f'media/{index:03d}/{stem}.mp4',poster=f'media/{index:03d}/{stem}.jpg',cloud=f'media/{index:03d}/{stem}.json',display_points=pick.size,scored_points=N))
  offset+=n
 record=dict(index=index,family=meta['family'],sample_id=meta['sample_id'],group_id=meta['group_id'],language=meta['language'],cameras=names,sources=meta['sources'],frame_indices=meta['request']['frame_indices'],frames=16,playback_fps=8,capture_fps=meta['request']['fps'],stride=2,pairs=pairs,metrics=m)
 save(out/'clip.json',record);print(json.dumps(dict(event='rendered',index=index)),flush=True)
if __name__=='__main__':
 import argparse
 ap=argparse.ArgumentParser();ap.add_argument('--workers',type=int,default=4);a=ap.parse_args()
 from concurrent.futures import ProcessPoolExecutor
 ids=json.loads((BASE/'protocol.json').read_text())['indices']
 with ProcessPoolExecutor(a.workers) as pool:list(pool.map(render,ids))
