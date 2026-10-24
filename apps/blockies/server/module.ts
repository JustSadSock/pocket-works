// Original Blockies engine; the wrapper below owns the room clock and serializable RNG.
function runtime(saved,seed){const soundManager={move(){},rotate(){},drop(){},lineClear(){},gameOver(){}};
// BEGIN GENERATED BLOCKIES PHYSICS CORE (apps/blockies/physics-core.js)
// Authoritative pure movement rules. This file is the ONLY editable copy.
// scripts/sync-blockies-physics.mjs embeds it into the standalone PocketNet module.
// No DOM, timers, mutable global game state, or network effects are allowed here.
const SHAPES = {
    I: [[1, 1, 1, 1]],
    O: [[1, 1], [1, 1]],
    T: [[0, 1, 0], [1, 1, 1]],
    S: [[0, 1, 1], [1, 1, 0]],
    Z: [[1, 1, 0], [0, 1, 1]],
    J: [[1, 0, 0], [1, 1, 1]],
    L: [[0, 0, 1], [1, 1, 1]]
};
const PIECE_TYPES = Object.keys(SHAPES);
const LOCK_DELAY_MS = 450;
const MAX_LOCK_RESETS = 8;
const SAFE_LANE_ROWS = 5;
const KICK_OFFSETS = [[0,0],[-1,0],[1,0],[-2,0],[2,0],[-3,0],[3,0],[0,-1],[-1,-1],[1,-1]];

function rotatedClockwise(piece) {
    return piece[0].map((_,i)=>piece.map(row=>row[i]).reverse());
}

function inferShapeType(piece) {
    if (!Array.isArray(piece)) return null;
    for (const type of PIECE_TYPES) {
        let shape=SHAPES[type];
        for (let i=0;i<4;i++) {
            if (JSON.stringify(shape)===JSON.stringify(piece)) return type;
            shape=rotatedClockwise(shape);
        }
    }
    return null;
}

function otherPieceOccupies(x,y,players,ownerId) {
    return players.some(player=>{
        if(player.id===ownerId||player.gameOver||player.offline||!player.currentPiece)return false;
        for(let py=0;py<player.currentPiece.length;py++)
            for(let px=0;px<player.currentPiece[py].length;px++)
                if(player.currentPiece[py][px]&&player.position.x+px===x&&player.position.y+py===y)
                    return true;
        return false;
    });
}

function checkPieceCollision(piece,pos,board,players,ownerId) {
    const result={collides:false,withLocked:false,withActive:false};
    if(!piece||!board?.length)return {collides:true,withLocked:true,withActive:false};
    const width=board[0].length,height=board.length;
    for(let y=0;y<piece.length;y++)
        for(let x=0;x<piece[y].length;x++){
            if(!piece[y][x])continue;
            const xx=pos.x+x,yy=pos.y+y;
            if(xx<0||xx>=width||yy>=height){
                return {collides:true,withLocked:true,withActive:result.withActive};
            }
            if(yy<0)continue;
            if(board[yy][xx]){
                return {collides:true,withLocked:true,withActive:result.withActive};
            }
            if(otherPieceOccupies(xx,yy,players,ownerId)){
                result.collides=true;
                result.withActive=true;
            }
        }
    return result;
}

function findRotationPlacement(piece,pos,board,players,ownerId) {
    const rotated=rotatedClockwise(piece);
    for(const [dx,dy] of KICK_OFFSETS){
        const target={x:pos.x+dx,y:pos.y+dy};
        if(!checkPieceCollision(rotated,target,board,players,ownerId).collides)
            return {currentPiece:rotated,position:target};
    }
    return null;
}

function isLaneClear(laneX,board,players,ownerId,numPlayers) {
    if(numPlayers<=1)return true;
    for(let y=0;y<SAFE_LANE_ROWS;y++)
        for(let x=laneX;x<laneX+4;x++)
            if(board[y]?.[x]||otherPieceOccupies(x,y,players,ownerId))return false;
    return true;
}

/** Pull one tetromino from a 7-bag without mutating the supplied bag. */
function drawSevenBag(bag,random) {
    const remaining=bag.length?bag.slice():PIECE_TYPES.slice();
    if(!bag.length){
        for(let i=remaining.length-1;i>0;i--){
            const j=Math.floor(random()*(i+1));
            [remaining[i],remaining[j]]=[remaining[j],remaining[i]];
        }
    }
    return {type:remaining.pop(),bag:remaining};
}

/** Hold never consumes the next piece when exchanging with an occupied slot. */
function planHold(seat){
    if(seat.gameOver||!seat.currentPiece||seat.holdUsed)return null;
    const outgoing=seat.currentType||inferShapeType(seat.currentPiece);
    if(!outgoing)return null;
    return {outgoing,incoming:seat.holdType||null,consumeNext:!seat.holdType};
}

function adjustLock(counter,resets) {
    return counter>0&&resets<MAX_LOCK_RESETS
        ?{lockCounter:0,lockResets:resets+1}
        :{lockCounter:counter,lockResets:resets};
}

function advanceLock(counter,elapsed,isOnLockedSurface) {
    return isOnLockedSurface?counter+elapsed:0;
}

/** Same score contract for local co-op and server-authoritative co-op. */
function scoreLineClear(stats,linesCleared) {
    if(linesCleared===0)return {
        score:stats.score,lines:stats.lines,level:stats.level,
        comboChain:0,lastClearDetail:null
    };
    const comboStep=stats.comboChain||0;
    const comboMultiplier=1+0.1*comboStep;
    const multiMultiplier=1+0.2*(linesCleared-1);
    const perLineScore=Math.round(100*comboMultiplier*multiMultiplier);
    const gained=perLineScore*linesCleared;
    const lines=stats.lines+linesCleared;
    const comboChain=comboStep+1;
    return {
        score:stats.score+gained,
        lines,
        level:Math.floor(lines/10)+1,
        comboChain,
        lastClearDetail:{
            linesCleared,totalScore:gained,perLineScore,basePerLine:100,
            comboChain,comboMultiplier,multiMultiplier,
            streakBonusPercent:Math.round((comboMultiplier-1)*100),
            multiBonusPercent:Math.round((multiMultiplier-1)*100)
        }
    };
}

function intervalAfterClear(interval,linesCleared) {
    return Math.max(100,interval*Math.pow(0.95,linesCleared));
}
// END GENERATED BLOCKIES PHYSICS CORE

// Game Configuration
const BLOCK_SIZE = 25;
const BASE_BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const MAX_INPUT_BATCH = 12, MAX_ACTIONS_PER_SECOND = 48;
const ADDITIONAL_COLUMNS_PER_PLAYER = 4;
const PREVIEW_SIZE = 4;

// Default colors for players// Default colors for players - Retro-futurism palette
const DEFAULT_COLORS = ['#FF1493', '#00D9FF', '#FFDB58', '#39FF14'];

// Minimum brightness threshold for player colors (0-255)
const MIN_COLOR_BRIGHTNESS = 80;

// Color validation helper function
function getColorBrightness(hexColor) {
    // Convert hex to RGB
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    // Calculate perceived brightness (ITU-R BT.709)
    return (r * 0.2126 + g * 0.7152 + b * 0.0722);
}

function isColorTooDark(hexColor) {
    return getColorBrightness(hexColor) < MIN_COLOR_BRIGHTNESS;
}

function suggestBrighterColor(hexColor) {
    const hex = hexColor.replace('#', '');
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);
    
    // Increase brightness while maintaining hue
    const currentBrightness = getColorBrightness(hexColor);
    const factor = MIN_COLOR_BRIGHTNESS / currentBrightness;
    
    r = Math.min(255, Math.floor(r * factor * 1.5));
    g = Math.min(255, Math.floor(g * factor * 1.5));
    b = Math.min(255, Math.floor(b * factor * 1.5));
    
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Default key bindings for players (keyboard layout agnostic using code values)
const DEFAULT_KEYS = [
    { left: 'ArrowLeft', right: 'ArrowRight', down: 'ArrowDown', rotate: 'ArrowUp', drop: 'Space' },
    { left: 'KeyA', right: 'KeyD', down: 'KeyS', rotate: 'KeyW', drop: 'KeyQ' },
    { left: 'KeyJ', right: 'KeyL', down: 'KeyK', rotate: 'KeyI', drop: 'KeyU' },
    { left: 'KeyF', right: 'KeyH', down: 'KeyG', rotate: 'KeyT', drop: 'KeyR' }
];

// Deterministic PRNG for synchronized multiplayer (Mulberry32)
function createPrng(seed) {
    let t = seed + 0x6D2B79F5;
    return function() {
        t |= 0;
        t = t + 0x6D2B79F5 | 0;
        let r = Math.imul(t ^ t >>> 15, 1 | t);
        r = r + Math.imul(r ^ r >>> 7, 61 | r) ^ r;
        return ((r ^ r >>> 14) >>> 0) / 4294967296;
    };
}

function normalizeSeed(seed) {
    const numeric = Number(seed);
    if (Number.isFinite(numeric)) {
        return numeric >>> 0;
    }
    return Math.floor(Math.random() * 0xFFFFFFFF);
}

const TEAM_SCORE_TEMPLATE = {
    score: 0,
    lines: 0,
    level: 1,
    comboChain: 0,
    lastClearDetail: null,
    contributions: []
};

function computeBoardWidth(numPlayers) {
    const players = Math.max(1, numPlayers || 1);
    return BASE_BOARD_WIDTH + (players - 1) * ADDITIONAL_COLUMNS_PER_PLAYER;
}

// Stable four-cell entrance for every player, with at least one gap for 2-4 players.
function spawnLaneX(index,count,boardWidth=computeBoardWidth(count)){
    if(count<=1)return Math.floor((boardWidth-4)/2);
    const slack=boardWidth-4*count;
    return index*4+Math.floor(slack*(index+1)/(count+1));
}
function getBoardWidth() {
    return gameState.boardWidth || BASE_BOARD_WIDTH;
}

function createEmptyBoard(width = getBoardWidth(), height = BOARD_HEIGHT) {
    return Array.from({ length: height }, () => Array(width).fill(0));
}

// Game State
let gameState = {
    players: [],
    numPlayers: 1,
    board: [],
    lastTime: 0,
    isPaused: false,
    isGameOver: false,
    boardWidth: BASE_BOARD_WIDTH,
    sharedStats: { ...TEAM_SCORE_TEMPLATE },
    sharedStatsDirty: false,
    inputStates: new Map(),
    randomSeed: normalizeSeed(Date.now()),
    rng: createPrng(normalizeSeed(Date.now())),
    settings: {
        colors: [...DEFAULT_COLORS],
        keys: JSON.parse(JSON.stringify(DEFAULT_KEYS))
    },
    gamepads: {
        connected: [],
        assignments: {}, // gamepadIndex -> playerIndex
        buttonStates: new Map() // gamepadIndex -> button states
    }
};

// Gamepad configuration
const GAMEPAD_DEADZONE = 0.5; // Increased deadzone to reduce sensitivity
const GAMEPAD_BUTTON_MAP = {
    left: [14], // D-pad left
    right: [15], // D-pad right
    down: [13], // D-pad down
    rotate: [0, 2], // A button (Xbox) or X button (PlayStation), X button (Xbox) or Square (PlayStation)
    drop: [1, 3] // B button (Xbox) or Circle (PlayStation), Y button (Xbox) or Triangle (PlayStation)
};

function scanGamepads() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const connected = [];
    
    for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i]) {
            connected.push({
                index: i,
                id: gamepads[i].id,
                buttons: gamepads[i].buttons.length,
                axes: gamepads[i].axes.length
            });
        }
    }
    
    gameState.gamepads.connected = connected;
    return connected;
}

