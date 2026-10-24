(() => {
  'use strict';
  const workerURL=new URL('pointstream-worker.js',document.currentScript.src).href;
  const cache=new Map();
  function cloudData(url){
    if(cache.has(url)){const item=cache.get(url);cache.delete(url);cache.set(url,item);return item;}
    const promise=new Promise((resolve,reject)=>{
      const worker=new Worker(workerURL);
      worker.onmessage=({data})=>{worker.terminate();data.error?reject(new Error(data.error)):resolve(data);};
      worker.onerror=e=>{worker.terminate();reject(new Error(e.message));};
      worker.postMessage({url});
    }).catch(error=>{cache.delete(url);throw error;});
    cache.set(url,promise);while(cache.size>2)cache.delete(cache.keys().next().value);
    return promise;
  }
  const vertex=`attribute vec3 position;attribute vec3 color;attribute float valid;
    uniform mat3 rotation;uniform vec3 target;uniform vec2 projection;uniform float cameraDistance;
    uniform float nearPlane;uniform float farPlane;uniform float pointSize;
    varying vec3 vColor;
    void main(){vec3 p=rotation*(position-target);float z=cameraDistance-p.z;
      float A=(farPlane+nearPlane)/(farPlane-nearPlane),B=-2.0*farPlane*nearPlane/(farPlane-nearPlane);
      gl_Position=valid>0.5?vec4(p.x*projection.x,p.y*projection.y,A*z+B,z):vec4(2.0,2.0,2.0,1.0);
      gl_PointSize=pointSize;vColor=color;}`;
  const fragment=`precision mediump float;varying vec3 vColor;
    void main(){vec2 p=gl_PointCoord-vec2(0.5);if(dot(p,p)>0.25)discard;gl_FragColor=vec4(vColor,1.0);}`;
  class PointView{
    constructor(canvas,data,status){
      this.canvas=canvas;this.data=data;this.status=status;this.frame=-1;this.pointSize=2.5;
      const gl=this.gl=canvas.getContext('webgl',{alpha:false,antialias:true,preserveDrawingBuffer:false});
      if(!gl)return canvasFallback(canvas,data,status);
      const compile=(type,code)=>{const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
      const p=this.program=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(p);
      if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
      gl.useProgram(p);this.buffers=[];this.uniforms={};
      for(const name of ['rotation','target','projection','cameraDistance','nearPlane','farPlane','pointSize'])this.uniforms[name]=gl.getUniformLocation(p,name);
      const attribute=(name,size,type,normalize)=>{const buffer=gl.createBuffer();this.buffers.push(buffer);const at=gl.getAttribLocation(p,name);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,size,type,normalize,0,0);return buffer;};
      this.position=attribute('position',3,gl.FLOAT,false);this.color=attribute('color',3,gl.UNSIGNED_BYTE,true);this.valid=attribute('valid',1,gl.UNSIGNED_BYTE,false);
      this.xyz=new Float32Array(data.header.points*3);this.mask=new Uint8Array(data.header.points);
      this.abort=new AbortController();this.bind();this.reset();
      this.observer=new ResizeObserver(()=>this.draw());this.observer.observe(canvas);
      gl.enable(gl.DEPTH_TEST);gl.clearColor(0.027,0.035,0.045,1);this.setFrame(0);
    }
    reset(){
      const [lo,hi]=this.data.header.bounds;this.target=lo.map((v,i)=>(v+hi[i])/2);
      this.radius=Math.max(Math.hypot(...hi.map((v,i)=>v-lo[i]))/2,0.05);
      this.distance=this.radius*2.8;this.yaw=-0.91;this.pitch=0.59;this.draw();
    }
    basis(){
      const c=Math.cos(this.yaw),s=Math.sin(this.yaw),p=Math.sin(this.pitch),q=Math.cos(this.pitch);
      return {right:[-s,c,0],up:[-c*p,-s*p,q],forward:[c*q,s*q,p]};
    }
    bind(){
      const c=this.canvas,options={signal:this.abort.signal},pointers=new Map();let pinch=null;
      c.addEventListener('contextmenu',e=>e.preventDefault(),options);
      c.addEventListener('pointerdown',e=>{c.focus({preventScroll:true});c.setPointerCapture(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);pinch=null;},options);
      c.addEventListener('pointermove',e=>{
        if(!pointers.has(e.pointerId))return;
        const previous=pointers.get(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);
        const dx=e.clientX-previous[0],dy=e.clientY-previous[1];
        if(pointers.size===2){const [a,b]=[...pointers.values()];const d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(pinch)this.zoom(pinch/Math.max(1,d));pinch=d;}
        else if(e.shiftKey||e.buttons===2){const {right,up}=this.basis();this.target=this.target.map((v,i)=>v+(-right[i]*dx+up[i]*dy)*this.distance*.0015);}
        else{this.yaw-=dx*.008;this.pitch=Math.max(-1.5,Math.min(1.5,this.pitch+dy*.008));}
        this.draw();
      },options);
      const end=e=>{pointers.delete(e.pointerId);pinch=null;};c.addEventListener('pointerup',end,options);c.addEventListener('pointercancel',end,options);
      c.addEventListener('wheel',e=>{e.preventDefault();this.zoom(Math.exp(e.deltaY*.001));},{...options,passive:false});
      c.addEventListener('keydown',e=>{
        const moves={ArrowLeft:[-.1,0],ArrowRight:[.1,0],ArrowUp:[0,.1],ArrowDown:[0,-.1]};
        if(moves[e.key]){e.preventDefault();this.yaw+=moves[e.key][0];this.pitch=Math.max(-1.5,Math.min(1.5,this.pitch+moves[e.key][1]));this.draw();}
        if(e.key==='+'||e.key==='='){e.preventDefault();this.zoom(.9);}if(e.key==='-'){e.preventDefault();this.zoom(1.1);}if(e.key==='Home'){e.preventDefault();this.reset();}
      },options);
    }
    zoom(ratio){this.distance=Math.max(this.radius*.08,Math.min(this.radius*30,this.distance*ratio));this.draw();}
    setFrame(frame){
      frame=Math.max(0,Math.min(this.data.header.frames-1,frame|0));if(frame===this.frame)return;
      this.frame=frame;const {header:h,arrays:a}=this.data,N=h.points,offset=frame*N*3;let valid=0;
      for(let n=0;n<N;n++){
        const bit=frame*N+n;this.mask[n]=(a.valid[bit>>3]>>(bit&7))&1;valid+=this.mask[n];
        for(let j=0;j<3;j++)this.xyz[n*3+j]=a.xyz[offset+n*3+j]*h.scale+h.offset[j];
      }
      const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.position);gl.bufferData(gl.ARRAY_BUFFER,this.xyz,gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.color);gl.bufferData(gl.ARRAY_BUFFER,a.colors.subarray(offset,offset+N*3),gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.valid);gl.bufferData(gl.ARRAY_BUFFER,this.mask,gl.DYNAMIC_DRAW);
      this.status.textContent=`${valid.toLocaleString()} / ${N.toLocaleString()} points / frame ${frame+1}`;this.draw();
    }
    draw(){
      if(!this.target||!this.gl)return;
      const c=this.canvas,gl=this.gl,dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(c.clientWidth*dpr)),h=Math.max(1,Math.round(c.clientHeight*dpr));
      if(c.width!==w||c.height!==h){c.width=w;c.height=h;}gl.viewport(0,0,w,h);gl.useProgram(this.program);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      const {right:r,up:u,forward:f}=this.basis(),a=this.uniforms;
      gl.uniformMatrix3fv(a.rotation,false,new Float32Array([r[0],u[0],f[0],r[1],u[1],f[1],r[2],u[2],f[2]]));
      gl.uniform3fv(a.target,this.target);gl.uniform2f(a.projection,1.9/(w/h),1.9);gl.uniform1f(a.cameraDistance,this.distance);
      gl.uniform1f(a.nearPlane,Math.max(this.radius*.0001,.00001));gl.uniform1f(a.farPlane,this.distance+this.radius*10);gl.uniform1f(a.pointSize,this.pointSize*dpr);
      gl.drawArrays(gl.POINTS,0,this.data.header.points);
    }
    dispose(){this.abort.abort();this.observer.disconnect();for(const b of this.buffers)this.gl.deleteBuffer(b);this.gl.deleteProgram(this.program);this.gl.getExtension('WEBGL_lose_context')?.loseContext();this.data=null;this.gl=null;}
  }
  // Keep the same orbit controls and projection when WebGL is unavailable.
  function canvasFallback(canvas,data,status){
    const view=Object.create(PointView.prototype);
    Object.assign(view,{canvas,data,status,frame:-1,pointSize:2.5,ctx:canvas.getContext('2d',{alpha:false}),
      xyz:new Float32Array(data.header.points*3),mask:new Uint8Array(data.header.points),abort:new AbortController()});
    if(!view.ctx)throw Error('Point-cloud canvas is unavailable');
    view.draw=function(){
      if(!this.target||!this.data)return;
      const c=this.canvas,dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(c.clientWidth*dpr)),h=Math.max(1,Math.round(c.clientHeight*dpr));
      if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
      const ctx=this.ctx;ctx.fillStyle='#07090c';ctx.fillRect(0,0,w,h);
      const {right,up,forward}=this.basis(),points=[],N=this.data.header.points,colors=this.data.arrays.colors;
      for(let i=0;i<N;i++){
        if(!this.mask[i])continue;
        const p=[0,1,2].map(k=>this.xyz[i*3+k]-this.target[k]),dot=v=>v.reduce((s,x,k)=>s+x*p[k],0),z=this.distance-dot(forward);
        if(z<=this.radius*.0001)continue;
        const x=w/2+dot(right)*1.9*h/(2*z),y=h/2-dot(up)*1.9*h/(2*z),j=(this.frame*N+i)*3;
        if(Number.isFinite(x)&&Number.isFinite(y))points.push({x,y,z,color:`rgb(${colors[j]},${colors[j+1]},${colors[j+2]})`});
      }
      points.sort((a,b)=>b.z-a.z);
      for(const p of points){ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,this.pointSize*dpr/2,0,2*Math.PI);ctx.fill();}
    };
    view.setFrame=function(frame){
      frame=Math.max(0,Math.min(this.data.header.frames-1,frame|0));if(frame===this.frame)return;this.frame=frame;
      const {header:h,arrays:a}=this.data,N=h.points,offset=frame*N*3;let valid=0;
      for(let n=0;n<N;n++){const bit=frame*N+n;this.mask[n]=(a.valid[bit>>3]>>(bit&7))&1;valid+=this.mask[n];
        for(let k=0;k<3;k++)this.xyz[n*3+k]=a.xyz[offset+n*3+k]*h.scale+h.offset[k];}
      this.status.textContent=`${valid.toLocaleString()} / ${N.toLocaleString()} points / frame ${frame+1}`;this.draw();
    };
    view.dispose=function(){this.abort.abort();this.observer.disconnect();this.data=null;this.ctx=null;};
    view.bind();view.reset();view.observer=new ResizeObserver(()=>view.draw());view.observer.observe(canvas);view.setFrame(0);return view;
  }
  const format=t=>`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
  class Player{
    constructor(card){
      this.card=card;this.video=card.querySelector('video');this.canvas=card.querySelector('.point-canvas');this.status=card.querySelector('.cloud-status');this.range=card.querySelector('[data-seek]');this.clock=card.querySelector('[data-clock]');this.play=card.querySelector('[data-play]');this.fps=Number(this.video.dataset.fps);this.frames=Number(card.dataset.frames);this.token=0;this.inView=false;this.view=null;
      const v=this.video;
      this.play.addEventListener('click',()=>{if(v.paused){this.activate();v.play().catch(e=>{this.status.textContent=e.message;});}else v.pause();});
      v.addEventListener('play',()=>{this.play.textContent='Pause';this.play.setAttribute('aria-label','Pause replay');this.activate();});
      v.addEventListener('pause',()=>{this.play.textContent='Play';this.play.setAttribute('aria-label','Play replay');this.sync();});
      v.addEventListener('loadeddata',()=>{v.removeAttribute('poster');delete v.dataset.poster;this.sync(v.currentTime);});
      for(const event of ['seeked','ended'])v.addEventListener(event,()=>{if(!v.requestVideoFrameCallback)this.sync(v.currentTime);});
      v.addEventListener('timeupdate',()=>{if(!v.requestVideoFrameCallback)this.sync(v.currentTime);});
      if(v.requestVideoFrameCallback){const tick=(_,meta)=>{this.presentedTime=meta.mediaTime;this.sync(meta.mediaTime);this.callback=v.requestVideoFrameCallback(tick);};this.callback=v.requestVideoFrameCallback(tick);}
      this.range.addEventListener('input',()=>{const frame=Number(this.range.value);v.currentTime=frame/this.fps+1e-7;});
      card.querySelector('[data-reset-view]').addEventListener('click',()=>this.view?.reset());
      card.querySelector('[data-point-size]').addEventListener('input',e=>{if(this.view){this.view.pointSize=Number(e.target.value);this.view.draw();}});
      card.querySelector('[data-fullscreen]').addEventListener('click',()=>{const panel=card.closest('.replay-shell')||card.querySelector('.replay-panel');if(document.fullscreenElement)document.exitFullscreen();else panel.requestFullscreen?.();});
      card.addEventListener('samplevisibility',()=>this.reconcile());
      card.quarcPlayer=this;this.sync();
    }
    sync(time=this.presentedTime??this.video.currentTime){
      const frame=Math.max(0,Math.min(this.frames-1,Math.floor(time*this.fps+1e-5)));
      this.frame=frame;this.range.value=String(frame);this.clock.textContent=`${format(frame/this.fps)} / ${format(this.frames/this.fps)} · ${frame+1}/${this.frames}`;
      this.range.setAttribute('aria-valuetext',`Frame ${frame+1} of ${this.frames}`);this.view?.setFrame(frame);
    }
    async activate(){
      if(this.view||this.loading||this.card.hidden||this.card.closest('.gallery-group').hidden)return;
      this.loading=true;const token=++this.token;this.status.textContent='Loading 3D points…';
      try{
        const data=await cloudData(new URL(this.card.dataset.cloud,document.baseURI).href);
        if(token!==this.token||this.card.hidden||this.card.closest('.gallery-group').hidden||!this.inView)return;
        this.view=new PointView(this.canvas,data,this.status);this.view.pointSize=Number(this.card.querySelector('[data-point-size]').value);this.sync();
      }catch(error){if(token===this.token)this.status.textContent=`3D: ${error.message}`;}
      finally{this.loading=false;if(token!==this.token&&this.inView&&!this.card.hidden&&!this.card.closest('.gallery-group').hidden)this.activate();}
    }
    reconcile(){
      const visible=this.inView&&!this.card.hidden&&!this.card.closest('.gallery-group').hidden;
      if(visible){if(this.video.preload==='none'){this.video.removeAttribute('poster');delete this.video.dataset.poster;this.video.preload='auto';this.video.load();}this.activate();}
      else{this.token++;if(this.view){this.view.dispose();this.view=null;const fresh=this.canvas.cloneNode(false);this.canvas.replaceWith(fresh);this.canvas=fresh;}if(!this.video.paused)this.video.pause();}
    }
  }
  const players=[...document.querySelectorAll('.video-card[data-cloud]')].map(c=>new Player(c));
  const observer=new IntersectionObserver(entries=>{for(const entry of entries){const p=entry.target.quarcPlayer;p.inView=entry.isIntersecting;p.reconcile();}},{rootMargin:'120px'});
  for(const p of players)observer.observe(p.card);
  const mutations=new MutationObserver(()=>players.forEach(p=>p.reconcile()));
  for(const group of document.querySelectorAll('.gallery-group'))mutations.observe(group,{attributes:true,attributeFilter:['hidden'],subtree:true});
  // Exposed for independent decoder / frame-sync tests and support diagnostics.
  window.QuarcPointViewer={PointView,Player,players};
})();
