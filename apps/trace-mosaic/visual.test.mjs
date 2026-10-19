import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import game from './simulation.js';

const appSource = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const rendererSource = appSource.slice(appSource.indexOf('function trailPath('),
  appSource.indexOf('\nfunction renderToasts()'));
assert.ok(rendererSource.includes('function renderResults()'));

function roomFor(count) {
  const players = Array.from({length:count},(_,i)=>({id:'p'+i,name:'Painter '+i}));
  let state = game.createRoom({player:players[0],payload:{maxPlayers:count}}).state;
  for(const player of players.slice(1)) state=game.onJoin({state,player}).state;
  for(const player of players.slice(1))
    state=game.onMessage({state,player,payload:{type:'toggle_ready'}}).state;
  state=game.onMessage({state,player:players[0],payload:{type:'start_game'}}).state;
  return {...game.viewForPlayer({state,player:players[0]}),roomId:'TEST',practice:false};
}
const fakeDocument={documentElement:{style:{setProperty(){}}}};
const escapeHtml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;');
const createViews = state => new Function('state','document','buildTrailMap','gameKey',
  'formatTimer','escapeHtml','renderDragGhost','renderToasts',
  rendererSource+'\nreturn {renderGame,renderResults,renderTrailPaths,renderReferenceOverlay};'
)(state,fakeDocument,()=>new Map(),()=>'test-key',seconds=>String(seconds),escapeHtml,()=>'',()=>'');

for(const count of [3,5]) {
  test('restoration workbench renders real '+count+'-player grid and assigned tray',()=>{
    const room=roomFor(count);
    const state={room,selfId:'p0',now:Date.now(),drag:null,soundEnabled:false,referenceOpen:false};
    const markup=createViews(state).renderGame();
    assert.equal((markup.match(/class="board-cell"/g)||[]).length,room.game.totalTiles);
    assert.equal((markup.match(/class="placed-piece/g)||[]).length,room.game.totalTiles);
    assert.equal((markup.match(/data-slot="/g)||[]).length,room.game.assignments.length);
    assert.match(markup,/class="trail-svg"/);
    assert.match(markup,/data-action="toggle-sound"/);
    assert.match(markup,/data-action="show-reference"/);
    assert.match(markup,/aria-label="Мозаика/);
  });
}
test('one continuous validated path produces both ribbon and centerline geometry',()=>{
  const room=roomFor(3),state={room,selfId:'p0',now:Date.now()};
  room.game.trails=[{id:'test',playerId:'p1',color:'#53d6ff',cells:[0,1,5,9],
    expiresAt:Date.now()+30000}];
  const svg=createViews(state).renderTrailPaths(room.game);
  assert.match(svg,/M 0.5 0.5 L 1.5 0.5 L 1.5 1.5 L 1.5 2.5/);
  assert.match(svg,/class="trail-ribbon"/);
  assert.match(svg,/class="trail-centerline"/);
  assert.match(svg,/data-expires=/);
});
test('finished artwork opens as an archival exhibit with actionable exit and replay',()=>{
  const room=roomFor(3),state={room,selfId:'p0',now:Date.now()};
  room.phase='results';room.game.score.completionPercent=100;
  const markup=createViews(state).renderResults();
  assert.match(markup,/Картина/);
  assert.match(markup,/exhibit-art/);
  assert.match(markup,/data-action="play-again"/);
  assert.match(markup,/data-action="leave-room"/);
});
test('reference overlay has a visible dismissal control and source art',()=>{
  const room=roomFor(3),state={room,selfId:'p0',now:Date.now()};
  const markup=createViews(state).renderReferenceOverlay();
  assert.match(markup,/role="dialog"/);
  assert.match(markup,/data-action="close-reference"/);
  assert.match(markup,/puzzle-/);
});
test('materials, mobile constraints and reduced motion rules are present',()=>{
  let balance=0;for(const char of css){if(char==='{')balance++;if(char==='}')balance--;}
  assert.equal(balance,0);
  for(const pattern of ['.board-shell','.trail-svg','.drag-ghost','.inventory-shell',
    '.reference-overlay','@media(orientation:landscape)','prefers-reduced-motion']) {
    assert.ok(css.includes(pattern),pattern+' must remain defined');
  }
});
test('same-round network updates patch the table rather than replacing the whole DOM',()=>{
  const from=appSource.indexOf('function render() {');
  const to=appSource.indexOf('\nfunction renderConnectionBanner()',from);
  const renderPart=appSource.slice(from,to);
  assert.match(renderPart,/if \(canPatch\) \{\s*patchGame\(\)/);
  assert.match(renderPart,/function patchGame\(\)/);
  assert.ok(!renderPart.slice(renderPart.indexOf('function patchGame()')).includes('app.innerHTML = renderGame()'));
  assert.match(renderPart,/el\.dataset\.artLoaded !== '1'/);
});
