import fs from 'node:fs';
import vm from 'node:vm';

const source = [1, 2, 3, 4].map((part) => fs.readFileSync(new URL(`../runtime/v4/16-0${part}.txt`, import.meta.url), 'utf8')).join('\n');
const context = { globalThis: {} };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context);
export const Core = context.CladaMetacommunityCore;

function hash(value) {
  let x = value | 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  return x >>> 0;
}

export function patches(seed = 1) {
  const biomes = [
    ['ocean','shallows','wetland','forest'],
    ['ocean','shallows','grassland','scrub'],
    ['ocean','wetland','highland','forest']
  ];
  const result = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) {
    const biome = biomes[y][x];
    const water = biome === 'ocean' || biome === 'shallows';
    const coast = biome === 'shallows' || biome === 'wetland';
    const id = `${x}${y}${water ? (x < 1 ? 'W' : 'E') : coast ? 'C' : biome === 'highland' ? 'M' : 'L'}`;
    result.push({
      id, x: (x + .5) / 4, y: (y + .5) / 3, biome, water, coast,
      temperature: .45 + y * .08 - (biome === 'highland' ? .25 : 0),
      moisture: water ? .94 : biome === 'wetland' ? .84 : biome === 'forest' ? .72 : biome === 'grassland' ? .52 : biome === 'highland' ? .38 : .31,
      elevation: water ? .2 : biome === 'highland' ? .82 : .52,
      neighbors: []
    });
  }
  for (const p of result) {
    p.neighbors = result.filter(q => Math.abs(q.x - p.x) <= .26 && Math.abs(q.y - p.y) <= .35 && q.id !== p.id).map(q => q.id);
  }
  return result;
}

const TRAITS = {
  grazer: { thermal:.55,moisture:.5,altitude:.35,water:.08,size:.42,speed:.52,prey:.05,plant:.92,filter:.02,carrion:.08,nocturnal:.25,mateChoice:.38,migration:.48,fertility:.68,parentalCare:.32,armor:.28,social:.58 },
  browser: { thermal:.54,moisture:.62,altitude:.42,water:.08,size:.7,speed:.4,prey:.04,plant:.9,filter:.01,carrion:.08,nocturnal:.22,mateChoice:.42,migration:.35,fertility:.48,parentalCare:.62,armor:.48,social:.42 },
  predator: { thermal:.56,moisture:.5,altitude:.38,water:.08,size:.58,speed:.7,prey:.92,plant:.04,filter:.01,carrion:.28,nocturnal:.4,mateChoice:.55,migration:.5,fertility:.45,parentalCare:.58,armor:.25,social:.55 },
  scavenger: { thermal:.56,moisture:.45,altitude:.35,water:.1,size:.42,speed:.52,prey:.32,plant:.12,filter:.01,carrion:.92,nocturnal:.45,mateChoice:.32,migration:.62,fertility:.58,parentalCare:.35,armor:.28,social:.38 },
  filterer: { thermal:.54,moisture:.9,altitude:.2,water:.94,size:.28,speed:.42,prey:.05,plant:.08,filter:.95,carrion:.08,nocturnal:.22,mateChoice:.35,migration:.58,fertility:.72,parentalCare:.22,armor:.15,social:.48 },
  amphibian: { thermal:.56,moisture:.84,altitude:.28,water:.52,size:.36,speed:.48,prey:.42,plant:.45,filter:.12,carrion:.12,nocturnal:.4,mateChoice:.42,migration:.62,fertility:.64,parentalCare:.38,armor:.18,social:.42 },
  burrower: { thermal:.58,moisture:.3,altitude:.4,water:.04,size:.18,speed:.32,prey:.12,plant:.74,filter:.01,carrion:.12,nocturnal:.72,mateChoice:.3,migration:.25,fertility:.78,parentalCare:.2,armor:.44,social:.25 },
  flyer: { thermal:.56,moisture:.48,altitude:.45,water:.08,size:.24,speed:.72,prey:.42,plant:.5,filter:.01,carrion:.1,nocturnal:.25,mateChoice:.72,migration:.78,fertility:.62,parentalCare:.4,armor:.12,social:.42 }
};

export function makeCommunity({seed=1, mode='mature', food=.62, mutation=.24, single=false}={}) {
  const ps = patches(seed);
  const guilds = single ? ['grazer'] : mode === 'primordial' ? ['filterer','amphibian','grazer'] : ['grazer','browser','predator','scavenger','filterer','amphibian','burrower','flyer'];
  const species = guilds.map((guild, i) => ({ id:i+1, born:0, guild, traits:{...TRAITS[guild]}, anchor:{...TRAITS[guild]}, extinctionDebt:0, lastSpeciationGeneration:0, extinct:false }));
  const preferred = {
    grazer:['12L','22L','32L'], browser:['03L','33L'], predator:['12L'], scavenger:['22L'],
    filterer:['00W','01W','02W','10E','11E'], amphibian:['20C','21C'], burrower:['31L'], flyer:['13L','23L']
  };
  const demes=[]; let nextDemeId=1;
  for (const s of species) {
    const ids = preferred[s.guild] || [ps.find(p=>!p.water)?.id];
    for (let j=0;j<Math.min(ids.length, s.guild==='filterer'?2:1);j++) {
      const patchId = ps.some(p=>p.id===ids[j]) ? ids[j] : ps.find(p=> s.guild==='filterer'?p.water:!p.water).id;
      demes.push({ id:nextDemeId++, speciesId:s.id, patchId, guild:s.guild, abundance: s.guild==='predator'?8:s.guild==='scavenger'?10:s.guild==='filterer'?18:16, age:20, traits:{...s.traits}, anchor:{...s.traits}, isolation:0,geneFlow:0,lowYears:0,founded:0 });
    }
  }
  return { modelVersion:2, generation:0, rng:hash(seed*19937+17), env:{food,mutation,temperature:.52}, patches:ps, species, demes, resources:{}, events:[], nextDemeId, metrics:{speciations:0,localExtinctions:0,colonizations:0}, nextSpeciesId:species.length+1 };
}

export function runCommunity(options={}, generations=1000) {
  const c = makeCommunity(options);
  const checkpoints=[];
  for(let g=0;g<generations;g++) {
    const {proposals}=Core.advance(c);
    for(const p of proposals) Core.applySpeciation(c,p,{id:c.nextSpeciesId++,niche:p.mode});
    if ([49,99,199,249,499,749,999].includes(g)) checkpoints.push(Core.summarize(c));
  }
  return {community:c,summary:Core.summarize(c),checkpoints};
}
