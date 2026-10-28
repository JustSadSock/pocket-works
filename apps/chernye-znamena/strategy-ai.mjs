export function evaluateWarOrder(s,side,api){
 const {neighbors,defensePower,supplyNetwork,isStronghold,warDiplomacy,armiesAt,MAX_STRENGTH}=api;
 const supplied=supplyNetwork(s,side),cash=s.treasury?.[side]??0,orders=[];
 const armies=s.armies.filter(a=>a.side===side&&a.strength>0&&!s.sieges.some(x=>x.armyId===a.id));
 for(const army of armies){
  if(supplied.has(army.province)&&army.strength<=7&&cash>=6)
   orders.push({kind:'recruit',armyId:army.id,score:army.strength<=4?140:100});
  for(const dest of neighbors(army.province)){
   const p=s.provinces[dest],def=defensePower(s,dest),logistic=supplied.has(army.province);
   if(p.owner===side){
    if(armiesAt(s,dest,side).length>=2)continue;
    const front=neighbors(dest).some(n=>s.provinces[n].owner===0);
    orders.push({kind:'move',armyId:army.id,to:dest,score:(!logistic&&supplied.has(dest)?120:front?31:8)});
    continue;
   }
   if(!warDiplomacy(s,p.owner,side)||s.sieges.some(x=>x.to===dest))continue;
   const priority=p.owner===0?90+(dest===0?35:0):p.owner===3?57:25;
   if(isStronghold(s,dest)&&logistic&&army.strength>=4&&army.strength<=def+4)
    orders.push({kind:'siege',armyId:army.id,to:dest,score:priority+12});
   if(army.strength>=def+2)
    orders.push({kind:'attack',armyId:army.id,to:dest,score:priority+Math.min(25,(army.strength-def)*3)+(logistic?10:-40)});
   else if(p.owner===0&&!isStronghold(s,dest)&&logistic&&army.strength>=4&&p.garrison>=2&&!armiesAt(s,dest).length&&(p.raidedUntil||0)<=s.season)
    orders.push({kind:'raid',armyId:army.id,to:dest,score:priority-27});
  }
 }
 const own=s.provinces.filter(p=>p.owner===side);
 const strength=s.armies.filter(a=>a.side===side).length;
 if(cash>=9&&strength<3)for(const p of own){
  if(supplied.has(p.id)&&armiesAt(s,p.id,side).length<2)
   orders.push({kind:'raise',province:p.id,score:strength===0?180:strength===1?77:14});
 }
 if(cash>=5)for(const p of own){
  if(p.garrison>=9||!supplied.has(p.id))continue;
  if(neighbors(p.id).some(n=>armiesAt(s,n).some(a=>a.side!==side)))
   orders.push({kind:'garrison',province:p.id,score:58+(p.garrison<=3?12:0)});
 }
 if(cash>=9)for(const p of own){
  if(p.development||!supplied.has(p.id))continue;
  orders.push({kind:'develop',province:p.id,type:neighbors(p.id).some(n=>s.provinces[n].owner===0)?'watchtower':'market',score:14});
 }
 const rank={attack:0,siege:1,raid:2,recruit:3,raise:4,garrison:5,move:6,develop:7};
 orders.sort((a,b)=>b.score-a.score||rank[a.kind]-rank[b.kind]||(a.to??a.province??0)-(b.to??b.province??0)||(a.armyId||'').localeCompare(b.armyId||''));
 return orders.find(a=>a.score>0)||null;
}
