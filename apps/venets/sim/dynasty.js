// Dynasty rules for v0.3. Demography here is a model, not an historical calibration.
// This module never changes geography or acts as political AI.
import { randomInt } from './random.js';
import { recordEvent, transfer, changeTitleHolder } from './transactions.js';
import { initializePoliticalPerson } from './politics.js';

export const SUCCESSION_LAWS = ['primogeniture','partition','seniority'];
const MALE = ['Радослав','Ярослав','Всеволод','Борислав','Святополк','Мирослав','Глеб','Добромир','Лев','Олег'];
const FEMALE = ['Мирослава','Звенислава','Анна','Любовь','Ольга','Добрава','Милица','Агния','Божена','София'];
const seniority = (a,b) => a.birthYear-b.birthYear || a.id.localeCompare(b.id);
const idNumber = id => Number(id.split('-').at(-1));

export function findPerson(world, id) { return world.people.find(p => p.id === id) ?? null; }
export function isAlive(world, id) { return Boolean(findPerson(world,id)?.alive); }
export function titlesOf(world, id) { return world.titles.filter(t => t.holderId === id); }
export function ancestors(world, personId, limit = 12) {
  const result = new Set(), queue = [{id:personId,depth:0}];
  while(queue.length) {
    const {id,depth} = queue.shift();
    if(depth >= limit) continue;
    const person=findPerson(world,id);
    if(!person) continue;
    for(const parentId of person.parentIds) {
      if(parentId === null || result.has(parentId)) continue;
      result.add(parentId);
      queue.push({id:parentId,depth:depth+1});
    }
  }
  return result;
}
function closelyRelated(world,a,b) {
  if(a===b) return true;
  const aa=ancestors(world,a,2), bb=ancestors(world,b,2);
  return aa.has(b) || bb.has(a) || [...aa].some(id=>bb.has(id));
}
function distinct(arr) { return [...new Set(arr)]; }
function kids(world,parentId) { return world.people.filter(p=>p.parentIds.includes(parentId)).sort((a,b)=>a.birthYear-b.birthYear || a.id.localeCompare(b.id)); }
// A deceased child's branch retains precedence over younger siblings.
function representative(world,person) {
  if(person.alive) return person;
  for(const child of kids(world,person.id)) {
    const heir=representative(world,child);
    if(heir) return heir;
  }
  return null;
}
export function descendantBranches(world,personId) {
  return distinct(kids(world,personId).map(p=>representative(world,p)?.id).filter(Boolean))
    .map(id=>findPerson(world,id));
}
function collateral(world,dead) {
  // Search breadth-first by kinship level: siblings (including their represented
  // descendants), then parents, then aunts/uncles and their lines.
  let branches=[dead];
  const seen=new Set([dead.id]);
  for(let depth=0;depth<12&&branches.length;depth++) {
    const parents=distinct(branches.flatMap(p=>p.parentIds.filter(Boolean)))
      .map(id=>findPerson(world,id)).filter(p=>p&&!seen.has(p.id));
    if(!parents.length) break;
    for(const parent of parents) {
      const siblings=kids(world,parent.id).filter(child=>
        !branches.some(branch=>branch.id===child.id));
      for(const sibling of siblings) {
        const heir=representative(world,sibling);
        if(heir && heir.id!==dead.id && !ancestors(world,heir.id).has(dead.id))return heir;
      }
    }
    for(const parent of parents)if(parent.alive)return parent;
    parents.forEach(p=>seen.add(p.id));
    branches=parents;
  }
  return null;
}
function elect(world,dead) {
  const alive=world.people.filter(p=>p.alive && p.id!==dead.id);
  if(!alive.length) return bringOutsider(world,dead.sex === 'male'?'female':'male',null,'emergency-regency');
  const nobles=alive.filter(p=>titlesOf(world,p.id).length);
  return (nobles.length?nobles:alive).sort((a,b)=>titlesOf(world,b.id).length-titlesOf(world,a.id).length || seniority(a,b))[0];
}
function chooseFallback(world,dead,title) {
  const kin=collateral(world,dead);
  if(kin) return {heir:kin,reason:'collateral'};
  const sameDynasty=world.people.filter(p=>p.alive && p.id!==dead.id && p.dynastyId===dead.dynastyId).sort(seniority);
  if(sameDynasty.length) return {heir:sameDynasty[0],reason:'dynastic-seniority'};
  const liege=title?.liegeId?world.titles.find(t=>t.id===title.liegeId):null;
  if(liege?.holderId && isAlive(world,liege.holderId)) return {heir:findPerson(world,liege.holderId),reason:'escheat'};
  return {heir:elect(world,dead),reason:'election'};
}
function rankValue(rank) { return ({kingdom:3,duchy:2,county:1})[rank] ?? 0; }
function claim(world,title,personId,sourceId) {
  if(title.holderId===personId || title.claims.some(c=>c.personId===personId) || !isAlive(world,personId)) return;
  const entry={personId,origin:'passed-over',sourceId,year:world.year};
  title.claims.push(entry);
  recordEvent(world,'claim-founded','inheritance-dispute:'+title.id,{titleId:title.id,personId,sourceId});
}
function distributeEstate(world,dead,recipient) {
  if(!recipient || recipient.id===dead.id) throw Error('No legal estate recipient');
  for(const good of ['grain','coin']) {
    const amount=dead.treasury[good];
    if(amount) transfer(world,{good,from:'person:'+dead.id,to:'person:'+recipient.id,amount,cause:'estate:'+dead.id});
  }
}
export function resolveInheritance(world,deadId) {
  const dead=findPerson(world,deadId);
  if(!dead || dead.alive) throw Error('Inheritance requires an already deceased person');
  const holdings=titlesOf(world,deadId).sort((a,b)=>rankValue(b.rank)-rankValue(a.rank)||a.id.localeCompare(b.id));
  const branches=descendantBranches(world,deadId);
  const fallback=chooseFallback(world,dead,holdings[0]);
  let partitionCount=0;
  let primary=null;
  const distribution=[];
  for(const title of holdings) {
    let winner,reason;
    if(title.law==='seniority') {
      const seniors=world.people.filter(p=>p.alive && p.dynastyId===dead.dynastyId && p.id!==dead.id).sort(seniority);
      winner=seniors[0];
      reason=winner?'house-seniority':fallback.reason;
    } else if(branches.length) {
      winner=title.law==='partition'?branches[(partitionCount++)%branches.length]:branches[0];
      reason=title.law==='partition'?'partible-inheritance':'primogeniture';
    }
    if(!winner) {winner=fallback.heir;reason=fallback.reason;}
    if(!primary) primary=winner;
    changeTitleHolder(world,{titleId:title.id,newHolderId:winner.id,cause:'succession:'+reason+':'+dead.id});
    distribution.push({titleId:title.id,heirId:winner.id});
    for(const contender of branches) if(contender.id!==winner.id) claim(world,title,contender.id,dead.id);
    if(reason==='escheat')world.stats.escheats++;
  }
  if(new Set(distribution.map(t=>t.heirId)).size>1){
    world.stats.partitions++;
    recordEvent(world,'realm-partition','portfolio-division:'+dead.id,{deceasedId:dead.id,distribution});
  }
  const estateHeir=primary ?? (dead.spouseId&&isAlive(world,dead.spouseId)?findPerson(world,dead.spouseId):null) ??
    branches[0] ?? fallback.heir;
  distributeEstate(world,dead,estateHeir);
  recordEvent(world,'inheritance','estate-settlement:'+deadId,{
    deceasedId:deadId,heirId:estateHeir.id,titles:holdings.map(t=>({id:t.id,to:t.holderId,law:t.law})),
    descendants:branches.map(p=>p.id)
  });
}

