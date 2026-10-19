// Living History v1.1 — transformation of *owned* timber and wool.
// These are not off-screen manufactured goods. Craftspeople are actual workers,
// finished goods occupy real households or real shipments, and wear is audited.
import {walkPath,pathEffort} from './navigation.js';
import {scheduleWork,commitWork} from './work-time.js';

const round=n=>Math.round((n+Number.EPSILON)*100)/100;
const living=(s,h)=>h.members.map(id=>s.people.find(p=>p.id===id)).filter(p=>p?.alive);
const requiredForCourt=(s,p)=>{
 const registry=s.institutions;
 if(!registry||!p)return false;
 return registry.cases.some(c=>['filed','owed'].includes(c.stage)&&(
  c.claimantId===p.houseId||c.ownerId===p.houseId||
  registry.officers?.[c.communityId]?.personId===p.id));
};
const workReady=(s,p)=>p?.alive&&p.age>=15&&p.health>28&&
 (!p.travel||p.travel.end<=s.day)&&p.hiredDay!==s.day&&
 p.combatDutyDay!==s.day&&p.dailyShift?.day!==s.day;
const aliveHome=(s,h)=>living(s,h).length>0;
export const CRAFT_GOODS=Object.freeze({
 boards:{label:'тёсаных досок',price:3.2,material:'wood'},
 chests:{label:'деревянных ларей',price:7.5,material:'wood'},
 cloth:{label:'домотканого сукна',price:14,material:'wool'},
 wool:{label:'сырой шерсти',price:6,material:'wool'}
});
export const craftLabel=good=>CRAFT_GOODS[good]?.label||good;
const residentCount=(s,h)=>living(s,h).length;
export function craftDemand(s,h,good){
 if(!aliveHome(s,h))return 0;
 const inbound=s.shipments.filter(t=>t.buyer===h.id&&t.good===good).reduce((n,t)=>n+t.amount,0);
 const stock=(h[good]||0)+inbound;
 if(good==='chests')return Math.max(0,round((h.grain>210?7:0)-stock));
 if(good==='boards')return Math.max(0,round((h.grain>210&&h.chests<7?8:0)-stock));
 if(good==='cloth')return Math.max(0,round(residentCount(s,h)*.85-stock));
 if(good==='wool')return h.fields.length<=55&&craftDemand(s,h,'cloth')>0?
  Math.max(0,round(3.5-stock)):0;
 return 0;
}
function reserve(s,h,good){
 if(good==='boards')return Math.min(h.boards||0,craftDemand(s,h,'boards')*.55);
 if(good==='cloth')return Math.min(h.cloth||0,residentCount(s,h)*.35);
 if(good==='chests')return Math.min(h.chests||0,h.grain>210?7:0);
 if(good==='wool')return Math.min(h.wool||0,h.fields.length<=55?1.5:0);
 return 0;
}
function localDemand(s,home,good){
 return s.households.filter(h=>h.communityId===home.communityId&&h.id!==home.id)
   .reduce((n,h)=>n+craftDemand(s,h,good),0);
}
function canProduce(s,h,good){
 if(good==='boards'){
  if(h.fields.length>50&&h.focus!=='wood')return false;
  // Three months of household firewood must be guarded before log cutting.
  return h.wood>=95&&(h.boards||0)<22 &&
   (craftDemand(s,h,'boards')>0||localDemand(s,h,'boards')>0);
 }
 if(good==='chests')return (h.boards||0)>=8&&(h.chests||0)<21 &&
  (craftDemand(s,h,'chests')>0||localDemand(s,h,'chests')>0);
 if(good==='cloth')return (h.fields.length<=55||h.focus==='trade'||h.tenure==='demesne'&&localDemand(s,h,'wool')<.5)&&(h.wool||0)>=3&&(h.cloth||0)<12 &&
  (craftDemand(s,h,'cloth')>0||localDemand(s,h,'cloth')>0);
 return false;
}
export function craftOpportunities(s,h){
 if(!aliveHome(s,h))return [];
 const options=[];
 for(const good of ['chests','cloth','boards']){
  if(!canProduce(s,h,good))continue;
  const other=localDemand(s,h,good),mine=craftDemand(s,h,good);
  const material=good==='boards'?'wood':good==='chests'?'boards':'wool';
  const cost=good==='boards'?9:good==='chests'?8:3;
  const output=good==='boards'?8:good==='chests'?7:2.7;
  const gross=output*CRAFT_GOODS[good].price, materialCost=
   material==='wood'?cost*1.4:material==='boards'?cost*CRAFT_GOODS.boards.price:cost*8;
  // Revenue is only a *prospective* sale. A true need plus accessible buyers
  // and observed material opportunity cost determines whether a workshop runs.
  const demand=Math.min(output,other+mine);
  const score=(gross-materialCost)*Math.min(1,demand/output)+
   (mine>0?Math.min(mine,output)*CRAFT_GOODS[good].price*.35:0);
  if(score>1)options.push({good,score:round(score),other:round(other),mine:round(mine)});
 }
 return options.sort((a,b)=>b.score-a.score||a.good.localeCompare(b.good));
}
function productiveShift(s,h){
 const p=living(s,h).filter(p=>workReady(s,p)).sort((a,b)=>{
  const as=a.skill?.craft||0,bs=b.skill?.craft||0;
  return bs-as||a.id-b.id;
 })[0];
 if(!p)return null;
 const shift=scheduleWork(s,p,'craft',h,h);
 return shift.workHours>=3&&Number.isFinite(shift.workHours)?{p,shift}:null;
}
function spend(s,h,input,inKg,output,outKg,type){
 if((h[input]||0)<inKg)return false;
 h[input]=round(h[input]-inKg);
 h[output]=round((h[output]||0)+outKg);
 const waste=round(inKg-outKg);
 if(type==='wood')s.stats.craftWoodWaste=round((s.stats.craftWoodWaste||0)+waste);
 else s.stats.craftWoolWaste=round((s.stats.craftWoolWaste||0)+waste);
 s.stats.craftItems=(s.stats.craftItems||0)+1;
 return true;
}
function make(s,h,good){
 if(good==='boards')return spend(s,h,'wood',9,'boards',8,'wood');
 if(good==='chests')return spend(s,h,'boards',8,'chests',7,'wood');
 if(good==='cloth')return spend(s,h,'wool',3,'cloth',2.7,'wool');
 return false;
}
export function advanceCrafts(s,notify){
 // Inert worlds and old saves initialize at zero, never backfill resources.
 for(const h of s.households){
  h.boards??=0;h.chests??=0;h.cloth??=0;
  if(!aliveHome(s,h))continue;
  // Worn goods lose actual mass, never vanish without material accounting.
  if(s.day%30===0&&h.chests>0){
   const wear=round(Math.min(h.chests,Math.max(.01,h.chests*.009)));
   h.chests=round(h.chests-wear);
   s.stats.craftWoodWear=round((s.stats.craftWoodWear||0)+wear);
  }
  const doy=s.day%365;
  if((doy<=86||doy>=305)&&h.cloth>0){
   const people=living(s,h);
   const wear=round(Math.min(h.cloth,people.length*.006));
   if(wear>0){
    h.cloth=round(h.cloth-wear);
    s.stats.craftWoolWear=round((s.stats.craftWoolWear||0)+wear);
    // Insulation can only help living wearers while actual cloth is worn down.
    for(const p of people)p.health=Math.min(100,Math.round((p.health+.012)*10000)/10000);
    s.stats.clothedPersonDays=(s.stats.clothedPersonDays||0)+people.length;
   }
  }
  if(s.day%7!==h.id%7)continue;
  const offers=craftOpportunities(s,h);
  if(!offers.length){
   if(h.craftSpecialty&&s.day-(h.lastCommercialSaleDay||0)>280){
    notify?.('craft-close',`Мастерская семьи #${h.id} перестала работать`,
     'Не осталось прибыльного спроса или физического сырья',[h.id],{good:h.craftSpecialty});
    h.craftSpecialty=null;
   }
   continue;
  }
  const worker=productiveShift(s,h);
  if(!worker)continue;
  const offer=offers[0];
  if(!make(s,h,offer.good))continue;
  const {p,shift}=worker;
  commitWork(s,p,shift);
  p.workDays??={};p.workDays.craft=round((p.workDays.craft||0)+shift.fraction);
  p.skill??={};p.skill.craft=Math.round(((p.skill.craft||0)+.006*shift.fraction)*10000)/10000;
  s.stats.laborHours=round((s.stats.laborHours||0)+shift.workHours);
  s.stats.craftHours=round((s.stats.craftHours||0)+shift.workHours);
  // A workshop is only publicly recognized on its first real paid sale.
  // Domestic household work is physical production but not automatic specialist status.
  h.lastCraftDay=s.day;
  h.craftHistory??=[];h.craftHistory.push({day:s.day,good:offer.good,workerId:p.id,material:offer.good==='cloth'?'шерсть':offer.good==='chests'?'доски':'древесина'});
  if(h.craftHistory.length>12)h.craftHistory.shift();
 }
}
export function tradeCrafts(s,notify){
 if(s.day%7!==0)return;
 for(const c of s.communities){
  const homes=s.households.filter(h=>h.communityId===c.id&&aliveHome(s,h));
  let trades=0;
  for(const good of ['wool','cloth','chests','boards']){
   const buyers=homes.filter(h=>craftDemand(s,h,good)>=.5&&h.coin>=10)
     .sort((a,b)=>craftDemand(s,b,good)-craftDemand(s,a,good)||a.id-b.id);
   const sellers=homes.filter(h=>(h[good]||0)-reserve(s,h,good)>=.5)
     .sort((a,b)=>(b[good]||0)-(a[good]||0)||a.id-b.id);
   for(const b of buyers){
    if(trades>=4)break;
    const offered=sellers.filter(h=>h.id!==b.id&&
     (h[good]||0)-reserve(s,h,good)>=.5&&
     !s.shipments.some(t=>t.good===good&&t.seller===h.id&&t.buyer===b.id));
    let done=false;
    for(const a of offered){
     const carrier=living(s,a).find(p=>workReady(s,p)&&!requiredForCourt(s,p));
     if(!carrier)continue;
     const path=walkPath(s,a,b);
     if(path.length<2||path.length>85)continue;
     const effort=pathEffort(s,path);
     if(!Number.isFinite(effort))continue;
     // The first day is physical packing at the seller; the cart travels from
     // seller to buyer only on the next days, without duplicating the route.
     const shift=scheduleWork(s,carrier,'haul',a,a);
     if(shift.workHours<=0||!Number.isFinite(shift.workHours))continue;
     const price=CRAFT_GOODS[good].price;
     const amount=round(Math.min(8,(a[good]||0)-reserve(s,a,good),
      craftDemand(s,b,good),Math.floor(b.coin/price*100)/100));
     if(amount<.5)continue;
     const cost=Math.ceil(amount*price);
     if(cost>b.coin)continue;
     const days=Math.max(1,Math.ceil(effort/10));
     // Money is escrowed in shipment.cost, material likewise in shipment.amount.
     // The existing deliver() settles on arrival; no instant remote purchase.
     a[good]=round(a[good]-amount);b.coin-=cost;
     const t={id:s.nextId++,kind:'craft',good,amount,seller:a.id,buyer:b.id,cost,
      haulFee:0,carrierId:carrier.id,carrierHouseId:a.id,route:path,
      departure:s.day+1,day:s.day+days+1,origin:{x:a.x,y:a.y},destination:{x:b.x,y:b.y}};
     s.shipments.push(t);
     commitWork(s,carrier,shift);
     carrier.workDays??={};carrier.workDays.haul=round((carrier.workDays.haul||0)+shift.fraction);
     carrier.travel={from:{x:a.x,y:a.y},to:{x:b.x,y:b.y},points:path,
      start:s.day+1,arrival:t.day,end:s.day+days*2+1};
     s.stats.laborHours=round((s.stats.laborHours||0)+shift.workHours);
     s.stats.craftSales=(s.stats.craftSales||0)+1;
     s.stats.trades++;
     if(good!=='wool'&&a.craftSpecialty!==good){
      a.craftSpecialty=good;
      notify?.('craft-open',`В семье #${a.id} появилось ремесленное дело: ${craftLabel(good)}`,
       'Ремесленником считается производитель, действительно продавший обработанное сырьё',
       [a.id,carrier.id],{good,workerId:a.craftHistory?.at(-1)?.workerId||carrier.id});
     }
     if(good!=='wool')a.lastCommercialSaleDay=s.day;
     c.volume=(c.volume||0)+amount;
     notify?.('craft-trade',`Дом #${a.id} отправил ${amount} кг ${craftLabel(good)} в дом #${b.id}`,
      'Заказ оплачен настоящими монетами и пойдёт по пешеходной дороге в течение нескольких дней',
      [a.id,b.id,carrier.id],{good,amount,cost,arrival:t.day,shipmentId:t.id});
     trades++;done=true;break;
    }
    if(done)continue;
   }
  }
 }
}
export function craftMaterialStocks(s){
 const goods=(name)=>s.households.reduce((n,h)=>n+(h[name]||0),0)+
  s.shipments.filter(t=>t.good===name).reduce((n,t)=>n+t.amount,0);
 return {wood:round(goods('boards')+goods('chests')),
  wool:round(goods('cloth')),boards:round(goods('boards')),
  chests:round(goods('chests')),cloth:round(goods('cloth'))};
}
export function craftAudit(s){
 const errors=[],goods=['boards','chests','cloth'];
 const cargoGoods=[...goods,'wool'];
 for(const h of s.households){
  for(const good of goods)if(!Number.isFinite(h[good]||0)||(h[good]||0)<-.001)errors.push('Некорректные ремесленные товары дома '+h.id+': '+good);
  if(h.craftSpecialty&&!goods.includes(h.craftSpecialty))errors.push('Неверная специализация семьи '+h.id);
 }
 for(const t of s.shipments)if(cargoGoods.includes(t.good)&&
  !(t.good==='wool'&&t.kind==='outside-export')&&
  (t.kind!=='craft'||!Number.isFinite(t.cost)||t.cost<=0||!t.carrierId))
  errors.push('Недействительный ремесленный груз '+t.id);
 for(const name of ['craftWoodWaste','craftWoolWaste','craftWoodWear','craftWoolWear'])
  if(!Number.isFinite(s.stats[name]||0)||(s.stats[name]||0)<0)errors.push('Неверный ремесленный баланс '+name);
 return errors;
}
