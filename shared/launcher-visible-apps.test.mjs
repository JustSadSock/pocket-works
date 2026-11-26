import test from 'node:test';
import assert from 'node:assert/strict';
import {selectVisibleApps} from './launcher-visible-apps.js';
test('home view skips hidden library filtering, sorting and card creation',()=>{
 const registry=Array.from({length:5000},(_,i)=>({slug:'app-'+i}));
 let work=0;
 const result=selectVisibleApps({view:'home',registry,queryMatches:()=>{work++;return true;},filterMatches:()=>{work++;return true;},compare:()=>{work++;return 0;}});
 assert.deepEqual(result,[]);assert.equal(work,0);
});
test('library view preserves query, filter and sort behavior',()=>{
 const registry=[{slug:'a',name:'Alpha',keep:true},{slug:'b',name:'Beta',keep:false},{slug:'c',name:'Gamma',keep:true}];
 const result=selectVisibleApps({view:'library',registry,visibleList:registry,queryMatches:a=>a.name!=='Beta',filterMatches:a=>a.keep,compare:(a,b)=>b.name.localeCompare(a.name)});
 assert.deepEqual(result.map(a=>a.slug),['c','a']);
});
test('archive view keeps query but does not apply the normal shelf filter',()=>{
 const registry=[{slug:'a',name:'Alpha',keep:true},{slug:'b',name:'Beta',keep:false}];
 const result=selectVisibleApps({view:'archive',registry,visibleList:registry,queryMatches:a=>a.name.startsWith('B'),filterMatches:()=>false,compare:(a,b)=>a.name.localeCompare(b.name)});
 assert.deepEqual(result.map(a=>a.slug),['b']);
});
