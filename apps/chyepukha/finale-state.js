// Editorial state is derived from authoritative PocketNet player flags.
// This module does not change any room messages or reveal hidden story content.
export function readiness(players=[]){
 const total=players.length;
 const ready=players.filter(p=>p?.submitted===true).length;
 return {ready,total,remaining:Math.max(0,total-ready),allReady:total>0&&ready===total};
}
export function waitingHeading(players=[]){
 const {ready,total,remaining}=readiness(players);
 if(total===0)return 'Очікуємо авторів';
 if(remaining===0)return 'Усі аркуші здано';
 if(remaining===1)return 'Залишився один автор';
 return 'Чекаємо ще '+remaining+' авторів';
}
export function justSubmitted(before=[],after=[]){
 const prev=new Map(before.map(p=>[p.id,p.submitted===true]));
 return after.filter(p=>p.submitted===true&&prev.get(p.id)===false).map(p=>p.id);
}
export function mayShowFinaleIntro(previousPhase,nextPhase,hasStories=true){
 return previousPhase==='writing'&&nextPhase==='finished'&&hasStories;
}
