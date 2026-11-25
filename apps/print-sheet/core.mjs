export function layout(items,landscape=false,margin=5,gap=2){
  const W=landscape?297:210,H=landscape?210:297,pages=[],invalid=[];
  let page=null,x=margin,y=margin,row=0;
  function next(){page=[];pages.push(page);x=margin;y=margin;row=0}
  for(const item of items){
    const w=Math.round(Number(item.w)*10*100)/100,h=Math.round(Number(item.h)*10*100)/100;
    if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0||w>W-2*margin+1e-6||h>H-2*margin+1e-6){invalid.push(item.id);continue}
    for(let c=0;c<Math.min(100,Math.max(1,Math.floor(Number(item.copies)||1)));c++){
      if(!page)next();
      if(x+w>W-margin+1e-6){x=margin;y+=row+gap;row=0}
      if(y+h>H-margin+1e-6)next();
      page.push({id:item.id,x,y,w,h});x+=w+gap;row=Math.max(row,h);
    }
  }
  return {W,H,pages,invalid};
}
export function pdfFromJpegs(pages,W,H){
  const enc=new TextEncoder(),parts=[],offsets=[0];let length=0;
  function put(v){const b=typeof v==='string'?enc.encode(v):v;parts.push(b);length+=b.length}
  function obj(n,body){offsets[n]=length;put(n+' 0 obj\n');put(body);put('\nendobj\n')}
  function stream(n,header,bytes){offsets[n]=length;put(n+' 0 obj\n<< '+header+' /Length '+bytes.length+' >>\nstream\n');put(bytes);put('\nendstream\nendobj\n')}
  const pw=(W*72/25.4).toFixed(6),ph=(H*72/25.4).toFixed(6);
  put('%PDF-1.4\n');put(new Uint8Array([37,226,227,207,211,10]));
  obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
  obj(2,'<< /Type /Pages /Count '+pages.length+' /Kids ['+pages.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>');
  pages.forEach((p,i)=>{const n=3+i*3;
    obj(n,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+pw+' '+ph+'] /Resources << /XObject << /Im '+(n+1)+' 0 R >> >> /Contents '+(n+2)+' 0 R >>');
    stream(n+1,'/Type /XObject /Subtype /Image /Width '+p.width+' /Height '+p.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode',p.bytes);
    stream(n+2,'',enc.encode('q '+pw+' 0 0 '+ph+' 0 0 cm /Im Do Q\n'));
  });
  const start=length;put('xref\n0 '+offsets.length+'\n0000000000 65535 f \n');for(let n=1;n<offsets.length;n++)put(String(offsets[n]).padStart(10,'0')+' 00000 n \n');
  put('trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF\n');
  return new Blob(parts,{type:'application/pdf'});
}
