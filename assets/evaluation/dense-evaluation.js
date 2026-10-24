'use strict';
(async () => {
  const $ = s => document.querySelector(s);
  const fmt = (x, n=4) => x == null ? '—' : Number(x).toFixed(n);
  const esc = x => String(x).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const get = async (path, params={}) => {
    if(window.QuarcDenseStatic)return window.QuarcDenseStatic.get(path,params);
    const response = await fetch('/dense-api/'+path+'?'+new URLSearchParams(params));
    const value = await response.json();
    if (!response.ok || value.error) throw Error(value.error || `HTTP ${response.status}`);
    return value;
  };
  if(!window.QuarcDenseStatic)document.querySelector('#point-limit').innerHTML='<option value="0">All sampled points</option><option value="1024">1,024 / source</option><option value="512">512 / source</option>';
  let data;
  try { data = await get('index'); }
  catch (e) { $('#summary-status').textContent = e.message; return; }
  let split='dev', stride=1, clip, generation=0, videoGeneration=0;
  let clouds=[], videoView=null, videoData=null, compareData=[], active=0;
  let frame=0, videoFrame=0, playing=false, videoPlaying=false, last=0, videoLast=0, ready=false;
  let linked=true, trails=false, videoURL=null;
  const cache=new Map(), videoCache=new Map(), video=$('#eval-video'), overlay=$('#eval-overlay'), ctx=overlay.getContext('2d');
  const models = () => data.models.filter(m => m.stride===stride);
  const label = m => `${m.trained_families.length} datasets / ${m.stage==='single'?'SV':'MV'} / step ${m.step.toLocaleString()}`;
  const clean = s => String(s).replace(/^\[['"]|['"]\]$/g,'');
  const params = model => ({model, stride, split, clip:clip.index, source:$('#source').value, target:$('#target').value,
                            kind:$('#point-kind').value, limit:$('#point-limit').value});
  function metric(row, name) {
    const kind=$('#point-kind').value;
    return row[kind==='all' ? name : kind+'_'+name];
  }
  function summary() {
    const family=$('#family').value, kind=$('#point-kind').value, prefix=kind==='all'?'':kind==='dynamic'?'Dynamic ':'Static ';
    $('#summary').innerHTML=`<thead><tr><th>Checkpoint</th><th>Coverage</th><th>Input</th><th>${prefix}loss</th><th>${prefix}XYZ (cm)</th><th>Dynamic (cm)</th><th>Static (cm)</th><th title="All scored points">Pixel (px)</th><th title="All scored points">Visibility</th></tr></thead><tbody>`+models().map(m=>{
      const x=data.summary[m.id][split][family], seen=m.trained_families.includes(family);
      const xyz=metric(x,'xyz_m');
      const views=data.strict_single_ready&&m.stage==='single'?1:(family==='robotwin_v6'?2:3);
      return `<tr><td>${esc(label(m))}</td><td title="${seen?'Included in model training':'Not included in model training'}">${seen?'Seen':'Unseen'}</td><td>${views} ${views===1?'view':'views'}</td><td>${fmt(metric(x,'loss'),5)}</td><td>${xyz==null?'—':fmt(xyz*100,2)}</td><td>${x.dynamic_xyz_m==null?'—':fmt(x.dynamic_xyz_m*100,2)}</td><td>${x.static_xyz_m==null?'—':fmt(x.static_xyz_m*100,2)}</td><td>${fmt(x.pixel_epe,2)}</td><td>${fmt(x.visibility_accuracy*100,1)}%</td></tr>`;
    }).join('')+'</tbody>';
    $('#summary-status').textContent='';
  }
  function modelOptions() {
    for (const id of ['left-run','run','video-run']) {
      const el=$('#'+id), old=el.value, equivalent=old.replace(/-s[12]-/,`-s${stride}-`);
      el.innerHTML=models().map(m=>`<option value="${m.id}">${esc(label(m))}</option>`).join('');
      el.value=models().some(m=>m.id===equivalent)?equivalent:models().find(m=>m.stage==='multi'&&(id==='run'?m.trained_families.length===4:m.trained_families.length===2)).id;
    }
  }
  function stopCompare() { playing=false; $('#play').textContent='Play'; }
  function stopVideo() { videoPlaying=false; $('#video-play').textContent='Play'; }
  function sync() {
    if (!linked || clouds.length!==2) return;
    const a=clouds[active], b=clouds[1-active]; b.target=[...a.target];
    for (const k of ['radius','distance','yaw','pitch']) b[k]=a[k]; b.draw();
  }
  function compareTimeline() {
    clouds.forEach(v=>v.setFrame(frame)); $('#seek').value=frame; $('#frame-label').textContent=`${frame+1} / 16`;
    $('#frame-label').title=`Original frame ${clip.frame_indices[frame]}`;
    $('#scale-readout').textContent=compareData.length===2?`Original frame ${clip.frame_indices[frame]}   Left α ${fmt(compareData[0].alpha)}   Right α ${fmt(compareData[1].alpha)}`:'';
  }
  function mask(view, mode) {
    if (!view) return;
    const d=view.data,N=d.header.points;
    d.arrays.valid.set(d.baseValid);
    for(let t=0;t<16;t++) for(let p=0;p<N;p++) {
      if(mode!=='both' && (mode==='gt'?p>=N/2:p<N/2)) { const k=t*N+p; d.arrays.valid[k>>3]&=~(1<<(k&7)); }
    }
    view.frame=-1;
  }
  function compareLayers() { clouds.forEach(v=>mask(v,$('#layers').value)); compareTimeline(); }
  function decode(text, Type) {
    const raw=atob(text), bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i);
    return new Type(bytes.buffer);
  }
  async function cloud(selection) {
    const key=new URLSearchParams(selection).toString();
    if(!cache.has(key)) {
      const pending=get('cloud',selection).then(p=>{
        if(!(p.xyz instanceof Float32Array))p.xyz=decode(p.xyz,Float32Array);
        if(!(p.valid instanceof Uint8Array))p.valid=decode(p.valid,Uint8Array);
        if(!(p.uv instanceof Float32Array))p.uv=decode(p.uv,Float32Array);return p;
      }).catch(e=>{cache.delete(key);throw e;});
      cache.set(key,pending); if(cache.size>8) cache.delete(cache.keys().next().value);
    }
    const p=await cache.get(key), N=p.header.points, colors=new Uint8Array(16*N*3);
    for(let t=0;t<16;t++)for(let i=0;i<N;i++)colors.set(i<N/2?[49,181,191]:[242,135,90],(t*N+i)*3);
    return {...p,header:{...p.header,bounds:p.header.bounds.map(a=>[...a])},baseValid:p.valid.slice(),
            arrays:{xyz:p.xyz,valid:p.valid.slice(),colors}};
  }
  function fresh(id, old) {
    old?.dispose(); const canvas=$('#'+id);canvas.replaceWith(canvas.cloneNode(false));return $('#'+id);
  }
  async function loadCompare() {
    const id=++generation;stopCompare();frame=0;$('#compare-error').textContent='';
    const left=$('#left-run').value, right=$('#run').value, selection=params(left);
    clouds.forEach(v=>v.dispose());clouds=[];compareData=[];
    const canvases=['baseline','experiment'].map(k=>fresh(k+'-cloud',null));
    $('#play').disabled=true;$('#scale-readout').textContent='';
    try {
      const result=await Promise.all([cloud(selection),cloud({...selection,model:right})]);
      if(id!==generation)return;
      const lo=[0,1,2].map(i=>Math.min(...result.map(d=>d.header.bounds[0][i]))),hi=[0,1,2].map(i=>Math.max(...result.map(d=>d.header.bounds[1][i])));
      result.forEach(d=>d.header.bounds=[lo,hi]);compareData=result;
      clouds=result.map((d,i)=>{
        const v=new window.QuarcPointViewer.PointView(canvases[i],d,$(i?'#experiment-status':'#baseline-status'));
        for(const event of ['pointermove','wheel','keydown'])canvases[i].addEventListener(event,()=>{active=i;sync();});return v;
      });
      result.forEach((d,i)=>{
        const loss=metric(d.metrics,'loss'),xyz=metric(d.metrics,'xyz_m');
        $(i?'#experiment-score':'#baseline-score').textContent=`XYZ ${xyz==null?'—':fmt(xyz*100,2)+' cm'} / loss ${fmt(loss,5)}`;
      });
      $('#play').disabled=false;compareLayers();updatePairs(left,right,id);
    }catch(e){if(id===generation)$('#compare-error').textContent=e.message;}
  }
  async function updatePairs(left,right,id) {
    try{
      const values=await Promise.all([...new Set([left,right])].map(m=>get('metrics',params(m))));if(id!==generation)return;
      $('#pairs').innerHTML='<thead><tr><th>Checkpoint</th><th>Source → target</th><th>Loss</th><th>Dynamic loss</th><th>Static loss</th><th>XYZ (cm)</th><th>Dynamic (cm)</th><th>Static (cm)</th><th>Pixel (px)</th></tr></thead><tbody>'+values.flatMap(x=>x.groups.map(g=>`<tr><td>${esc(label(data.models.find(m=>m.id===x.model)))}</td><td title="${esc(g.source_name+' → '+g.target_name)}">V${g.source+1} → V${g.target+1}</td><td>${fmt(g.loss,5)}</td><td>${fmt(g.dynamic_loss,5)}</td><td>${fmt(g.static_loss,5)}</td><td>${fmt(g.xyz_m*100,2)}</td><td>${g.dynamic_xyz_m==null?'—':fmt(g.dynamic_xyz_m*100,2)}</td><td>${g.static_xyz_m==null?'—':fmt(g.static_xyz_m*100,2)}</td><td>${fmt(g.pixel_epe,2)}</td></tr>`)).join('')+'</tbody>';
    }catch(e){if(id===generation)$('#compare-error').textContent=e.message;}
  }
  function draw() {
    const rect=overlay.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);
    if(overlay.width!==w||overlay.height!==h){overlay.width=w;overlay.height=h;}ctx.clearRect(0,0,w,h);
    if(!videoData||!video.videoWidth)return;
    const N=videoData.header.points, count=N/2, uv=videoData.uv, mode=$('#video-layers').value;
    const fit=Math.min(w/video.videoWidth,h/video.videoHeight),fw=fit*video.videoWidth,fh=fit*video.videoHeight,ox=(w-fw)/2,oy=(h-fh)/2;
    for(let layer=0;layer<2;layer++){
      if(mode!=='both' && (mode==='gt'?layer!==0:layer!==1))continue;
      ctx.fillStyle=ctx.strokeStyle=layer?'#f2875a':'#31b5bf';ctx.lineWidth=dpr;
      for(let i=0;i<count;i++){
        ctx.beginPath();let connected=false;
        for(let f=trails?Math.max(0,videoFrame-3):videoFrame;f<=videoFrame;f++){
          const k=(f*N+layer*count+i)*2,x=uv[k],y=uv[k+1];
          if(x<0||x>1||y<0||y>1){connected=false;continue;}
          connected?ctx.lineTo(ox+x*fw,oy+y*fh):ctx.moveTo(ox+x*fw,oy+y*fh);connected=true;
        }ctx.stroke();
        const k=(videoFrame*N+layer*count+i)*2,x=uv[k],y=uv[k+1];
        if(x>=0&&x<=1&&y>=0&&y<=1){ctx.beginPath();ctx.arc(ox+x*fw,oy+y*fh,1.3*dpr,0,Math.PI*2);ctx.fill();}
      }
    }
  }
  function videoTimeline() {
    videoView?.setFrame(videoFrame);$('#video-seek').value=videoFrame;$('#video-frame').textContent=`${videoFrame+1} / 16`;
    $('#video-frame').title=`Original frame ${clip.frame_indices[videoFrame]}`;
    if(video.readyState>=1)video.currentTime=(videoFrame+.02)/8;draw();
  }
  function videoLayers(){mask(videoView,$('#video-layers').value);videoTimeline();}
  async function loadVideo() {
    const id=++videoGeneration, selection=params($('#video-run').value);stopVideo();videoFrame=0;ready=false;videoData=null;
    $('#video-error').textContent='';$('#video-play').disabled=true;fresh('video-cloud',videoView);videoView=null;draw();
    video.pause();video.removeAttribute('src');video.load();
    if(videoURL){URL.revokeObjectURL(videoURL);videoURL=null;}
    try{
      const videoKey=new URLSearchParams({stride:selection.stride,split:selection.split,clip:selection.clip,target:selection.target}).toString();
      if(!videoCache.has(videoKey)){
        videoCache.set(videoKey,fetch(window.QuarcDenseStatic?window.QuarcDenseStatic.videoURL(selection):'/dense-api/video.mp4?'+videoKey).then(r=>{if(!r.ok)throw Error(`Video HTTP ${r.status}`);return r.blob();}).catch(e=>{videoCache.delete(videoKey);throw e;}));
        if(videoCache.size>6)videoCache.delete(videoCache.keys().next().value);
      }
      const [d,blob]=await Promise.all([cloud(selection),videoCache.get(videoKey)]);if(id!==videoGeneration)return;
      videoData=d;videoView=new window.QuarcPointViewer.PointView($('#video-cloud'),d,$('#video-status'));
      const xyz=metric(d.metrics,'xyz_m');$('#video-metrics').textContent=`XYZ ${xyz==null?'—':fmt(xyz*100,2)+' cm'} / ${d.displayed_points.toLocaleString()} points`;
      $('#video-panel').style.setProperty('--video-aspect',`${d.image_shape[1]}/${d.image_shape[0]}`);
      videoURL=URL.createObjectURL(blob);video.src=videoURL;video.load();videoLayers();
    }catch(e){if(id===videoGeneration)$('#video-error').textContent=e.message;}
  }
  function pair() {
    constrainTarget();
    const s=+$('#source').value,t=+$('#target').value;
    $('#pair-title').textContent=`V${s+1} → V${t+1}`;$('#compare-pair-label').textContent=`V${s+1} → V${t+1}`;
    $('#video-pair-label').textContent=`Video / V${s+1} → V${t+1}`;
    $('#description').textContent=`${clip.cameras[s]} → ${clip.cameras[t]} / ${clip.sources[s].points.toLocaleString()} scored source points / ${clip.sample_id}`;
    loadCompare();loadVideo();
  }
  function constrainTarget() {
    const single=data.strict_single_ready&&['left-run','run','video-run'].some(id=>data.models.find(m=>m.id===$('#'+id).value)?.stage==='single');
    const t=$('#target'),changed=t.disabled!==!!single||(single&&t.value!==$('#source').value);
    t.disabled=!!single;t.title=single?'SV checkpoint selected: one input camera, same-camera queries, local view indices0':'';
    if(single)t.value=$('#source').value;
    return changed;
  }
  function selectClip() {
    clip=data.clips[stride][split].find(c=>c.index===+$('#clip').value);
    for(const id of ['source','target']){const el=$('#'+id),old=el.value;el.innerHTML=clip.cameras.map((n,i)=>`<option value="${i}">V${i+1} / ${esc(n)}</option>`).join('');if(+old<clip.cameras.length)el.value=old||'0';}
    pair();
  }
  function selection() {
    const old=$('#clip').value,clips=data.clips[stride][split].filter(c=>c.family===$('#family').value);
    $('#clip').innerHTML=clips.map((c,i)=>`<option value="${c.index}">${String(i+1).padStart(2,'0')} / ${esc(clean(c.language))}</option>`).join('');
    if(clips.some(c=>String(c.index)===old))$('#clip').value=old;
    modelOptions();summary();selectClip();
  }
  $('#family').onchange=selection;$('#clip').onchange=selectClip;
  document.querySelectorAll('[data-split]').forEach(b=>b.onclick=()=>{split=b.dataset.split;document.querySelectorAll('[data-split]').forEach(x=>x.setAttribute('aria-pressed',x===b));selection();});
  document.querySelectorAll('[data-stride]').forEach(b=>b.onclick=()=>{stride=+b.dataset.stride;document.querySelectorAll('[data-stride]').forEach(x=>x.setAttribute('aria-pressed',x===b));selection();});
  for(const id of ['source','target'])$('#'+id).onchange=pair;
  for(const id of ['point-kind','point-limit'])$('#'+id).onchange=()=>{summary();pair();};
  for(const id of ['left-run','run'])$('#'+id).onchange=()=>{if(constrainTarget())pair();else loadCompare();};
  $('#video-run').onchange=()=>{if(constrainTarget())pair();else loadVideo();};$('#layers').onchange=compareLayers;$('#video-layers').onchange=videoLayers;
  $('#seek').oninput=()=>{stopCompare();frame=+$('#seek').value;compareTimeline();};
  $('#play').onclick=()=>{playing=!playing;last=performance.now();$('#play').textContent=playing?'Pause':'Play';};
  $('#reset').onclick=()=>clouds.forEach(v=>v.reset());
  $('#linked').onclick=e=>{linked=!linked;e.currentTarget.setAttribute('aria-pressed',linked);sync();};
  $('#video-seek').oninput=()=>{stopVideo();videoFrame=+$('#video-seek').value;videoTimeline();};
  $('#video-play').onclick=()=>{if(ready){videoPlaying=!videoPlaying;videoLast=performance.now();$('#video-play').textContent=videoPlaying?'Pause':'Play';}};
  for(const [id,delta] of [['video-prev',-1],['video-next',1]])$('#'+id).onclick=()=>{stopVideo();videoFrame=(videoFrame+delta+16)%16;videoTimeline();};
  $('#video-trails').onclick=e=>{trails=!trails;e.currentTarget.setAttribute('aria-pressed',trails);draw();};$('#video-reset').onclick=()=>videoView?.reset();
  video.onloadeddata=()=>{ready=true;$('#video-play').disabled=false;videoTimeline();};video.onseeked=draw;
  video.onerror=()=>{if(video.getAttribute('src'))$('#video-error').textContent='Video could not be loaded';};
  new ResizeObserver(draw).observe(overlay);
  document.querySelectorAll('[data-fullscreen]').forEach(b=>b.onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.getElementById(b.dataset.fullscreen).requestFullscreen();}catch(e){$('#compare-error').textContent=e.message;}});
  function tick(now){
    if(playing&&now-last>=125){frame=(frame+1)%16;last=now;compareTimeline();}
    if(videoPlaying&&ready&&!video.seeking&&now-videoLast>=1000/Number($('#video-speed').value)){videoFrame=(videoFrame+1)%16;videoLast=now;videoTimeline();}
    requestAnimationFrame(tick);
  }
  selection();requestAnimationFrame(tick);
})();
