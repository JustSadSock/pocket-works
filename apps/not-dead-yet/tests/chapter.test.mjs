import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Apartment,ITEMS,HOME,hash} from '../apartment.mjs';
import {createSoundscape} from '../soundscape.mjs';
import {chapterJournal,chapterEnding} from '../story.mjs';
const appText=readFileSync(new URL('../app.mjs',import.meta.url),'utf8').replace(/^import [^\n]*\n/gm,'');
const appFunction=new Function('Apartment','ITEMS','HOME','hash','Renderer','createSoundscape','chapterJournal','chapterEnding','document','window','localStorage','performance','requestAnimationFrame','navigator','crypto',appText+'\nreturn {get:()=>({phase,position:{...player},seed:world.seed,inventory:[...inventory],ammo,reserve,stress,shifts:world.changes}),getWorld:()=>world,getPlayer:()=>player,interact,shoot,reload,save:persist};');
function boot(){
 const dom=new Map(),listeners=new Map(),storage=new Map(),frames=[];
 function el(id){
  if(!dom.has(id)){
   const callbacks={},styles={},classNames=new Set();
   dom.set(id,{id,textContent:'',hidden:false,style:styles,children:[],className:'',
    classList:{add:n=>classNames.add(n),remove:n=>classNames.delete(n),toggle:(n,v)=>{if(v??!classNames.has(n))classNames.add(n);else classNames.delete(n)}},
    addEventListener:(k,fn)=>{callbacks[k]=fn},fire:(k,e={})=>callbacks[k]?.(e),
    replaceChildren(){this.children=[]},append(...nodes){this.children.push(...nodes)},
    setPointerCapture(){},getBoundingClientRect(){return{width:390,height:844,left:0,top:0}},requestPointerLock(){return Promise.resolve()}
   })
  }return dom.get(id)
 }
 const document={getElementById:el,createElement:()=>({textContent:'',className:'',children:[],append(...x){this.children.push(...x)}}),
  addEventListener:(event,fn)=>listeners.set(event,fn),pointerLockElement:null,exitPointerLock(){}};
 const window={matchMedia:()=>({matches:false}),addEventListener(){},innerWidth:390};
 const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 class Renderer{constructor(){this.lost=false}draw(){}}
 let time=0,seed=1000;
 const runtime=appFunction(Apartment,ITEMS,HOME,hash,Renderer,createSoundscape,chapterJournal,chapterEnding,document,window,localStorage,{now:()=>time},fn=>frames.push(fn),{vibrate(){}},{getRandomValues(x){x[0]=++seed;return x}});
 const frame=n=>{for(let i=0;i<n;i++){time+=16;frames.shift()?.(time)}};
 const tickMs=ms=>{time+=ms;frames.shift()?.(time)};
 const key=(name,down=true)=>listeners.get(down?'keydown':'keyup')?.({key:name,preventDefault(){},repeat:false});
 return{runtime,el,key,frame,tickMs,listeners,storage}
}
test('start, keyboard movement and mouse look are independent of pointer lock',()=>{
 const x=boot();x.el('start').fire('click');x.frame(1);
 assert.equal(x.runtime.get().phase,'play');
 const a=x.runtime.get().position;
 x.key('w');x.frame(130);x.key('w',false);
 const b=x.runtime.get().position;
 assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>2,'movement is silently blocked');
 x.el('touchLook').fire('pointerdown',{pointerId:7,clientX:260,clientY:400,preventDefault(){}});
 x.el('touchLook').fire('pointermove',{pointerId:7,clientX:340,clientY:421});
 x.el('touchLook').fire('pointerup',{pointerId:7});
 assert.ok(Math.abs(x.runtime.get().position.yaw-b.yaw)>.2,'look control does not respond');
});
test('inventory objectives can all be collected and front door ends the chapter',()=>{
 const x=boot();x.el('start').fire('click');x.frame(1);
 for(const i of ITEMS){const p=x.runtime.getWorld().itemPosition(i.id);Object.assign(x.runtime.getPlayer(),{x:p.x,z:p.z});x.runtime.interact()}
 assert.equal(x.runtime.get().inventory.length,4);
 Object.assign(x.runtime.getPlayer(),{x:HOME.x,z:20.9});
 x.runtime.interact();assert.equal(x.runtime.get().phase,'end');
 assert.equal(x.storage.has('pocket-works:not-dead-yet:chapter-one:v2'),false);
});
test('shooting consumes ammunition, reload restores the drum with a finite reserve',()=>{
 const x=boot();x.el('start').fire('click');x.frame(1);
 x.runtime.shoot();assert.equal(x.runtime.get().ammo,5);
 x.runtime.reload();x.frame(110);
 assert.equal(x.runtime.get().ammo,6);assert.equal(x.runtime.get().reserve,17);
});
test('restarting an ordinary new night never produces the same seed twice',()=>{
 const x=boot();x.el('start').fire('click');x.frame(1);
 const first=x.runtime.get().seed;
 x.el('new').fire('click'); // pause before asking for irreversible new game
 x.el('pause').fire('click');x.el('new').fire('click');x.el('erase').fire('click');x.frame(1);
 const second=x.runtime.get().seed;assert.notEqual(first,second);
});
test('pause and inventory always return to the gameplay and save real state',()=>{
 const x=boot();x.el('start').fire('click');x.frame(1);
 x.el('pack').fire('click');assert.equal(x.runtime.get().phase,'inventory');
 assert.ok(x.storage.has('pocket-works:not-dead-yet:chapter-one:v2'));
 x.el('closePack').fire('click');assert.equal(x.runtime.get().phase,'play');
 x.el('pause').fire('click');assert.equal(x.runtime.get().phase,'paused');
 x.el('resume').fire('click');assert.equal(x.runtime.get().phase,'play');
});

