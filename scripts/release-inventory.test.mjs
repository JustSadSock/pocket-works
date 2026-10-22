import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateReleaseInventory} from './release-inventory.mjs';
const cfg={slug:'example',version:'1.3.0',releaseDateTime:'2026-10-22T10:00:00Z'};
const release={schemaVersion:2,slug:'example',version:'1.3.0',releasedAt:cfg.releaseDateTime,files:['index.html','app.js','release.json']};
test('release manifest matches exact deployed file set',()=>{
 assert.deepEqual(validateReleaseInventory(release,cfg,[...release.files]),[]);
});
test('detect missing asset, unknown extra asset, duplicates and traversal',()=>{
 assert.ok(validateReleaseInventory(release,cfg,['index.html','release.json']).some(s=>s.includes('app.js')));
 assert.ok(validateReleaseInventory(release,cfg,[...release.files,'rogue.css']).some(s=>s.includes('rogue.css')));
 assert.ok(validateReleaseInventory({...release,files:[...release.files,'app.js']},cfg,release.files).some(s=>s.includes('duplicates')));
 assert.ok(validateReleaseInventory({...release,files:[...release.files,'../secrets']},cfg,release.files).some(s=>s.includes('unsafe paths')));
});
test('detect cross-game manifest and stale release timestamps',()=>{
 assert.ok(validateReleaseInventory({...release,slug:'other'},cfg,release.files).some(s=>s.includes('slug')));
 assert.ok(validateReleaseInventory({...release,releasedAt:'2026-10-01'},cfg,release.files).some(s=>s.includes('timestamp')));
});
