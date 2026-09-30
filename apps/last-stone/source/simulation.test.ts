import { describe,it,expect } from 'vitest';
import { newGame,build,remove,repair,startWave,tick,loadGame,saveGame,MAX_HP } from './simulation';

describe('castle campaign',()=>{
  it('spends materials, salvages damaged masonry, and preserves a valid save',()=>{
    const s=newGame();
    expect(build(s,'wall',4,3)).toBeNull();
    expect(s.stone).toBe(192);
    s.pieces[0].hp=40;
    const before=s.stone;
    expect(repair(s,4,3)).toBeNull();
    expect(s.pieces[0].hp).toBe(MAX_HP.wall);
    expect(s.stone).toBeLessThan(before);
    expect(remove(s,4,3)).toBeNull();
    expect(s.pieces).toHaveLength(0);
    expect(loadGame(saveGame(s)).stone).toBe(s.stone);
    expect(loadGame('{"version":1,"pieces":[{"kind":"unknown"}]}').pieces).toHaveLength(0);
  });
  it('resolves a full siege into defeat without any defenses',()=>{
    const s=newGame();startWave(s);
    for(let i=0;i<9000&&s.phase==='siege';i++)tick(s,1/30);
    expect(s.phase).toBe('lost');
    expect(s.keep).toBe(0);
  });
  it('rejects inaccessible or duplicate construction',()=>{
    const s=newGame();
    expect(build(s,'archer',4,4)).toMatch(/нужна стена/);
    expect(build(s,'wall',5,5)).toMatch(/донжон/);
    expect(build(s,'wall',4,3)).toBeNull();
    expect(build(s,'wall',4,3)).toMatch(/занято/);
    expect(build(s,'archer',4,2)).toBeNull();
  });
});

import {upgrade,maxHP,pieceAt,canBuild} from './simulation';
function ring(){
  const s=newGame();
  for(let z=3;z<=7;z++)for(let x=3;x<=7;x++)if(x===3||x===7||z===3||z===7){
    const kind=(x===3||x===7)&&(z===3||z===7)?'tower':x===5&&z===3?'gate':'wall';
    expect(build(s,kind,x,z)).toBeNull();
  }
  return s;
}
it('completes a built castle siege and preserves damage for reconstruction',()=>{
  const s=ring();startWave(s);let hits=0,breaks=0;const types=new Set();
  for(let i=0;i<12000&&s.phase==='siege';i++){
    tick(s,1/30);hits+=s.events.filter(e=>e.type==='hit').length;breaks+=s.events.filter(e=>e.type==='break').length;
    for(const e of s.enemies)types.add(e.type);
  }
  expect(hits).toBeGreaterThan(0);expect(breaks).toBeGreaterThan(0);
  expect(s.phase).toBe('build');expect(s.wave).toBe(2);expect(types.has('ram')).toBe(true);
  expect(s.keep).toBeGreaterThan(0);expect(s.stone).toBeGreaterThan(0);
});
it('keeps infantry outside an intact enclosure and opens the route when it breaks',()=>{
  const s=ring();s.pieces=s.pieces.map(p=>({...p,kind:p.kind==='tower'?'wall':p.kind}));startWave(s);
  let broken=false,inside=false;
  for(let i=0;i<8000&&s.phase==='siege';i++){
    tick(s,1/30);if(s.events.some(e=>e.type==='break'))broken=true;
    for(const e of s.enemies){if(e.x>3&&e.x<7&&e.z>3&&e.z<7){expect(broken).toBe(true);inside=true;}}
  }
  expect(broken).toBe(true);expect(inside).toBe(true);expect(s.phase).toBe('lost');
});
it('persists upgrades, caps repairs and rejects fractional or poisoned saves',()=>{
  const s=newGame();build(s,'tower',3,3);expect(upgrade(s,3,3)).toBeNull();const p=s.pieces[0];
  expect(maxHP(p)).toBe(240);p.hp=60;expect(repair(s,3,3)).toBeNull();expect(p.hp).toBe(240);
  expect(loadGame(saveGame(s)).pieces[0]).toEqual(p);expect(canBuild(s,'wall',3.5,3)).not.toBeNull();
  const bad=JSON.parse(saveGame(s));bad.stone=-100;expect(loadGame(JSON.stringify(bad)).stone).toBe(200);
});
it('ladder units cross walls without tunnelling through a second occupied cell',()=>{
  const s=ring();s.pieces=s.pieces.map(p=>({...p,kind:'wall'}));startWave(s);s.spawned=8;
  s.enemies=[{id:1,x:5,z:2,hp:48,maxHp:48,speed:.8,attack:9,type:'ladder',cooldown:0}];
  let climbing=false;
  for(let i=0;i<200&&s.phase==='siege';i++){tick(s,1/30);for(const e of s.enemies)if(e.climb){climbing=true;expect(pieceAt(s,e.climb.x,e.climb.z)).toBeUndefined();}}
  expect(climbing).toBe(true);
});

it('resumes an interrupted siege with the same soldiers, arrows and elapsed time',()=>{
  const s=ring();startWave(s);for(let i=0;i<160;i++)tick(s,1/30);
  const restored=loadGame(saveGame(s));expect(restored.phase).toBe('siege');expect(restored.enemies).toEqual(s.enemies);expect(restored.elapsed).toBe(s.elapsed);
  for(let i=0;i<100;i++){tick(s,1/30);tick(restored,1/30);}
  expect(saveGame(restored)).toBe(saveGame(s));
});
