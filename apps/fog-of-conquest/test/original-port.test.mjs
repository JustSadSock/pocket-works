import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const unitNames=['swordsman','archer','heavy','cavalry','mage','bog'];
const buildingNames=['base','barracks','stable','mageTower','mill','fort'];
function originalWorld(h,w){
  const g={console,Math};g.window=g;g.global=g;
  vm.createContext(g);
  for(const file of ['js/data.js','js/gameState.js','js/worldGen.js'])
    vm.runInContext(read(file),g,{filename:file});
  g.ROWS=h;g.COLS=w;g.generateWorld(false);return g;
}
function connected(g){
  const visited=new Set(['1,1']),queue=[[1,1]];
  for(let i=0;i<queue.length;i++){
    const [r,c]=queue[i];
    for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const rr=r+dr,cc=c+dc,k=rr+','+cc;
      if(rr<0||rr>=g.ROWS||cc<0||cc>=g.COLS||visited.has(k)||[1,4].includes(g.map[rr][cc]))continue;
      visited.add(k);queue.push([rr,cc]);
    }
  }
  return visited.has((g.ROWS-2)+','+(g.COLS-2));
}
test('original unit/building roster and parameters are unchanged',()=>{
  const g=originalWorld(20,30);
  assert.deepEqual(Object.keys(g.UNIT_TYPES).sort(),unitNames.slice().sort());
  assert.deepEqual(Object.keys(g.BUILD_TYPES).sort(),buildingNames.slice().sort());
  assert.equal(g.UNIT_TYPES.swordsman.hpMax,5);
  assert.equal(g.UNIT_TYPES.archer.range,2);
  assert.equal(g.UNIT_TYPES.cavalry.move,3);
  assert.equal(g.UNIT_TYPES.bog.hpMax,1000);
  assert.equal(g.BUILD_TYPES.mill.genUp,2);
});
test('all four source map sizes keep connected bases',()=>{
  for(const [h,w] of [[5,8],[10,15],[20,30],[20,60]])
    for(let n=0;n<5;n++){
      const g=originalWorld(h,w);
      assert.equal(g.map.length,h);
      assert(g.map.every(row=>row.length===w));
      assert(connected(g),'Disconnected '+h+'x'+w+' on run '+n);
      assert.equal(g.buildings.filter(b=>b.type==='base').length,2);
      assert.equal(g.units.filter(u=>u.owner===1).length,2);
      assert.equal(g.units.filter(u=>u.owner===2).length,2);
      assert(g.buildings.some(b=>b.type==='mill'&&b.owner===1));
    }
});
test('all original visual packs and icon are present',()=>{
  const illustrations=fs.readdirSync(path.join(root,'assets(ai)')).filter(f=>f.endsWith('.png'));
  const classic=fs.readdirSync(path.join(root,'assets','tiles')).filter(f=>f.endsWith('.png'));
  assert(illustrations.length>=28);
  assert(classic.length>=12);
  for(const f of ['assets/icon.png','assets(ai)/main_castle_ally.png','assets/units/archer_enemy.png','assets/buildings/windmill.png'])
    assert(fs.statSync(path.join(root,f)).size>50);
});
test('original combat, replay, saves, visuals and AI options are wired',()=>{
  const ui=read('js/ui.js'),html=read('index.html');
  for(const signature of ['function doAttack(','function computeZone(','function saveGame(','function updateFog('])
    assert(ui.includes(signature));
  assert(html.includes('js/replay.js'));
  for(let i=0;i<=6;i++)assert(html.includes('value="'+i+'"'),'AI '+i+' absent');
  for(const theme of ['simple','toen','ai'])assert(html.includes('value="'+theme+'"'));
});
