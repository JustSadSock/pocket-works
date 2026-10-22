import test from 'node:test';
import assert from 'node:assert/strict';
import {RUNES} from '../runes.mjs';
import {ALL_SEAL_IDS} from '../rune-seals.mjs';

test('every existing rune has an individually authored visual seal',()=>{
 const all=RUNES.map(r=>r.id);
 assert.equal(all.length,39);
 assert.equal(ALL_SEAL_IDS.length,all.length);
 assert.equal(new Set(ALL_SEAL_IDS).size,all.length);
 for(const id of all)assert.ok(ALL_SEAL_IDS.includes(id),'missing seal: '+id);
});
