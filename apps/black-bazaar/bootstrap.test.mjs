import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const root=dirname(fileURLToPath(import.meta.url));
const entrypoints=['app.js','art.js','economy.js','feedback.js','debug-console.js','debug-state.js','art/artifacts.js','art/characters.js','sw.js'];

for(const file of entrypoints){
 test('JavaScript parses: '+file,()=>{
  const check=spawnSync(process.execPath,['--check',join(root,file)],{encoding:'utf8'});
  assert.equal(check.status,0,check.stderr||check.stdout);
 });
}

test('lobby retains player list, occupancy and controls in one expression',()=>{
 const source=readFileSync(join(root,'app.js'),'utf8');
 const lobby=source.slice(source.indexOf('function renderLobby(){'),source.indexOf('function scoreBox(){'));
 assert.ok(lobby.startsWith('function renderLobby(){'),'Lobby renderer must exist');
 for(const action of ['copy-code','copy-url','kick-player','start','leave']){
  assert.ok(lobby.includes('data-action="'+action+'"'),'Missing lobby action '+action);
 }
 assert.match(lobby,/\.join\(''\)\+'<\/div>'\+\s*'<p class="muted">/,'Lobby occupancy line must be concatenated');
});
