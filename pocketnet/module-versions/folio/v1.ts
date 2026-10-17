// FOLIO shared drawing protocol v1. Immutable PocketNet snapshot once released.
// Only small vector operations traverse PocketNet; private Pocket Cloud persists finished documents.
export const MIN_PLAYERS=1,MAX_PLAYERS=6,RULESET_VERSION=1;
const MAX_STROKE_BYTES=7500,MAX_DOC_BYTES=175000,MAX_POINTS=360,MAX_RUNS=650;
const colors=/^#[0-9a-f]{6}$/i, brushes=new Set(['ink','pencil','gouache','marker','wash']);
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
const notice=(to,text)=>[{type:'notice',to,payload:text}];
const stateEvent=(s,to)=>[{type:'state',to,payload:s}];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function clean(raw,doc){
 if(!raw||typeof raw!=='object'||!/^[-\w]{8,90}$/.test(raw.id||'')||
    raw.layer!=='shared'||!['brush','eraser','fill'].includes(raw.tool)||
    !colors.test(raw.color||'')||!Number.isFinite(raw.opacity)||raw.opacity<0||raw.opacity>1)return null;
 const stroke={id:raw.id,layer:'shared',tool:raw.tool,color:raw.color.toLowerCase(),opacity:raw.opacity};
 if(raw.tool==='fill'){
  if(Array.isArray(raw.bands)&&raw.bands.length&&raw.bands.length<=MAX_RUNS){
   if(!raw.bands.every(b=>Array.isArray(b)&&b.length===4&&b.every(Number.isInteger)&&
    b[0]>=0&&b[0]<=b[1]&&b[1]<doc.height&&b[2]>=0&&b[2]<=b[3]&&b[3]<doc.width))return null;
   stroke.bands=raw.bands;
  }else{
   if(!Array.isArray(raw.runs)||!raw.runs.length||raw.runs.length>MAX_RUNS)return null;
   if(!raw.runs.every(r=>Array.isArray(r)&&r.length===3&&r.every(Number.isInteger)&&
    r[0]>=0&&r[0]<doc.height&&r[1]>=0&&r[1]<=r[2]&&r[2]<doc.width))return null;
   stroke.runs=raw.runs;
  }
 }else{
  if(!Number.isFinite(raw.size)||raw.size<1||raw.size>144||!brushes.has(raw.brush)||!Array.isArray(raw.points)||
     !raw.points.length||raw.points.length>MAX_POINTS)return null;
  if(!raw.points.every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)&&
     p[0]>=0&&p[0]<=doc.width&&p[1]>=0&&p[1]<=doc.height&&p[2]>=.2&&p[2]<=1.5))return null;
  stroke.brush=raw.brush;stroke.size=raw.size;stroke.points=raw.points;
 }
 return bytes(stroke)<MAX_STROKE_BYTES?stroke:null;
}
const module={
 protocolVersion:1,
 createRoom({player,payload}){
  const type=['portrait','square','landscape'].includes(payload?.format)?payload.format:'square';
  const dimensions={portrait:[960,1280],square:[1024,1024],landscape:[1280,960]}[type];
  const title=typeof payload?.title==='string'?payload.title.trim().slice(0,70):'';
  const doc={id:'shared-'+crypto.randomUUID(),title:title||'Общий холст',
    width:dimensions[0],height:dimensions[1],paper:'#fbf5e8',
    palette:['#24465c','#c54a35','#efbd59','#3d9a89','#5877b3','#ffedd2'],
    layers:[{id:'shared',name:'Общий слой',visible:true,opacity:1,strokes:[]}],
    activeLayer:'shared',updatedAt:Date.now(),thumb:''};
  return {state:{phase:'drawing',host:player.id,players:[player],revision:0,protocol:1,
   doc,redoBy:{},lastMutation:Date.now()}};
 },
 onJoin({state,players}){if(players.length>MAX_PLAYERS)throw Error('room_full');
  state.players=players;return{state,events:[{type:'roster',payload:players}]};},
 onLeave({state,players}){state.players=players;
  if(state.host&&!players.some(p=>p.id===state.host))state.host=players[0]?.id||'';
  return {state,events:[{type:'roster',payload:players}]};},
 onMessage({state,player,payload}){
  const input=payload&&typeof payload==='object'?payload:{};
  const doc=state.doc,strokes=doc.layers[0].strokes;
  if(input.type==='sync')return{state,events:stateEvent(state,player.id)};
  if(input.type==='preview'){
   const partial=input.stroke;
   if(partial===null)return{state,events:[{type:'preview',payload:{author:player.id,stroke:null}}]};
   if(!partial||!Array.isArray(partial.points)||partial.points.length>75||
      bytes(partial)>3600)return {state,events:[]};
   const s=clean({...partial,id:partial.id,layer:'shared'},doc);
   if(!s||s.tool==='fill')return{state,events:[]};
   return{state,events:[{type:'preview',payload:{author:player.id,stroke:s}}]};
  }
  if(input.type==='commit'){
   const stroke=clean(input.stroke,doc);
   if(!stroke)return{state,events:[{type:'reject',to:player.id,payload:{id:String(input.stroke?.id||''),message:'Слишком большой или повреждённый мазок. Попробуй короче.'}}]};
   if(strokes.some(s=>s.id===stroke.id))return{state,events:stateEvent(state,player.id)};
   stroke.author=player.id;
   stroke.seq=state.revision+1;
   if(bytes(doc)+bytes(stroke)>MAX_DOC_BYTES)return{state,events:[{type:'reject',to:player.id,payload:{id:stroke.id,message:'Холст почти заполнен. Сохрани работу и начни новую комнату.'}}]};
   const i=stroke.tool==='fill'?Math.max(0,strokes.findIndex(s=>s.tool!=='fill')):strokes.length;
   strokes.splice(stroke.tool==='fill'&&i===0&&strokes.every(s=>s.tool==='fill')?strokes.length:i,0,stroke);
   delete state.redoBy[player.id];state.revision++;doc.updatedAt=Date.now();state.lastMutation=doc.updatedAt;
   return{state,events:[{type:'op',payload:{revision:state.revision,stroke}}]};
  }
  if(input.type==='undo'){
   const last=strokes.filter(s=>s.author===player.id).sort((a,b)=>(b.seq||0)-(a.seq||0))[0];
   if(last){
    const index=strokes.findIndex(s=>s.id===last.id);
    const [stroke]=strokes.splice(index,1);state.redoBy[player.id]={stroke,index};
    state.revision++;doc.updatedAt=Date.now();state.lastMutation=doc.updatedAt;
    return{state,events:[{type:'remove',payload:{revision:state.revision,id:stroke.id,author:player.id,canRedo:true}}]};
   }
   return{state,events:notice(player.id,'Нет своих мазков для отмены.')};
  }
  if(input.type==='redo'){
   const entry=state.redoBy[player.id];
   if(!entry)return{state,events:notice(player.id,'Нечего повторять.')};
   entry.stroke.seq=state.revision+1;
   strokes.splice(clamp(entry.index,0,strokes.length),0,entry.stroke);delete state.redoBy[player.id];
   state.revision++;doc.updatedAt=Date.now();state.lastMutation=doc.updatedAt;
   return{state,events:[{type:'op',payload:{revision:state.revision,stroke:entry.stroke}}]};
  }
  return{state,events:[]};
 }
};
export default module;