function createGamepadButtonState() {
    return {
        left: { pressed: false, wasPressed: false },
        right: { pressed: false, wasPressed: false },
        down: { pressed: false, wasPressed: false },
        rotate: { pressed: false, wasPressed: false },
        drop: { pressed: false, wasPressed: false }
    };
}

function resetSharedStats() {
    gameState.sharedStats = { ...TEAM_SCORE_TEMPLATE,
      contributions:Array.from({length:gameState.numPlayers},()=>({cellsCleared:0,linesHelped:0,finishes:0,returns:0})) };
    gameState.sharedStatsDirty = true;
}

// Attribution never modifies team scoring or the conditions for re-entry.
function creditClearedRows(rows,finisherId){
    const stats=gameState.sharedStats.contributions;
    if(!Array.isArray(stats)||!rows.length)return;
    for(const row of rows){
        const owners=new Set();
        for(const tile of row.cells){
            const owner=tile-1;
            if(Number.isInteger(owner)&&stats[owner]){
                stats[owner].cellsCleared++;
                owners.add(owner);
            }
        }
        for(const owner of owners)stats[owner].linesHelped++;
        if(stats[finisherId])stats[finisherId].finishes++;
    }
}
function setRandomSeed(seed) {
    gameState.randomSeed = normalizeSeed(seed);
    gameState.rng = createPrng(gameState.randomSeed);
}

