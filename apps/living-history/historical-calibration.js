// Read-only historical calibration instruments. Benchmarks are published
// estimates, not forcing targets and NEVER modify the simulated world.
const ACRE=0.40468564224;
const LAND_STRIP_HA=0.0625;
export const REFERENCES=Object.freeze({
 demography:{label:'La Poutré & Paping (2025), English Familial Demography c. 1300',
  uri:'https://doi.org/10.1017/ssh.2025.17',scope:'England c.1300, reconstruction, uncertain'},
 tenure:{label:'Kanzaka (2025), Hundred Rolls 1279–1280, sample of customary holdings',
  uri:'https://doi.org/10.1007/s11698-025-00315-9',
  scope:'sample of observed customary tenements; 86.1% at least half a virgate, NOT all English farms'},
 crops:{label:'Bruce Campbell, English Seigniorial Agriculture, 1250–1450',
  uri:'https://www.cambridge.org/core/books/english-seigniorial-agriculture-12501450/3463BB75D129196B5BACDDCC3CE3D2E7',
  scope:'productivity varies by crop, region and year; no one universal crop yield target'}
});
export const REFERENCE_POINTS=Object.freeze({
 femaleFirstMarriage:{value:24,unit:'years',source:'demography'},
 maleFirstMarriage:{value:27,unit:'years',source:'demography'},
 householdSize:{value:5.8,unit:'persons',source:'demography'},
 customaryTenementsAbove10Acres:{value:0.861,unit:'share',source:'tenure'}
});
const round=(v,d=3)=>Number(v.toFixed(d));
export function quantiles(raw){
 const x=raw.filter(Number.isFinite).sort((a,b)=>a-b);
 if(!x.length)return {n:0,p10:null,median:null,p90:null,mean:null,min:null,max:null};
 const q=p=>{const i=(x.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return round(x[lo]+(x[hi]-x[lo])*(i-lo));};
 return {n:x.length,p10:q(.1),median:q(.5),p90:q(.9),mean:round(x.reduce((a,b)=>a+b,0)/x.length),min:x[0],max:x[x.length-1]};
}
export function historicalObservation(s){
 const alive=s.people.filter(p=>p.alive),livingPerHome=new Map();
 for(const p of alive)livingPerHome.set(p.houseId,(livingPerHome.get(p.houseId)||0)+1);
 const inhabited=s.households.filter(h=>livingPerHome.has(h.id));
 const femaleAges=s.people.filter(p=>p.sex==='f'&&Number.isFinite(p.firstMarriageAge)).map(p=>p.firstMarriageAge);
 const maleAges=s.people.filter(p=>p.sex==='m'&&Number.isFinite(p.firstMarriageAge)).map(p=>p.firstMarriageAge);
 const allCustomary=s.households.filter(h=>h.tenure==='customary'&&h.tenureOrigin==='initial-settlement');
 const customaryLarge=allCustomary.filter(h=>h.fields.length*LAND_STRIP_HA/ACRE>10).length;
 return {
  seed:s.seed,year:Math.floor(s.day/365),scenario:s.scenario,population:alive.length,
  totalPeople:s.people.length,inhabitedHomes:inhabited.length,
  householdSize:inhabited.length?round(alive.length/inhabited.length):null,
  householdSizeDistribution:quantiles(inhabited.map(h=>livingPerHome.get(h.id))),
  femaleFirstMarriage:femaleAges.length?round(femaleAges.reduce((a,b)=>a+b,0)/femaleAges.length):null,
  maleFirstMarriage:maleAges.length?round(maleAges.reduce((a,b)=>a+b,0)/maleAges.length):null,
  firstMarriagesObserved:Math.min(femaleAges.length,maleAges.length),
  femaleFirstMarriagesObserved:femaleAges.length,maleFirstMarriagesObserved:maleAges.length,
  femaleFirstMarriageDistribution:quantiles(femaleAges),
  maleFirstMarriageDistribution:quantiles(maleAges),
  customaryTenementsAbove10Acres:allCustomary.length?round(customaryLarge/allCustomary.length):null,
  customarySampleSize:allCustomary.length,
  farmlandGini:gini( inhabited.filter(h=>h.tenure!=='demesne').map(h=>h.fields.length*LAND_STRIP_HA)),
  smallholdings:inhabited.filter(h=>h.tenure!=='demesne'&&h.fields.length*LAND_STRIP_HA/ACRE<=5).length,
  largeholdings:inhabited.filter(h=>h.tenure!=='demesne'&&h.fields.length*LAND_STRIP_HA/ACRE>10).length,
  harvestKg:s.stats.harvest||0,oatsHarvestKg:s.stats.oatsHarvested||0,
  pulsesHarvestKg:s.stats.pulsesHarvested||0,
  starvationDeaths:s.stats.starvationDeaths||0,allDeaths:s.stats.died||0,births:s.stats.born||0,
  wageGrainKg:s.stats.grainWagesKg||0,grainTradeKg:s.stats.outsideGrainIn||0,
  activeVillages:s.communities.filter(c=>inhabited.some(h=>h.communityId===c.id)).length,
  auditVersion:s.historicalProfile?.version||null
 };
}
function gini(values){
 const x=values.filter(v=>v>=0).sort((a,b)=>a-b),n=x.length,sum=x.reduce((a,b)=>a+b,0);
 return !n||!sum?0:round(2*x.reduce((a,b,i)=>a+b*(i+1),0)/(n*sum)-(n+1)/n);
}
export function historicalComparison(observation){
 return Object.entries(REFERENCE_POINTS).map(([metric,benchmark])=>{
  const observed=observation[metric],sample=metric==='femaleFirstMarriage'?observation.femaleFirstMarriagesObserved:
   metric==='maleFirstMarriage'?observation.maleFirstMarriagesObserved:
   metric.includes('customary')?observation.customarySampleSize:observation.inhabitedHomes;
  return {metric,observed,reference:benchmark.value,unit:benchmark.unit,source:benchmark.source,
   sampleSize:sample,delta:observed===null?null:round(observed-benchmark.value),
   // Explicit insufficiency instead of pretending one medieval village equals England.
   interpretation:observed===null||sample<8?'insufficient-sample':'illustrative-comparison'};
 });
}
export function summarizeHistoricalRuns(records){
 const keys=['population','householdSize','femaleFirstMarriage','maleFirstMarriage',
  'customaryTenementsAbove10Acres','starvationDeaths','births','allDeaths','farmlandGini'];
 const result=Object.fromEntries(keys.map(k=>[k,quantiles(records.map(r=>r[k]))]));
 return {runs:records.length,statistics:result,
  references:REFERENCES,
  limits:'A stylized four-village Midlands sample is NOT a representative dataset. Intervals here are Monte Carlo ranges, not historical confidence intervals. No population floor or forced benchmark matching.'};
}
