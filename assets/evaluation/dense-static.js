/* Static transport for the existing evaluation panel. Metrics remain full-query. */
(() => {
  const local=['127.0.0.1','localhost'].includes(location.hostname);
  if(local&&!new URLSearchParams(location.search).has('static'))return;
  const base=new URL('data/dense-20261024/',document.baseURI),cache=new Map();
  const predictionBase=local?base:new URL('https://raw.githubusercontent.com/cowboy446/point-track-databoard/main/data/dense-20261024/');
  async function bytes(path){
    if(!cache.has(path))cache.set(path,(async()=>{
      const r=await fetch(new URL(path,path.startsWith('predictions/')?predictionBase:base));if(!r.ok)throw Error(`HTTP ${r.status}: ${path}`);
      return await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    })().catch(e=>{cache.delete(path);throw e;}));
    if(cache.size>18)cache.delete(cache.keys().next().value);return cache.get(path);
  }
  function container(raw){const n=new DataView(raw).getUint32(0,true);return {header:JSON.parse(new TextDecoder().decode(new Uint8Array(raw,4,n))),raw,offset:4+n};}
  function half(raw,offset,count){
    const a=new Uint16Array(raw,offset,count),b=new Float32Array(count);
    for(let i=0;i<count;i++){const h=a[i],s=h&32768?-1:1,e=(h>>10)&31,f=h&1023;b[i]=e===0?s*f*2**-24:e===31?f?NaN:s*Infinity:s*(1+f/1024)*2**(e-15);}
    return b;
  }
  async function clip(stride,split,index){
    const b=container(await bytes(`clips/s${stride}-${split}-${String(index).padStart(3,'0')}.bin.gz`));let offset=b.offset;
    b.sources=b.header.sources.map(s=>{
      const xyz=new Float32Array(b.raw,offset,16*s.n*3);offset+=xyz.byteLength;
      const visible=new Uint8Array(b.raw,offset,16*s.n*b.header.views);offset+=visible.byteLength;
      return {...s,xyz,visible};
    });return b;
  }
  async function prediction(model,split,index,gt){
    const b=container(await bytes(`predictions/${model}/${split}-${String(index).padStart(3,'0')}.bin.gz`));let offset=b.offset;
    b.sources=gt.sources.map((s,i)=>{const count=16*s.n*(b.header.single?1:gt.header.views)*3,dtype=b.header.dtypes[i];
      const a=dtype==='<f2'?half(b.raw,offset,count):new Float32Array(b.raw,offset,count);offset+=count*(dtype==='<f2'?2:4);return a;});return b;
  }
  async function cloud(p){
    const stride=+p.stride,index=+p.clip,source=+p.source,target=+p.target;
    const gt=await clip(stride,p.split,index),pred=await prediction(p.model,p.split,index,gt),h=gt.header,s=gt.sources[source];
    if(pred.header.single&&source!==target)throw Error('Single-view checkpoint requires the same source and target camera');
    let choose=Array.from({length:s.n},(_,i)=>i).filter(i=>p.kind==='dynamic'?s.dynamic[i]:p.kind==='static'?!s.dynamic[i]:true);
    const limit=+p.limit;if(limit&&choose.length>limit)choose=Array.from({length:limit},(_,i)=>choose[Math.floor(i*(choose.length-1)/(limit-1))]);
    const n=choose.length,N=2*n,xyz=new Float32Array(16*N*3),uv=new Float32Array(16*N*2),valid=new Uint8Array(Math.ceil(16*N/8));
    const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity],V=h.views,P=pred.header.single?1:V;
    for(let t=0;t<16;t++)for(let layer=0;layer<2;layer++)for(let j=0;j<n;j++){
      const i=choose[j],dst=t*N+layer*n+j,gi=(t*s.n+i)*3,pi=((t*s.n+i)*P+(pred.header.single?0:target))*3,w=[];
      for(let k=0;k<3;k++){w[k]=s.xyz[gi+k]+(layer?pred.sources[source][pi+k]:0);xyz[dst*3+k]=w[k];lo[k]=Math.min(lo[k],w[k]);hi[k]=Math.max(hi[k],w[k]);}
      if(w.every(Number.isFinite))valid[dst>>3]|=1<<(dst&7);
      const pose=h.poses[t][target],cam=[0,0,0];
      for(let k=0;k<3;k++)for(let a=0;a<3;a++)cam[k]+=pose[a][k]*((w[a]-h.center[a])/h.scale-pose[a][3]);
      const K=h.K[t][target],pixel=K.map(row=>row.reduce((v,x,k)=>v+x*cam[k],0));
      if(cam[2]>1e-6&&pixel.every(Number.isFinite)&&s.visible[(t*s.n+i)*V+target]){
        uv[dst*2]=pixel[0]/pixel[2]/(h.image_shapes[target][1]-1);uv[dst*2+1]=pixel[1]/pixel[2]/(h.image_shapes[target][0]-1);
      }else{uv[dst*2]=uv[dst*2+1]=-1;}
    }
    return {header:{frames:16,points:N,bounds:[n?lo:[-.5,-.5,-.5],n?hi:[.5,.5,.5]],scale:1,offset:[0,0,0]},
      xyz,uv,valid,point_ids:choose.map(i=>s.point_ids[i]),alpha:pred.header.alphas[source],
      metrics:pred.header.metrics.groups.find(g=>g.source===source&&g.target===target),
      scored_points:s.scored_points,displayed_points:n,query_sha256:pred.header.query_sha256,image_shape:h.image_shapes[target],input_views:pred.header.single?1:V};
  }
  window.QuarcDenseStatic={
    async get(path,p={}){
      if(path==='index')return JSON.parse(new TextDecoder().decode(await bytes('catalog.json.gz')));
      if(path==='cloud')return cloud(p);
      if(path==='metrics'){const gt=await clip(+p.stride,p.split,+p.clip);return (await prediction(p.model,p.split,+p.clip,gt)).header.metrics;}
      throw Error('Unknown static endpoint');
    },
    videoURL:p=>new URL(`video/s${p.stride}-${p.split}-${String(p.clip).padStart(3,'0')}-v${p.target}.mp4`,base).href
  };
})();