function randomFloat() {
    if (gameState.rng) {
        return gameState.rng();
    }
    return Math.random();
}

function formatKeyLabel(code) {
    if (!code) return '';

    const arrowMap = {
        ArrowLeft: '←',
        ArrowRight: '→',
        ArrowUp: '↑',
        ArrowDown: '↓'
    };

    if (arrowMap[code]) {
        return arrowMap[code];
    }

    if (code === 'Space') {
        return 'Space';
    }

    if (code.startsWith('Key')) {
        return code.replace('Key', '');
    }

    if (code.startsWith('Digit')) {
        return code.replace('Digit', '');
    }

    return code;
}

function normalizeKeyCode(value) {
    if (!value) return '';

    if (value === ' ') {
        return 'Space';
    }

    if (/^Arrow(Left|Right|Up|Down)$/.test(value)) {
        return value;
    }

    if (/^Key[A-Z]$/.test(value)) {
        return value;
    }

    if (/^Digit[0-9]$/.test(value)) {
        return value;
    }

    if (value.length === 1) {
        const upper = value.toUpperCase();
        if (upper >= 'A' && upper <= 'Z') {
            return `Key${upper}`;
        }

        if (/^[0-9]$/.test(value)) {
            return `Digit${value}`;
        }
    }

    return value;
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString('en-US');
}

