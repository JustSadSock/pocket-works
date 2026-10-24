import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { sessionTokenKey, findSessionByToken, isSessionToken } from '../session-tokens.mjs';

const raw = 'abcdef0123456789'.repeat(4);
const expected = 'sha256:' + createHash('sha256').update(raw).digest('hex');
const record = {id:'player-1',name:'Guest',account_id:null,avatar:null};

function memorySessions(entries) {
  const rows = new Map(entries);
  const operations = [];
  const query = (sql, ...args) => {
    operations.push({sql,args});
    if (sql.startsWith('SELECT')) {
      const [key, now] = args;
      const row = rows.get(key);
      return {toArray:()=>row && row.expires > now ? [{...row,expires:undefined}] : []};
    }
    if (sql.startsWith('UPDATE')) {
      const [next, prior] = args;
      const old = rows.get(prior);
      if (old) {rows.delete(prior);rows.set(next,old);}
      return {toArray:()=>[]};
    }
    throw Error('unexpected query');
  };
  return {rows,operations,query};
}

test('raw session bearer token is never its stored credential', async () => {
  assert.equal(isSessionToken(raw),true);
  assert.equal(isSessionToken(raw.toUpperCase()),false);
  assert.equal(isSessionToken('invalid'),false);
  assert.equal(await sessionTokenKey(raw),expected);
  assert.notEqual(expected,raw);
  await assert.rejects(()=>sessionTokenKey('invalid'),TypeError);
});

test('authentication finds newly hashed sessions without plaintext fallback writes', async () => {
  const db=memorySessions([[expected,{...record,expires:5000}]]);
  const result=await findSessionByToken(db.query,raw,1000);
  assert.equal(result.id,'player-1');
  assert.deepEqual([...db.rows.keys()],[expected]);
  assert.equal(db.operations.length,1);
});

test('legacy session migrates transparently after successful authentication', async () => {
  const db=memorySessions([[raw,{...record,expires:5000}]]);
  const result=await findSessionByToken(db.query,raw,1000);
  assert.equal(result.name,'Guest');
  assert.equal(db.rows.has(raw),false);
  assert.equal(db.rows.has(expected),true);
  assert.equal(db.operations.length,3);
  await findSessionByToken(db.query,raw,1000);
  assert.equal(db.operations.filter(op=>op.sql.startsWith('UPDATE')).length,1);
});

test('expired legacy sessions remain expired and are never upgraded', async () => {
  const db=memorySessions([[raw,{...record,expires:999}]]);
  assert.equal(await findSessionByToken(db.query,raw,1000),null);
  assert.equal(db.rows.has(raw),true);
  assert.equal(db.operations.some(op=>op.sql.startsWith('UPDATE')),false);
});

test('PocketNet profile refresh does not accidentally update a plaintext session key', async () => {
  const hub = await readFile(new URL('../hub.mjs', import.meta.url), 'utf8');
  assert.match(hub, /const storedToken = await sessionTokenKey\(msg\.token\)/);
  assert.match(hub, /found\.name,found\.avatar,storedToken\)/);
  assert.match(hub, /found\.name, storedToken\)/);
  assert.doesNotMatch(hub, /found\.name,found\.avatar,msg\.token\)/);
  assert.doesNotMatch(hub, /found\.name, msg\.token\)/);
});
