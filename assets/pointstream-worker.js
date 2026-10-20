/* Decode exact int16 temporal deltas away from the UI thread. */
self.onmessage = async ({data:{url}}) => {
  try {
    const response=await fetch(url);
    if(!response.ok)throw new Error(`Point metadata: HTTP ${response.status}`);
    const meta=await response.json();
    const resource=await fetch(new URL(meta.data_file,url));
    if(!resource.ok)throw new Error(`Point stream: HTTP ${resource.status}`);
    const compressed=await resource.arrayBuffer();
    const sum=await crypto.subtle.digest('SHA-256',compressed);
    const hex=[...new Uint8Array(sum)].map(x=>x.toString(16).padStart(2,'0')).join('');
    if(hex!==meta.data_sha256)throw new Error('Point stream checksum mismatch');
    const bytes=new Uint8Array(compressed);
    const buffer=bytes[0]===31&&bytes[1]===139
      ?await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():compressed;
    const view=new DataView(buffer);
    if(new TextDecoder().decode(new Uint8Array(buffer,0,8))!=='QARC3D01')throw new Error('Unknown point format');
    const length=view.getUint32(8,true);
    const header=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,12,length)));
    if(header.frames!==meta.frames||header.points!==meta.points)throw new Error('Point dimensions mismatch');
    let offset=12+length;const arrays={};
    for(const item of header.layout){
      const Type=item.name==='xyz'?Int16Array:item.name==='timestamps'?Float64Array:Uint8Array;
      const count=item.bytes/Type.BYTES_PER_ELEMENT;
      arrays[item.name]=offset%Type.BYTES_PER_ELEMENT===0?new Type(buffer,offset,count):new Type(buffer.slice(offset,offset+item.bytes));
      offset+=item.bytes;
    }
    if(offset!==buffer.byteLength)throw new Error('Point stream length mismatch');
    const stride=header.points*3,xyz=arrays.xyz;
    for(let i=stride;i<xyz.length;i++)xyz[i]=xyz[i]+xyz[i-stride];
    const transfer=[...new Set(Object.values(arrays).map(a=>a.buffer))];
    self.postMessage({header,arrays,sha256:hex},transfer);
  }catch(error){self.postMessage({error:error.message});}
};