function createActionState() {
    return {
        active: false,
        heldTime: 0,
        hasFiredInitial: false
    };
}

// Player Class
class Player {
    constructor(id, color, keys, spawnAnchor) {
        this.id = id;
        this.color = color;
        this.keys = keys;
        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.currentPiece = null;
        this.nextPiece = null;
        this.position = { x: 0, y: 0 };
        this.gameOver = false;
        this.blocked = false;
        this.offline = false;
        this.reentryType = null;
        this.bag=[];
        this.currentType=null;
        this.nextType=null;
        this.holdType=null;
        this.holdUsed=false;
        this.lockCounter=0;
        this.lockResets=0;
        this.lastInputSeq = 0;
        this.inputWindowStart = 0;
        this.inputWindowCount = 0;
        this.dropCounter = 0;
        this.dropInterval = 1000;
        this.lastTime = 0;
        this.spawnAnchor = typeof spawnAnchor === 'number' ? spawnAnchor : getBoardWidth() / 2;
    }

    init(){
        this.nextType=this.randomType();
        this.nextPiece=SHAPES[this.nextType].map(row=>row.slice());
        this.spawnPiece();
    }
    randomType(){
        const next=drawSevenBag(this.bag,randomFloat);
        this.bag=next.bag;
        return next.type;
    }
    randomPiece(){return SHAPES[this.randomType()].map(row=>row.slice());}

    spawnPiece(presetType=null,consumeNext=true) {
        // Do not draw the queued piece while the personal entrance is unsafe.
        if(gameState.numPlayers>1&&!laneHasClearance(this)){
            this.blocked=true;this.gameOver=true;this.currentPiece=null;
            this.dropCounter=0;checkAllPlayersGameOver();return;
        }
        this.blocked=false;
        this.currentType=presetType||this.nextType||inferShapeType(this.nextPiece);
        this.currentPiece=SHAPES[this.currentType].map(row=>row.slice());
        if(consumeNext){
            this.nextType=this.randomType();
            this.nextPiece=SHAPES[this.nextType].map(row=>row.slice());
        }
        this.dropCounter=0;
        this.lockCounter=0;
        this.lockResets=0;
        this.holdUsed=false;
        const seat={id:this.id,spawnAnchor:this.spawnAnchor,
            spawnLaneX:Number.isInteger(this.spawnLaneX)?this.spawnLaneX:
                spawnLaneX(this.id,gameState.numPlayers,getBoardWidth())};
        const placement=planPieceSpawn(seat,this.currentType,gameState.board,
            gameState.players,gameState.numPlayers,getBoardWidth());
        this.position=placement.position||this.position;
        if(!placement.allowed){
            this.gameOver=true;
            if(gameState.numPlayers>1){this.blocked=true;this.currentPiece=null;}
            checkAllPlayersGameOver();
        }
    }

    checkCollision(piece = this.currentPiece, pos = this.position) {
        return checkPieceCollision(piece,pos,gameState.board,gameState.players,this.id);
    }