test('reloading lasts real time even when rendering falls to one frame per two seconds',()=>{
 const x=boot();x.el('start').fire('click');x.frame(1);
 x.runtime.shoot();assert.equal(x.runtime.get().ammo,5);
 x.runtime.reload();x.tickMs(1800);
 assert.equal(x.runtime.get().ammo,6,'real-time reload should finish despite a very slow render frame');
 assert.equal(x.runtime.get().reserve,17);
});

test('a single slow WebKit-style frame preserves expected walking distance without tunnelling',()=>{
 const x=boot();x.el('start').fire('click');x.frame(1);
 const first=x.runtime.get().position;
 x.key('w');x.tickMs(520);x.key('w',false);
 const next=x.runtime.get().position;
 assert.ok(Math.hypot(next.x-first.x,next.z-first.z)>.30,'walking speed must use real elapsed time on mobile');
 assert.ok(x.runtime.getWorld().canStand(next.x,next.z),'large movement frame passed through a wall');
});


test('radio tuning is real interaction after finding the album; journal has an authored entry',()=>{
 const x=boot();x.el('start').fire('click');x.frame(1);
 const w=x.runtime.getWorld(),album=w.itemPosition('album');
 Object.assign(x.runtime.getPlayer(),{x:album.x,z:album.z});
 x.runtime.interact();
 assert.ok(x.runtime.get().inventory.includes('album'));
 const p=w.radioPosition(),offsets=[[0,1.25],[0,-1.25],[1.45,0],[-1.45,0],[0,1.65],[0,-1.65]];
 const safe=offsets.map(([dx,dz])=>({x:p.x+dx,z:p.z+dz})).find(q=>w.canStand(q.x,q.z)&&w.visible(q.x,q.z,p.x,p.z));
 assert.ok(safe);
 Object.assign(x.runtime.getPlayer(),safe);
 x.runtime.interact();assert.equal(w.radio.channel,1);
 x.runtime.interact();assert.equal(w.radio.channel,2);
 assert.equal(w.radio.heard,true);
 assert.ok(w.save().radio.heard);
 x.el('pack').fire('click');
 assert.equal(x.el('journalList').children.length,1);
 assert.match(x.el('journalStatus').textContent,/Голос/);
 x.el('closePack').fire('click');
 assert.equal(x.runtime.get().phase,'play');
});
