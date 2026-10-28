class CloudRenderer {
  constructor(canvas) {
    this.canvas=canvas;this.gl=canvas.getContext('webgl',{preserveDrawingBuffer:true,antialias:false});this.count=0;
    if(!this.gl){this.ctx=canvas.getContext('2d');this.backend='CPU 全点透视 + Z-buffer';return}
    this.backend='WebGL';const gl=this.gl;
    const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s};
    const p=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,'attribute vec3 p;attribute vec4 color;uniform vec3 center,right,up,forward;uniform float distance,aspect;varying vec4 c;void main(){vec3 q=p-center;float z=distance-dot(q,forward);gl_Position=vec4(dot(q,right)*1.7/aspect,dot(q,up)*1.7,z*1.00002-.0200002,z);gl_PointSize=1.4;c=color;}'));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,'precision mediump float;varying vec4 c;void main(){gl_FragColor=c;}'));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));gl.useProgram(p);
    this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);for(const [name,size,type,off,norm]of [['p',3,gl.FLOAT,0,false],['color',4,gl.UNSIGNED_BYTE,12,true]]){const loc=gl.getAttribLocation(p,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,type,norm,16,off)}
    this.loc={};for(const n of ['center','right','up','forward','distance','aspect'])this.loc[n]=gl.getUniformLocation(p,n);
  }
  upload(buffer){this.count=buffer.byteLength/16;if(this.gl)this.gl.bufferData(this.gl.ARRAY_BUFFER,buffer,this.gl.STATIC_DRAW);else{this.xyz=new Float32Array(buffer);this.rgba=new Uint8Array(buffer)}}
  render(center,yaw,pitch,distance){
    const canvas=this.canvas,w=Math.round(canvas.clientWidth),h=Math.round(canvas.clientHeight);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
    const f=[Math.cos(pitch)*Math.cos(yaw),Math.sin(pitch),Math.cos(pitch)*Math.sin(yaw)],r=[Math.sin(yaw),0,-Math.cos(yaw)],u=[-Math.sin(pitch)*Math.cos(yaw),Math.cos(pitch),-Math.sin(pitch)*Math.sin(yaw)];
    if(this.gl){const gl=this.gl;gl.viewport(0,0,w,h);gl.clearColor(.035,.055,.085,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);for(const [n,v]of [['center',center],['right',r],['up',u],['forward',f]])gl.uniform3fv(this.loc[n],v);gl.uniform1f(this.loc.distance,distance);gl.uniform1f(this.loc.aspect,w/h);gl.drawArrays(gl.POINTS,0,this.count);return}
    const image=this.ctx.createImageData(w,h),pix=new Uint32Array(image.data.buffer),zbuf=new Float32Array(w*h);pix.fill(0xff160e09);zbuf.fill(Infinity);
    const a=this.xyz,c=this.rgba,k=h*.85;
    for(let i=0;i<this.count;i++){
      const j=i*4,x=a[j]-center[0],y=a[j+1]-center[1],z=a[j+2]-center[2],depth=distance-x*f[0]-y*f[1]-z*f[2];if(depth<.01)continue;
      const sx=Math.floor(w*.5+(x*r[0]+y*r[1]+z*r[2])*k/depth),sy=Math.floor(h*.5-(x*u[0]+y*u[1]+z*u[2])*k/depth);if(sx<0||sx>=w||sy<0||sy>=h)continue;
      const index=sy*w+sx;if(depth>=zbuf[index])continue;zbuf[index]=depth;const b=i*16+12;pix[index]=(255<<24)|(c[b+2]<<16)|(c[b+1]<<8)|c[b];
    }
    this.ctx.putImageData(image,0,0);
  }
}
