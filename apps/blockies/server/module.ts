// Original Blockies engine; the wrapper below owns the room clock and serializable RNG.
function runtime(saved,seed){const soundManager={move(){},rotate(){},drop(){},lineClear(){},gameOver(){}};
// Game Configuration
const BLOCK_SIZE = 25;
const BASE_BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const ADDITIONAL_COLUMNS_PER_PLAYER = 4;
const PREVIEW_SIZE = 4;

const BASE_LINE_SCORE = 100;
const STREAK_BONUS_STEP = 0.1;
const MULTI_LINE_BONUS_STEP = 0.2;

// Tetromino shapes
const SHAPES = {
    I: [[1, 1, 1, 1]],
    O: [[1, 1], [1, 1]],
    T: [[0, 1, 0], [1, 1, 1]],
    S: [[0, 1, 1], [1, 1, 0]],
    Z: [[1, 1, 0], [0, 1, 1]],
    J: [[1, 0, 0], [1, 1, 1]],
    L: [[0, 0, 1], [1, 1, 1]]
};

// Default colors for players - Retro-futurism palette
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
    lastClearDetail: null
};

function computeBoardWidth(numPlayers) {
    const players = Math.max(1, numPlayers || 1);
    return BASE_BOARD_WIDTH + (players - 1) * ADDITIONAL_COLUMNS_PER_PLAYER;
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
    pieceBag: [],
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
    gameState.sharedStats = { ...TEAM_SCORE_TEMPLATE };
    gameState.sharedStatsDirty = true;
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

// Shared seven-bag: the same seeded queue is consumed by all players.
// No tetromino can disappear for more than twelve consecutive shared draws.
function nextBaggedPiece() {
    if (!Array.isArray(gameState.pieceBag)) gameState.pieceBag = [];
    if (!gameState.pieceBag.length) {
        const bag = Object.keys(SHAPES);
        for (let i = bag.length - 1; i > 0; i--) {
            const j = Math.floor(randomFloat() * (i + 1));
            [bag[i], bag[j]] = [bag[j], bag[i]];
        }
        gameState.pieceBag = bag;
    }
    const shape = gameState.pieceBag.pop();
    return SHAPES[shape].map(row => [...row]);
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
        this.heldPiece = null;
        this.holdUsed = false;
        this.position = { x: 0, y: 0 };
        this.gameOver = false;
        this.dropCounter = 0;
        this.dropInterval = 1000;
        this.lastTime = 0;
        this.spawnAnchor = typeof spawnAnchor === 'number' ? spawnAnchor : getBoardWidth() / 2;
    }

    init() {
        this.nextPiece = this.randomPiece();
        this.spawnPiece();
    }

    randomPiece() {
        return nextBaggedPiece();
    }

    spawnPiece() {
        this.currentPiece = this.nextPiece;
        this.nextPiece = this.randomPiece();
        this.holdUsed = false;
        this.placeSpawn();
    }

    hold({ broadcast = true } = {}) {
        if (!this.currentPiece || this.gameOver || this.holdUsed) return false;
        const outgoing = this.currentPiece;
        if (this.heldPiece) {
            this.currentPiece = this.heldPiece;
        } else {
            this.currentPiece = this.nextPiece;
            this.nextPiece = this.randomPiece();
        }
        this.heldPiece = outgoing;
        this.holdUsed = true;
        this.placeSpawn();
        if (broadcast && typeof networkManager !== 'undefined' && networkManager.connected && window.uiManager?.isOnlineMode) {
            networkManager.sendPlayerInput({ action: 'hold' });
        }
        return true;
    }

    placeSpawn() {
        const pieceWidth = this.currentPiece[0].length;
        const boardWidth = getBoardWidth();
        const preferredX = Math.min(
            boardWidth - pieceWidth,
            Math.max(0, Math.round(this.spawnAnchor - pieceWidth / 2))
        );

        let spawnPosition = null;
        const checked = new Set();

        for (let offset = 0; offset < boardWidth; offset++) {
            const candidates = [];
            if (offset === 0) {
                candidates.push(preferredX);
            } else {
                const left = preferredX - offset;
                const right = preferredX + offset;

                if (left >= 0) candidates.push(left);
                if (right <= boardWidth - pieceWidth) candidates.push(right);
            }

            for (const candidate of candidates) {
                if (checked.has(candidate)) continue;
                checked.add(candidate);

                if (!this.checkCollision(this.currentPiece, { x: candidate, y: 0 }).collides) {
                    spawnPosition = { x: candidate, y: 0 };
                    break;
                }
            }

            if (spawnPosition) break;
        }

        this.position = spawnPosition || { x: preferredX, y: 0 };

        if (!spawnPosition && this.checkCollision().collides) {
            this.gameOver = true;
            checkAllPlayersGameOver();
        }

        this.dropCounter = 0;
    }

    checkCollision(piece = this.currentPiece, pos = this.position) {
        const result = {
            collides: false,
            withLocked: false,
            withActive: false
        };

        for (let y = 0; y < piece.length; y++) {
            for (let x = 0; x < piece[y].length; x++) {
                if (!piece[y][x]) continue;

                const boardX = pos.x + x;
                const boardY = pos.y + y;
                const boardWidth = getBoardWidth();

                if (boardX < 0 || boardX >= boardWidth || boardY >= BOARD_HEIGHT) {
                    result.collides = true;
                    result.withLocked = true;
                    return result;
                }

                if (boardY < 0) continue;

                if (gameState.board[boardY][boardX]) {
                    result.collides = true;
                    result.withLocked = true;
                    return result;
                }

                if (isCellOccupiedByOtherPiece(boardX, boardY, this.id)) {
                    result.collides = true;
                    result.withActive = true;
                }
            }
        }

        return result;
    }

    move(dir, { broadcast = true } = {}) {
        this.position.x += dir;
        if (this.checkCollision().collides) {
            this.position.x -= dir;
        } else {
            soundManager.move();
            // Send online update if in online game
            if (broadcast && typeof networkManager !== 'undefined' && networkManager.connected && window.uiManager?.isOnlineMode) {
                networkManager.sendPlayerInput({ action: 'move', direction: dir });
            }
        }
    }

    rotate({ broadcast = true } = {}) {
        if (this.gameOver || !this.currentPiece) return false;
        const rotated = this.currentPiece[0].map((_, i) =>
            this.currentPiece.map(row => row[i]).reverse()
        );
        // Stable, bounded kicks: nearby cells first; only one upward rescue.
        // Every candidate respects locked blocks and other players' active pieces.
        const kicks = [[0,0],[-1,0],[1,0],[-2,0],[2,0],[-3,0],[3,0],[0,-1],[-1,-1],[1,-1],[0,-2],[0,-3]];
        for (const [dx, dy] of kicks) {
            const next = { x: this.position.x + dx, y: this.position.y + dy };
            if (this.checkCollision(rotated, next).collides) continue;
            this.currentPiece = rotated;
            this.position = next;
            soundManager.rotate();
            if (broadcast && typeof networkManager !== 'undefined' && networkManager.connected && window.uiManager?.isOnlineMode) {
                networkManager.sendPlayerInput({ action: 'rotate' });
            }
            return true;
        }
        return false;
    }

    drop({ broadcast = true } = {}) {
        this.position.y++;
        const collision = this.checkCollision();
        if (collision.collides) {
            this.position.y--;
            if (collision.withLocked) {
                this.merge();
                soundManager.drop();
                this.clearLines();
                this.spawnPiece();
            }
        }
        this.dropCounter = 0;
        // Send online update if in online game
        if (broadcast && typeof networkManager !== 'undefined' && networkManager.connected && window.uiManager?.isOnlineMode) {
            networkManager.sendPlayerInput({ action: 'drop' });
        }
    }

    hardDrop({ broadcast = true } = {}) {
        let maxDrops = BOARD_HEIGHT; // Safety limit
        let landedOnLocked = false;

        while (maxDrops > 0) {
            this.position.y++;
            maxDrops--;

            const collision = this.checkCollision();
            if (!collision.collides) {
                continue;
            }

            if (collision.withLocked) {
                landedOnLocked = true;
            }

            this.position.y--;
            break;
        }

        if (landedOnLocked) {
            this.merge();
            soundManager.drop();
            this.clearLines();
            this.spawnPiece();
        }
        this.dropCounter = 0;
        // Send online update if in online game
        if (broadcast && typeof networkManager !== 'undefined' && networkManager.connected && window.uiManager?.isOnlineMode) {
            networkManager.sendPlayerInput({ action: 'hardDrop' });
        }
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
        const clearedRows = [];

        const boardWidth = getBoardWidth();
        for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
            if (gameState.board[y].every(cell => cell !== 0)) {
                clearedRows.push({ y, owners: gameState.board[y].slice() });
                gameState.board.splice(y, 1);
                gameState.board.unshift(Array(boardWidth).fill(0));
                linesCleared++;
                y++; // Check the same row again
            }
        }

        if (linesCleared === 0) {
            if (gameState.sharedStats.comboChain !== 0) {
                gameState.sharedStats.comboChain = 0;
                gameState.sharedStatsDirty = true;
            }
            gameState.sharedStats.lastClearDetail = null;
            return;
        }

        // Play line clear sound
        soundManager.lineClear(linesCleared);

        const comboStep = gameState.sharedStats.comboChain || 0;
        const comboMultiplier = 1 + STREAK_BONUS_STEP * comboStep;
        const multiMultiplier = 1 + MULTI_LINE_BONUS_STEP * (linesCleared - 1);
        const perLineScore = Math.round(BASE_LINE_SCORE * comboMultiplier * multiMultiplier);
        const gained = perLineScore * linesCleared;

        const streakBonusPercent = Math.round((comboMultiplier - 1) * 100);
        const multiBonusPercent = Math.round((multiMultiplier - 1) * 100);

        gameState.sharedStats.lines += linesCleared;
        gameState.sharedStats.score += gained;
        gameState.sharedStats.level = Math.floor(gameState.sharedStats.lines / 10) + 1;
        gameState.sharedStats.comboChain = comboStep + 1;
        gameState.sharedStats.lastClearDetail = {
            linesCleared,
            totalScore: gained,
            rows: clearedRows,
            perLineScore,
            basePerLine: BASE_LINE_SCORE,
            comboChain: gameState.sharedStats.comboChain,
            comboMultiplier,
            multiMultiplier,
            streakBonusPercent,
            multiBonusPercent
        };

        this.lines = gameState.sharedStats.lines;
        this.score = gameState.sharedStats.score;
        this.level = gameState.sharedStats.level;

        gameState.players.forEach(player => {
            player.dropInterval = Math.max(100, player.dropInterval * Math.pow(0.95, linesCleared));
            player.lines = gameState.sharedStats.lines;
            player.score = gameState.sharedStats.score;
            player.level = gameState.sharedStats.level;
        });

        gameState.sharedStatsDirty = true;
    }

    update(deltaTime) {
        if (this.gameOver) return;

        this.dropCounter += deltaTime;
        if (this.dropCounter > this.dropInterval) {
            this.drop();
        }
    }
}