    resetLockOnAdjustment(){
        Object.assign(this,adjustLock(this.lockCounter,this.lockResets));
    }
    move(dir,{broadcast=true}={}){
        if(this.gameOver||!this.currentPiece||![-1,1].includes(dir))return false;
        const at={x:this.position.x+dir,y:this.position.y};
        if(this.checkCollision(this.currentPiece,at).collides)return false;
        this.position=at;
        this.resetLockOnAdjustment();
        soundManager.move();
        
        return true;
    }
    rotate({broadcast=true}={}){
        if(this.gameOver||!this.currentPiece)return false;
        const rotated=findRotationPlacement(this.currentPiece,this.position,gameState.board,gameState.players,this.id);
        if(!rotated)return false;
        this.currentPiece=rotated.currentPiece;
        this.position=rotated.position;
        this.resetLockOnAdjustment();
        soundManager.rotate();
        return true;
    }
    holdPiece({broadcast=true}={}){
        const exchange=planHold(this);
        if(!exchange)return false;
        this.holdType=exchange.outgoing;
        if(exchange.consumeNext)this.spawnPiece();
        else this.spawnPiece(exchange.incoming,false);
        this.holdUsed=true;
        return true;
    }
    lockPiece(hard=false){
        if(this.gameOver||!this.currentPiece)return;
        this.merge();soundManager.drop();
        this.clearLines();this.spawnPiece();
    }

    drop({broadcast=true}={}){
        if(this.gameOver||!this.currentPiece)return;
        const next={x:this.position.x,y:this.position.y+1};
        if(!this.checkCollision(this.currentPiece,next).collides){
            this.position=next;
            this.lockCounter=0;
        }
        this.dropCounter=0;
        
    }

    hardDrop({broadcast=true}={}){
        if(this.gameOver||!this.currentPiece)return;
        let remaining=BOARD_HEIGHT;
        while(remaining-->0){
            const next={x:this.position.x,y:this.position.y+1};
            if(this.checkCollision(this.currentPiece,next).collides)break;
            this.position=next;
        }
        // An adjacent active piece is not a rigid surface: never merge into it.
        if(this.checkCollision(this.currentPiece,{x:this.position.x,y:this.position.y+1}).withLocked)
            this.lockPiece(true);
        this.dropCounter=0;
        
    }

    merge() {
        for (let y = 0; y < this.currentPiece.length; y++) {
            for (let x = 0; x < this.currentPiece[y].length; x++) {
                if (this.currentPiece[y][x]) {
                    const boardY = this.position.y + y;
                    const boardX = this.position.x + x;
                    if (boardY >= 0) {
                        gameState.board[boardY][boardX] = this.id + 1;
                    }
                }
            }
        }
    }

    clearLines() {
        let linesCleared = 0;

        const boardWidth = getBoardWidth();
        const clearedRows=gameState.board.flatMap((row,y)=>row.every(Boolean)?[{y,cells:row.slice()}]:[]);
        for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
            if (gameState.board[y].every(cell => cell !== 0)) {
                gameState.board.splice(y, 1);
                gameState.board.unshift(Array(boardWidth).fill(0));
                linesCleared++;
                y++; // Check the same row again
            }
        }

        if (linesCleared === 0) {
            const hadCombo=gameState.sharedStats.comboChain!==0;
            Object.assign(gameState.sharedStats,scoreLineClear(gameState.sharedStats,0));
            if(hadCombo)gameState.sharedStatsDirty=true;
            return;
        }

        // Record actual ownership of removed cells, not just the final action.
        creditClearedRows(clearedRows,this.id);
        soundManager.lineClear(linesCleared);

        Object.assign(gameState.sharedStats,scoreLineClear(gameState.sharedStats,linesCleared));
        this.lines = gameState.sharedStats.lines;
        this.score = gameState.sharedStats.score;
        this.level = gameState.sharedStats.level;

        gameState.players.forEach(player => {
            player.dropInterval = intervalAfterClear(player.dropInterval,linesCleared);
            player.lines = gameState.sharedStats.lines;
            player.score = gameState.sharedStats.score;
            player.level = gameState.sharedStats.level;
        });

