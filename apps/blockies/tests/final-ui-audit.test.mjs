import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const gameSource=await fs.readFile(new URL('../game.js',import.meta.url),'utf8');
const cssSource=await fs.readFile(new URL('../styles.css',import.meta.url),'utf8');
const htmlSource=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
const classStart=gameSource.indexOf('class UIManager {');
const classEnd=gameSource.indexOf('// Initialize the game',classStart);
assert.ok(classStart!==-1 && classEnd>classStart);
const classSource=gameSource.slice(classStart,classEnd);

function fixture(){
  const added=[],removed=[],calls=[];
  const nodes=new Map();
  const state={
    numPlayers:1,settings:{colors:['#ffffff'],keys:[{left:'ArrowLeft'}]},
    gamepads:{assignments:{}},isPaused:false,isGameOver:false,
    players:[{id:0}],board:[[1,0],[0,2]]
  };
  const context={
    document:{
      addEventListener:(...args)=>added.push(args),
      removeEventListener:(...args)=>removed.push(args),
      getElementById:id=>nodes.get(id)||null
    },
    window:{confirm:()=>false},
    confirm:()=>false,
    performance:{now:()=>777},
    currentLanguage:'ru',
    gameState:state,
    networkManager:{started:false},
    normalizeKeyCode:x=>x,
    formatKeyLabel:x=>x,
    isColorTooDark:()=>true,
    DEFAULT_COLORS:['#ffffff'],
    DEFAULT_KEYS:[{left:'ArrowLeft'}],
    t:value=>value,
    clearTimeout:()=>{},
    setTimeout:()=>1,
    soundManager:{enabled:true,setEnabled(value){calls.push(['sound',value]);}},
  };
  vm.runInNewContext(classSource+';globalThis.UIManager=UIManager;',context);
  const ui=Object.create(context.UIManager.prototype);
  ui.isOnlineMode=false;
  ui.previousScreen='mainMenu';
  ui.settingsPausedLocalGame=false;
  ui.settingsPausedModal=false;
  ui.settingsReturnTimer=null;
  ui.debugPausedLocal=false;
  ui.activeKeyCapture=null;
  ui.screens={
    gameScreen:{classList:{contains:()=>true}},
    settingsScreen:{classList:{contains:()=>true}},
  };
  ui.showScreen=id=>calls.push(['screen',id]);
  ui.showModal=id=>calls.push(['modal',id]);
  ui.hideModal=id=>calls.push(['hideModal',id]);
  ui.showStyledMessage=(...args)=>calls.push(['message',...args]);
  return {ui,context,nodes,state,added,removed,calls};
}
function keyInput(value='ArrowLeft'){
  const classes=new Set();
  return {
    value,dataset:{keyCode:value},isConnected:true,
    classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v)}
  };
}

test('key capturing replaces previous handlers and Escape restores the existing binding',()=>{
  const {ui,added,removed}=fixture();
  const first=keyInput(),second=keyInput('KeyW');
  ui.captureKey(first);
  assert.equal(first.classList.contains('capturing'),true);
  assert.equal(added.length,1);
  assert.equal(added[0][2],true);
  ui.captureKey(second);
  assert.equal(first.value,'ArrowLeft','switching controls must restore an uncommitted key');
  assert.equal(first.classList.contains('capturing'),false);
  assert.equal(removed.length,1);
  assert.equal(added.length,2);
  const pressed={code:'Escape',key:'Escape',preventDefault(){},stopImmediatePropagation(){}};
  added[1][1](pressed);
  assert.equal(second.value,'KeyW');
  assert.equal(second.dataset.keyCode,'KeyW');
  assert.equal(ui.activeKeyCapture,null);
  assert.equal(removed.length,2);
});

test('key capture accepts a new key without leaving a document-level listener active',()=>{
  const {ui,added,removed}=fixture();
  const input=keyInput();
  ui.captureKey(input);
  added[0][1]({code:'KeyQ',key:'q',preventDefault(){},stopImmediatePropagation(){}});
  assert.equal(input.dataset.keyCode,'KeyQ');
  assert.equal(input.value,'KeyQ');
  assert.equal(ui.activeKeyCapture,null);
  assert.equal(removed.length,1);
});

test('failed settings validation does not persist a different sound preference',()=>{
  const {ui,nodes,state,calls}=fixture();
  ui.previousScreen='gameScreen';
  nodes.set('sound-enabled',{checked:false});
  nodes.set('color-0',{value:'#000000'});
  ui.saveSettings();
  assert.equal(calls.some(event=>event[0]==='sound'),false);
  assert.equal(state.settings.colors[0],'#ffffff');
});

test('cancelled reset and leaving settings cannot overwrite a local active match',()=>{
  const {ui,state,calls}=fixture();
  ui.resetSettings();
  assert.equal(state.settings.colors[0],'#ffffff','rejected reset leaves settings alone');
  ui.previousScreen='gameScreen';
  ui.settingsPausedLocalGame=true;
  state.isPaused=true;
  ui.hideSettings();
  assert.equal(state.isPaused,false);
  assert.equal(state.lastTime,777);
  assert.ok(calls.some(event=>event[0]==='screen'&&event[1]==='gameScreen'));
  assert.equal(ui.settingsPausedLocalGame,false);
});

test('debug screen review refuses to replace a live online round',()=>{
  const {ui,state,context,calls}=fixture();
  ui.isOnlineMode=true;context.networkManager.started=true;
  const board=JSON.stringify(state.board);
  ui.debugOpenScreen('gameOver');
  assert.equal(JSON.stringify(state.board),board);
  assert.equal(state.isGameOver,false);
  assert.ok(calls.some(e=>e[0]==='message'));
  assert.equal(calls.some(e=>e[0]==='screen'),false);
});

test('debug review restores the same paused local well without resetting pieces',()=>{
  const {ui,state,calls}=fixture();
  ui.isOnlineMode=false;state.isPaused=true;ui.debugPausedLocal=true;
  const originalBoard=JSON.stringify(state.board);
  ui.debugOpenScreen('gameScreen');
  assert.equal(JSON.stringify(state.board),originalBoard);
  assert.equal(state.isPaused,false);
  assert.equal(state.lastTime,777);
  assert.equal(ui.debugPausedLocal,false);
  assert.ok(calls.some(e=>e[0]==='screen'&&e[1]==='gameScreen'));
});

test('all debug destinations, mobile safe areas and replay access remain available',()=>{
  for(const name of ['mainMenu','coopSetup','onlineLobby','gameScreen',
    'settingsScreen','pause','gameOver','achievements'])
    assert.ok(gameSource.includes("['"+name+"'"),'missing debug screen '+name);
  assert.match(gameSource,/this\.settingsPausedLocalGame=true/);
  assert.match(gameSource,/if\(this\.screens\.settingsScreen\.classList\.contains\('active'\)\)this\.hideSettings\(\)/);
  assert.match(gameSource,/if\(!window\.confirm\(currentLanguage==='ru'/);
  assert.match(cssSource,/\.results-content #play-again-btn\{[\s\S]*?position:sticky/);
  assert.match(cssSource,/@media\(max-height:550px\)/);
  assert.match(cssSource,/env\(safe-area-inset-bottom\)/);
  assert.match(htmlSource,/id="gameover-menu"/);
  assert.match(htmlSource,/id="settings-screen"/);
});
