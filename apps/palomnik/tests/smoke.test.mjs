import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const base=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const original=readFileSync(resolve(base,'app.js'),'utf8');
const source='const createWorkshopMode=()=>({});\n'+original.replace(/^import[^\n]*\n/gm,'').replace(/^installMobileRuntime\(\);\s*/,'')
  + '\nreturn {get state(){return state},get mode(){return mode},get loaded(){return loaded},get targets(){return targets},tile,placeTargets,begin,showModal,applyStep,save,read};';

function open(memory=new Map()) {
 const nodes=new Map();
 const context={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}};
 const node=id=>({id,textContent:'',hidden:false,style:{},firstChild:{textContent:''},width:360,height:700,
   listeners:{},getContext:()=>context,getBoundingClientRect:()=>({left:0,top:0,width:390,height:844}),
   classList:{add(){},remove(){}},setAttribute(){},addEventListener(event,handler){this.listeners[event]=handler},
   setPointerCapture(){}});
 const document={hidden:false,createElement:tag=>node(tag),getElementById(id){if(!nodes.has(id))nodes.set(id,node(id));return nodes.get(id)},listeners:{},addEventListener(name,fn){this.listeners[name]=fn}};
 const window={listeners:{},addEventListener(name,fn){this.listeners[name]=fn}};
 const storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
 const boot=new Function('document','window','matchMedia','localStorage','requestAnimationFrame','performance','setTimeout','clearTimeout',source);
 const api=boot(document,window,()=>({matches:true}),storage,()=>0,{now:()=>1000},()=>0,()=>{});
 return {api,document,nodes,memory,press(id){const fn=nodes.get(id)?.listeners.click;assert.equal(typeof fn,'function',id+' click listener missing');fn()}};
}

function solve(seed,api){
 let states=[{row:1,heat:12,hull:3,path:[]}];
 for(let step=1;step<=21;step++){
  const next=new Map();
  for(const s of states)for(let row=0;row<3;row++){
   if(Math.abs(row-s.row)>1)continue;
   const kind=api.tile(step,row).kind; // tile() reads state.seed
   let heat=s.heat-(row===s.row?1:2),hull=s.hull;
   if(kind==='ember')heat=Math.min(12,heat+3);
   if(kind==='crack')hull--;
   if(kind==='void')heat-=3;
   if(step===7||step===14){heat=Math.min(12,heat+2);hull=Math.min(3,hull+1)}
   if(heat<=0||hull<=0)continue;
   const key=row+':'+heat+':'+hull;
   if(!next.has(key))next.set(key,{row,heat,hull,path:[...s.path,row]});
  }
  states=[...next.values()];
  if(!states.length)return null;
 }
 return states.sort((a,b)=>b.heat-a.heat)[0].path;
}

const game=open();
assert.equal(game.api.mode,'intro');
assert.equal(game.api.state.step,0);
game.press('primary');
assert.equal(game.api.mode,'playing');
assert.equal(game.nodes.get('hud').hidden,false);
game.api.placeTargets();
assert.equal(game.api.targets.length,3);
const first=game.api.targets.find(v=>v.row===1);
game.api.applyStep(first);
assert.equal(game.api.state.step,1);
assert.equal(game.api.state.heat,first.kind==='ember'?12:11-(first.kind==='void'?3:0));
assert.ok(game.memory.has('pocket-works:palomnik:expedition:v1'));
game.press('pause');
assert.equal(game.api.mode,'paused');
game.press('primary');
assert.equal(game.api.mode,'playing');
game.press('pause');
game.press('secondary');
assert.equal(game.api.mode,'confirm');
game.press('primary');
assert.equal(game.api.mode,'paused');
game.press('secondary');
game.press('secondary');
assert.equal(game.api.mode,'playing');
assert.equal(game.api.state.step,0);
game.api.state.hull=1;
game.api.applyStep({row:game.api.state.row,kind:'crack'});
assert.equal(game.api.mode,'dead');
game.press('primary');
assert.equal(game.api.mode,'playing');
assert.equal(game.api.state.hull,3);
game.api.state.step=20;
game.api.applyStep({row:game.api.state.row,kind:'safe'});
assert.equal(game.api.mode,'win');
game.press('primary');
assert.equal(game.api.state.step,0);
game.api.state.seed=41;
game.api.save();
const saved=open(game.memory);
assert.equal(saved.api.loaded,true);
assert.equal(saved.api.state.seed,41);
saved.press('primary');
const route=solve(41,saved.api);
assert.ok(route&&route.length===21,'There must be a solvable complete route');
for(let i=0;i<route.length;i++){
 const row=route[i],kind=saved.api.tile(i+1,row).kind;
 saved.api.applyStep({row,kind});
}
assert.equal(saved.api.mode,'win');
assert.equal(saved.api.state.step,21);
assert.equal(saved.memory.has('pocket-works:palomnik:expedition:v1'),false);
console.log('ПАЛОМНИК: boot, persistence, pause, reset, death, choice and 21-step victory passed.');
