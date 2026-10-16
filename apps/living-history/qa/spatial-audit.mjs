#!/usr/bin/env node
// Read-only cartographic observation. No population floor or settlement shape
// target: statistical diagnosis is not an optimization criterion.
import fs from 'node:fs';
import path from 'node:path';
import {createWorld,advanceDays,audit,SIZE,overview} from '../model.js';
import {walkingSteps,walkPath,pathEffort} from '../navigation.js';

const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith('--')).map(x=>{const i=x.indexOf('=');return [x.slice(2,i),x.slice(i+1)];}));
const seed=Number(args.seed??413),years=Number(args.years??50),out=path.resolve(args.output||'spatial-audit');
if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff||![1,5,20,50].includes(years))throw Error('Invalid seed or years');
const checkpoints=[1,5,20,50].filter(y=>y<=years),result={schema:1,seed,years,units:{tileMeters:25,fieldHa:.0625},snapshots:[],auditPassedYears:[],warnings:[]};
const median=a=>{if(!a.length)return null;const v=[...a].sort((a,b)=>a-b),n=v.length;return n%2?v[(n-1)/2]:(v[n/2-1]+v[n/2])/2;};
const round=x=>Math.round(x*100)/100;
const pos=i=>({x:i%SIZE,y:Math.floor(i/SIZE)});
const xy=(x,y)=>y*SIZE+x;
function inspection(s,year){
 const byId=new Map(s.people.filter(p=>p.alive).map(p=>[p.id,p]));
 const homes=s.households.filter(h=>h.members.some(id=>byId.has(id)));
 const communities=s.communities.map(c=>{
  const hh=homes.filter(h=>h.communityId===c.id);
  const nearest=hh.map(h=>Math.min(Infinity,...hh.filter(k=>k.id!==h.id).map(k=>Math.hypot(h.x-k.x,h.y-k.y)))).filter(Number.isFinite);
  const houseToCenter=hh.map(h=>walkingSteps(s,h,c)).filter(n=>n>=0);
  const fieldWalk=[],roadFrontage=[],actualCommute=[];
  for(const h of hh){
   const near=Array.from({length:5},(_,q)=>Array.from({length:5},(_,p)=>({x:h.x+p-2,y:h.y+q-2}))).flat().some(({x,y})=>x>=0&&y>=0&&x<SIZE&&y<SIZE&&(s.traffic[xy(x,y)]||0)>=12);
   roadFrontage.push(near?1:0);
   const cells=h.fields||[];
   if(cells.length){
    for(const i of [cells[0],cells[Math.floor(cells.length/2)],cells.at(-1)]){
     const dest=pos(i),steps=walkingSteps(s,h,dest);if(steps>=0)fieldWalk.push(steps);
    }
    const plot=pos(cells[Math.floor(cells.length/2)]),route=walkPath(s,h,plot),cost=pathEffort(s,route);
    if(Number.isFinite(cost))actualCommute.push(cost);
   }
  }
  const x=hh.reduce((a,h)=>a+h.x,0)/Math.max(1,hh.length),y=hh.reduce((a,h)=>a+h.y,0)/Math.max(1,hh.length);
  return {id:c.id,name:c.name||String(c.id),inhabited:hh.length,
   neighbourTilesMedian:median(nearest),distanceToMeetingTilesMedian:median(houseToCenter),
   radiusTilesMedian:median(hh.map(h=>Math.hypot(h.x-x,h.y-y))),
   fieldsWalkTilesMedian:median(fieldWalk),fieldsActualEffortMedian:median(actualCommute),
   roadFrontageShare:round(roadFrontage.reduce((a,b)=>a+b,0)/Math.max(1,roadFrontage.length)),
   croftTiles:hh.reduce((n,h)=>n+(h.croft||[]).length,0),
   isolatedHouses:hh.filter(h=>!hh.some(k=>k.id!==h.id&&Math.hypot(k.x-h.x,k.y-h.y)<=9)).length};
 });
 const road=s.traffic.reduce((a,t)=>{if(t>=12)a.worn++;if(t>=55)a.main++;a.totalIntensity+=t;return a;},{worn:0,main:0,totalIntensity:0});
 const pop=overview(s);
 return {year,day:s.day,population:pop.population,grainKg:pop.grain,inhabitedHomes:homes.length,totalHomes:s.households.length,
  road,communities,positions:homes.map(h=>({id:h.id,x:h.x,y:h.y,community:h.communityId,croft:h.croft||[]})),
  fieldCells:s.households.flatMap(h=>h.fields.map(i=>({i,ownerId:h.id}))),
  roadCells:s.traffic.map((v,i)=>v>=12?{i,wear:v}:null).filter(Boolean)};
}
function terrainSvg(s){
 const shapes=[];
 for(let y=0;y<SIZE;y++){
  let run=-1,kind=0;
  for(let x=0;x<=SIZE;x++){
   const k=x<SIZE?s.terrain[xy(x,y)]:0;
   if(k!==kind){if(run>=0)shapes.push(`<rect x="${run}" y="${y}" width="${x-run}" height="1" fill="${kind===1?'#9db6b8':'#b9afa2'}"/>`);run=k?x:-1;kind=k;}
  }
 }
 return shapes.join('');
}
function svg(s){
 const tile=terrainSvg(s);
 let body='';
 for(let n=0;n<result.snapshots.length;n++){
  const p=result.snapshots[n],ox=12+(n%2)*354,oy=30+Math.floor(n/2)*359;
  const fields=p.fieldCells.map(({i,ownerId})=>`<rect x="${i%SIZE}" y="${Math.floor(i/SIZE)}" width="1" height="1" fill="${ownerId%3===0?'#b8ab75':ownerId%3===1?'#c4b17f':'#c7bd8f'}" opacity=".9"/>`).join('');
  const roads=p.roadCells.map(({i,wear})=>`<rect x="${i%SIZE}" y="${Math.floor(i/SIZE)}" width="1" height="1" fill="${wear>=55?'#86634a':'#ad9472'}"/>`).join('');
  const crofts=p.positions.flatMap(h=>h.croft.map(i=>`<rect x="${i%SIZE}" y="${Math.floor(i/SIZE)}" width="1" height="1" fill="#719458"/>`)).join('');
  const homes=p.positions.map(h=>`<rect x="${h.x-.5}" y="${h.y-.5}" width="2" height="2" fill="#754831"/>`).join('');
  const villages=s.communities.map(c=>`<circle cx="${c.x}" cy="${c.y}" r="1.7" fill="none" stroke="#272c2a" stroke-width=".9"/>`).join('');
  body+=`<g transform="translate(${ox} ${oy}) scale(2.15)">${tile}${fields}${roads}${crofts}${homes}${villages}</g>`;
  body+=`<text x="${ox}" y="${oy-9}" fill="#393a30" font-size="12" font-family="Arial,sans-serif">Год ${p.year} · ${p.population} жителей · ${p.inhabitedHomes} домов</text>`;
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" width="728" height="755" viewBox="0 0 728 755">
 <rect width="100%" height="100%" fill="#ede9db"/>
 <text x="12" y="16" fill="#3b342a" font-size="14" font-family="Arial,sans-serif">Живая история · seed ${seed} · реальные земельные права и тропы</text>
 ${body}
 <text x="12" y="746" fill="#4f5546" font-size="11" font-family="Arial,sans-serif">Здания — коричневый · croft — зелёный · пашня — песочный · дороги — охра · вода — голубой</text>
 </svg>`;
}
const s=createWorld(seed);
fs.mkdirSync(out,{recursive:true});
for(let year=1;year<=years;year++){
 advanceDays(s,365);
 const checked=audit(s);
 if(!checked.ok)throw Error(`Seed ${seed} year ${year}: ${checked.issues.slice(0,6).join(' | ')}`);
 result.auditPassedYears.push(year);
 if(checkpoints.includes(year)){
  const snap=inspection(s,year);
  result.snapshots.push(snap);
  console.log('MAP',seed,year,'population',snap.population,'wornTiles',snap.road.worn,'houses',snap.inhabitedHomes);
 }
}
fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify(result,null,2));
fs.writeFileSync(path.join(out,'maps.svg'),svg(s));
console.log('SPATIAL COMPLETE',seed,years,result.snapshots.length);
