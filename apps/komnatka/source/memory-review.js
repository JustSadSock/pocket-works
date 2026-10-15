// Comparison is explanatory only: server score remains authoritative.
export function compareMemory(reference=[],placed=[]){
 const used=new Set(),rows=[];
 for(const expected of reference){
  let best=-1,bestPoints=-1;
  placed.forEach((candidate,index)=>{
   if(used.has(index)||candidate.type!==expected.type)return;
   const distance=Math.hypot(expected.x-candidate.x,expected.z-candidate.z);
   const points=Math.max(0,1-distance/2.3)*.7+
    (expected.rot===candidate.rot?1:.35)*.2+
    (expected.color===candidate.color?1:.6)*.1;
   if(points>bestPoints){best=index;bestPoints=points;}
  });
  if(best===-1){rows.push({type:expected.type,status:'missing',detail:'Не найден'});continue;}
  used.add(best);
  const found=placed[best],distance=Math.hypot(expected.x-found.x,expected.z-found.z);
  const issues=[];
  if(distance>.38)issues.push('положение');
  if((expected.rot||0)!==(found.rot||0))issues.push('поворот');
  if(expected.color!==found.color)issues.push('цвет');
  if(expected.support && !found.support)issues.push('опора');
  rows.push({type:expected.type,status:issues.length?'partial':'exact',
   detail:issues.length?'Не совпали: '+issues.join(', '):'Совпадение'});
 }
 const extra=placed.filter((_,i)=>!used.has(i)).map(item=>({type:item.type,status:'extra',detail:'Лишний предмет'}));
 return {rows:[...rows,...extra],exact:rows.filter(row=>row.status==='exact').length,
  partial:rows.filter(row=>row.status==='partial').length,missing:rows.filter(row=>row.status==='missing').length,
  extra:extra.length,total:reference.length};
}
