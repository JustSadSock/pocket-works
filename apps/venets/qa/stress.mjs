// Headless campaign runner for CI and release-gate reports.
// node apps/venets/qa/stress.mjs --seeds=100 --years=50 [--output=/tmp/venets-report.json]
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createWorld, advanceYears, summary, assertWorld, serializeWorld, loadWorld } from '../sim/world.js';

const options = Object.fromEntries(process.argv.slice(2).map(raw => {
  const match = /^--([a-z]+)=(.+)$/.exec(raw);
  if (!match) throw new RangeError('Unexpected argument ' + raw);
  return [match[1], match[2]];
}));
if (Object.keys(options).some(k => !['seeds','years','output','offset'].includes(k))) throw Error('Unsupported option');
const seeds = Number(options.seeds ?? 100);
const years = Number(options.years ?? 50);
const offset = Number(options.offset ?? 0);
if (![seeds, years, offset].every(Number.isSafeInteger) || seeds < 1 || seeds > 1000 ||
    years < 1 || years > 200 || offset < 0 || offset + seeds > 0x100000000) {
  throw new RangeError('Invalid seed/years/offset bounds');
}
const aggregate = { seeds, years, auditedYears: 0, shortages: 0, worldsWithShortages: 0, births: 0, deaths: 0, marriages: 0, partitions: 0,
  totalHarvest: 0, totalTrade: 0, firstSeed: offset, lastSeed: offset + seeds - 1,
  firstWorld: null, lastWorld: null };
for(let index=0; index<seeds; index++){
  const seed = offset + index;
  const world=createWorld(seed);
  advanceYears(world,years);
  const snapshot = serializeWorld(world);
  const restored=loadWorld(snapshot);
  const check=assertWorld(restored);
  if(check.year !== 1066 + years || world.stats.years !== years) throw Error('Calendar drift for seed ' + seed);
  if(serializeWorld(restored) !== snapshot) throw Error('Save/load drift for seed ' + seed);
  const report=summary(world);
  aggregate.auditedYears += years;
  aggregate.shortages += report.shortages;
  aggregate.worldsWithShortages += Number(report.shortages > 0);
  aggregate.totalHarvest += report.harvested;
  aggregate.totalTrade += report.minted;
  aggregate.births += report.births;
  aggregate.deaths += report.deaths;
  aggregate.marriages += report.marriages;
  aggregate.partitions += report.partitions;
  const sample={ seed, year:report.year, grain:report.resources.grain,
    coin:report.resources.coin, events:report.events, shortages:report.shortages,
    births:report.births, deaths:report.deaths, alive:report.alive,
    marriages:report.marriages, partitions:report.partitions,
    ledger:report.ledger };
  if(index===0)aggregate.firstWorld=sample;
  if(index===seeds-1)aggregate.lastWorld=sample;
}
aggregate.passed=true;
const json=JSON.stringify(aggregate,null,2)+'\n';
if(options.output){
  mkdirSync(dirname(options.output),{recursive:true});
  writeFileSync(options.output,json);
}
process.stdout.write(json);
