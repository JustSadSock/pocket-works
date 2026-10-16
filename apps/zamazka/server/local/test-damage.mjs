import {strict as assert} from 'node:assert';
import {W,H,ARTS,PLAYABLE_IDS,REAL_COUNT,zoneFor,insideDamage,artworkURL} from '../../artworks.js';
assert.equal(REAL_COUNT,136);
assert.equal(PLAYABLE_IDS.length,109);
assert(ARTS.slice(0,REAL_COUNT).every(a=>a.isReal&&a.source));
assert.equal(PLAYABLE_IDS[0],1);
const types=new Set(),positions=new Set();
for(const id of PLAYABLE_IDS){
 for(let seed=0;seed<80;seed++){
  const z=zoneFor(id,seed*90342+7);
  assert.deepEqual(z,zoneFor(id,seed*90342+7),'Damage must be reproducible from seed');
  assert(z.x>=0&&z.y>=0&&z.x+z.w<=W&&z.y+z.h<=H,'Damage cannot exit picture');
  assert(z.points.length>=4&&z.points.length<=32);
  assert(insideDamage(z,[z.x+z.w/2,z.y+z.h/2]),'Damage center should be painted');
  assert(!insideDamage(z,[0,0]),'Outside point should not be paintable');
  types.add(z.kind);positions.add(Math.floor(z.x)+'/'+Math.floor(z.y));
 }
}
assert.equal(types.size,6,'All 6 randomized silhouettes must be reachable');
assert(positions.size>500,'Damage placement should not be memorized');
for(let i=1;i<REAL_COUNT;i++)assert(artworkURL(i).startsWith('https://'));
console.log('PASS: '+REAL_COUNT+' authentic works, 6 randomized contours, seeded deterministic masks and '+positions.size+' different locations');
