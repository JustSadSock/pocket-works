import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const themeSource=await fs.readFile(new URL('../theme.js',import.meta.url),'utf8');
const styleSource=await fs.readFile(new URL('../styles.css',import.meta.url),'utf8');
const htmlSource=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
const gameSource=await fs.readFile(new URL('../game.js',import.meta.url),'utf8');
function scenario({hour=12,systemDark=false,saved=null}={}){
  const listeners={};
  const attributes={};
  const store=new Map(saved?[['pocket-works:blockies:theme',saved]]:[]);
  const button={
    icon:{textContent:''},
    querySelector(){return this.icon;},
    addEventListener(event,listener){listeners['button-'+event]=listener;},
    setAttribute(key,value){attributes[key]=value;},
    getAttribute(key){return attributes[key];},
    title:''
  };
  const choice={value:null,addEventListener(event,listener){listeners['choice-'+event]=listener;}};
  const meta={setAttribute(k,v){attributes['meta-'+k]=v;}};
  const root={dataset:{},style:{}};
  const media={matches:systemDark,addEventListener(event,listener){listeners['media-'+event]=listener;}};
  const context={
    Date:class {getHours(){return hour;}},
    localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
    document:{
      documentElement:root,
      getElementById:id=>id==='theme-toggle'?button:id==='theme-choice'?choice:null,
      querySelector:q=>q==='meta[name="theme-color"]'?meta:null
    },
    window:{matchMedia:()=>media,addEventListener:(event,listener)=>{listeners['window-'+event]=listener;},setInterval:(fn)=>{listeners.interval=fn;}}
  };
  vm.runInNewContext(themeSource,context);
  return {root,button,choice,store,attributes,listeners,media};
}
test('auto theme uses daylight palette on a bright day',()=>{
  const s=scenario({hour:12});
  assert.equal(s.root.dataset.theme,'light');
  assert.equal(s.choice.value,'auto');
  assert.equal(s.attributes['meta-content'],'#f4f1e9');
});
test('auto theme respects sunset even if operating-system theme is light',()=>{
  const s=scenario({hour:23});
  assert.equal(s.root.dataset.theme,'dark');
  assert.equal(s.attributes['meta-content'],'#111b20');
  assert.equal(s.attributes['aria-pressed'],'true');
});
test('manual theme override is immediately applied, saved, and reusable',()=>{
  const s=scenario({hour:23});
  s.listeners['button-click']();
  assert.equal(s.root.dataset.theme,'light');
  assert.equal(s.store.get('pocket-works:blockies:theme'),'light');
  s.listeners['choice-change']({target:{value:'dark'}});
  assert.equal(s.root.dataset.theme,'dark');
  assert.equal(s.store.get('pocket-works:blockies:theme'),'dark');
  assert.equal(scenario({hour:12,saved:'dark'}).root.dataset.theme,'dark');
});
test('system dark preference works during daylight and automatic setting remains live',()=>{
  const s=scenario({hour:12,systemDark:true});
  assert.equal(s.root.dataset.theme,'dark');
  assert.equal(typeof s.listeners.interval,'function');
  s.listeners['choice-change']({target:{value:'light'}});
  s.media.matches=false;
  s.listeners.interval();
  assert.equal(s.root.dataset.theme,'light');
});
test('expanded setup, shared entry rail, and actual result dashboard are represented in app UI',()=>{
  assert.match(htmlSource,/id="theme-choice"/);
  assert.match(htmlSource,/id="theme-toggle"/);
  assert.match(htmlSource,/results-content/);
  assert.match(styleSource,/\.online-lobby-container\{display:grid/);
  assert.match(styleSource,/#settings-container\{grid-template-columns:repeat\(2/);
  assert.match(styleSource,/:root\[data-theme="dark"\]/);
  assert.match(styleSource,/\.spawn-bay__mouth:before/);
  assert.match(gameSource,/result-score__value/);
  assert.match(gameSource,/result-board__canvas/);
  assert.match(gameSource,/result-player__status/);
  assert.match(gameSource,/const labelExtra=rail\?20:0/);
});
