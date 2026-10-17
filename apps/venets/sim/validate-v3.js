// Frozen v0.3 world validator for strict save migration.
// World schema v3: structural, kinship, legal and audited financial invariants.
const demand=(ok,message)=>{if(!ok)throw new Error('Invalid Venets world: '+message);};
const safe=n=>Number.isSafeInteger(n)&&n>=0;
const ranks={county:1,duchy:2,kingdom:3};
const laws=new Set(['primogeniture','partition','seniority']);
const sex=new Set(['male','female']);
const goods=['grain','coin'];
const index=(arr,label)=>{
  demand(Array.isArray(arr),'expected '+label);
  const entries=new Map(arr.map(p=>[p?.id,p]));
  demand(entries.size===arr.length&&!entries.has(undefined),'unique '+label);
  return entries;
};
export function assertWorldV3(w){
  demand(w&&typeof w==='object'&&!Array.isArray(w),'world object');
  demand(w.schemaVersion===3 && safe(w.seed) && w.seed<=0xffffffff,'schema/seed');
  demand(safe(w.rngState)&&w.rngState<=0xffffffff&&w.rngState!==0,'PRNG');
  demand(Number.isSafeInteger(w.year)&&w.year>=1066&&w.year<=5000,'year');
  demand(Array.isArray(w.provinces)&&w.provinces.length===12,'12 provinces');
  demand(Array.isArray(w.titles)&&w.titles.length===17,'17 titles');
  demand(Array.isArray(w.people)&&w.people.length>=17,'people count');
  demand(Array.isArray(w.dynasties)&&w.dynasties.length===5,'five houses');
  const people=index(w.people,'people'),titles=index(w.titles,'titles'),provinces=index(w.provinces,'provinces');
  const dynasties=index(w.dynasties,'dynasties');
  demand(w.nextPersonId===w.people.length+1 && Number.isSafeInteger(w.nextPersonId),'next-person ID');
  demand(w.people.every((p,i)=>p.id==='pe-'+String(i+1).padStart(2,'0')),'person ID sequence');
  demand(w.events&&Array.isArray(w.events)&&w.nextEventId===w.events.length+1,'event sequence');
  demand([...dynasties.values()].every(d=>typeof d.name==='string'&&d.name),'dynasty name');

  // Family graph is a directed DAG by chronological birth, not an arbitrary set of links.
  let alive=0;
  for(const p of w.people){
    demand(dynasties.has(p.dynastyId)&&typeof p.name==='string'&&p.name,'person/dynasty');
    demand(sex.has(p.sex)&&Number.isSafeInteger(p.birthYear)&&p.birthYear<=w.year,'sex and birth');
    demand(p.birthYear>=1000,'birth year lower bound');
    demand(typeof p.alive==='boolean'&&
      (p.alive?p.deathYear===null:Number.isSafeInteger(p.deathYear)&&p.deathYear>=p.birthYear&&p.deathYear<=w.year),'life state');
    if(p.alive)alive++;
    demand(['founder','founder-spouse','born','immigrant','v2-migrated'].includes(p.origin),'person provenance');
    demand(Array.isArray(p.parentIds)&&p.parentIds.length===2,'two genealogical parent slots');
    const [fatherId,motherId]=p.parentIds;
    demand((fatherId===null&&motherId===null)||(typeof fatherId==='string'&&typeof motherId==='string'&&fatherId!==motherId),
      'parent pair or absence');
    for(const [id,kind] of [[fatherId,'male'],[motherId,'female']]){
      if(id===null)continue;
      const parent=people.get(id);
      demand(parent?.sex===kind,'invalid parent '+id);
      demand(parent.birthYear<=p.birthYear-16,'parent too young / genealogical cycle');
      demand(parent.deathYear===null||parent.deathYear>=p.birthYear,'child born after parental death');
    }
    demand(p.spouseId===null||people.has(p.spouseId),'spouse exists');
    if(p.alive&&p.spouseId!==null){
      const spouse=people.get(p.spouseId);
      demand(spouse?.alive&&spouse.spouseId===p.id&&spouse.sex!==p.sex&&spouse.id!==p.id,'mutual living marriage');
    }
    demand(Array.isArray(p.marriages),'marriage history');
    for(const union of p.marriages)
      demand(people.has(union?.spouseId)&&safe(union.year)&&union.year<=w.year,'marriage evidence');
    demand(p.treasury&&goods.every(good=>safe(p.treasury[good])),'person treasure');
  }
  demand(alive>0,'at least one living person');

  const counties=new Set();let countyCount=0,duchyCount=0,kingdomCount=0;
  for(const t of w.titles){
    demand(ranks[t.rank]&&people.get(t.holderId)?.alive,'living titleholder '+t.id);
    demand(laws.has(t.law),'succession law');
    if(t.rank==='county'){
      countyCount++;
      demand(provinces.has(t.provinceId)&&!counties.has(t.provinceId),'unique county-province');
      counties.add(t.provinceId);
    } else demand(t.provinceId===null,'non-county province');
    duchyCount+=Number(t.rank==='duchy');
    kingdomCount+=Number(t.rank==='kingdom');
    if(t.liegeId===null) demand(t.rank==='kingdom','unrooted county/duchy');
    else demand(ranks[titles.get(t.liegeId)?.rank]===ranks[t.rank]+1,'illegal title liege');
    let ancestor=t,hops=0;
    while(ancestor.liegeId!==null){
      ancestor=titles.get(ancestor.liegeId);
      demand(ancestor&&++hops<=2,'liege cycle');
    }
    demand(Array.isArray(t.history)&&t.history.length>0,'title history');
    for(let k=0;k<t.history.length;k++){
      const h=t.history[k];
      demand(safe(h?.year)&&h.year<=w.year && h.year>=1066 &&
        (h.from===null||people.has(h.from))&&people.has(h.to) &&
        typeof h.cause==='string'&&h.cause,'title provenance');
      if(k>0)demand(h.from===t.history[k-1].to&&h.year>=t.history[k-1].year,'title history chain');
    }
    demand(t.history.at(-1).to===t.holderId,'title history current owner');
    demand(Array.isArray(t.claims)&&new Set(t.claims.map(c=>c.personId)).size===t.claims.length,'unique claimants');
    for(const c of t.claims)
      demand(people.get(c.personId)?.alive&&people.has(c.sourceId)&&
        c.personId!==t.holderId&&c.origin==='passed-over'&&safe(c.year)&&c.year<=w.year,
        'invalid inheritance claim');
  }
  demand(countyCount===12&&duchyCount===4&&kingdomCount===1,'feudal ranks');
  const grid=new Set();
  for(const p of w.provinces){
    demand(titles.get(p.titleId)?.provinceId===p.id,'county mapping');
    demand(safe(p.x)&&p.x<4&&safe(p.y)&&p.y<3,'grid coordinate');
    const coord=p.x+':'+p.y;
    demand(!grid.has(coord),'overlapping provinces');grid.add(coord);
    demand(['plains','hills'].includes(p.terrain)&&safe(p.baseYield)&&safe(p.baseTrade)&&safe(p.demand),
      'province economy');
    demand(safe(p.shortages)&&safe(p.lastShortage),'province shortages');
    demand(p.treasury&&goods.every(good=>safe(p.treasury[good])),'province treasure');
    demand(Array.isArray(p.neighbors)&&new Set(p.neighbors).size===p.neighbors.length,'neighbors');
    for(const id of p.neighbors){
      const other=provinces.get(id);
      demand(id!==p.id&&other?.neighbors.includes(p.id)&&
        Math.abs(other.x-p.x)+Math.abs(other.y-p.y)===1,'invalid neighbor '+id);
    }
  }
  const seen=new Set(['pr-01']),queue=['pr-01'];
  while(queue.length){
    const p=provinces.get(queue.shift());
    demand(p,'grid root');
    for(const other of p.neighbors)if(!seen.has(other)){seen.add(other);queue.push(other);}
  }
  demand(seen.size===12,'not contiguous');

  const stats=w.stats;
  demand(stats&&safe(stats.years)&&stats.years===w.year-1066,'year statistics');
  for(const key of ['shortages','harvested','minted','taxGrain','taxCoin','births','deaths',
    'marriages','escheats','partitions']) demand(safe(stats[key]),'missing/invalid stats '+key);
  demand(stats.shortages===w.provinces.reduce((n,p)=>n+p.shortages,0),'shortage counter');
  demand(stats.deaths===w.people.filter(p=>!p.alive).length,'death counter');
  let lastYear=1066,closed=0,eventsBorn=0,eventsDead=0,eventsMarried=0,eventsPartitioned=0;
  const flows={created:{grain:0,coin:0},consumed:{grain:0,coin:0}};
  for(let i=0;i<w.events.length;i++){
    const e=w.events[i];
    demand(e?.id===i+1&&safe(e.year)&&e.year>=lastYear&&e.year<=w.year&&
      typeof e.kind==='string'&&e.kind&&typeof e.cause==='string'&&e.cause&&
      e.effect&&typeof e.effect==='object','event integrity');
    lastYear=e.year;
    if(e.kind==='year-closed')closed++;
    if(e.kind==='birth')eventsBorn++;
    if(e.kind==='death')eventsDead++;
    if(e.kind==='marriage')eventsMarried++;
    if(e.kind==='realm-partition')eventsPartitioned++;
    if(e.kind==='transfer'){
      const {good,from,to,amount}=e.effect;
      demand(goods.includes(good)&&safe(amount)&&from!==to &&
        (from===null||typeof from==='string'&&/^(person|province):/.test(from))&&
        (to===null||typeof to==='string'&&/^(person|province):/.test(to)),'event transfer');
      if(from===null)flows.created[good]+=amount;
      if(to===null)flows.consumed[good]+=amount;
    }
  }
  demand(closed===stats.years,'year-close entries');
  demand(eventsPartitioned===stats.partitions,'portfolio partition counter');
  demand(eventsBorn===stats.births&&eventsDead===stats.deaths&&eventsMarried===stats.marriages,
    'demographic event counters');
  const totals={grain:0,coin:0};
  for(const person of [...w.people,...w.provinces])for(const good of goods)totals[good]+=person.treasury[good];
  for(const good of goods){
    demand(Number.isSafeInteger(totals[good]),'resource total overflow');
    demand(safe(w.ledger?.initial?.[good])&&safe(w.ledger?.created?.[good])&&
      safe(w.ledger?.consumed?.[good]),'ledger entries');
    demand(flows.created[good]===w.ledger.created[good]&&flows.consumed[good]===w.ledger.consumed[good],
      'ledger-event mismatch '+good);
    demand(totals[good]===w.ledger.initial[good]+w.ledger.created[good]-w.ledger.consumed[good],
      'ledger balance mismatch '+good);
  }
  return {provinces:12,titles:17,people:w.people.length,alive,dynasties:w.dynasties.length,
    year:w.year,events:w.events.length,resources:totals};
}