export function die(world,{personId,cause='natural-mortality'}={}) {
  const dead=findPerson(world,personId);
  if(!dead||!dead.alive) throw new RangeError('Unknown or deceased person');
  if(typeof cause!=='string'||!cause)throw new TypeError('Death must have a cause');
  dead.alive=false;dead.deathYear=world.year;
  const formerSpouse=dead.spouseId;
  if(formerSpouse) {
    const spouse=findPerson(world,formerSpouse);
    if(spouse?.spouseId===dead.id) spouse.spouseId=null;
    // Historical spouse reference remains on deceased person; the widow is now free to remarry.
  }
  for(const title of world.titles) title.claims=title.claims.filter(c=>c.personId!==dead.id);
  world.stats.deaths++;
  recordEvent(world,'death',cause,{personId,age:world.year-dead.birthYear,widowedId:formerSpouse});
  resolveInheritance(world,personId);
  return dead;
}
export function marry(world,{personAId,personBId,cause='marriage-contract'}={}) {
  const a=findPerson(world,personAId),b=findPerson(world,personBId);
  if(!a||!b||!a.alive||!b.alive||a.id===b.id)throw new RangeError('Marriage requires two living people');
  if(a.sex===b.sex)throw new RangeError('Only opposite-sex dynastic marriages are modelled in v0.3');
  if(a.spouseId||b.spouseId)throw new RangeError('Already married');
  if(world.year-a.birthYear<17||world.year-b.birthYear<17)throw new RangeError('Partners must be adults');
  if(closelyRelated(world,a.id,b.id))throw new RangeError('Close relatives cannot marry');
  if(typeof cause!=='string'||!cause)throw new TypeError('Marriage must have a cause');
  a.spouseId=b.id;b.spouseId=a.id;
  a.marriages.push({spouseId:b.id,year:world.year});
  b.marriages.push({spouseId:a.id,year:world.year});
  world.stats.marriages++;
  recordEvent(world,'marriage',cause,{personAId:a.id,personBId:b.id,dynasties:[a.dynastyId,b.dynastyId]});
  return [a,b];
}
function addPerson(world,{sex,dynastyId,birthYear,parentIds=[null,null],origin='born',treasury={grain:0,coin:0}}) {
  const id='pe-'+String(world.nextPersonId++).padStart(2,'0');
  const nameList=sex==='male'?MALE:FEMALE;
  const dynasty=world.dynasties.find(d=>d.id===dynastyId);
  const person={id,name:nameList[randomInt(world,nameList.length)]+' '+dynasty.name,
    dynastyId,sex,birthYear,parentIds:[...parentIds],spouseId:null,
    marriages:[],alive:true,deathYear:null,origin,treasury:{...treasury}};
  world.people.push(person);
  if(world.schemaVersion>=4) initializePoliticalPerson(world,person);
  return person;
}
function bringOutsider(world,sex,host,cause) {
  const houses=world.dynasties.filter(d=>d.id!==host?.dynastyId);
  const dynasty=houses[randomInt(world,houses.length)];
  const suitableAge=host ? Math.min(42,Math.max(18,world.year-host.birthYear)) : 30;
  const birthYear=world.year-(Math.max(18,suitableAge-3)+randomInt(world,7));
  const entrant=addPerson(world,{sex,dynastyId:dynasty.id,birthYear,origin:'immigrant'});
  recordEvent(world,'arrival',cause,{personId:entrant.id,houseId:dynasty.id,origin:'off-map-branch'});
  return entrant;
}
export function birth(world,{motherId,fatherId,cause='household-birth'}={}) {
  const mother=findPerson(world,motherId),father=findPerson(world,fatherId);
  if(!mother||!father||!mother.alive||!father.alive||mother.sex!=='female'||father.sex!=='male'||
    mother.spouseId!==father.id||father.spouseId!==mother.id)throw new RangeError('Birth requires a married living mother and father');
  if(world.year-mother.birthYear<17||world.year-mother.birthYear>44||
    world.year-father.birthYear<17||world.year-father.birthYear>80)throw new RangeError('Parents outside reproductive ages');
  const existing=world.people.filter(p=>p.parentIds.includes(motherId)&&p.parentIds.includes(fatherId)).length;
  if(existing>=4)throw new RangeError('Household has reached current model fertility cap');
  const main=rankValue(world.titles.find(t=>t.holderId===mother.id)?.rank);
  const other=rankValue(world.titles.find(t=>t.holderId===father.id)?.rank);
  const dynastyId=main>other?mother.dynastyId:other>main?father.dynastyId:
    (titlesOf(world,mother.id).length ? mother.dynastyId :
      titlesOf(world,father.id).length ? father.dynastyId : father.dynastyId);
  const child=addPerson(world,{sex:randomInt(world,2)===0?'female':'male',
    dynastyId,birthYear:world.year,parentIds:[father.id,mother.id]});
  world.stats.births++;
  recordEvent(world,'birth',cause,{personId:child.id,parentIds:[father.id,mother.id],dynastyId});
  return child;
}
export function setSuccessionLaw(world,{titleId,law,cause='law-reform'}={}) {
  const title=world.titles.find(t=>t.id===titleId);
  if(!title||!SUCCESSION_LAWS.includes(law))throw new RangeError('Unknown title or succession law');
  if(typeof cause!=='string'||!cause)throw new TypeError('Law change requires cause');
  if(title.law===law)return title;
  const previous=title.law;
  title.law=law;
  recordEvent(world,'law-changed',cause,{titleId,previous,law});
  return title;
}
export function seedFamilyFoundations(world) {
  // All baseline members are contemporaries of the foundation, not post-start arrivals.
  // Extend holders first and pair them with unrelated off-map branches of existing houses.
  for(const [i,person] of world.people.entries()) Object.assign(person,{
    sex:i%2?'female':'male',parentIds:[null,null],spouseId:null,marriages:[],
    alive:true,deathYear:null,origin:'founder'
  });
  world.nextPersonId=world.people.length+1;
  world.stats={...world.stats,births:0,deaths:0,marriages:0,escheats:0,partitions:0};
  for(const [index,title] of world.titles.entries()) {
    title.law=title.rank==='kingdom'?'primogeniture':
      title.rank==='duchy'?(index===1?'partition':'primogeniture'):
      (index%3===0?'seniority':index%2===0?'partition':'primogeniture');
    title.claims=[];
    title.history=[{year:world.year,from:null,to:title.holderId,cause:'foundation'}];
  }
  const titled=[...world.people];
  for(const person of titled) {
    const sex=person.sex==='male'?'female':'male';
    const age=world.year-person.birthYear;
    const spouse=addPerson(world,{sex,dynastyId:world.dynasties.filter(d=>d.id!==person.dynastyId)[randomInt(world,world.dynasties.length-1)].id,
      birthYear:world.year-Math.max(20,Math.min(40,age-4+randomInt(world,9))),
      origin:'founder-spouse',treasury:{grain:10+randomInt(world,22),coin:5+randomInt(world,12)}});
    person.spouseId=spouse.id;spouse.spouseId=person.id;
    person.marriages.push({spouseId:spouse.id,year:world.year});
    spouse.marriages.push({spouseId:person.id,year:world.year});
    // Seed a few historically possible existing children, with no post-foundation birth events.
    const maxChildAge=Math.max(0,Math.min(12,Math.min(world.year-person.birthYear,world.year-spouse.birthYear)-18));
    const count=maxChildAge>0?randomInt(world,3):0;
    for(let c=0;c<count;c++) {
      const childAge=1+randomInt(world,maxChildAge);
      addPerson(world,{sex:randomInt(world,2)===0?'male':'female',dynastyId:person.dynastyId,
        birthYear:world.year-childAge,parentIds:person.sex==='male'?[person.id,spouse.id]:[spouse.id,person.id]});
    }
  }
}
export function migrateV2(world) {
  if(world.schemaVersion!==2)throw new RangeError('Not a v2 save');
  // Keep old RNG, financial history, existing people, and titles intact.
  // No invented births or retroactive spouses are placed into historical years.
  world.schemaVersion=3;
  world.nextPersonId=Math.max(...world.people.map(p=>idNumber(p.id)))+1;
  world.stats={...world.stats,births:0,deaths:0,marriages:0,escheats:0,partitions:0};
  for(const [i,p] of world.people.entries())Object.assign(p,{
    sex:i%2?'female':'male',parentIds:[null,null],spouseId:null,marriages:[],
    alive:true,deathYear:null,origin:'v2-migrated'
  });
  for(const [i,t] of world.titles.entries())Object.assign(t,{
    law:t.rank==='kingdom'?'primogeniture':i%3===0?'partition':'primogeniture',
    claims:[],history:[{year:world.year,from:null,to:t.holderId,cause:'v2-migration-baseline'}]
  });
  recordEvent(world,'migration','schema-v2-to-v3',{year:world.year,people:world.people.length});
  return world;
}
export function demographicYear(world) {
  // Snapshot is vital: newborns cannot marry or die during the year of birth.
  const cohort=[...world.people];
  for(const person of cohort) {
    if(!person.alive)continue;
    const age=world.year-person.birthYear;
    const risk=age>=102?1000:age>=85?300:age>=75?125:age>=65?58:
      age>=55?20:age>=40?5:age<=3?22:age<=12?5:3;
    if(randomInt(world,1000)<risk)die(world,{personId:person.id,cause:'age-and-health'});
  }
  if(world.schemaVersion<4) for(const person of cohort) {
    if(!person.alive||person.spouseId)continue;
    const age=world.year-person.birthYear;
    if(age<19||age>(person.sex==='female'?39:54))continue;
    const titled=titlesOf(world,person.id).length>0;
    const childOfLord=person.parentIds.some(id=>id && titlesOf(world,id).length);
    if(!titled&&!childOfLord)continue;
    if(randomInt(world,1000)>=260)continue;
    const partners=world.people.filter(p=>p.alive&&!p.spouseId&&p.sex!==person.sex&&p.id!==person.id&&
      world.year-p.birthYear>=18&&world.year-p.birthYear<=54&&
      Math.abs(p.birthYear-person.birthYear)<=16&&!closelyRelated(world,p.id,person.id));
    partners.sort((a,b)=>a.dynastyId===person.dynastyId?1:b.dynastyId===person.dynastyId?-1:seniority(a,b));
    const partner=partners[0]??bringOutsider(world,person.sex==='male'?'female':'male',person,'marriage-market');
    marry(world,{personAId:person.id,personBId:partner.id,cause:'household-formation'});
  }
  for(const mother of cohort) {
    if(!mother.alive||mother.sex!=='female'||!mother.spouseId)continue;
    const father=findPerson(world,mother.spouseId);
    if(!father?.alive||father.sex!=='male')continue;
    const age=world.year-mother.birthYear;
    if(age<18||age>42||world.year-father.birthYear>75)continue;
    const children=world.people.filter(p=>p.parentIds.includes(mother.id)&&p.parentIds.includes(father.id));
    if(children.length>=4)continue;
    const last=Math.max(-9999,...children.map(p=>p.birthYear));
    if(world.year-last<2)continue;
    if(randomInt(world,1000)<225)birth(world,{motherId:mother.id,fatherId:father.id,cause:'annual-household-fertility'});
  }
}
