import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,renameSync,existsSync,rmSync} from 'node:fs';
import path from 'node:path';
import {createCatalog} from './sample-library.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
export function openLibrary(root){
  root=path.resolve(root);mkdirSync(root,{recursive:true});mkdirSync(path.join(root,'objects'),{recursive:true});
  const db=new DatabaseSync(path.join(root,'catalog.sqlite'));
  db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS samples(id TEXT PRIMARY KEY,sha256 TEXT NOT NULL,metadata TEXT NOT NULL); CREATE INDEX IF NOT EXISTS samples_hash ON samples(sha256); CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(id UNINDEXED,title,creator,tags);");
  const get=db.prepare('SELECT metadata FROM samples WHERE id=?');
  function insert(entry,sourceRoot){
    const resolved=createCatalog([entry],sourceRoot).resolve(entry.id);
    const bytes=readFileSync(resolved.file);
    if(digest(bytes)!==entry.sha256)throw new Error('Source changed during import');
    const ext=path.extname(resolved.file).toLowerCase();
    const stored={...entry,path:'objects/'+entry.sha256+ext};
    const target=path.join(root,stored.path),tmp=target+'.tmp';
    db.exec('BEGIN IMMEDIATE');
    try{
      const old=get.get(entry.id);
      if(old){if(JSON.stringify(JSON.parse(old.metadata))!==JSON.stringify(stored))throw new Error('Sample ID already exists with different metadata');}
      if(existsSync(target)){if(digest(readFileSync(target))!==entry.sha256)throw new Error('Corrupted vault object');}
      else{writeFileSync(tmp,bytes,{flag:'wx'});renameSync(tmp,target);}
      if(!old){
        db.prepare('INSERT INTO samples VALUES(?,?,?)').run(entry.id,entry.sha256,JSON.stringify(stored));
        db.prepare('INSERT INTO search VALUES(?,?,?,?)').run(entry.id,entry.title,entry.creator,entry.tags.join(' '));
      }
      db.exec('COMMIT');return stored;
    }catch(e){db.exec('ROLLBACK');rmSync(tmp,{force:true});throw e;}
  }
  function list(query=''){
    const terms=String(query).trim().match(/[\p{L}\p{N}]+/gu)??[];
    const rows=terms.length?db.prepare('SELECT samples.metadata FROM search JOIN samples ON samples.id=search.id WHERE search MATCH ? ORDER BY samples.id').all(terms.map(t=>'"'+t+'"*').join(' AND ')):db.prepare('SELECT metadata FROM samples ORDER BY id').all();
    return rows.map(r=>JSON.parse(r.metadata));
  }
  return {insert,list,resolve(id){const row=get.get(id);if(!row)throw new Error('Unknown sample '+id);return createCatalog([JSON.parse(row.metadata)],root).resolve(id)},close(){db.close()}};
}
