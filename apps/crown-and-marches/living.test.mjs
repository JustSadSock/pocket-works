
import test from 'node:test';
import assert from 'node:assert/strict';
import {N,W,H,idx,xx,yy,dist,newGame,generate,step,serialize,restore,neighbors,pathfind,travelCost,recalcTerritory,occupationStep,controller,treaty,settle,assignLand,buildConnection,transportStep,investLand,territoryValue} from './world.mjs';
import {campaignTerrain} from './battle.mjs';
function corridor({same=true,end=28}={}){
 const s=newGame('living-fixture');s.cities=s.cities.slice(0,2);s.armies=[];s.shipments=[];s.routes=[];
 s.owner.fill(-1);s.admin.fill(-1);s.occ.fill(-1);s.control.fill(0);s.road.fill(0);s.bridge.fill(0);s.development.fill(0);s.devastation.fill(0);s.pressure.fill(0);s.contender.fill(-1);s.district.fill(0);s.adminOverride.fill(-1);s.adminAccess.fill(0);
 s.map.land.fill(0);s.map.height.fill(.20);s.map.terrain.fill(1);s.map.river.fill(0);s.map.fert.fill(.75);s.map.resource.fill(0);s.map.down.fill(-1);s.map.coast?.fill(0);s.map.pass?.fill(0);
 const at=x=>idx(x,30);for(let x=20;x<=end;x++){let i=at(x);s.map.land[i]=1;s.owner[i]=same?0:x<24?0:1;s.control[i]=1;s.road[i]=1;s.development[i]=.6;}
 for(const [k,c] of s.cities.entries()){c.i=at(k?end:20);c.f=k&&!same?1:0;c.pop=3000;c.infra=3;c.fort=0;c.occupation=-1;c.stock.fill(100);s.owner[c.i]=c.f;}
 recalcTerritory(s,false);return {s,at};
}
test('all inland drainage follows strictly downhill edges to water; basins and coherent geology exist',()=>{
 const m=generate('living-map');let rivers=0,iron=0,coast=0;
 for(let i=0;i<N;i++)if(m.land[i]){if(m.down[i]>=0){assert.ok(m.height[m.down[i]]<m.height[i]);assert.equal(m.basin[i],m.basin[m.down[i]]);}if(m.river[i])rivers++;if(m.resource[i]===3)iron++;if(m.coast[i])coast++;}
 assert.ok(rivers>100&&iron>25&&coast>10);assert.ok(m.temperature.every(Number.isFinite));assert.ok(m.pass.some(Boolean));
});
test('mountain barrier increases actual transport cost between two settlements',()=>{
 const {s,at}=corridor();let a=s.cities[0],b=s.cities[1];let path=pathfind(s,a.i,b.i,0);assert.equal(path.length,8);const cost=p=>p.reduce((sum,i,j)=>sum+travelCost(s,j?p[j-1]:a.i,i),0);const before=cost(path);
 for(let x=23;x<=25;x++){s.map.height[at(x)]=.70;s.map.terrain[at(x)]=4;}assert.ok(cost(path)>before*2);s.map.land[at(24)]=0;assert.equal(pathfind(s,a.i,b.i,0).length,0);
});
test('occupation of iron deposit is gradual and distinct from legal ownership and city surrender',()=>{
 const {s,at}=corridor({same:false});let i=at(25);s.map.resource[i]=3;treaty(s,0,1,'war');s.armies.push({id:1,f:0,i,units:[600,0,0,0,0,0,0,0,0,0],supply:60,morale:1,fatigue:0,path:[]});
 occupationStep(s);assert.equal(s.occ[i],-1);assert.ok(s.pressure[i]>0);
 for(let k=0;k<20;k++)occupationStep(s);assert.equal(controller(s,i),0);assert.equal(s.owner[i],1);assert.equal(s.cities[1].occupation,-1);assert.ok(s.devastation[i]>0);
 assert.equal(treaty(s,0,1,'peace'),'Договор принят');assert.equal(s.owner[i],0);
});
test('a hostile patrol blocks a cargo shipment without capturing either settlement',()=>{
 const {s,at}=corridor();treaty(s,0,1,'war');let [a,b]=s.cities,before=b.stock[3];let goods=Array(17).fill(0);goods[3]=7;
 s.shipments=[{id:1,from:a.id,to:b.id,fromFaction:0,toFaction:0,i:at(20),start:at(20),end:at(28),sea:false,path:Array.from({length:8},(_,i)=>at(21+i)),index:0,progress:0,wait:0,goods}];
 s.armies.push({id:1,f:1,i:at(21),units:[60,0,0,0,0,0,0,0,0,0],supply:60,path:[]});
 transportStep(s);assert.equal(s.shipments[0].wait,1);assert.equal(b.stock[3],before);assert.equal(a.occupation,-1);assert.equal(b.occupation,-1);
 s.armies=[];for(let k=0;k<20;k++)transportStep(s);assert.equal(s.shipments.length,0);assert.equal(b.stock[3],before+7);
});
test('an occupied chokepoint isolates cells from their district without changing legal owner',()=>{
 const {s,at}=corridor();s.cities=s.cities.slice(0,1);recalcTerritory(s,false);let far=at(27);assert.equal(s.admin[far],s.cities[0].id);assert.equal(s.adminAccess[far],1);s.occ[at(23)]=1;recalcTerritory(s,false);assert.equal(s.owner[far],0);assert.equal(s.admin[far],s.cities[0].id);assert.equal(s.adminAccess[far],0);assert.ok(s.cities[0].isolated>0);
});
test('founding in a fertile valley, initial investment and connected roads use treasury and goods',()=>{
 const s=newGame('living-valley'),c=s.cities[0];let candidates=[];for(let i=0;i<N;i++)if(s.map.land[i]&&s.owner[i]<0&&dist(c.i,i)>=8&&dist(c.i,i)<20&&s.map.fert[i]>.45&&!s.cities.some(d=>dist(d.i,i)<7))candidates.push(i);candidates.sort((a,b)=>territoryValue(s,b)-territoryValue(s,a));
 let target=candidates.find(i=>pathfind(s,c.i,i,0).length);assert.notEqual(target,undefined);assert.match(settle(s,0,target),/Основано/);let city=s.cities.find(c=>c.i===target);assert.equal(s.owner[target],0);assert.ok(s.development[target]>=.6);assert.equal(city.pop,220);
 const {s:t,at}=corridor();const a=t.cities[0];t.map.river[at(22)]=1;let gold=t.states[0].gold;assert.match(buildConnection(t,a,at(22)),/Дорога построена/);assert.equal(t.bridge[at(22)],1);assert.ok(t.states[0].gold<gold);const d=t.development[at(21)];assert.match(investLand(t,a,at(21)),/Освоение/);assert.ok(t.development[at(21)]>d);
});
test('adjacent administrative cells can be reassigned between connected centers',()=>{
 const {s,at}=corridor();let [a,b]=s.cities;let i=Array.from({length:7},(_,k)=>at(21+k)).find(i=>s.admin[i]===a.id&&neighbors(i).some(j=>s.admin[j]===b.id));assert.notEqual(i,undefined);assert.equal(assignLand(s,i,b.id),'Участок передан');assert.equal(s.admin[i],b.id);assert.equal(s.adminAccess[i],1);assert.equal(s.owner[i],0);
});
test('strategic river and bridge are sampled into tactical terrain with actual orientation',()=>{
 const {s,at}=corridor();const i=at(24),north=i-W,south=i+W;for(const j of [north,i,south]){s.map.land[j]=1;s.map.river[j]=1;s.map.height[j]=.3;s.map.flow[j]=100;}s.map.down[north]=i;s.map.down[i]=south;s.bridge[i]=1;s.road[i]=1;s.road[i-1]=1;s.road[i+1]=1;
 const tiles=campaignTerrain(s,i);assert.equal(tiles.length,1600);assert.ok(tiles.some(t=>t.bridge));assert.ok(tiles.some(t=>t.water));assert.ok(tiles.some(t=>t.road));assert.ok(tiles.every(t=>Number.isFinite(t.h)));assert.ok(tiles.some(t=>t.worldCell===north&&t.water));assert.ok(tiles.some(t=>t.worldCell===south&&t.water));
});
test('six autonomous states run a full simulated year and preserve the complete save',()=>{
 let a=newGame('living-year'),b=newGame('living-year');a.autonomous=b.autonomous=true;for(let i=0;i<360;i++){step(a);step(b);}assert.equal(a.day,360);assert.equal(a.states.length,6);assert.ok(a.cities.length>=6);assert.ok(a.cities.every(c=>Number.isFinite(c.pop)&&c.pop>0));assert.equal(serialize(a),serialize(b));assert.equal(serialize(restore(serialize(a))),serialize(a));
});
