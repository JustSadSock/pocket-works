// Apartment 17 / landing: a small diegetic memory event at the real front door.
// This never changes collision or forces the player to leave the apartment.
export function readLanding(data){
 return {knocked:data?.knocked===true,seen:data?.seen===true,recognized:data?.recognized===true,knockedAt:Number.isFinite(data?.knockedAt)?Math.max(0,data.knockedAt):0}
}
export function knockAtDoor(state,elapsed,collected){
 if(state.knocked||elapsed<39&&(collected<2||elapsed<27)||elapsed<27)return false;
 state.knocked=true;state.knockedAt=Math.max(0,elapsed);return true
}
export function inspectPeephole(state,{hasPhoto=false}={}){
 if(!state.knocked)return {ok:false,reason:'quiet'};
 const first=!state.seen;state.seen=true;
 if(hasPhoto&&!state.recognized){
  state.recognized=true;
  return {ok:true,first,recognized:true,text:'На лестничной площадке — старая авоська. Такую Лена брала за хлебом. Здесь никто не ждёт тебя с оружием.'}
 }
 return {ok:true,first,recognized:false,text:hasPhoto?'В подъезде пусто. На перилах осталась знакомая авоська.':'За дверью никого нет. На перилах висит чья-то выцветшая авоська.'}
}
export function landingHint(state,hasPhoto){
 if(!state.knocked)return '';
 if(!state.seen)return 'Кто-то постучал. Посмотри в дверной глазок.';
 if(hasPhoto&&!state.recognized)return 'Знакомая фотография может объяснить, что оставили в подъезде.';
 return '';
}
