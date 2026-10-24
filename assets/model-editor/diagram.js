// A structured SVG scene: the same nodes and edges also export to native draw.io cells.
const NS='http://www.w3.org/2000/svg';
const el=(name,attrs={})=>{const x=document.createElementNS(NS,name);for(const [k,v] of Object.entries(attrs))x.setAttribute(k,v);return x;};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const copy=x=>JSON.parse(JSON.stringify(x));

export class ArchitectureDiagram {
  constructor(host,spec){
    this.host=host;this.original=copy(spec);this.spec=copy(spec);this.key='quarc-architecture-layout-v1'+(new URLSearchParams(location.search).has('qa')?'-qa':'');
    try{const saved=JSON.parse(localStorage.getItem(this.key));if(saved?.id===spec.id){
      for(const n of this.spec.nodes){const old=saved.nodes.find(x=>x.id===n.id);if(old){n.x=old.x;n.y=old.y;n.label=old.label;}}
    }}catch{}
    this.view=[0,0,spec.width,spec.height];this.selected=null;
    this.svg=el('svg',{xmlns:NS,viewBox:this.view.join(' '),role:'img','aria-label':'QuARC model architecture. Video encoder, point queries, cross-attention decoder and point predictions.'});
    this.svg.innerHTML='<defs><marker id="arrow" viewBox="0 0 10 8" refX="9" refY="4" markerWidth="8" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 4 L0 8Z" fill="#777268"/></marker></defs><g class="groups"></g><g class="edges"></g><g class="nodes"></g>';
    host.replaceChildren(this.svg);this.render();this.bind();
  }
  abs(n){const p=n.parent?this.abs(this.spec.nodes.find(x=>x.id===n.parent)):{x:0,y:0};return {...n,x:n.x+p.x,y:n.y+p.y};}
  port(id,side){const n=this.abs(this.spec.nodes.find(x=>x.id===id));return ({top:[n.x+n.w/2,n.y],bottom:[n.x+n.w/2,n.y+n.h],left:[n.x,n.y+n.h/2],right:[n.x+n.w,n.y+n.h/2]})[side];}
  save(){try{localStorage.setItem(this.key,JSON.stringify(this.spec));}catch{}this.host.dispatchEvent(new CustomEvent('diagramchange'));}
  render(){
    const layer=this.svg.querySelector('.nodes'),groups=this.svg.querySelector('.groups');layer.replaceChildren();groups.replaceChildren();
    for(const n of this.spec.nodes){
      const p=this.abs(n),g=el('g',{'data-node':n.id,transform:`translate(${p.x} ${p.y})`,class:'diagram-node','aria-label':n.label||n.id});
      const fill=this.spec.palette[n.color]||'none';
      if(!['text','image'].includes(n.kind))g.append(el(n.kind==='sum'?'ellipse':'rect',n.kind==='sum'?{cx:n.w/2,cy:n.h/2,rx:n.w/2,ry:n.h/2,fill,stroke:'#777268','stroke-width':1.5}:{x:0,y:0,width:n.w,height:n.h,rx:n.kind==='group'?15:n.kind==='pill'?18:5,fill,stroke:'#777268','stroke-width':1.5}));
      if(n.kind==='image')g.append(el('image',{href:n.image,x:0,y:0,width:n.w,height:n.h,preserveAspectRatio:'xMidYMid slice'}));
      if(n.label){
        const text=el('text',{x:n.kind==='group'?18:n.w/2,y:n.kind==='group'?30:n.h/2,'text-anchor':n.kind==='group'?'start':'middle',fill:'#45443f','font-family':'Arial, Helvetica, sans-serif','font-size':n.size||21,'font-weight':n.kind==='group'?500:400});
        const lines=n.label.split('\n');lines.forEach((s,i)=>{const t=el('tspan',{x:n.kind==='group'?18:n.w/2,dy:i?((n.size||21)*1.12):n.kind==='group'?0:(.34-(lines.length-1)*.56)*(n.size||21)});t.textContent=s;text.append(t);});g.append(text);
      }
      (n.kind==='group'?groups:layer).append(g);
    }
    this.drawEdges();
  }
  drawEdges(){
    const layer=this.svg.querySelector('.edges');layer.replaceChildren();
    for(const e of this.spec.edges){
      const a=this.port(e.source,e.a),b=this.port(e.target,e.b);let points=[a,...e.via,b];
      if(!e.via.length&&a[0]!==b[0]&&a[1]!==b[1])points=[a,...(['top','bottom'].includes(e.a)?[[a[0],(a[1]+b[1])/2],[b[0],(a[1]+b[1])/2]]:[[(a[0]+b[0])/2,a[1]],[(a[0]+b[0])/2,b[1]]]),b];
      layer.append(el('path',{d:points.map((p,i)=>(i?'L':'M')+p.join(' ')).join(' '),fill:'none',stroke:'#777268','stroke-width':1.6,'marker-end':'url(#arrow)','stroke-linejoin':'round'}));
      if(e.label){const p=e.labelAt||[points[1][0]+10,points[1][1]+65],t=el('text',{x:p[0],y:p[1],fill:'#55534d','font-family':'Arial, sans-serif','font-size':17,transform:`rotate(${e.labelAngle||90} ${p[0]} ${p[1]})`});t.textContent=e.label;layer.append(t);}
    }
  }
  point(event){const p=new DOMPoint(event.clientX,event.clientY);return p.matrixTransform(this.svg.getScreenCTM().inverse());}
  bind(){
    let drag=null;
    this.svg.addEventListener('pointerdown',e=>{
      if(e.button!==0)return;const id=e.target.closest('[data-node]')?.dataset.node,p=this.point(e);
      const n=this.spec.nodes.find(n=>n.id===id);drag={id,p,x:n?.x,y:n?.y,view:[...this.view],changed:false};
    });
    this.svg.addEventListener('pointermove',e=>{
      if(!drag)return;const p=this.point(e),dx=p.x-drag.p.x,dy=p.y-drag.p.y;
      if(!drag.changed&&Math.hypot(dx,dy)<3)return;
      if(!drag.changed){this.svg.setPointerCapture(e.pointerId);this.svg.classList.add('is-dragging');}
      if(drag.id){const n=this.spec.nodes.find(n=>n.id===drag.id);n.x=drag.x+dx;n.y=drag.y+dy;this.render();}
      else{this.view[0]-=dx;this.view[1]-=dy;this.svg.setAttribute('viewBox',this.view.join(' '));}
      drag.changed=true;
    });
    const end=()=>{if(drag?.changed&&drag.id)this.save();drag=null;this.svg.classList.remove('is-dragging');};
    this.svg.addEventListener('pointerup',end);this.svg.addEventListener('pointercancel',end);
    this.svg.addEventListener('dblclick',e=>{const n=this.spec.nodes.find(n=>n.id===e.target.closest('[data-node]')?.dataset.node);if(!n?.label)return;this.selected=n;const dialog=document.querySelector('#label-dialog');dialog.querySelector('textarea').value=n.label;dialog.showModal();});
    this.svg.addEventListener('wheel',e=>{if(!e.ctrlKey&&!e.metaKey)return;e.preventDefault();this.zoom(e.deltaY>0?1.1:1/1.1);},{passive:false});
  }
  zoom(factor){const [x,y,w,h]=this.view;const nw=Math.max(500,Math.min(4000,w*factor)),nh=nw*this.spec.height/this.spec.width;this.view=[x+(w-nw)/2,y+(h-nh)/2,nw,nh];this.svg.setAttribute('viewBox',this.view.join(' '));}
  fit(){this.view=[0,0,this.spec.width,this.spec.height];this.svg.setAttribute('viewBox',this.view.join(' '));}
  reset(){this.spec=copy(this.original);this.save();this.fit();this.render();}
  async svgText(){
    const svg=this.svg.cloneNode(true);svg.setAttribute('viewBox',`0 0 ${this.spec.width} ${this.spec.height}`);svg.setAttribute('width',this.spec.width);svg.setAttribute('height',this.spec.height);svg.style.background='#fff';
    for(const img of svg.querySelectorAll('image')){const blob=await(await fetch(img.getAttribute('href'))).blob();img.setAttribute('href',await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);}));}
    return '<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(svg);
  }
  async drawio(){
    let cells='<mxCell id="0"/><mxCell id="1" parent="0"/>';
    for(const n of this.spec.nodes){
      let style=`rounded=1;arcSize=${n.kind==='group'?12:8};whiteSpace=wrap;html=0;fillColor=${this.spec.palette[n.color]||'none'};strokeColor=#777268;fontColor=#45443f;fontFamily=Helvetica;fontSize=${n.size||21};`;
      if(n.kind==='group')style+='verticalAlign=top;align=left;spacingTop=9;spacingLeft=15;container=1;collapsible=0;';
      if(n.kind==='sum')style+='ellipse;';
      if(n.kind==='pill')style+='arcSize=100;';
      if(n.kind==='text')style+='fillColor=none;strokeColor=none;';
      if(n.kind==='image'){
        const blob=await(await fetch(n.image)).blob(),data=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(blob);});
        style=`shape=image;imageAspect=0;aspect=fixed;image=${data.replace(';base64,',',')};`;
      }
      cells+=`<mxCell id="${n.id}" value="${esc(n.label)}" style="${esc(style)}" vertex="1" parent="${n.parent||1}"><mxGeometry x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" as="geometry"/></mxCell>`;
    }
    const ports={top:[.5,0],bottom:[.5,1],left:[0,.5],right:[1,.5]};
    for(const e of this.spec.edges){const a=ports[e.a],b=ports[e.b];cells+=`<mxCell id="${e.id}" value="${esc(e.label||'')}" edge="1" parent="1" source="${e.source}" target="${e.target}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;endArrow=block;endFill=1;strokeColor=#777268;strokeWidth=1.5;exitX=${a[0]};exitY=${a[1]};entryX=${b[0]};entryY=${b[1]};fontSize=16;"><mxGeometry relative="1" as="geometry">${e.via.length?'<Array as="points">'+e.via.map(p=>`<mxPoint x="${p[0]}" y="${p[1]}"/>`).join('')+'</Array>':''}</mxGeometry></mxCell>`;}
    return `<mxfile host="app.diagrams.net"><diagram id="quarc-model" name="QuARC"><mxGraphModel grid="0" page="0" pageWidth="${this.spec.width}" pageHeight="${this.spec.height}"><root>${cells}</root></mxGraphModel></diagram></mxfile>`;
  }
}

