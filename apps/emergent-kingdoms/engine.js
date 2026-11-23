/* Emergent Kingdoms — renderer-independent deterministic annual model. */
const engine = function engine(){
const W=84,H=52,N=W*H,VERSION=1;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), round=v=>Math.round(v*1000)/1000;
const copy=s=>JSON.parse(JSON.stringify(s));
function hash(str){let h=2166136261;for(const c of String(str)){h=Math.imul(h^c.charCodeAt(0),16777619)}return h>>>0}
function rand(s){s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;return s.rng/4294967296}
function noise(seed,x,y){const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,t=fx*fx*(3-2*fx),u=fy*fy*(3-2*fy);const v=(a,b)=>hash(seed+":"+a+":"+b)/4294967295;return (v(ix,iy)*(1-t)+v(ix+1,iy)*t)*(1-u)+(v(ix,iy+1)*(1-t)+v(ix+1,iy+1)*t)*u}
const adj=Array.from({length:N},(_,i)=>{let x=i%W,y=i/W|0;return [x>0?i-1:-1,x<W-1?i+1:-1,y>0?i-W:-1,y<H-1?i+W:-1].filter(j=>j>=0)});
const pair=(a,b)=>a<b?a+":"+b:b+":"+a;
const palette=["#b65f48","#56877a","#bd9753","#7778a3","#64854e","#b0768e","#5c819c","#a67c59","#8e6f9c","#b0a344","#559b9a","#aa695f"];
const stems=["Avar","Bel","Cyr","Daran","Esh","Fenn","Gald","Hara","Istr","Jor","Kelm","Lyr","Mera","Neth","Orun","Pyr","Qara","Rhen","Sava","Tarn","Uld","Vey","Wara","Xen","Yl","Zor"];
const tails=["ia","eth","or","an","en","ar","is","um"];
function name(s){return stems[Math.floor(rand(s)*stems.length)]+tails[Math.floor(rand(s)*tails.length)]}
function event(s,type,text,ids=[],cell=-1){s.events.push({year:s.year,type,text,ids,cell});}
function terrain(seed){
const cells=[];for(let i=0;i<N;i++){const x=i%W,y=i/W|0,xx=x/W,yy=y/H;
let edge=Math.max(Math.abs(xx-.5)*2,Math.abs(yy-.5)*2);
let e= .60*noise(seed,x/19,y/17)+.26*noise(seed+1,x/8,y/8)+.14*noise(seed+2,x/3,y/3)-.39*Math.pow(edge,3)+.08;
let land=e>.40, elev=round(clamp((e-.40)*2.35,0,1));
let wet=round(clamp(.68*noise(seed+5,x/14,y/12)+.32*noise(seed+6,x/5,y/5)-elev*.18,0,1));
let heat=round(clamp(1-Math.abs(yy-.5)*1.45-elev*.55,0,1));
cells.push({land,elev,wet,heat,river:0,down:-1,forest:land&&wet>.48&&elev<.72&&heat>.18,fert:0,ore:land?round(clamp(elev*.75+noise(seed+9,x/4,y/4)*.35,0,1)):0,pop:0,owner:0,culture:0,stock:0,wealth:0,city:false});
}
if(cells.filter(c=>c.land).length<250){for(let i=0;i<N;i++){let x=i%W-W/2,y=i/W|0;y-=H/2;if(x*x/350+y*y/170<1){cells[i].land=true;cells[i].elev=.18;cells[i].wet=.6;cells[i].heat=.7}}}
const dist=new Int16Array(N).fill(32767),q=[];cells.forEach((c,i)=>{if(!c.land){dist[i]=0;q.push(i)}});for(let k=0;k<q.length;k++){let i=q[k];for(const j of adj[i])if(dist[j]>dist[i]+1){dist[j]=dist[i]+1;q.push(j)}}
const flow=new Float64Array(N);cells.forEach((c,i)=>{if(!c.land)return;flow[i]=.5+c.wet;const potential=j=>cells[j].land?dist[j]*.025+cells[j].elev*.7:-1;let j=adj[i].reduce((a,b)=>potential(a)<potential(b)?a:b);if(potential(j)>=potential(i))j=adj[i].find(j=>dist[j]<dist[i])??-1;c.down=j});
 // Strictly descending distance for connected drainage, avoiding river loops.
cells.forEach((c,i)=>{if(c.land&&c.down>=0&&dist[c.down]>=dist[i])c.down=adj[i].filter(j=>dist[j]<dist[i]).sort((a,b)=>cells[a].elev-cells[b].elev)[0]??-1});
for(const i of q.slice().reverse()){let c=cells[i];if(!c.land)continue;c.river=flow[i]>7?round(Math.min(1,flow[i]/65)):0;if(c.down>=0)flow[c.down]+=flow[i]}
cells.forEach((c,i)=>{if(c.land)c.fert=round(clamp(.12+c.wet*.55+c.heat*.22-c.elev*.68+c.river*.55+(dist[i]===1?.09:0),.04,1))});return cells;
}
function create(seed="Mare-01",params={}){
const s={version:VERSION,seed:String(seed),rng:hash(seed),year:0,cells:terrain(hash(seed)),nations:[],cultures:[],relations:{},routes:[],events:[],stats:[],params:{growth:1,aggression:1,trade:1,climate:0,...params}};
const candidates=s.cells.map((c,i)=>({i,score:c.land?c.fert+rand(s)*.4:-1})).sort((a,b)=>b.score-a.score);
let used=[];for(const {i,score} of candidates){if(score<.6||used.length>=18)break;if(used.some(j=>Math.hypot(i%W-j%W,(i/W|0)-(j/W|0))<8))continue;used.push(i);const c=s.cells[i];let id=s.cultures.length+1;s.cultures.push({id,name:name(s),color:palette[(id-1)%palette.length]});c.pop=round(90+rand(s)*100);c.culture=id;c.stock=c.pop*.3;c.city=true;event(s,"settlement","Основано поселение культуры "+s.cultures[id-1].name,[],i)}
record(s);return s;
}
function nation(s,i,reason="Основано государство",parent=0){
let c=s.cells[i],id=s.nations.length+1;let n={id,name:name(s)+" "+String(id),color:palette[(id-1)%palette.length],capital:i,culture:c.culture,found:s.year,end:null,tech:parent?s.nations[parent-1].tech*.8:1,treasury:30,stability:.8,policy:rand(s),history:[],parent};
s.nations.push(n);c.owner=id;c.city=true;event(s,"state",reason+": "+n.name,parent?[id,parent]:[id],i);return n;
}
function aggregate(s){
let a=s.nations.map(n=>({id:n.id,pop:0,land:0,wealth:0,food:0,ore:0,cities:0,front:new Map(),capital:n.capital,tech:n.tech}));
s.cells.forEach((c,i)=>{if(!c.land||!c.owner)return;let t=a[c.owner-1];if(!t)return;t.land++;t.pop+=c.pop;t.wealth+=c.wealth;t.food+=c.stock;t.ore+=c.ore;t.cities+=+c.city;for(const j of adj[i]){const b=s.cells[j];if(b.land&&b.owner!==c.owner){if(!t.front.has(b.owner))t.front.set(b.owner,[]);t.front.get(b.owner).push(j)}}});return a;
}
function record(s){let a=aggregate(s),pop=0,wealth=0,settlements=0;for(const c of s.cells){pop+=c.pop;wealth+=c.wealth;settlements+=+c.city}let v={year:s.year,pop:Math.round(pop),wealth:Math.round(wealth),settlements,states:a.filter(t=>t.land).length,wars:Object.values(s.relations).filter(r=>r.war).length,trade:s.routes.length};s.stats.push(v);for(const t of a){const n=s.nations[t.id-1];if(t.land)n.history.push({year:s.year,pop:Math.round(t.pop),land:t.land,wealth:Math.round(t.wealth),tech:round(n.tech),treasury:round(n.treasury),stability:round(n.stability)})}return v}
function capacity(s,c){return Math.max(15,(70+1100*c.fert*(1-c.elev*.45))*clamp(1+s.params.climate*(c.heat-.55),.3,1.7))}
function step(s){
s.year++;const a=aggregate(s);const incoming=new Float64Array(N);const migrantCulture=new Int32Array(N),migrantWeight=new Float64Array(N);
for(let i=0;i<N;i++){const c=s.cells[i];if(!c.land||c.pop<=0)continue;let n=s.nations[c.owner-1],tech=n?n.tech:1,cap=capacity(s,c)*(1+Math.log(tech)*.22),yieldFood=c.fert*(1+Math.log(tech)*.23)*1.65*clamp(1+s.params.climate*(c.heat-.55),.25,1.7);
let food=c.pop*yieldFood*(1-.38*Math.min(1,c.pop/cap));let balance=food+c.stock*.28-c.pop*.54;c.stock=round(clamp(c.stock+food-c.pop*.54,0,c.pop*1.2+30));
let birth=.035*s.params.growth*(1-c.pop/cap);let famine=balance<0?Math.min(.17,-balance/Math.max(1,c.pop)*.22):0;
c.pop=round(Math.max(0,c.pop*(1+clamp(birth,-.08,.075)-famine)));
c.wealth=round(clamp(c.wealth*.91+Math.max(0,balance)*.09+c.pop*c.ore*.009,0,100000));
let options=adj[i].filter(j=>s.cells[j].land);let score=j=>{let b=s.cells[j];return b.fert*1.4-b.pop/capacity(s,b)*.9-b.elev*.32+(b.owner===c.owner?.08:0)};
if(options.length&&c.pop>18){let j=options.reduce((a,b)=>score(a)>score(b)?a:b);let pressure=clamp((c.pop/cap-.27)*.07+(balance<0?.055:0)+(s.cells[j].pop<5?.014:0),0,.09);if(score(j)>score(i)+.08){let count=round(c.pop*pressure);c.pop=round(c.pop-count);incoming[j]+=count;if(count>migrantWeight[j]){migrantCulture[j]=c.culture;migrantWeight[j]=count}}}
if(c.pop>160&&!c.city){c.city=true;event(s,"settlement","Поселение стало городом",c.owner?[c.owner]:[],i)}
}
s.cells.forEach((c,i)=>{if(!incoming[i])return;if(!c.culture||incoming[i]>c.pop*.65)c.culture=migrantCulture[i]||c.culture;c.pop=round(c.pop+incoming[i])});
if(s.year%5===0){
for(let i=0;i<N;i++){let c=s.cells[i];if(c.land&&!c.owner&&c.pop>135&&c.culture&&rand(s)<.045&&!adj[i].some(j=>s.cells[j].owner)){nation(s,i)}}
const ag=aggregate(s);
for(const t of ag){let n=s.nations[t.id-1];if(!t.land)continue;
let revenue=t.wealth*.014+t.pop*.008,expense=t.land*.12+t.pop*.002;n.treasury=round(clamp(n.treasury+revenue-expense,0,1e8));n.tech=round(clamp(n.tech+.008+Math.min(.10,t.wealth/(t.pop+1)*.012+t.cities*.0008),1,80));n.stability=round(clamp(n.stability+.018-(t.pop>0&&t.food/t.pop<.12?.07:0)-Math.max(0,t.land/Math.max(4,Math.sqrt(t.pop)*.6)-1)*.025,0,1));
let unowned=[...new Set(t.front.get(0)||[])].filter(j=>s.cells[j].owner===0);unowned.sort((a,b)=>(s.cells[b].fert+s.cells[b].pop/600)-(s.cells[a].fert+s.cells[a].pop/600)||a-b);
let limit=Math.min(unowned.length,Math.max(1,Math.floor(Math.sqrt(t.pop)/18)));for(let k=0;k<limit;k++){let j=unowned[k],c=s.cells[j];if(c.elev>.9||n.treasury<2)continue;if(rand(s)<.55+c.fert*.25){c.owner=n.id;if(!c.culture)c.culture=n.culture;if(c.pop<5)c.pop=round(c.pop+4);n.treasury-=2}}
if(t.land>8&&n.stability<.45&&rand(s)<.25){let candidates=s.cells.map((c,i)=>c.owner===n.id&&c.city&&i!==n.capital?i:-1).filter(i=>i>=0);if(candidates.length){let i=candidates[Math.floor(rand(s)*candidates.length)],child=nation(s,i,"Отделение провинции",n.id);for(const j of adj[i])if(s.cells[j].owner===n.id)s.cells[j].owner=child.id;n.stability=round(n.stability+.15)}}
}
}
if(s.year%5===0){
let ag=aggregate(s);s.routes=[];let live=new Set(ag.filter(t=>t.land).map(t=>t.id));for(const [key,r] of Object.entries(s.relations)){let [a,b]=key.split(":").map(Number);if(!live.has(a)||!live.has(b)){if(r.war)event(s,"peace","Война закончилась исчезновением государства",[a,b]);delete s.relations[key]}}
for(const t of ag){if(!t.land)continue;let n=s.nations[t.id-1];for(const [id,front] of t.front){if(!id||id<=t.id||!ag[id-1]?.land)continue;let other=s.nations[id-1],b=ag[id-1],key=pair(n.id,id),r=s.relations[key]??(s.relations[key]={score:0,war:false,since:s.year,alliance:false});let cultural=n.culture===other.culture?.08:-.045;
let border=front.length,scarcity=(t.food/(t.pop+1)<.18? .08:0)+(b.food/(b.pop+1)<.18?.08:0);r.score=round(clamp(r.score+cultural+(.5-rand(s))*.26-scarcity-border*.003,-1,1));
let power=t.pop*(.6+n.stability)*Math.sqrt(n.tech)+n.treasury*3,otherPower=b.pop*(.6+other.stability)*Math.sqrt(other.tech)+other.treasury*3;
if(!r.war&&r.score<-.25&&rand(s)<.12*s.params.aggression*(1+Math.abs(power-otherPower)/Math.max(1,power+otherPower))){r.war=true;r.alliance=false;r.since=s.year;event(s,"war",n.name+" ↔ "+other.name,[n.id,id],front[0])}
if(r.war){if(s.year-r.since>10&&(rand(s)<.23||n.treasury<3||other.treasury<3)){r.war=false;r.score=-.1;event(s,"peace","Мир: "+n.name+" / "+other.name,[n.id,id])}else{
let attacker=rand(s)<power/Math.max(1,power+otherPower)?n:other,defender=attacker===n?other:n;let pool=(ag[attacker.id-1].front.get(defender.id)||[]).filter(j=>s.cells[j].owner===defender.id);if(pool.length){let j=pool[Math.floor(rand(s)*pool.length)],c=s.cells[j];c.owner=attacker.id;c.pop=round(c.pop*.88);c.stock=round(c.stock*.4);attacker.treasury=round(Math.max(0,attacker.treasury-3));defender.treasury=round(Math.max(0,defender.treasury-4));defender.stability=round(Math.max(0,defender.stability-.045));if(c.city)event(s,"conquest",attacker.name+" захватило город "+defender.name,[attacker.id,defender.id],j)}}}
else if(s.params.trade>0){let volume=round(Math.min(t.pop,b.pop)*(.012+Math.max(0,r.score)*.025)*s.params.trade);if(volume>0){s.routes.push({a:n.id,b:id,from:n.capital,to:other.capital,volume});n.treasury=round(n.treasury+volume*.15);other.treasury=round(other.treasury+volume*.15);let diff=n.tech-other.tech;n.tech=round(n.tech-Math.max(0,diff)*0+Math.max(0,-diff)*.015);other.tech=round(other.tech+Math.max(0,diff)*.015);r.score=round(clamp(r.score+.035*s.params.trade,-1,1))}if(r.score>.65&&!r.alliance){r.alliance=true;event(s,"alliance","Союз: "+n.name+" / "+other.name,[n.id,id])}if(r.score<.15)r.alliance=false}
}}
}
const final=aggregate(s);for(const t of final){let n=s.nations[t.id-1];if(!t.land&&n.end===null){n.end=s.year;event(s,"collapse","Исчезло государство "+n.name,[n.id],n.capital)}else if(t.land&&s.cells[n.capital].owner!==n.id){let best=-1;for(let i=0;i<N;i++)if(s.cells[i].owner===n.id&&(best<0||s.cells[i].pop>s.cells[best].pop))best=i;if(best>=0){n.capital=best;s.cells[best].city=true;event(s,"state","Новая столица "+n.name,[n.id],best)}}}
if(s.year%5===0){s.routes=s.routes.filter(r=>s.nations[r.a-1].end===null&&s.nations[r.b-1].end===null).map(r=>({...r,from:s.nations[r.a-1].capital,to:s.nations[r.b-1].capital}));record(s)}return s;
}
function apply(s,a){if(a.kind==="param"){const bounds={growth:[0,2],aggression:[0,3],trade:[0,3],climate:[-1,1]};if(!bounds[a.key]||!Number.isFinite(a.value))throw Error("Некорректный параметр");s.params[a.key]=clamp(a.value,...bounds[a.key]);event(s,"experiment","Параметр "+a.key+" = "+s.params[a.key]);return}
if(!Number.isInteger(a.cell)||!s.cells[a.cell]?.land)throw Error("Выберите сушу");let c=s.cells[a.cell];if(a.kind==="fertility")c.fert=clamp(c.fert+.22,.04,1);else if(a.kind==="drought"){c.fert=clamp(c.fert-.25,.04,1);c.stock=0}else if(a.kind==="plague")c.pop=round(c.pop*.35);else if(a.kind==="settle"){c.pop+=80;if(!c.culture){const id=s.cultures.length+1;s.cultures.push({id,name:name(s),color:palette[(id-1)%palette.length]});c.culture=id}c.city=true}else if(a.kind==="forest"){c.forest=!c.forest;c.fert=clamp(c.fert+(c.forest?.08:-.08),.04,1)}else throw Error("Неизвестное вмешательство");event(s,"experiment",({fertility:"Улучшение почвы",drought:"Засуха",plague:"Эпидемия",settle:"Переселение",forest:"Изменение леса"})[a.kind],c.owner?[c.owner]:[],a.cell)}
function replay(seed,actions,year,checkpoint=null){let s=checkpoint?copy(checkpoint.state):create(seed),start=checkpoint?checkpoint.actionCount:0;for(let i=start;i<actions.length;i++){const a=actions[i];if(a.year>year)break;if(a.year<s.year)throw Error("Нарушение хронологии");while(s.year<a.year)step(s);apply(s,a)}while(s.year<year)step(s);return s}
function digest(s){return hash(JSON.stringify(s)).toString(16).padStart(8,"0")}
return {W,H,N,VERSION,create,step,apply,replay,copy,aggregate,digest,adj,record,capacity};
};
export const E = engine();