function isCellOccupiedByOtherPiece(x, y, currentPlayerId) {
    return gameState.players.some(player => {
        if (player.id === currentPlayerId || player.gameOver || !player.currentPiece) {
            return false;
        }

        for (let py = 0; py < player.currentPiece.length; py++) {
            for (let px = 0; px < player.currentPiece[py].length; px++) {
                if (!player.currentPiece[py][px]) continue;
                const boardX = player.position.x + px;
                const boardY = player.position.y + py;

                if (boardX === x && boardY === y) {
                    return true;
                }
            }
        }

        return false;
    });
}

function checkAllPlayersGameOver() {
    if (!gameState.players.length) return;

    if (gameState.players.every(player => player.gameOver)) {
        gameState.isGameOver = true;
        soundManager.gameOver();
    }
}


 let rngState=saved?.rngState??((seed>>>0)+0x6D2B79F5);
 function rng(){rngState=(rngState+0x6D2B79F5)|0;let r=Math.imul(rngState^rngState>>>15,1|rngState);r=r+Math.imul(r^r>>>7,61|r)^r;return((r^r>>>14)>>>0)/4294967296;}
 if(saved){Object.assign(gameState,saved);gameState.players=saved.players.map(p=>Object.assign(new Player(p.id,p.color,p.keys,p.spawnAnchor),p));}
 gameState.rng=rng;
 return {
 init(players){gameState.numPlayers=players.length;gameState.boardWidth=computeBoardWidth(players.length);gameState.board=createEmptyBoard();gameState.players=[];gameState.pieceBag=[];resetSharedStats();players.forEach((p,i)=>{const v=new Player(i,p.color,{},((i+1)/(players.length+1))*gameState.boardWidth);v.init();gameState.players.push(v);});},
 step(ms,awaySlots=[]){for(let t=0;t<ms;t+=50)for(const p of gameState.players)if(!p.gameOver&&!awaySlots.includes(p.id))p.update(Math.min(50,ms-t));},
 input(i,p){const v=gameState.players[i];if(!v||v.gameOver)return;if(p.action==='move'&&[-1,1].includes(p.direction))v.move(p.direction,{broadcast:false});else if(['rotate','drop','hardDrop','hold'].includes(p.action))v[p.action]({broadcast:false});else throw Error('Некорректная команда');},
 snapshot(){return {board:gameState.board,boardWidth:gameState.boardWidth,numPlayers:gameState.numPlayers,sharedStats:gameState.sharedStats,isGameOver:gameState.isGameOver,rngState,pieceBag:gameState.pieceBag,players:gameState.players.map(p=>({...p}))};}
 };
}
const COLORS=['#FF1493','#00D9FF','#FFDB58','#39FF14'];
const IDLE_GRACE_MS=3000;
const SEAT_EXPIRY_MS=60000;
const copy=s=>structuredClone(s),out=state=>({state,events:[{type:'state',payload:{}}]});
function active(s){return s.players.filter(p=>!p.departed&&!p.timedOut);}
function add(s,p){
 const existing=s.players.find(v=>v.id===p.id);
 if(existing){
  if(existing.departed){
   if(s.phase==='playing')throw Error('Партия уже идёт');
   existing.departed=false;existing.ready=false;
   existing.name=String(p.name||existing.name).slice(0,24);
  }
  return;
 }
 if(s.phase==='playing'||active(s).length>=4)throw Error('Комната заполнена или игра уже началась');
 s.players.push({id:p.id,name:String(p.name||'Игрок').slice(0,24),
  color:COLORS.find(c=>!active(s).some(v=>v.color===c)),ready:false,departed:false});
}
function startRound(s){
 const participants=active(s);
 if(!participants.length||!participants.every(p=>p.ready))throw Error('Не все игроки готовы');
 // The old stack is discarded only after explicit unanimous rematch readiness.
 // Reindex only at a round boundary: locked cells refer to stable player slots in an active round.
 s.players=participants.map(p=>({...p,ready:false,departed:false,away:false,timedOut:false,lastSeenAt:Date.now()}));
 s.seed=(Date.now()>>>0) || 1;
 s.phase='playing';s.started=true;s.lastTick=Date.now();s.round=(s.round||0)+1;
 const r=runtime(null,s.seed);r.init(s.players);s.engine=r.snapshot();
}
function finishIfOver(s){
 if(s.engine?.isGameOver){
  s.phase='results';s.started=false;
  s.players.forEach(p=>p.ready=false);
 }
}
export default {protocolVersion:1,
 createRoom({player}) {
  const s={phase:'lobby',hostId:player.id,players:[],started:false,seed:Date.now()>>>0,
    engine:null,lastTick:Date.now(),round:0};
  add(s,player);return out(s);
 },
 onJoin({state,player}){
  state=copy(state);add(state,player);return out(state);
 },
 onLeave({state,player,players=[]}){
  state=copy(state);
  const slot=state.players.findIndex(p=>p.id===player.id);
  if(slot===-1)return out(state);
  state.hostId=players[0]?.id||active(state).find(p=>p.id!==player.id)?.id||null;
  if(state.phase==='playing'||state.phase==='results'){
   // Do not splice playing-round slots: all locked cells and active pieces use those indices.
   state.players[slot].departed=true;state.players[slot].ready=false;
   if(state.engine?.players?.[slot]){
    state.engine.players[slot].gameOver=true;
    state.engine.players[slot].currentPiece=null;
   }
   if(state.phase==='playing'&&state.engine){
    if(state.engine.players.every(p=>p.gameOver))state.engine.isGameOver=true;
    finishIfOver(state);
   }
  }else{
   state.players=state.players.filter(p=>p.id!==player.id);
  }
  return out(state);
 },
 onMessage({state,player,payload:p}){
  state=copy(state);
  const index=state.players.findIndex(v=>v.id===player.id&&!v.departed);
  if(index<0)throw Error('Игрок не в комнате');
  const v=state.players[index],now=Date.now();
  if(state.phase==='playing'){
   if(p?.type!=='input'&&p?.type!=='pulse')throw Error('Игра уже началась');
   // Messages from authenticated seats act as heartbeats, not proof of all other
   // sockets being online. Grace prevents falling or locking a disconnected piece.
   const previousTick=state.lastTick;
   for(const seat of state.players){
    if(seat.departed||seat.timedOut)continue;
    const lastSeen=seat.lastSeenAt??previousTick;
    const absence=now-lastSeen;
    seat.away=absence>IDLE_GRACE_MS;
    if(absence>SEAT_EXPIRY_MS){
     seat.timedOut=true;
     seat.ready=false;
     const held=state.engine?.players?.[state.players.indexOf(seat)];
     if(held){held.gameOver=true;held.currentPiece=null;}
    }
   }
   v.lastSeenAt=now;
   if(!v.timedOut)v.away=false;
   const r=runtime(state.engine,state.seed);
   r.step(Math.min(250,Math.max(0,now-previousTick)),
     state.players.flatMap((seat,i)=>seat.away||seat.timedOut||seat.departed?[i]:[]));
   if(p.type==='input'&&!v.timedOut)r.input(index,p.input||{});
   state.engine=r.snapshot();state.lastTick=now;
   if(state.engine.players.every(seat=>seat.gameOver))state.engine.isGameOver=true;
   finishIfOver(state);
   return out(state);
  }
  if(state.phase==='results'){
   // Expired players can rejoin in results and vote for the next round.
   if(v.timedOut){v.timedOut=false;v.away=false;v.lastSeenAt=now;}
   if(p?.type==='rematch'){
    v.ready=!v.ready;
    if(active(state).every(x=>x.ready))startRound(state);
   }else if(!['sync','pulse','input'].includes(p?.type))throw Error('Ожидается повторный матч');
   return out(state);
  }
  if(p?.type==='nickname')v.name=String(p.name||'Игрок').slice(0,24);
  else if(p?.type==='color'){
   if(!COLORS.includes(p.color)||active(state).some(x=>x.id!==v.id&&x.color===p.color))throw Error('Цвет занят');
   v.color=p.color;
  }else if(p?.type==='ready'){
   v.ready=!v.ready;
   if(active(state).every(x=>x.ready))startRound(state);
  }else if(p?.type!=='sync')throw Error('Неизвестная команда');
  return out(state);
 },
 viewForPlayer({state}){return state;}
};
