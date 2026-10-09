import test from 'node:test';
import assert from 'node:assert/strict';
import {createManuscript} from '../manuscript.js';
import {LEVELS} from '../logic.js';

function fakeDOM(){
  const ids={};
  function element(tag='div',id=''){
    const listeners={},classes=new Set(),node={
      tag,id,children:[],parent:null,hidden:false,disabled:false,style:{},className:'',
      dataset:{},textContent:'',attributes:{},
      classList:{add(...items){items.forEach(x=>classes.add(x));},remove(...items){items.forEach(x=>classes.delete(x));},contains(x){return classes.has(x);}},
      setAttribute(k,v){this.attributes[k]=v;},
      getAttribute(k){return this.attributes[k];},
      getClientRects(){return this.hidden?[]:[{}];},
      addEventListener(k,cb){(listeners[k]??=[]).push(cb);},
      trigger(k,evt={}){for(const fn of listeners[k]??[])fn({preventDefault(){},stopPropagation(){},...evt});},
      append(...children){children.forEach(n=>{n.parent=this;this.children.push(n);});},
      replaceChildren(...children){this.children=[];this.append(...children);},
      focus(){doc.activeElement=this;},
      closest(){return null;},
      querySelectorAll(selector){const all=[];
        function visit(n){for(const child of n.children){if(child.tag==='button'&&!child.disabled&&!child.hidden)all.push(child);visit(child);}}
        visit(this);return all;
      }
    };
    return node;
  }
  const doc={activeElement:null,getElementById(id){return ids[id]??(ids[id]=element('div',id));},createElement:tag=>element(tag)};
  const keys=['manuscript','codexPage','codexContent','codexTitle','codexSubtitle','codexEyebrow','codexPageCount','codexArt','codexBack','codexPrev','codexNext','codexClose','codexStatus','codexAnnouncement'];
  for(const id of keys)doc.getElementById(id);
  return {doc,ids,element};
}

test('Codex catalogue and folia: 10 books and exactly 25 numbered medallions per page',()=>{
 const {doc,ids}=fakeDOM();
 const beforeDoc=globalThis.document,beforeWindow=globalThis.window,beforeRAF=globalThis.requestAnimationFrame;
 globalThis.document=doc;globalThis.window={setTimeout:fn=>{fn();return 1;}};globalThis.requestAnimationFrame=fn=>fn();
 try{
   let unlocked=1;const picked=[];
   const codex=createManuscript({levels:LEVELS,getUnlocked:()=>unlocked,getBest:()=>({0:6}),getCurrent:()=>0,onSelect:i=>picked.push(i),reduceMotion:()=>true});
   codex.show();
   assert.equal(ids.manuscript.hidden,false);
   assert.equal(ids.codexContent.children[1].children.length,10);
   assert.equal(ids.codexContent.children[1].children[1].disabled,true);
   ids.codexContent.children[1].children[0].trigger('click');
   assert.equal(ids.codexTitle.textContent,'Пробуждение');
   assert.equal(ids.codexContent.children[1].children.length,25);
   ids.codexContent.children[1].children[1].disabled=true;
   ids.codexNext.trigger('click');
   assert.equal(ids.codexContent.children[1].children.length,25);
   assert.equal(ids.codexContent.children[1].children[0].disabled,true);
   ids.codexPrev.trigger('click');
   ids.codexContent.children[1].children[0].trigger('click');
   assert.deepEqual(picked,[0]);
   assert.equal(ids.manuscript.hidden,true);
   unlocked=500;codex.show({book:true,level:499});
   assert.equal(ids.codexTitle.textContent,'Последний рассвет');
   assert.equal(ids.codexContent.children[1].children.length,25);
   ids.codexContent.children[1].children[24].trigger('click');
   assert.deepEqual(picked,[0,499]);
 }finally{globalThis.document=beforeDoc;globalThis.window=beforeWindow;globalThis.requestAnimationFrame=beforeRAF;}
});

test('Closing, page-turn keyboard and entering chapters do not alter puzzle persistence',()=>{
 const {doc,ids}=fakeDOM();
 const beforeDoc=globalThis.document,beforeWindow=globalThis.window,beforeRAF=globalThis.requestAnimationFrame;
 globalThis.document=doc;globalThis.window={setTimeout:fn=>{fn();return 1;}};globalThis.requestAnimationFrame=fn=>fn();
 try{
   let soundTurns=0,selected=false;
   const nav=createManuscript({levels:LEVELS,getUnlocked:()=>98,getBest:()=>({0:3}),getCurrent:()=>47,
    onSelect:()=>{selected=true;},onPageTurn:()=>soundTurns++,reduceMotion:()=>true});
   nav.show({book:true,level:47});
   assert.equal(ids.codexPage.dataset.turn,undefined);
   assert.equal(ids.codexPageCount.textContent,'I · 2 / II');
   ids.codexBack.trigger('click');
   assert.equal(ids.codexContent.children[1].children.length,10);
   nav.show({book:true,level:47});
   ids.manuscript.trigger('keydown',{key:'Escape'});
   assert.equal(ids.codexTitle.textContent,'Книга света');
   ids.manuscript.trigger('keydown',{key:'Escape'});
   assert.equal(nav.isVisible(),false);
   assert.equal(selected,false);
   assert.ok(soundTurns>=1);
 }finally{globalThis.document=beforeDoc;globalThis.window=beforeWindow;globalThis.requestAnimationFrame=beforeRAF;}
});

test('Leaving an animated manuscript cancels a pending level selection',()=>{
 const {doc,ids}=fakeDOM();
 const beforeDoc=globalThis.document,beforeWindow=globalThis.window,beforeRAF=globalThis.requestAnimationFrame;
 const queue=[];
 globalThis.document=doc;globalThis.window={setTimeout:fn=>{queue.push(fn);return queue.length;}};
 globalThis.requestAnimationFrame=fn=>fn();
 try{
   const selected=[];
   const codex=createManuscript({
     levels:LEVELS,getUnlocked:()=>5,getBest:()=>({}),getCurrent:()=>0,
     onSelect:i=>selected.push(i),reduceMotion:()=>false
   });
   codex.show({book:true,level:0});
   ids.codexContent.children[1].children[0].trigger('click');
   codex.hide();
   while(queue.length)queue.shift()();
   assert.deepEqual(selected,[]);
   assert.equal(ids.manuscript.hidden,true);
 }finally{globalThis.document=beforeDoc;globalThis.window=beforeWindow;globalThis.requestAnimationFrame=beforeRAF;}
});
