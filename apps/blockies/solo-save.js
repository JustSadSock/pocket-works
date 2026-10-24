// Offline solo checkpoint. Store data only, never executable objects or user settings.
export const SOLO_KEY = 'pocket-works:blockies:solo-v1';
const HEIGHT = 20, WIDTH = 10, MAX_AGE = 1000 * 60 * 60 * 24 * 30;
const TYPES=new Set(['I','O','T','S','Z','J','L']);
const shapeType=v=>typeof v==='string'&&TYPES.has(v);
function validModern(p){
    return shapeType(p.currentType)&&shapeType(p.nextType)&&
        (p.holdType===null||shapeType(p.holdType))&&
        Array.isArray(p.bag)&&p.bag.length<=7&&p.bag.every(shapeType)&&
        new Set(p.bag).size===p.bag.length&&typeof p.holdUsed==='boolean'&&
        finite(p.lockCounter,0,500)&&integer(p.lockResets,0,8);
}
const integer = (n,min,max) => Number.isInteger(n) && n >= min && n <= max;
const finite = (n,min,max) => Number.isFinite(n) && n >= min && n <= max;
const piece = p => Array.isArray(p) && p.length >= 1 && p.length <= 4 &&
    p.every(row => Array.isArray(row) && row.length === p[0]?.length &&
      row.length >= 1 && row.length <= 4 && row.every(cell => cell === 0 || cell === 1)) &&
    p.some(row => row.some(Boolean));
function safeStorage(storage) {
    try { return storage ?? globalThis.localStorage; } catch { return null; }
}
export function validateSoloSnapshot(value,now = Date.now()) {
    if (!value || ![1,2].includes(value.version) || !integer(value.updatedAt,0,now + 60_000) ||
        now - value.updatedAt > MAX_AGE || !integer(value.randomSeed,0,0xffffffff) ||
        !integer(value.rngState,0,0xffffffff) || !Array.isArray(value.board) ||
        value.board.length !== HEIGHT ||
        !value.board.every(row => Array.isArray(row) && row.length === WIDTH &&
          row.every(cell => cell === 0 || cell === 1))) return null;
    const p = value.player, stats = value.sharedStats;
    if (!p || !stats || (value.version===2&&!validModern(p)) || !piece(p.currentPiece) || !piece(p.nextPiece) ||
        !p.position || !integer(p.position.x,0,WIDTH - 1) || !integer(p.position.y,0,HEIGHT - 1) ||
        p.position.x + p.currentPiece[0].length > WIDTH ||
        !finite(p.dropCounter,0,10_000) || !finite(p.dropInterval,100,10_000) ||
        !finite(p.spawnAnchor,0,WIDTH) ||
        !integer(stats.score,0,2**53 - 1) || !integer(stats.lines,0,1_000_000) ||
        !integer(stats.level,1,100_001) || !integer(stats.comboChain,0,1_000_000)) return null;
    // Explicit field copy prevents stale prototypes / unrelated save keys.
    return {
      version:value.version,updatedAt:value.updatedAt,
      randomSeed:value.randomSeed,rngState:value.rngState,
      board:value.board.map(row => row.slice()),
      sharedStats:{score:stats.score,lines:stats.lines,level:stats.level,
        comboChain:stats.comboChain,lastClearDetail:null},
      player:{currentPiece:p.currentPiece.map(row=>row.slice()),
        nextPiece:p.nextPiece.map(row=>row.slice()),
        position:{x:p.position.x,y:p.position.y},
        dropCounter:p.dropCounter,dropInterval:p.dropInterval,spawnAnchor:p.spawnAnchor,
        color:/^#[0-9a-f]{6}$/i.test(p.color) ? p.color : '#FF1493',
        ...(value.version===2?{bag:p.bag.slice(),currentType:p.currentType,
           nextType:p.nextType,holdType:p.holdType,holdUsed:p.holdUsed,
           lockCounter:p.lockCounter,lockResets:p.lockResets}:{})}
    };
}
export function loadSolo(storage) {
    const target=safeStorage(storage);
    if(!target)return null;
    try {
        const text=target.getItem(SOLO_KEY);
        if(!text)return null;
        const valid=validateSoloSnapshot(JSON.parse(text));
        if(!valid)target.removeItem(SOLO_KEY);
        return valid;
    } catch { try {target.removeItem(SOLO_KEY);}catch{} return null; }
}
export function saveSolo(value,storage) {
    const valid=validateSoloSnapshot(value),target=safeStorage(storage);
    if(!valid || !target)return false;
    try {target.setItem(SOLO_KEY,JSON.stringify(valid));return true;} catch{return false;}
}
export function clearSolo(storage) {
    try {safeStorage(storage)?.removeItem(SOLO_KEY);} catch {}
}
