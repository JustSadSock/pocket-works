// Deliberate, state-based editorial transitions. No timers, protocol changes or
// decorative animation loops. Room updates may re-render without replaying motion.
export function screenSignature({view,archiveOpen=false,connecting=false,room='',writerStep='draft'}={}){
 if(connecting&&!view)return 'connecting';
 if(!view)return archiveOpen?'archive':'home';
 const prefix=room?room+':':'';
 if(view.phase==='writing'){
  const page=prefix+'writing:'+String(view.round)+':'+String(view.sheet?.id||'');
  return page+':'+(view.waiting?'waiting':writerStep==='select'?'select':'draft');
 }
 if(view.phase==='finished')return prefix+'finished';
 return prefix+String(view.phase||'unknown');
}
export function transitionFor(from,to){
 if(!from||from===to)return '';
 const a=String(from).split(':'),b=String(to).split(':');
 const endA=a.at(-1),endB=b.at(-1);
 const wasWriting=a.includes('writing'),isWriting=b.includes('writing');
 if(wasWriting&&isWriting){
  if(endA==='draft'&&endB==='select')return 'proof';
  if(endA==='select'&&endB==='draft')return 'rewrite';
  if(endA!=='waiting'&&endB==='waiting')return 'seal';
  if(endA==='waiting'&&(endB==='draft'||endB==='select'))return 'receive';
  if(a.at(-2)!==b.at(-2))return 'receive';
 }
 if(endB==='finished'&&endA!=='finished')return 'reveal';
 if(endA==='lobby'&&isWriting)return 'open';
 return '';
}