        gameState.sharedStatsDirty = true;
    }

    update(deltaTime){
        if(this.gameOver||!this.currentPiece)return;
        this.dropCounter+=deltaTime;
        if(this.dropCounter>=this.dropInterval)this.drop({broadcast:false});
        if(this.gameOver||!this.currentPiece)return;
        const landing=this.checkCollision(this.currentPiece,{x:this.position.x,y:this.position.y+1});
        this.lockCounter=advanceLock(this.lockCounter,deltaTime,landing.withLocked);
        if(landing.withLocked&&this.lockCounter>=LOCK_DELAY_MS)this.lockPiece();
    }
}

function laneHasClearance(player){
    const x=Number.isInteger(player.spawnLaneX)?player.spawnLaneX:
        spawnLaneX(player.id,gameState.numPlayers,getBoardWidth());
    return isLaneClear(x,gameState.board,gameState.players,player.id,gameState.numPlayers);
}

function checkAllPlayersGameOver() {
    if (!gameState.players.length) return;

    if (areAllSeatsEliminated(gameState.players)) {
        gameState.isGameOver = true;
        soundManager.gameOver();
    }
}


 let rngState=saved?.rngState??((seed>>>0)+0x6D2B79F5);
 function rng(){rngState=(rngState+0x6D2B79F5)|0;let r=Math.imul(rngState^rngState>>>15,1|rngState);r=r+Math.imul(r^r>>>7,61|r)^r;return((r^r>>>14)>>>0)/4294967296;}
 if(saved){Object.assign(gameState,saved);gameState.players=saved.players.map(p=>Object.assign(new Player(p.id,p.color,p.keys,p.spawnAnchor),p));}
 gameState.rng=rng;
 return {
 init(players){gameState.numPlayers=players.length;gameState.boardWidth=computeBoardWidth(players.length);gameState.board=createEmptyBoard();gameState.players=[];resetSharedStats();players.forEach((p,i)=>{const laneX=spawnLaneX(i,players.length,gameState.boardWidth);const v=new Player(i,p.color,{},laneX+2);v.spawnLaneX=laneX;v.name=p.name||('Игрок '+(i+1));v.init();gameState.players.push(v);});},
 step(ms){for(let t=0;t<ms;t+=50)for(const p of gameState.players)if(!p.gameOver&&!p.offline)p.update(Math.min(50,ms-t));},
 setPresence(rooms,connectedIds){
  if(!Array.isArray(connectedIds))return;
  const live=new Set(connectedIds);
  for(let i=0;i<gameState.players.length;i++){
   const seat=gameState.players[i],owner=rooms[i];
   const connected=owner&&!owner.left&&live.has(owner.id);
   if(!connected){seat.offline=true;continue;}
   if(!seat.offline)continue;
   // A disconnected figure is parked without occupying the team board.
   // Rejoin at the same position only if the board is still collision-free.
   seat.offline=false;
   if(seat.gameOver||!seat.currentPiece)continue;
   if(seat.checkCollision().collides){
    seat.reentryType=seat.currentType||inferShapeType(seat.currentPiece);
    seat.blocked=true;
    seat.gameOver=true;
    seat.currentPiece=null;
    seat.dropCounter=0;
    seat.lockCounter=0;
   }
  }
 },
 acceptLegacy(i,action,now){
  const seat=gameState.players[i];
  if(!seat||seat.gameOver||seat.offline)return;
  if(!action||(action.action==='move'?![-1,1].includes(action.direction):
      !['rotate','drop','hardDrop','hold'].includes(action.action)))
    throw Error('Некорректная команда');
  if(!seat.inputWindowStart||now-seat.inputWindowStart>=1000||now<seat.inputWindowStart){
   seat.inputWindowStart=now;seat.inputWindowCount=0;
  }
  if(seat.inputWindowCount>=MAX_ACTIONS_PER_SECOND)throw Error('Слишком частые команды');
  seat.inputWindowCount++;
  this.input(i,action);
 },
 resume(i){const v=gameState.players[i];if(!canPlayerResume(v,gameState.board,gameState.players,gameState.numPlayers,gameState.isGameOver))return false;
  const holdUsed=v.holdUsed,preserved=v.reentryType;
  v.gameOver=false;v.blocked=false;
  if(preserved){v.spawnPiece(preserved,false);v.holdUsed=holdUsed;}
  else v.spawnPiece();
  if(!v.gameOver){
   v.reentryType=null;
   if(gameState.sharedStats.contributions?.[i])gameState.sharedStats.contributions[i].returns++;
  }
  return !v.gameOver;},
 input(i,p){const v=gameState.players[i];if(!v||v.gameOver)return;if(p.action==='move'&&[-1,1].includes(p.direction))v.move(p.direction,{broadcast:false});else if(['rotate','drop','hardDrop'].includes(p.action))v[p.action]({broadcast:false});else if(p.action==='hold')v.holdPiece({broadcast:false});else throw Error('Некорректная команда');},
 acceptBatch(i,actions,now){
  const v=gameState.players[i];if(!v||v.gameOver||v.offline)return;
  const valid=a=>a&&Number.isSafeInteger(a.seq)&&a.seq>0&&a.seq<=2147483647&&
   (a.action==='move'?[-1,1].includes(a.direction):['rotate','drop','hardDrop','hold'].includes(a.action));
  if(!Array.isArray(actions)||!actions.length||actions.length>MAX_INPUT_BATCH||!actions.every(valid))
   throw Error('Некорректный пакет команд');
  const ordered=actions.filter(a=>a.seq>v.lastInputSeq);
  if(!ordered.length)return;
  if(ordered.some((a,j)=>a.seq<=(j?ordered[j-1].seq:v.lastInputSeq)))
   throw Error('Пропущен порядковый номер команды');
  if(!v.inputWindowStart||now-v.inputWindowStart>=1000||now<v.inputWindowStart){
   v.inputWindowStart=now;v.inputWindowCount=0;
  }
  if(v.inputWindowCount+ordered.length>MAX_ACTIONS_PER_SECOND)throw Error('Слишком частые команды');
  v.inputWindowCount+=ordered.length;
  for(const action of ordered){if(!v.gameOver)this.input(i,action);v.lastInputSeq=action.seq;}
 },
 snapshot(){return {board:gameState.board,boardWidth:gameState.boardWidth,numPlayers:gameState.numPlayers,sharedStats:gameState.sharedStats,isGameOver:gameState.isGameOver,rngState,players:gameState.players.map(p=>({...p,canResume:canPlayerResume(p,gameState.board,gameState.players,gameState.numPlayers,gameState.isGameOver)}))};}
 };
}
const MAX_CLOCK_CATCHUP=1200,MAX_CLOCK_IDLE=3500;
const COLORS=['#FF1493','#00D9FF','#FFDB58','#39FF14'];
const copy=s=>structuredClone(s),out=state=>({state,events:[{type:'state',payload:{}}]});
function add(s,p){
 const existing=s.players.find(v=>v.id===p.id);
 if(existing){existing.left=false;return;}
 if(s.started||s.players.length>=4)throw Error('Комната заполнена или игра уже началась');
 s.players.push({id:p.id,name:String(p.name||'Игрок').slice(0,24),color:COLORS.find(c=>!s.players.some(v=>v.color===c)),ready:false,left:false});
}
function boundedElapsed(now,previous){
 const elapsed=Math.max(0,now-previous);
 return elapsed>MAX_CLOCK_IDLE?0:Math.min(elapsed,MAX_CLOCK_CATCHUP);
}
function newMatch(state,connectedIds){
 state.seed=Date.now()>>>0;
 state.round=(state.round||0)+1;
 state.paused=false;
 state.started=true;
 state.phase='playing';
 state.lastTick=Date.now();
 const r=runtime(null,state.seed);
 r.init(state.players);
 state.engine=r.snapshot();
 // Preserve disconnected seats for later recovery without inserting ghost
 // pieces into a new round the disconnected user never joined.
 if(Array.isArray(connectedIds)){
  state.engine.players.forEach((piece,index)=>{
   if(!connectedIds.includes(state.players[index].id)){
    piece.offline=true;
    piece.blocked=true;
    piece.gameOver=true;
    piece.currentPiece=null;
   }
  });
 }
}
export default {protocolVersion:1,
 createRoom({player}){const s={phase:'lobby',hostId:player.id,players:[],started:false,paused:false,round:0,seed:0,inputBatchVersion:1,rulesVersion:3,contributionVersion:1,engine:null,lastTick:Date.now()};add(s,player);return out(s);},
 onJoin({state,player}){state=copy(state);add(state,player);return out(state);},
 onLeave({state,player}){
  state=copy(state);
  const index=state.players.findIndex(p=>p.id===player.id);
  if(state.started&&state.engine){
   if(index>=0){
    state.players[index].left=true;
    state.players[index].ready=false;
    const piece=state.engine.players[index];
    if(piece){piece.gameOver=true;piece.offline=true;piece.currentPiece=null;}
   }
   state.hostId=state.players.find(p=>!p.left)?.id||null;
   if(state.engine.players.every(p=>p.gameOver||!p.currentPiece)){
    state.engine.isGameOver=true;state.phase='finished';
   }
   if(state.players.every(p=>p.left)){state.started=false;state.phase='lobby';state.engine=null;}
   return out(state);
  }
  state.players=state.players.filter(p=>p.id!==player.id);
  state.hostId=state.players[0]?.id||null;
  state.players.forEach(p=>p.ready=false);
  return out(state);
 },
 onMessage({state,player,payload:p,connectedIds}){
  state=copy(state);
  const index=state.players.findIndex(v=>v.id===player.id&& !v.left);
  if(index<0)throw Error('Игрок не в комнате');
  const v=state.players[index];
  // Host reassignment uses server-observed live sockets, never client claims.
  // A survivor can therefore pause or start the next round if the host vanishes.
  if(Array.isArray(connectedIds)&&connectedIds.length&&!connectedIds.includes(state.hostId)){
   const successor=state.players.find(seat=>!seat.left&&connectedIds.includes(seat.id));
   if(successor)state.hostId=successor.id;
  }
  if(state.started){
   if(p?.type==='rematch'){
    if(player.id!==state.hostId||!state.engine?.isGameOver)throw Error('Только ведущий может начать новый раунд после завершения');
    state.players=state.players.filter(p=>!p.left);
    const live=state.players.filter(p=>!p.left&&(!Array.isArray(connectedIds)||connectedIds.includes(p.id)));
    if(live.length<2){
     state.started=false;state.phase='lobby';state.engine=null;
     state.players.forEach(p=>p.ready=false);return out(state);
    }
    state.players.forEach(p=>p.ready=true);
    newMatch(state,connectedIds);
    return out(state);
   }
   if(p?.type==='pause'){
    if(player.id!==state.hostId||state.engine?.isGameOver)throw Error('Пауза доступна ведущему во время игры');
    state.paused=!state.paused;
    state.lastTick=Date.now();
    return out(state);
   }
   if(!state.paused&&!state.engine?.isGameOver){
    const now=Date.now(),elapsed=boundedElapsed(now,state.lastTick);
    const r=runtime(state.engine,state.seed);
    r.setPresence(state.players,connectedIds);
    r.step(elapsed);
    if(p?.type==='input_batch')r.acceptBatch(index,p.actions,now);
    else if(p?.type==='input')r.acceptLegacy(index,p.input||{},now);
    else if(p?.type==='resume')r.resume(index);
    else if(p?.type!=='pulse')throw Error('Игра уже началась');
    state.engine=r.snapshot();
    state.lastTick=now;
    if(state.engine.isGameOver)state.phase='finished';
   }else if(p?.type!=='pulse')throw Error('Игра приостановлена или завершена');
   return out(state);
  }
  // An absent player must explicitly ready up again after reconnecting.
  if(Array.isArray(connectedIds)){
   const online=new Set(connectedIds);
   state.players.forEach(seat=>{if(!online.has(seat.id))seat.ready=false;});
  }
  if(p?.type==='nickname')v.name=String(p.name||'Игрок').slice(0,24);
  else if(p?.type==='color'){
   if(!COLORS.includes(p.color)||state.players.some(x=>x.id!==v.id&&x.color===p.color))throw Error('Цвет занят');
   v.color=p.color;
  }else if(p?.type==='ready'){
   v.ready=!v.ready;
   const live=state.players.filter(p=>!p.left&&(!Array.isArray(connectedIds)||connectedIds.includes(p.id)));
   if(live.length>=2 && live.every(p=>p.ready))newMatch(state,connectedIds);
  }else if(p?.type!=='sync')throw Error('Неизвестная команда');
  return out(state);
 },
 viewForPlayer({state,player}){
  // A snapshot is a public projection, not the authoritative save.
  // Keep positions, held/next pieces, score and the seat owner's acknowledgement.
  if(!state.engine)return state;
  const {rngState,...publicEngine}=state.engine;
  const players=publicEngine.players.map((seat,index)=>{
   const {bag,inputWindowStart,inputWindowCount,lastTime,keys,...publicSeat}=seat;
   if(state.players[index]?.id!==player?.id)delete publicSeat.lastInputSeq;
   return publicSeat;
  });
  return {...state,engine:{...publicEngine,players}};
 }
};