const download=(name,text,type)=>{const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);};
if(document.querySelector('#architecture-canvas')){
const spec=await(await fetch('data/model-current/architecture.json')).json();
const diagram=new ArchitectureDiagram(document.querySelector('#architecture-canvas'),spec);
window.quarcArchitecture=diagram;
document.querySelectorAll('[data-diagram-action]').forEach(button=>button.onclick=async()=>{
  const action=button.dataset.diagramAction;
  if(action==='in')diagram.zoom(1/1.2);if(action==='out')diagram.zoom(1.2);if(action==='fit')diagram.fit();if(action==='reset')diagram.reset();
  if(action==='full')document.querySelector('#architecture-workspace').requestFullscreen?.();
  if(action==='svg')download('quarc-model.svg',await diagram.svgText(),'image/svg+xml');
  if(action==='drawio')download('quarc-model.drawio',await diagram.drawio(),'application/xml');
  if(action==='json')download('quarc-model.json',JSON.stringify(diagram.spec,null,2),'application/json');
});
document.querySelector('#import-layout').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const next=JSON.parse(await f.text());if(next.id!==spec.id||!Array.isArray(next.nodes)||!Array.isArray(next.edges)||next.nodes.some(n=>!Number.isFinite(n.x)||!Number.isFinite(n.y)))throw Error('Invalid diagram file');diagram.spec=next;diagram.render();diagram.save();diagram.fit();}catch(error){document.querySelector('#diagram-error').textContent=error.message;}e.target.value='';};
document.querySelector('#label-dialog form').onsubmit=e=>{e.preventDefault();if(diagram.selected){diagram.selected.label=document.querySelector('#node-label').value;diagram.render();diagram.save();}document.querySelector('#label-dialog').close();};
document.querySelector('#cancel-label').onclick=()=>document.querySelector('#label-dialog').close();
}
