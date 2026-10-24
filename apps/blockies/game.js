// Localization
import {loadSolo,saveSolo,clearSolo} from './solo-save.js';
import {BoardEffects,getNewLockedCells} from './board-effects.js';
import {projectOwnPiece} from './input-prediction.js';

const TRANSLATIONS = {
    en: {
        // Main Menu
        welcome: "Welcome to Blockies!",
        tagline: "Stack vibrant neon blocks in this modern take on the classic puzzle game. Play solo or team up with friends!",
        singlePlayer: "Single Player",
        localCoop: "Local Co-op",
        online: "Online",
        playSolo: "Start a new solo game",
        heroLine1: "Room", heroLine2: "for every", heroLine3: "block.",
        homeDescription: "One shared stack for every player. Build lines together or go at your own pace.",
        localDescription: "Pick players and controls. Every piece lands in the same shared well.",
        onlineDescription: "Create a room and share the link. Play on one shared board.",
        roomCode: "Room code",joinRoom:"Join",orCreate:"OR CREATE YOUR OWN",
        inviteCode:"INVITE CODE",invite:"Share invite",linesLabel:"Lines",
        sharedBoard:"SHARED WELL",moveHint:"MOVE",actionsHint:"ACTIONS",
        gestureHint:"On the board: tap to rotate · swipe to move",
        pauseDescription:"Your pieces stay right where you left them.",
        resumeSoloGame: "Continue saved game",
        recoveryOffline: "Connection lost. Reconnecting…",
        recoveryRestoring: "Restoring the online match…",
        recoveryStalled: "Server is not responding. Waiting for synchronization…",
        playTogether: "Play together",
        playOverNetwork: "Play over network",
        
        // Settings
        settings: "Settings",
        globalSettings: "Global Settings",
        soundEffects: "Sound Effects",
        playerSettings: "Player Settings",
        blockColor: "Block Color:",
        gamepad: "Gamepad:",
        keyboard: "Keyboard",
        saveSettings: "Save Settings",
        resetToDefault: "Reset to Default",
        cancel: "Cancel",
        
        // Messages
        settingsSaved: "Settings Saved",
        settingsSavedMsg: "Your settings have been saved successfully!",
        settingsReset: "Settings Reset",
        settingsResetMsg: "All settings have been reset to default values!",
        colorConflict: "Color Conflict",
        colorConflictMsg: "Please choose unique colors for each player.",
        keyBindingConflict: "Key Binding Conflict",
        keyBindingConflictMsg: "Please assign unique keys for each action.",
        gamepadConflict: "Gamepad Conflict",
        gamepadConflictMsg: "Each gamepad can only be assigned to one player.",
        networkError: "Network Error",
        
        // Game
        pause: "Pause",
        menu: "Menu",
        gamePaused: "Game Paused",
        resume: "Resume",
        restart: "Restart",
        mainMenu: "Main Menu",
        gameOver: "Game Over!",
        playAgain: "Play Again",
        teamScore: "Team Score",
        lines: "lines",
        comboReady: "Combo ready",
        comboX: "Combo x",
        streak: "streak",
        inPlay: "In play",
        out: "Out",
        lineBreak: "Line break",
        doubleBreak: "Double break",
        tripleBreak: "Triple break",
        megaClear: "Mega clear",
        pts: "pts",
        ptsPerLine: "pts / line",
        multiBonus: "Multi",
        streakBonus: "Streak",
        
        // Feature list
        multipleGameModes: "Multiple Game Modes",
        localAndOnlineMultiplayer: "Local & Online Multiplayer",
        fastPacedAction: "Fast-Paced Action",
        
        // Empty states
        noRoomsAvailable: "No rooms available yet",
        createRoomPrompt: "Be the first to create a room!",
        
        // Network errors
        connectionFailed: "Connection failed",
        serverUnavailable: "Server is currently unavailable. Please try again later.",
        socketIoNotAvailable: "Unable to connect to multiplayer server.",
        
        // Touch controls
        touchControlsReady: "Touch controls ready",
        startGameForTouch: "Start a game to use touch controls",
        
        // Combo help
        comboHelp: "Clear lines consecutively without gaps to build a combo chain! Each combo increases your score by +10% per chain level.",
        
        // Online
        onlineMultiplayer: "Online Multiplayer",
        connectingToServer: "Connecting to server...",
        connectedToServer: "Connected to server",
        disconnectedFromServer: "Disconnected from server",
        yourNickname: "Your Nickname:",
        enterYourName: "Enter your name...",
        availableRooms: "Available Rooms",
        createNewRoom: "Create New Room",
        playersInRoom: "Players in Room",
        yourColor: "Your Color",
        ready: "Ready",
        waitingForPlayers: "Waiting for players...",
        leaveRoom: "Leave Room",
        backToMenu: "Back to Menu",
        
        // Co-op
        localCoopSetup: "Local Co-op Setup",
        numberOfPlayers: "Number of Players",
        startGame: "Start Game",
        
        // Keys
        left: "Left",
        right: "Right",
        down: "Down",
        rotate: "Rotate",
        drop: "Drop",
        
        // Generic
        player: "Player"
    },
    ru: {
        // Main Menu
        welcome: "Добро пожаловать в Blockies!",
        tagline: "Складывайте яркие неоновые блоки в этой современной версии классической головоломки. Играйте соло или в команде с друзьями!",
        singlePlayer: "Одиночная игра",
        localCoop: "Локальный кооп",
        online: "Онлайн",
        playSolo: "Начать новую партию",
        heroLine1: "Место", heroLine2: "каждому", heroLine3: "блоку.",
        homeDescription: "Общее поле для всех. Собирайте линии вместе или играйте в своём темпе.",
        localDescription: "Выберите игроков и клавиши. Все фигуры складываются в одно поле.",
        onlineDescription: "Создайте комнату и отправьте ссылку. Все фигуры окажутся на одной доске.",
        roomCode: "Код комнаты",joinRoom:"Войти",orCreate:"ИЛИ СОЗДАЙТЕ СВОЮ",
        inviteCode:"КОД ПРИГЛАШЕНИЯ",invite:"Поделиться",linesLabel:"Линии",
        sharedBoard:"ОБЩЕЕ ПОЛЕ",moveHint:"ДВИЖЕНИЕ",actionsHint:"ДЕЙСТВИЯ",
        gestureHint:"На поле: касание — поворот, свайп — движение",
        pauseDescription:"Фигуры останутся на своих местах.",
        resumeSoloGame: "Продолжить партию",
        recoveryOffline: "Нет подключения. Переподключаемся…",
        recoveryRestoring: "Восстанавливаем сетевую партию…",
        recoveryStalled: "Сервер не отвечает. Ожидаем синхронизацию…",
        playTogether: "Играть вместе",
        playOverNetwork: "Играть по сети",
        
        // Settings
        settings: "Настройки",
        globalSettings: "Общие настройки",
        soundEffects: "Звуковые эффекты",
        playerSettings: "Настройки игроков",
        blockColor: "Цвет блоков:",
        gamepad: "Геймпад:",
        keyboard: "Клавиатура",
        saveSettings: "Сохранить настройки",
        resetToDefault: "Сбросить по умолчанию",
        cancel: "Отмена",
        
        // Messages
        settingsSaved: "Настройки сохранены",
        settingsSavedMsg: "Ваши настройки успешно сохранены!",
        settingsReset: "Настройки сброшены",
        settingsResetMsg: "Все настройки сброшены к значениям по умолчанию!",
        colorConflict: "Конфликт цветов",
        colorConflictMsg: "Пожалуйста, выберите уникальные цвета для каждого игрока.",
        keyBindingConflict: "Конфликт клавиш",
        keyBindingConflictMsg: "Пожалуйста, назначьте уникальные клавиши для каждого действия.",
        gamepadConflict: "Конфликт геймпадов",
        gamepadConflictMsg: "Каждый геймпад может быть назначен только одному игроку.",
        networkError: "Ошибка сети",
        
        // Game
        pause: "Пауза",
        menu: "Меню",
        gamePaused: "Игра на паузе",
        resume: "Продолжить",
        restart: "Начать заново",
        mainMenu: "Главное меню",
        gameOver: "Игра окончена!",
        playAgain: "Играть снова",
        teamScore: "Командный счёт",
        lines: "линий",
        comboReady: "Комбо готово",
        comboX: "Комбо x",
        streak: "серия",
        inPlay: "В игре",
        out: "Выбыл",
        lineBreak: "Линия",
        doubleBreak: "Двойная",
        tripleBreak: "Тройная",
        megaClear: "Мега-очистка",
        pts: "очк",
        ptsPerLine: "очк / линию",
        multiBonus: "Мульти",
        streakBonus: "Серия",
        
        // Feature list
        multipleGameModes: "Множество игровых режимов",
        localAndOnlineMultiplayer: "Локальный и онлайн мультиплеер",
        fastPacedAction: "Быстрый экшен",
        
        // Empty states
        noRoomsAvailable: "Комнат пока нет",
        createRoomPrompt: "Создайте первую комнату!",
        
        // Network errors
        connectionFailed: "Ошибка подключения",
        serverUnavailable: "Сервер временно недоступен. Попробуйте позже.",
        socketIoNotAvailable: "Не удалось подключиться к серверу мультиплеера.",
        
        // Touch controls
        touchControlsReady: "Сенсорное управление готово",
        startGameForTouch: "Начните игру для использования сенсорного управления",
        
        // Combo help
        comboHelp: "Убирайте линии подряд без пропусков, чтобы создать комбо-цепочку! Каждое комбо увеличивает ваш счёт на +10% за уровень цепочки.",
        
        // Online
        onlineMultiplayer: "Сетевая игра",
        connectingToServer: "Подключение к серверу...",
        connectedToServer: "Подключено к серверу",
        disconnectedFromServer: "Отключено от сервера",
        yourNickname: "Ваш никнейм:",
        enterYourName: "Введите ваше имя...",
        availableRooms: "Доступные комнаты",
        createNewRoom: "Создать новую комнату",
        playersInRoom: "Игроки в комнате",
        yourColor: "Ваш цвет",
        ready: "Готов",
        waitingForPlayers: "Ожидание игроков...",
        leaveRoom: "Покинуть комнату",
        backToMenu: "Назад в меню",
        
        // Co-op
        localCoopSetup: "Настройка локального коопа",
        numberOfPlayers: "Количество игроков",
        startGame: "Начать игру",
        
        // Keys
        left: "Влево",
        right: "Вправо",
        down: "Вниз",
        rotate: "Повернуть",
        drop: "Сбросить",
        
        // Generic
        player: "Игрок"
    }
};

let currentLanguage = 'ru';

function t(key) {
    return TRANSLATIONS[currentLanguage]?.[key] || TRANSLATIONS.en[key] || key;
}

function setLanguage(lang) {
    if (!TRANSLATIONS[lang]) return;
    currentLanguage = lang;
    localStorage.setItem('pocket-works:blockies:language', lang);
    updateUILanguage();
    window.uiManager?.refreshSoloResume?.();
    window.uiManager?.refreshTouchStatus?.();
}

function updateUILanguage() {
    // Update all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = t(key);
    });
    
    // Update placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = t(key);
    });
    
    // Update combo tooltip if UI manager exists
    if (window.uiManager && window.uiManager.updateComboTooltip) {
        window.uiManager.updateComboTooltip();
    }
}

import {spawnLaneX} from './spawn-bays.js';

// Game Configuration
const BLOCK_SIZE = 25;
const BASE_BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const SAFE_LANE_ROWS = 5;
const ADDITIONAL_COLUMNS_PER_PLAYER = 4;
const PREVIEW_SIZE = 4;

const BASE_LINE_SCORE = 100;
const STREAK_BONUS_STEP = 0.1;
const MULTI_LINE_BONUS_STEP = 0.2;

// Sound design: soft mechanical movement, weighted lock, rising crystalline clears.
// Pure Web Audio; no fetched assets, delayed game logic or sounds after mute.
class SoundManager {
    constructor(){
        this.audioContext=null;
        this.master=null;
        this.enabled=true;
        this.lastMoveAt=0;
        try{
            const saved=localStorage.getItem('pocket-works:blockies:sound-enabled');
            if(saved!==null)this.enabled=saved==='true';
        }catch{}
    }
    initAudio(){
        if(this.audioContext)return this.audioContext;
        try{
            const Audio=window.AudioContext||window.webkitAudioContext;
            if(!Audio)return null;
            const ctx=new Audio();
            const master=ctx.createGain();
            master.gain.value=.65;
            master.connect(ctx.destination);
            this.audioContext=ctx;
            this.master=master;
            return ctx;
        }catch{return null;}
    }
    setEnabled(enabled){
        this.enabled=Boolean(enabled);
        try{localStorage.setItem('pocket-works:blockies:sound-enabled',String(this.enabled));}catch{}
        if(this.master)this.master.gain.value=this.enabled ? .65 : 0;
    }
    toggle(){this.setEnabled(!this.enabled);return this.enabled;}
    voice({frequency,toFrequency=frequency,duration=.1,gain=.03,type='sine',delay=0,filter=0}){
        if(!this.enabled)return;
        const ctx=this.initAudio();
        if(!ctx||!this.master)return;
        if(ctx.state==='suspended')ctx.resume().catch(()=>{});
        const start=ctx.currentTime+delay;
        const end=start+duration;
        const oscillator=ctx.createOscillator(),envelope=ctx.createGain();
        oscillator.type=type;
        oscillator.frequency.setValueAtTime(Math.max(35,frequency),start);
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(35,toFrequency),end);
        envelope.gain.setValueAtTime(.0001,start);
        envelope.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),start+Math.min(.015,duration*.2));
        envelope.gain.exponentialRampToValueAtTime(.0001,end);
        oscillator.connect(envelope);
        let lowpass=null;
        if(filter){
            lowpass=ctx.createBiquadFilter();
            lowpass.type='lowpass';lowpass.frequency.value=filter;
            envelope.connect(lowpass);lowpass.connect(this.master);
        }else envelope.connect(this.master);
        oscillator.start(start);oscillator.stop(end+.012);
        oscillator.onended=()=>{
            oscillator.disconnect();envelope.disconnect();
            lowpass?.disconnect();
        };
    }
    move(){
        const now=performance.now();
        if(now-this.lastMoveAt<65)return;
        this.lastMoveAt=now;
        this.voice({frequency:285,toFrequency:225,duration:.038,gain:.014,type:'triangle',filter:1200});
    }
    rotate(){this.voice({frequency:370,toFrequency:520,duration:.082,gain:.024,type:'sine'});}
    land(hard=false){
        // A short low-frequency knock with a quieter textured transient.
        this.voice({frequency:hard?135:115,toFrequency:hard?57:67,duration:hard?.19:.135,gain:hard?.105:.065,type:'triangle',filter:530});
        this.voice({frequency:hard?590:420,toFrequency:190,duration:.052,gain:hard?.017:.012,type:'square',filter:1200});
    }
    drop(){this.land(false);}
    lineClear(count,combo=1){
        const notes=Math.max(1,Math.min(4,count));
        for(let i=0;i<notes;i++){
            const frequency=420+i*92+Math.min(combo,7)*24;
            this.voice({frequency,toFrequency:frequency*1.26,duration:.18,gain:.036+notes*.006,type:'sine',delay:i*.054});
            this.voice({frequency:frequency*.5,toFrequency:frequency*.68,duration:.18,gain:.016,type:'triangle',delay:i*.054});
        }
        if(combo>1){
            const top=640+Math.min(combo,7)*65;
            this.voice({frequency:top,toFrequency:top*1.28,duration:.22,gain:.033,type:'sine',delay:notes*.055});
        }
    }
    gameOver(){
        [280,235,195,155].forEach((frequency,i)=>this.voice({
            frequency,toFrequency:frequency*.84,duration:.21,gain:.032,type:'triangle',delay:i*.11,filter:720
        }));
    }
}

const soundManager = new SoundManager();

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
function createPrng(seed, restoredState) {
    let t = restoredState === undefined ? seed + 0x6D2B79F5 : restoredState;
    const next = function() {
        t |= 0;
        t = t + 0x6D2B79F5 | 0;
        let r = Math.imul(t ^ t >>> 15, 1 | t);
        r = r + Math.imul(r ^ r >>> 7, 61 | r) ^ r;
        return ((r ^ r >>> 14) >>> 0) / 4294967296;
    };
    next.getState = () => t >>> 0;
    return next;
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
        const shapes = Object.keys(SHAPES);
        const shape = shapes[Math.floor(randomFloat() * shapes.length)];
        return SHAPES[shape];
    }

    spawnPiece() {
        if(gameState.numPlayers>1&&!laneHasClearance(this)){
            this.blocked=true;this.gameOver=true;this.currentPiece=null;
            this.dropCounter=0;checkAllPlayersGameOver();return;
        }
        this.blocked=false;
        this.currentPiece = this.nextPiece;
        this.nextPiece = this.randomPiece();
        const pieceWidth=this.currentPiece[0].length;
        if(gameState.numPlayers>1){
            const laneX=Number.isInteger(this.spawnLaneX)
                ? this.spawnLaneX:spawnLaneX(this.id,gameState.numPlayers,getBoardWidth());
            const x=laneX+Math.floor((4-pieceWidth)/2);
            this.position={x,y:0};
            if(this.checkCollision().collides){
                this.gameOver=true;
                this.blocked=true;
                this.currentPiece=null;
                checkAllPlayersGameOver();
            }
            this.dropCounter=0;
            return;
        }
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

    resumeFromGate(){
        if(!this.blocked||gameState.isGameOver||!laneHasClearance(this))return false;
        this.gameOver=false;this.blocked=false;this.spawnPiece();
        return !this.gameOver;
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
        const rotated = this.currentPiece[0].map((_, i) =>
            this.currentPiece.map(row => row[i]).reverse()
        );

        if (!this.checkCollision(rotated).collides) {
            this.currentPiece = rotated;
            soundManager.rotate();
            // Send online update if in online game
            if (broadcast && typeof networkManager !== 'undefined' && networkManager.connected && window.uiManager?.isOnlineMode) {
                networkManager.sendPlayerInput({ action: 'rotate' });
            }
        }
    }

    drop({ broadcast = true } = {}) {
        this.position.y++;
        const collision = this.checkCollision();
        if (collision.collides) {
            this.position.y--;
            if (collision.withLocked) {
                const locked=this.merge();
                soundManager.land(false);
                window.uiManager?.onPieceLocked?.(this,locked,false);
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
            const locked=this.merge();
            soundManager.land(true);
            window.uiManager?.onPieceLocked?.(this,locked,true);
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
        const locked=[];
        for (let y = 0; y < this.currentPiece.length; y++) {
            for (let x = 0; x < this.currentPiece[y].length; x++) {
                if (this.currentPiece[y][x]) {
                    const boardY = this.position.y + y;
                    const boardX = this.position.x + x;
                    if (boardY >= 0) {
                        gameState.board[boardY][boardX] = this.id + 1;
                        locked.push({x:boardX,y:boardY,owner:this.id+1});
                    }
                }
            }
        }
        gameState.boardRevision=(gameState.boardRevision||0)+1;
        return locked;
    }

    clearLines() {
        let linesCleared = 0;

        const boardWidth = getBoardWidth();
        const clearedRows=gameState.board.flatMap((row,y)=>
            row.every(cell=>cell!==0)?[{y,cells:row.slice()}]:[]);
        for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
            if (gameState.board[y].every(cell => cell !== 0)) {
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
            perLineScore,
            basePerLine: BASE_LINE_SCORE,
            comboChain: gameState.sharedStats.comboChain,
            comboMultiplier,
            multiMultiplier,
            streakBonusPercent,
            multiBonusPercent
        };

        soundManager.lineClear(linesCleared,gameState.sharedStats.comboChain);
        window.uiManager?.onLinesCleared?.(clearedRows,gameState.sharedStats.lastClearDetail);

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

function laneHasClearance(player){
    if(gameState.numPlayers<=1)return true;
    const x=Number.isInteger(player.spawnLaneX)?player.spawnLaneX:spawnLaneX(player.id,gameState.numPlayers,getBoardWidth());
    for(let y=0;y<SAFE_LANE_ROWS;y++)for(let col=x;col<x+4;col++){
        if(gameState.board[y]?.[col]||isCellOccupiedByOtherPiece(col,y,player.id))return false;
    }
    return true;
}

function checkAllPlayersGameOver() {
    if (!gameState.players.length) return;

    if (gameState.players.every(player => player.gameOver)) {
        gameState.isGameOver = true;
        soundManager.gameOver();
    }
}

// UI Manager
class UIManager {
    constructor() {
        this.screens = {
            mainMenu: document.getElementById('main-menu'),
            coopSetup: document.getElementById('coop-setup-screen'),
            onlineLobby: document.getElementById('online-lobby-screen'),
            gameScreen: document.getElementById('game-screen'),
            settingsScreen: document.getElementById('settings-screen')
        };

        this.modals = {
            pause: document.getElementById('pause-menu'),
            gameOver: document.getElementById('gameover-menu')
        };

        this.touchControls = document.getElementById('touch-controls');
        this.touchStatus = document.getElementById('touch-status');
        this.touchPlayerIndex = 0;
        this.teamStats = document.getElementById('team-stats');
        this.scoreCard = document.getElementById('team-score-card');
        this.comboIndicator = document.getElementById('combo-indicator');
        this.comboLabel = document.getElementById('combo-label');
        this.comboBonus = document.getElementById('combo-bonus');
        this.clearFeed = document.getElementById('clear-feed');
        this.boardEffects = new BoardEffects({
            reducedMotion:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false,
            colors:()=>gameState.players.map(player=>player.color)
        });
        this.pendingScaleFrame = null;
        this.lastComboChain = 0;
        
        // Set combo help tooltip
        if (this.comboIndicator) {
            this.updateComboTooltip();
        }
        this.previousScreen = 'mainMenu'; // Track previous screen for settings navigation (matches screen key)
        this.isOnlineMode = false; // Flag for online multiplayer mode
        this.networkPlayers = {}; // Map of network player IDs to local indices
        this.localPlayerIndex = -1; // Local player index in online mode

        this.moveRepeatInterval = 105;
        this.softDropInitialDelay = 0;
        this.softDropRepeatInterval = 55;

        this.lastSoloSaveAt = 0;
        this.activeKeyCapture = null;
        this.settingsPausedLocalGame = false;
        this.settingsPausedModal = false;
        this.settingsReturnTimer = null;
        this.debugPausedLocal = false;
        this.setupEventListeners();
        this.initTouchControls();
        this.refreshSoloResume();
        this.initGamepads();
        window.addEventListener('resize', () => this.handleResize());
    }
    
    // Helper method to check if a player can be controlled locally
    isPlayerControllable(player) {
        if (player.gameOver) return false;
        if (this.isOnlineMode && (!networkManager.connected || networkManager.stale)) return false;
        // In online mode, only allow local player to be controlled
        if (this.isOnlineMode && player.id !== this.localPlayerIndex) {
            return false;
        }
        return true;
    }

    initGamepads() {
        // Scan for gamepads initially
        scanGamepads();
        this.updateGamepadStatus();
        
        // Listen for gamepad connection events
        window.addEventListener('gamepadconnected', (e) => {
            console.log('Gamepad connected:', e.gamepad.id);
            scanGamepads();
            this.updateGamepadStatus();
        });
        
        window.addEventListener('gamepaddisconnected', (e) => {
            console.log('Gamepad disconnected:', e.gamepad.id);
            scanGamepads();
            this.updateGamepadStatus();
            // Remove assignments for this gamepad
            delete gameState.gamepads.assignments[e.gamepad.index];
            gameState.gamepads.buttonStates.delete(e.gamepad.index);
        });
    }
    
    updateGamepadStatus() {
        const statusEl = document.getElementById('gamepad-status');
        if (!statusEl) return;
        
        const count = gameState.gamepads.connected.length;
        if (count > 0) {
            statusEl.textContent = `🎮 ${count} Gamepad${count > 1 ? 's' : ''}`;
            statusEl.style.display = 'block';
        } else {
            statusEl.style.display = 'none';
        }
    }

    pollGamepads() {
        if (!navigator.getGamepads) return;
        
        const gamepads = navigator.getGamepads();
        
        for (let i = 0; i < gamepads.length; i++) {
            const gamepad = gamepads[i];
            if (!gamepad) continue;
            
            // Check if this gamepad is assigned to a player
            const playerIndex = gameState.gamepads.assignments[i];
            if (playerIndex === undefined) continue;
            
            const player = gameState.players[playerIndex];
            if (!player || player.gameOver) continue;
            
            // Get or create button state for this gamepad
            if (!gameState.gamepads.buttonStates.has(i)) {
                gameState.gamepads.buttonStates.set(i, createGamepadButtonState());
            }
            const buttonState = gameState.gamepads.buttonStates.get(i);
            
            // Check D-pad buttons for each action
            for (const action in GAMEPAD_BUTTON_MAP) {
                const buttons = GAMEPAD_BUTTON_MAP[action];
                const pressed = buttons.some(btnIndex => gamepad.buttons[btnIndex]?.pressed);
                
                const wasPressed = buttonState[action].wasPressed;
                buttonState[action].pressed = pressed;
                
                // Trigger on button press (not held) - similar to keyboard behavior
                if (pressed && !wasPressed) {
                    this.handleGamepadAction(player, action);
                }
                
                buttonState[action].wasPressed = pressed;
            }
        }
    }

    handleGamepadAction(player, action) {
        if (gameState.isPaused || !this.isPlayerControllable(player)) return;
        switch (action) {
            case 'left':
                player.move(-1);
                break;
            case 'right':
                player.move(1);
                break;
            case 'down':
                player.drop();
                break;
            case 'rotate':
                player.rotate();
                break;
            case 'drop':
                player.hardDrop();
                break;
        }
    }

    setupEventListeners() {
        // Language selector
        const languageSelector = document.getElementById('language-selector');
        if (languageSelector) {
            languageSelector.addEventListener('change', (e) => {
                setLanguage(e.target.value);
            });
        }
        
        // Mode selection - new menu structure
        document.getElementById('mode-single').addEventListener('click', () => {
            this.isOnlineMode = false;
            this.startGame(1);
        });
        document.getElementById('resume-solo')?.addEventListener('click', () => this.resumeSolo());
        document.getElementById('mode-local').addEventListener('click', () => this.showCoopSetup());
        document.getElementById('mode-online').addEventListener('click', () => this.showOnlineLobby());

        // Co-op setup
        document.querySelectorAll('.player-count-btn').forEach(btn => {
            btn.addEventListener('click', () => this.selectPlayerCount(btn));
        });
        document.getElementById('start-coop-btn').addEventListener('click', () => this.startCoopGame());
        document.getElementById('cancel-coop-btn').addEventListener('click', () => this.showScreen('mainMenu'));

        // Online lobby
        document.getElementById('back-from-online-btn').addEventListener('click', () => { if (networkManager.currentRoom) networkManager.leaveRoom(); this.showScreen('mainMenu'); });
        document.getElementById('create-room-btn').addEventListener('click', () => this.createRoom());
        document.getElementById('invite-friends-btn')?.addEventListener('click',event=>{
            event.stopPropagation();
            void networkManager.inviteFriends();
        });
        const nicknameInput = document.getElementById('nickname-input');
        if (nicknameInput) {
            // Load saved nickname
            const savedNickname = localStorage.getItem('pocket-works:blockies:nickname');
            if (savedNickname) {
                nicknameInput.value = savedNickname;
            }
            // Send nickname on change
            nicknameInput.addEventListener('input', () => {
                const nickname = nicknameInput.value.trim();
                if (nickname) {
                    localStorage.setItem('pocket-works:blockies:nickname', nickname);
                    networkManager.setNickname(nickname);
                }
            });
        }
        const leaveRoomBtn = document.getElementById('leave-room-btn');
        if (leaveRoomBtn) {
            leaveRoomBtn.addEventListener('click', () => this.leaveRoom());
        }
        const readyBtn = document.getElementById('ready-btn');
        if (readyBtn) {
            readyBtn.addEventListener('click', () => this.toggleReady());
        }

        // Settings
        document.getElementById('settings-btn').addEventListener('click', () => this.showSettings());
        document.getElementById('save-settings-btn').addEventListener('click', () => this.saveSettings());
        document.getElementById('reset-settings-btn').addEventListener('click', () => this.resetSettings());
        document.getElementById('cancel-settings-btn').addEventListener('click', () => this.hideSettings());

        // Game controls - now in header
        const pauseBtn = document.getElementById('pause-btn');
        const quitBtn = document.getElementById('quit-btn');
        if (pauseBtn) pauseBtn.addEventListener('click', () => this.togglePause());
        if (quitBtn) quitBtn.addEventListener('click', () => this.quitToMenu());

        // Pause menu
        document.getElementById('resume-btn').addEventListener('click', () => this.togglePause());
        document.getElementById('restart-btn').addEventListener('click', () => this.restart());
        document.getElementById('quit-to-menu-btn').addEventListener('click', () => this.quitToMenu());

        // Game over menu
        document.getElementById('play-again-btn').addEventListener('click', () => this.restart());
        document.getElementById('menu-btn').addEventListener('click', () => this.quitToMenu());

        // Keyboard input
        document.addEventListener('keydown', (e) => this.handleKeyPress(e));
        document.addEventListener('keyup', (e) => this.handleKeyRelease(e));
    }

    initTouchControls() {
        if (!this.touchControls) return;
        this.touchPresses = new Map();
        const press = (button, action, event) => {
            if (event.button != null && event.button !== 0) return;
            event.preventDefault();
            const player = this.getTouchPlayer();
            if (!player || gameState.isPaused || gameState.isGameOver) return;
            if (['left','right','down'].includes(action)) {
                if (action === 'down') {
                    this.activateSoftDrop(player);
                    player.drop();
                    const state = this.getInputState(player.id, 'down');
                    if (state) { state.hasFiredInitial = true; state.heldTime = 0; }
                } else this.activateMovementAction(player, action);
                this.touchPresses.set(event.pointerId ?? 'fallback', {playerId:player.id, action});
                if (event.pointerId != null && button.setPointerCapture) {
                    try { button.setPointerCapture(event.pointerId); } catch {}
                }
                this.drawBoard();
            } else this.handleTouchAction(action);
        };
        const release = event => {
            const key = event.pointerId ?? 'fallback';
            const pressed = this.touchPresses.get(key);
            if (!pressed) return;
            this.releaseContinuousAction(pressed.playerId, pressed.action);
            this.touchPresses.delete(key);
        };
        this.releaseTouchControls = () => {
            for (const pressed of this.touchPresses.values()) {
                this.releaseContinuousAction(pressed.playerId, pressed.action);
            }
            this.touchPresses.clear();
            this.touchControls.querySelectorAll('.touch-btn').forEach(btn=>btn.classList.remove('is-pressed'));
        };
        this.touchControls.querySelectorAll('[data-action]').forEach(button => {
            const action = button.dataset.action;
            const lightPress = event => {
                button.classList.add('is-pressed');
                if(event.pointerId != null && button.setPointerCapture){
                    try{button.setPointerCapture(event.pointerId);}catch{}
                }
            };
            const lightRelease = () => button.classList.remove('is-pressed');
            if (window.PointerEvent) {
                button.addEventListener('pointerdown', event => {
                    lightPress(event);
                    press(button, action, event);
                });
                for (const type of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(type, event => { release(event); lightRelease(); });
            } else {
                button.addEventListener('touchstart', event => press(button, action, event), {passive:false});
                button.addEventListener('touchend', release);
                button.addEventListener('touchcancel', release);
                button.addEventListener('mousedown', event => press(button, action, event));
                window.addEventListener('mouseup', release);
            }
            button.addEventListener('click', event => { if (event.detail === 0) this.handleTouchAction(action); });
            button.addEventListener('contextmenu', event => event.preventDefault());
        });
        window.addEventListener('blur', () => this.releaseTouchControls());
        document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseTouchControls(); });
        if (this.touchStatus) this.touchStatus.textContent = t('startGameForTouch');
    }

    refreshTouchStatus() {
        if (!this.touchControls || !this.touchStatus) return;

        const activePlayer = this.getTouchPlayer();
        if (activePlayer && !gameState.isGameOver) {
            this.touchStatus.textContent = currentLanguage === 'ru'
                ? `Управляете фигурой · Игрок ${activePlayer.id + 1}`
                : `Controlling piece · Player ${activePlayer.id + 1}`;
        } else if (gameState.players.length && gameState.players.every(player => player.gameOver)) {
            this.touchStatus.textContent = currentLanguage === 'ru'
                ? 'Все игроки завершили игру'
                : 'All players have finished';
        } else {
            this.touchStatus.textContent = t('startGameForTouch');
        }
    }

    getTouchPlayer() {
        if (this.isOnlineMode) {
            if (!networkManager.connected || networkManager.stale) return null;
            const mine = gameState.players[this.localPlayerIndex];
            return mine && !mine.gameOver ? mine : null;
        }
        if (!gameState.players.length) {
            return null;
        }

        const current = gameState.players[this.touchPlayerIndex];
        if (current && !current.gameOver) {
            return current;
        }

        const fallback = gameState.players.find(player => !player.gameOver);
        if (fallback) {
            this.touchPlayerIndex = fallback.id;
            return fallback;
        }

        return null;
    }

    handleTouchAction(action) {
        if (gameState.isPaused || gameState.isGameOver) {
            return;
        }

        const player = this.getTouchPlayer();
        if (!player) {
            this.refreshTouchStatus();
            return;
        }

        let requiresInfoUpdate = false;

        switch (action) {
            case 'left':
                player.move(-1);
                break;
            case 'right':
                player.move(1);
                break;
            case 'down':
                player.drop();
                requiresInfoUpdate = true;
                break;
            case 'rotate':
                player.rotate();
                break;
            case 'drop':
                player.hardDrop();
                requiresInfoUpdate = true;
                break;
            default:
                break;
        }

        this.noteSpawnAction(player);
        if (requiresInfoUpdate) {
            this.updatePlayerInfo(player);
            this.drawNextPiece(player);
        }

        this.drawBoard();
        this.updateTeamStatsIfNeeded();

        if (player.gameOver) {
            this.refreshTouchStatus();
        }
    }

    refreshSoloResume() {
        const button = document.getElementById('resume-solo');
        if (!button) return;
        const checkpoint = loadSolo();
        button.hidden = !checkpoint;
        if (checkpoint) {
            button.querySelector('.resume-detail').textContent =
                currentLanguage === 'ru'
                  ? `Уровень ${checkpoint.sharedStats.level} · ${checkpoint.sharedStats.lines} линий`
                  : `Level ${checkpoint.sharedStats.level} · ${checkpoint.sharedStats.lines} lines`;
        }
    }

    saveSoloCheckpoint(force = false) {
        if (this.isOnlineMode || gameState.numPlayers !== 1 || gameState.isGameOver ||
            !gameState.players.length || !this.screens.gameScreen.classList.contains('active')) return;
        const now = performance.now();
        if (!force && now - this.lastSoloSaveAt < 1500) return;
        const p = gameState.players[0];
        if (!p?.currentPiece || !p.nextPiece) return;
        const checkpoint = {
            version: 1, updatedAt: Date.now(),
            randomSeed: gameState.randomSeed, rngState: gameState.rng.getState(),
            board: gameState.board, sharedStats: gameState.sharedStats,
            player: {
                currentPiece: p.currentPiece, nextPiece: p.nextPiece,
                position: p.position, dropCounter: p.dropCounter,
                dropInterval: p.dropInterval, spawnAnchor: p.spawnAnchor, color: p.color
            }
        };
        if (saveSolo(checkpoint)) this.lastSoloSaveAt = now;
    }

    resumeSolo() {
        const checkpoint = loadSolo();
        if (!checkpoint) {
            this.refreshSoloResume();
            this.showStyledMessage('Нет сохранения', 'Сохранённая партия отсутствует или повреждена.', 'error');
            return;
        }
        this.isOnlineMode = false;
        this.startGame(1, checkpoint.randomSeed);
        const player = gameState.players[0];
        gameState.board = checkpoint.board;
        gameState.sharedStats = checkpoint.sharedStats;
        gameState.sharedStatsDirty = true;
        gameState.rng = createPrng(checkpoint.randomSeed, checkpoint.rngState);
        player.currentPiece = checkpoint.player.currentPiece;
        player.nextPiece = checkpoint.player.nextPiece;
        player.position = checkpoint.player.position;
        player.dropCounter = checkpoint.player.dropCounter;
        player.dropInterval = checkpoint.player.dropInterval;
        player.spawnAnchor = checkpoint.player.spawnAnchor;
        player.color = checkpoint.player.color;
        player.score = checkpoint.sharedStats.score;
        player.lines = checkpoint.sharedStats.lines;
        player.level = checkpoint.sharedStats.level;
        this.lastSoloSaveAt = 0;
        this.drawBoard();
        this.drawNextPiece(player);
        this.updatePlayerInfo(player);
        this.updateTeamStatsIfNeeded();
        this.refreshTouchStatus();
        this.saveSoloCheckpoint(true);
    }

    toggleDebugMenu(){
        let overlay=document.getElementById('blockies-debug');
        if(!overlay){
            overlay=document.createElement('div');
            overlay.id='blockies-debug';
            overlay.className='blockies-debug';
            overlay.hidden=true;
            const panel=document.createElement('section');
            panel.className='blockies-debug__panel';
            panel.setAttribute('role','dialog');
            panel.setAttribute('aria-label','Отладка Blockies');
            const head=document.createElement('div');
            head.className='blockies-debug__head';
            const title=document.createElement('h2');
            title.textContent='Blockies · Debug';
            const close=document.createElement('button');
            close.type='button';
            close.textContent='Закрыть ×';
            close.addEventListener('click',()=>this.toggleDebugMenu());
            head.append(title,close);
            const help=document.createElement('p');
            help.textContent='Backquote / Ё — открыть или закрыть. Экраны для проверки.';
            const grid=document.createElement('div');
            grid.className='blockies-debug__grid';
            const screens=[
                ['mainMenu','Главное меню'],['coopSetup','Локальная комната'],
                ['onlineLobby','Онлайн-комната'],['gameScreen','Игровое поле'],
                ['settingsScreen','Настройки'],['pause','Пауза'],
                ['gameOver','Результаты'],['achievements','Награды']
            ];
            for(const [id,label] of screens){
                const button=document.createElement('button');
                button.type='button';button.textContent=label;
                button.addEventListener('click',()=>{this.debugOpenScreen(id);this.toggleDebugMenu();});
                grid.append(button);
            }
            const inspect=document.createElement('pre');
            inspect.className='blockies-debug__details';
            inspect.id='blockies-debug-details';
            const refresh=document.createElement('button');
            refresh.type='button';refresh.textContent='Обновить состояние';
            refresh.addEventListener('click',()=>this.refreshDebugDetails());
            panel.append(head,help,grid,refresh,inspect);
            overlay.append(panel);
            overlay.addEventListener('click',event=>{if(event.target===overlay)this.toggleDebugMenu();});
            document.body.append(overlay);
        }
        overlay.hidden=!overlay.hidden;
        if(!overlay.hidden)this.refreshDebugDetails();
    }

    refreshDebugDetails(){
        const node=document.getElementById('blockies-debug-details');
        if(!node)return;
        const state={
            screen:Object.keys(this.screens).find(key=>this.screens[key].classList.contains('active')),
            connection:networkManager.connected?'online':'offline',
            room:networkManager.roomId||null,
            round:networkManager.activeRound||0,
            players:gameState.players.map(player=>({
                id:player.id,name:player.name,color:player.color,
                entranceX:player.spawnLaneX,entranceWidth:4,entranceHeight:2,
                position:player.position,next:player.nextPiece,
                eliminated:player.gameOver
            })),
            field:{width:gameState.boardWidth,height:BOARD_HEIGHT},
            score:gameState.sharedStats
        };
        node.textContent=JSON.stringify(state,null,2);
    }

    debugOpenScreen(id){
        // Screenshots must never silently leave a real online match or fake its result.
        if(this.isOnlineMode && networkManager.started &&
           !['gameScreen','achievements'].includes(id)){
            this.showStyledMessage('Debug',
                'Сетевая партия идёт на сервере. Для просмотра других экранов сначала выйдите из комнаты.','info');
            return;
        }
        if(id==='gameScreen' && gameState.players.length && !this.isOnlineMode){
            this.hideModal('pause');this.hideModal('gameOver');
            this.showScreen('gameScreen');
            if(this.debugPausedLocal && !gameState.isGameOver){
                gameState.isPaused=false;
                gameState.lastTime=performance.now();
                this.debugPausedLocal=false;
            }
            return;
        }
        if(!this.isOnlineMode && gameState.players.length && !gameState.isPaused &&
           !gameState.isGameOver && id!=='gameScreen'){
            this.debugPausedLocal=true;
            gameState.isPaused=true;
        }
        this.hideModal('pause');this.hideModal('gameOver');
        if(id==='mainMenu'){this.showScreen('mainMenu');return;}
        if(id==='coopSetup'){this.showCoopSetup();return;}
        if(id==='onlineLobby'){this.showOnlineLobby();return;}
        if(id==='settingsScreen'){this.showSettings();return;}
        if(id==='achievements'){document.getElementById('achievements-btn')?.click();return;}
        if(!gameState.players.length){
            // Debug starts a playable local board only if one does not exist.
            this.isOnlineMode=false;
            this.localPlayerNames=['Игрок 1','Игрок 2'];
            this.startGame(2);
        }else this.showScreen('gameScreen');
        if(id==='pause'){
            if(!this.isOnlineMode)gameState.isPaused=true;
            this.showModal('pause');
        }else if(id==='gameOver'){
            if(this.isOnlineMode){
                // Never manufacture a result or mutate a running PocketNet round.
                this.showStyledMessage('Debug','Результаты онлайн-партии показывает сервер после её завершения. Для предпросмотра запусти локальную игру.','info');
                return;
            }
            gameState.isGameOver=true;
            this.showGameOver();
        }
    }

    showScreen(screenName) {
        // Track previous screen for settings navigation
        const currentScreen = Object.keys(this.screens).find(key => 
            this.screens[key].classList.contains('active')
        );
        if (currentScreen && screenName === 'settingsScreen') {
            this.previousScreen = currentScreen;
        }
        
        Object.values(this.screens).forEach(screen => screen.classList.remove('active'));
        this.screens[screenName].classList.add('active');
        if (screenName === 'mainMenu') this.refreshSoloResume();

        // Show/hide header buttons based on screen
        const pauseBtn = document.getElementById('pause-btn');
        const quitBtn = document.getElementById('quit-btn');
        if (pauseBtn && quitBtn) {
            if (screenName === 'gameScreen') {
                pauseBtn.style.display = 'inline-flex';
                quitBtn.style.display = 'inline-flex';
            } else {
                pauseBtn.style.display = 'none';
                quitBtn.style.display = 'none';
            }
        }

        if (screenName === 'gameScreen') {
            this.updateLayoutDensity();
            this.scheduleBoardScaleUpdate();
        }

        const teamStats = document.getElementById('team-stats');
        if (teamStats) {
            if (screenName === 'gameScreen') {
                teamStats.classList.add('visible');
                this.updateTeamStats();
            } else {
                teamStats.classList.remove('visible');
                this.resetTeamStatsDisplay();
            }
        }

        if (this.touchControls) {
            if (screenName === 'gameScreen') {
                this.touchControls.classList.add('visible');
                this.refreshTouchStatus();
            } else {
                this.touchControls.classList.remove('visible');
                if (this.touchStatus) {
                    this.touchStatus.textContent = t('startGameForTouch');
                }
            }
        }
    }

    showModal(modalName) {
        if (modalName === 'pause') {
            const restart=document.getElementById('restart-btn');
            if(restart)restart.hidden=this.isOnlineMode;
        }
        this.modals[modalName].classList.add('active');
    }

    hideModal(modalName) {
        this.modals[modalName].classList.remove('active');
    }

    startGame(numPlayers, seed = Date.now()) {
        this.lastSoloSaveAt = 0;
        this.boardEffects.reset();
        clearTimeout(this.spawnFocusTimer);
        if (!this.isOnlineMode && numPlayers === 1) clearSolo();
        setRandomSeed(seed);
        gameState.numPlayers = numPlayers;
        this.screens.gameScreen.classList.toggle('wide-well',numPlayers>1);
        gameState.isPaused = false;
        gameState.isGameOver = false;
        this.boardGesture=null;
        gameState.players = [];
        gameState.boardWidth = computeBoardWidth(numPlayers);
        const stageSize=document.getElementById('stage-mode');
        if(stageSize)stageSize.textContent=gameState.boardWidth+' × '+BOARD_HEIGHT;
        gameState.board = createEmptyBoard(gameState.boardWidth, BOARD_HEIGHT);
        gameState.lastTime = 0;
        this.touchPlayerIndex = 0;
        gameState.inputStates = new Map();
        resetSharedStats();

        const container = document.getElementById('game-container');
        container.querySelector('#shared-board')?.remove();
        
        const nextPiecesPreview = document.getElementById('next-pieces-preview');
        if (nextPiecesPreview) {
            nextPiecesPreview.innerHTML = '';
        }
        
        const playerInfoSidebar = document.getElementById('player-info-sidebar');
        if (playerInfoSidebar) {
            playerInfoSidebar.innerHTML = '';
        }

        if (this.clearFeed) {
            this.clearFeed.innerHTML = '';
        }
        this.lastComboChain = 0;
        this.updateComboIndicator();

        const boardWrapper = document.createElement('div');
        boardWrapper.id = 'shared-board';

        const canvas = document.createElement('canvas');
        canvas.id = 'game-canvas';
        canvas.width = gameState.boardWidth * BLOCK_SIZE;
        canvas.height = BOARD_HEIGHT * BLOCK_SIZE;
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        canvas.style.maxWidth = `${canvas.width}px`;
        canvas.style.maxHeight = 'none';
        boardWrapper.style.setProperty('--board-max-width', `${canvas.width}px`);
        if(numPlayers>1){
            const rail=document.createElement('div');
            rail.id='spawn-rail';
            rail.className='spawn-gantry';
            rail.setAttribute('role','group');
            rail.setAttribute('aria-label','Личные зоны появления фигур');
            boardWrapper.appendChild(rail);
        }
        this.installBoardGestures(canvas);
        boardWrapper.appendChild(canvas);
        const effectsCanvas=document.createElement('canvas');
        effectsCanvas.id='game-effects-canvas';
        effectsCanvas.width=canvas.width;
        effectsCanvas.height=canvas.height;
        effectsCanvas.setAttribute('aria-hidden','true');
        boardWrapper.appendChild(effectsCanvas);
        this.boardEffects.boardWidth=gameState.boardWidth;
        this.boardEffects.attach(effectsCanvas);

        container.appendChild(boardWrapper);

        this.previewSignatures=new Map();
        for (let i = 0; i < numPlayers; i++) {
            const laneX=spawnLaneX(i,numPlayers,gameState.boardWidth);
            const spawnAnchor=numPlayers>1?laneX+2:gameState.boardWidth/2;
            const player = new Player(
                i,
                gameState.settings.colors[i],
                gameState.settings.keys[i],
                spawnAnchor
            );
            player.spawnLaneX=laneX;
            player.name=this.isOnlineMode?(this.onlineParticipantNames?.[i]||`Игрок ${i+1}`):
                (this.localPlayerNames?.[i]||`Игрок ${i+1}`);
            player.init();
            player.score = gameState.sharedStats.score;
            player.level = gameState.sharedStats.level;
            player.lines = gameState.sharedStats.lines;
            gameState.players.push(player);
            gameState.inputStates.set(player.id, {
                left: createActionState(),
                right: createActionState(),
                down: createActionState()
            });

            this.createPlayerInfo(player, playerInfoSidebar);
            if(numPlayers===1)this.createNextPiecePreview(player, nextPiecesPreview);
            else this.createSpawnBay(player,document.getElementById('spawn-rail'));
            this.updatePlayerInfo(player);
            this.drawNextPiece(player);
        }

        if(nextPiecesPreview)nextPiecesPreview.classList.toggle('visible',numPlayers===1);
        
        if (playerInfoSidebar && numPlayers > 0) {
            playerInfoSidebar.classList.add('visible');
        }

        this.drawBoard();
        this.blockedLaneSignature=null;
        this.updateBlockedLanes();

        this.showScreen('gameScreen');
        if (!this.isOnlineMode && numPlayers === 1) this.saveSoloCheckpoint(true);
        this.refreshTouchStatus();
        this.scheduleBoardScaleUpdate();
        this.gameLoopRun = (this.gameLoopRun || 0) + 1;
        const run = this.gameLoopRun;
        requestAnimationFrame((time) => this.gameLoop(time, run));
    }
    
    noteSpawnAction(player){
        if(!player||gameState.numPlayers<2)return;
        const bay=document.getElementById(`spawn-bay-${player.id}`);
        if(!bay||bay.classList.contains('is-out'))return;
        for(const active of document.querySelectorAll('#spawn-rail .spawn-bay.is-engaged')){
            active.classList.remove('is-engaged');
        }
        bay.classList.add('is-engaged');
        clearTimeout(this.spawnFocusTimer);
        this.spawnFocusTimer=setTimeout(()=>bay.classList.remove('is-engaged'),540);
    }

    createSpawnBay(player,rail){
        if(!rail)return;
        const bay=document.createElement('div');
        bay.className='spawn-bay';
        bay.id=`spawn-bay-${player.id}`;
        bay.setAttribute('role','group');
        bay.setAttribute('aria-label',player.name);
        bay.style.left=(100*player.spawnLaneX/gameState.boardWidth)+'%';
        bay.style.width=(400/gameState.boardWidth)+'%';
        bay.style.setProperty('--bay-color',player.color);
        const label=document.createElement('span');
        label.className='spawn-bay__name';
        label.textContent=player.name;
        label.title=player.name;
        const next=document.createElement('canvas');
        next.id=`bay-next-${player.id}`;
        next.className='spawn-bay__next';
        next.width=4*BLOCK_SIZE;
        next.height=2*BLOCK_SIZE;
        next.setAttribute('aria-label','Следующая фигура: '+player.name);
        const preview=document.createElement('div');
        preview.className='spawn-bay__preview';
        next.setAttribute('role','img');
        preview.append(next);
        const mouth=document.createElement('div');
        mouth.className='spawn-bay__mouth';
        mouth.setAttribute('aria-hidden','true');
        const status=document.createElement('span');
        status.className='spawn-bay__status';
        status.textContent='×';
        status.setAttribute('aria-hidden','true');
        mouth.append(status);
        bay.append(label,preview,mouth);
        rail.appendChild(bay);
    }

    onPieceLocked(player,cells,hard=false){
        this.boardEffects.landing(cells,player.color,{hard});
    }

    onLinesCleared(rows,detail){
        this.boardEffects.clearRows(rows,detail||{});
    }

    createNextPiecePreview(player, container) {
        if (!container) return;
        
        const item = document.createElement('div');
        item.className = 'next-piece-item';
        item.id = `next-item-${player.id}`;
        
        const nextCanvas = document.createElement('canvas');
        nextCanvas.id = `next-${player.id}`;
        nextCanvas.width = PREVIEW_SIZE * BLOCK_SIZE;
        nextCanvas.height = PREVIEW_SIZE * BLOCK_SIZE;
        item.appendChild(nextCanvas);
        const label=document.createElement('span');
        label.className='next-piece-label';
        label.textContent=gameState.numPlayers===1?(currentLanguage==='ru'?'Далее':'Next'):`P${player.id+1}`;
        item.prepend(label);
        if(this.isOnlineMode&&player.id===this.localPlayerIndex)item.classList.add('is-mine');
        container.appendChild(item);
    }

    createPlayerInfo(player, container) {
        if (!container) return;
        
        const preview = document.createElement('div');
        preview.className = 'player-preview';
        preview.id = `player-${player.id}`;

        const header = document.createElement('div');
        header.className = 'preview-header';
        header.style.setProperty('--player-color', player.color);
        header.innerHTML = `
            <span class="preview-badge" style="background:${player.color}"></span>
            ${t('player')} ${player.id + 1}
        `;

        const status = document.createElement('div');
        status.className = 'preview-status';
        status.id = `status-${player.id}`;
        status.textContent = 'In play';

        preview.appendChild(header);
        preview.appendChild(status);
        container.appendChild(preview);
    }

    gameLoop(time, run) {
        if (run !== this.gameLoopRun) return;
        if (gameState.isGameOver) {
            this.refreshTouchStatus();
            this.showGameOver();
            return;
        }

        if (!gameState.isPaused) {
            const deltaTime = Math.min(50, Math.max(0, time - (gameState.lastTime || time)));
            gameState.lastTime = time;

            // Poll gamepads
            this.pollGamepads();

            let touchStatusNeedsUpdate = false;
            const boardRevision=gameState.boardRevision||0;
            const before=this.isOnlineMode?null:gameState.players.map(p=>[p.position.x,p.position.y,p.currentPiece,p.gameOver]);
            gameState.players.forEach(player => {
                const wasGameOver = player.gameOver;
                const isLocalPlayer = !this.isOnlineMode || player.id === this.localPlayerIndex;

                if (!player.gameOver) {
                    if (isLocalPlayer) {
                        if (!this.isOnlineMode) player.update(deltaTime);
                        this.applyContinuousInputs(player, deltaTime);
                    }

                    this.updatePlayerInfo(player);
                    this.drawNextPiece(player);
                }

                if (!wasGameOver && player.gameOver) {
                    touchStatusNeedsUpdate = true;
                }
            });

            // Snapshots and direct inputs repaint online; do not draw the same
            // 20-row well at 60 fps when its authoritative pose has not changed.
            if(this.isOnlineMode){
                if(this.lastRenderedInputSeq!==networkManager.inputSeq){
                    this.lastRenderedInputSeq=networkManager.inputSeq;
                    this.drawBoard();
                }
            }else if((gameState.boardRevision||0)!==boardRevision||
                gameState.players.some((p,i)=>p.position.x!==before[i][0]||
                 p.position.y!==before[i][1]||p.currentPiece!==before[i][2]||p.gameOver!==before[i][3]))
                this.drawBoard();
            this.updateTeamStatsIfNeeded();
            this.updateBlockedLanes();
            if (!this.isOnlineMode) this.saveSoloCheckpoint();

            if (touchStatusNeedsUpdate) {
                this.refreshTouchStatus();
            }
        }

        requestAnimationFrame((time) => this.gameLoop(time, run));
    }

    paintBlock(ctx,x,y,color,active=false) {
        const left=x*BLOCK_SIZE,top=y*BLOCK_SIZE;
        ctx.fillStyle=color;
        ctx.fillRect(left+1,top+1,BLOCK_SIZE-2,BLOCK_SIZE-2);
        ctx.fillStyle=active?'#ffffff63':'#ffffff34';
        ctx.fillRect(left+3,top+3,BLOCK_SIZE-6,3);
        ctx.strokeStyle=active?'#ffffff8a':'#051e1c36';
        ctx.lineWidth=1;
        ctx.strokeRect(left+1.5,top+1.5,BLOCK_SIZE-3,BLOCK_SIZE-3);
    }

    drawBoard() {
        const canvas=document.getElementById('game-canvas');
        if(!canvas)return;
        const ctx=canvas.getContext('2d');
        const boardWidth=getBoardWidth();
        ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle='#142629';
        ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.strokeStyle='#ffffff0d';
        ctx.lineWidth=1;
        ctx.beginPath();
        for(let x=1;x<boardWidth;x++){
            ctx.moveTo(x*BLOCK_SIZE+.5,0);
            ctx.lineTo(x*BLOCK_SIZE+.5,canvas.height);
        }
        for(let y=1;y<BOARD_HEIGHT;y++){
            ctx.moveTo(0,y*BLOCK_SIZE+.5);
            ctx.lineTo(canvas.width,y*BLOCK_SIZE+.5);
        }
        ctx.stroke();

        for(let y=0;y<BOARD_HEIGHT;y++){
            for(let x=0;x<boardWidth;x++){
                const occupant=gameState.board[y]?.[x];
                if(!occupant)continue;
                const player=gameState.players[occupant-1];
                this.paintBlock(ctx,x,y,player?.color||'#92a5a1');
            }
        }
        if(gameState.numPlayers>1)this.drawSpawnEntryGuides(ctx);
        const displayed=gameState.players.map(player=>{
            if(!this.isOnlineMode||player.id!==this.localPlayerIndex||
                !networkManager.connected||networkManager.stale)return player;
            const pose=projectOwnPiece(player,gameState.board,gameState.players,networkManager.pendingInputs);
            return pose?Object.assign(Object.create(Object.getPrototypeOf(player)),player,pose):player;
        });
        // Each active piece gets a matching landing outline.
        for(const player of displayed){
            if(!player.currentPiece||player.gameOver)continue;
            let landingY=player.position.y;
            while(landingY<BOARD_HEIGHT&&!player.checkCollision(
                player.currentPiece,{x:player.position.x,y:landingY+1}
            ).collides)landingY++;
            if(landingY<=player.position.y)continue;
            ctx.save();
            ctx.strokeStyle=player.color;
            ctx.globalAlpha=.52;ctx.lineWidth=1.7;
            for(let y=0;y<player.currentPiece.length;y++)for(let x=0;x<player.currentPiece[y].length;x++){
                if(!player.currentPiece[y][x])continue;
                const left=(player.position.x+x)*BLOCK_SIZE;
                const top=(landingY+y)*BLOCK_SIZE;
                ctx.strokeRect(left+4,top+4,BLOCK_SIZE-8,BLOCK_SIZE-8);
            }
            ctx.restore();
        }
        for(const player of displayed){
            if(!player.currentPiece||player.gameOver)continue;
            for(let y=0;y<player.currentPiece.length;y++)for(let x=0;x<player.currentPiece[y].length;x++){
                if(player.currentPiece[y][x])
                    this.paintBlock(ctx,player.position.x+x,player.position.y+y,player.color,true);
            }
        }
    }

    drawSpawnEntryGuides(ctx){
        // The rails continue into the first two actual rows without altering collision data.
        const depth=2*BLOCK_SIZE;
        for(const player of gameState.players){
            if(player.gameOver||!Number.isInteger(player.spawnLaneX))continue;
            const left=player.spawnLaneX*BLOCK_SIZE;
            const width=4*BLOCK_SIZE;
            ctx.save();
            const tint=ctx.createLinearGradient(0,0,0,depth);
            tint.addColorStop(0,player.color);
            tint.addColorStop(1,'#142629');
            ctx.globalAlpha=.095;
            ctx.fillStyle=tint;
            ctx.fillRect(left,0,width,depth);
            ctx.strokeStyle=player.color;
            ctx.globalAlpha=.26;
            ctx.lineWidth=1;
            ctx.beginPath();
            ctx.moveTo(left+.5,0);
            ctx.lineTo(left+.5,depth*.86);
            ctx.moveTo(left+width-.5,0);
            ctx.lineTo(left+width-.5,depth*.86);
            ctx.stroke();
            ctx.restore();
        }
    }

    darkenColor(color, amount) {
        // Parse hex color and darken it
        if (!color || typeof color !== 'string' || !color.startsWith('#')) {
            return '#000000';
        }
        
        let r = parseInt(color.slice(1, 3), 16);
        let g = parseInt(color.slice(3, 5), 16);
        let b = parseInt(color.slice(5, 7), 16);
        
        if (isNaN(r) || isNaN(g) || isNaN(b)) {
            return color;
        }
        
        r = Math.max(0, Math.floor(r * (1 - amount)));
        g = Math.max(0, Math.floor(g * (1 - amount)));
        b = Math.max(0, Math.floor(b * (1 - amount)));
        
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    drawNextPiece(player) {
        if(!this.previewSignatures)this.previewSignatures=new Map();
        const signature=[player.nextPiece?.map(row=>row.join('')).join('/'),player.color,player.gameOver&&!player.blocked].join(':');
        if(this.previewSignatures.get(player.id)===signature)return;
        this.previewSignatures.set(player.id,signature);
        for(const id of [`next-${player.id}`,`bay-next-${player.id}`]){
            const canvas=document.getElementById(id);
            if(!canvas)continue;
            const ctx=canvas.getContext('2d');
            ctx.clearRect(0,0,canvas.width,canvas.height);
            const piece=player.nextPiece;
            if(!piece||(player.gameOver&&!player.blocked))continue;
            const offsetX=Math.floor((canvas.width/BLOCK_SIZE-piece[0].length)/2);
            const offsetY=Math.floor((canvas.height/BLOCK_SIZE-piece.length)/2);
            for(let y=0;y<piece.length;y++)for(let x=0;x<piece[y].length;x++){
                if(piece[y][x])this.paintBlock(ctx,offsetX+x,offsetY+y,player.color,true);
            }
        }
    }

    updateBlockedLanes(){
        const area=document.getElementById('blocked-lanes');
        if(!area)return;
        const blocked=gameState.isGameOver?[]:gameState.players.filter(p=>p.blocked);
        const model=blocked.map(p=>({id:p.id,name:p.name||('Игрок '+(p.id+1)),ready:!!(this.isOnlineMode?p.canResume:laneHasClearance(p)),mine:!this.isOnlineMode||p.id===this.localPlayerIndex}));
        const signature=JSON.stringify([model,this.isOnlineMode&&networkManager.connected,this.isOnlineMode&&networkManager.stale,currentLanguage]);
        if(this.blockedLaneSignature===signature)return;
        this.blockedLaneSignature=signature;
        area.hidden=model.length===0;
        area.replaceChildren();
        for(const item of model){
            const row=document.createElement('div');row.className='blocked-lane';
            const message=document.createElement('span');message.className='blocked-lane__message';
            message.textContent=item.name+': '+(item.ready?(currentLanguage==='ru'?'проход свободен':'lane clear'):(currentLanguage==='ru'?'проход пока занят':'lane blocked'));
            row.append(message);
            if(item.mine&&item.ready){
                const btn=document.createElement('button');btn.type='button';btn.className='blocked-lane__resume';
                btn.textContent=currentLanguage==='ru'?'Я готов — вернуться':'Ready — return';
                btn.disabled=this.isOnlineMode&&(!networkManager.connected||networkManager.stale);
                btn.addEventListener('click',()=>{
                    if(this.isOnlineMode){networkManager.requestLaneResume();return;}
                    const player=gameState.players[item.id];
                    if(player?.resumeFromGate()){
                        this.blockedLaneSignature=null;this.updatePlayerInfo(player);
                        this.drawNextPiece(player);this.drawBoard();this.refreshTouchStatus();this.updateBlockedLanes();
                    }
                });
                row.append(btn);
            }
            area.append(row);
        }
    }

    updatePlayerInfo(player) {
        const bay=document.getElementById(`spawn-bay-${player.id}`);
        if(bay){
            bay.classList.toggle('is-out',!!player.gameOver);
            bay.classList.toggle('is-owned',this.isOnlineMode&&player.id===this.localPlayerIndex&&!player.gameOver);
            const accessibleName=player.name+(player.blocked?' — проход занят':player.gameOver?' — выбыл':'');
            if(bay.getAttribute('aria-label')!==accessibleName)bay.setAttribute('aria-label',accessibleName);
            const label=bay.querySelector('.spawn-bay__name');
            if(label&&label.textContent!==player.name){label.textContent=player.name;label.title=player.name;}
        }
        const statusEl = document.getElementById(`status-${player.id}`);
        if (!statusEl) return;

        if (player.gameOver) {
            statusEl.textContent = player.blocked?(currentLanguage==='ru'?'Ждёт проход':'Waiting'):t('out');
            statusEl.classList.add('is-out');
        } else {
            statusEl.textContent = t('inPlay');
            statusEl.classList.remove('is-out');
        }
    }

    updateTeamStats() {
        const { score, lines } = gameState.sharedStats;
        const scoreEl = document.getElementById('team-score');
        const linesEl = document.getElementById('team-lines');

        if (scoreEl) scoreEl.textContent = formatNumber(score);
        if (linesEl) linesEl.textContent = formatNumber(lines);

        this.updateComboIndicator();
        this.scheduleBoardScaleUpdate();
    }

    resetTeamStatsDisplay() {
        const scoreEl = document.getElementById('team-score');
        const linesEl = document.getElementById('team-lines');

        if (scoreEl) scoreEl.textContent = '0';
        if (linesEl) linesEl.textContent = '0';

        if (this.comboIndicator) {
            this.comboIndicator.classList.remove('visible');
        }
        if (this.clearFeed) {
            this.clearFeed.innerHTML = '';
        }
        if (this.scoreCard) {
            this.scoreCard.classList.remove('score-card--pulse');
        }
        this.lastComboChain = 0;
    }

    updateTeamStatsIfNeeded() {
        if (!gameState.sharedStatsDirty) {
            return;
        }

        this.updateTeamStats();

        const detail = gameState.sharedStats.lastClearDetail;
        if (detail) {
            this.showLineClearCelebration(detail);
            gameState.sharedStats.lastClearDetail = null;
        }

        gameState.sharedStatsDirty = false;
    }

    updateComboIndicator() {
        if (!this.comboIndicator) return;

        const chain = gameState.sharedStats.comboChain || 0;
        if (chain > 1) {
            this.comboIndicator.classList.add('visible');
            if (this.comboLabel) {
                this.comboLabel.textContent = `${t('comboX')}${chain}`;
            }
            if (this.comboBonus) {
                const bonusPercent = (chain - 1) * 10;
                this.comboBonus.textContent = `+${bonusPercent}% ${t('streak')}`;
            }

            if (chain !== this.lastComboChain) {
                this.comboIndicator.classList.remove('combo-burst');
                void this.comboIndicator.offsetWidth;
                this.comboIndicator.classList.add('combo-burst');
            }
        } else {
            this.comboIndicator.classList.remove('visible');
            this.comboIndicator.classList.remove('combo-burst');
            if (this.comboLabel) {
                this.comboLabel.textContent = t('comboReady');
            }
            if (this.comboBonus) {
                this.comboBonus.textContent = '';
            }
        }

        this.lastComboChain = chain;
        this.scheduleBoardScaleUpdate();
    }
    
    updateComboTooltip() {
        if (this.comboIndicator) {
            this.comboIndicator.title = t('comboHelp');
        }
    }

    flashScoreCard() {
        if (!this.scoreCard) return;

        this.scoreCard.classList.remove('score-card--pulse');
        void this.scoreCard.offsetWidth;
        this.scoreCard.classList.add('score-card--pulse');
    }

    getLineClearTitle(linesCleared) {
        switch (linesCleared) {
            case 1:
                return t('lineBreak');
            case 2:
                return t('doubleBreak');
            case 3:
                return t('tripleBreak');
            default:
                return t('megaClear');
        }
    }

    showLineClearCelebration(detail) {
        this.flashScoreCard();

        if (!this.clearFeed) return;

        const entry = document.createElement('div');
        entry.className = 'clear-event';

        const title = document.createElement('div');
        title.className = 'clear-event__title';
        title.textContent = this.getLineClearTitle(detail.linesCleared);
        entry.appendChild(title);

        const points = document.createElement('div');
        points.className = 'clear-event__points';
        points.textContent = `+${formatNumber(detail.totalScore)} ${t('pts')}`;
        entry.appendChild(points);

        const perLine = document.createElement('div');
        perLine.className = 'clear-event__per-line';
        perLine.textContent = `${formatNumber(detail.perLineScore)} ${t('ptsPerLine')}`;
        entry.appendChild(perLine);

        const bonusChips = [];
        if (detail.multiMultiplier > 1) {
            bonusChips.push(`${t('multiBonus')} +${detail.multiBonusPercent}%`);
        }
        if (detail.comboMultiplier > 1) {
            bonusChips.push(`${t('streakBonus')} +${detail.streakBonusPercent}%`);
        }

        if (bonusChips.length) {
            const bonusRow = document.createElement('div');
            bonusRow.className = 'clear-event__bonuses';
            bonusChips.forEach(text => {
                const chip = document.createElement('span');
                chip.textContent = text;
                bonusRow.appendChild(chip);
            });
            entry.appendChild(bonusRow);
        }

        this.clearFeed.appendChild(entry);

        while (this.clearFeed.children.length > 4) {
            this.clearFeed.removeChild(this.clearFeed.firstChild);
        }

        requestAnimationFrame(() => {
            entry.classList.add('visible');
        });

        setTimeout(() => {
            entry.classList.add('clear-event--fade');
            setTimeout(() => {
                entry.remove();
                this.scheduleBoardScaleUpdate();
            }, 600);
        }, 3600);

        this.scheduleBoardScaleUpdate();
    }

    handleResize() {
        if (!this.screens.gameScreen.classList.contains('active')) {
            return;
        }

        this.updateLayoutDensity();
        this.updateBoardScale();
    }

    updateLayoutDensity() {
        const gameScreen = this.screens.gameScreen;
        if (!gameScreen) return;

        const compact = window.innerWidth < 980 || window.innerHeight < 720;
        gameScreen.classList.toggle('compact', compact);
    }

    scheduleBoardScaleUpdate() {
        if (this.pendingScaleFrame) return;

        this.pendingScaleFrame = requestAnimationFrame(() => {
            this.pendingScaleFrame = null;
            this.updateBoardScale();
        });
    }

    updateBoardScale() {
        const canvas=document.getElementById('game-canvas');
        const stage=document.getElementById('game-container');
        const wrapper=document.getElementById('shared-board');
        if(!canvas||!stage||!wrapper||!this.screens.gameScreen.classList.contains('active'))return;

        // The CSS grid owns the layout. Fit the playable area within its actual stage,
        // not by subtracting siblings that can sit beside it in landscape/tablet mode.
        const rect=stage.getBoundingClientRect();
        const head=stage.querySelector('.stage-head');
        const stageStyles=getComputedStyle(stage);
        const boxStyles=getComputedStyle(wrapper);
        const padX=(parseFloat(stageStyles.paddingLeft)||0)+(parseFloat(stageStyles.paddingRight)||0);
        const padY=(parseFloat(stageStyles.paddingTop)||0)+(parseFloat(stageStyles.paddingBottom)||0);
        const frameX=(parseFloat(boxStyles.borderLeftWidth)||0)+(parseFloat(boxStyles.borderRightWidth)||0);
        const frameY=(parseFloat(boxStyles.borderTopWidth)||0)+(parseFloat(boxStyles.borderBottomWidth)||0);
        const gap=parseFloat(stageStyles.gap)||0;
        const maxWidth=Math.max(1,rect.width-padX-frameX-2);
        const maxHeight=Math.max(1,rect.height-padY-frameY-(head?.getBoundingClientRect().height||0)-gap-2);
        const rail=document.getElementById('spawn-rail');
        const railExtra=rail?4*BLOCK_SIZE:0;
        const labelExtra=rail?20:0;
        const ratio=Math.max(.05,Math.min(1.6,maxWidth/canvas.width,
            Math.max(1,maxHeight-labelExtra)/(canvas.height+railExtra)));
        const width=Math.floor(canvas.width*ratio);
        const height=Math.floor(canvas.height*ratio);
        canvas.style.width=width+'px';
        canvas.style.height=height+'px';
        canvas.style.maxWidth='none';
        canvas.style.maxHeight='none';
        wrapper.style.width=(width+frameX)+'px';
        // Keep the fractional CSS rail cell in exact horizontal lockstep with the canvas.
        const railHeight=rail?(4*width/gameState.boardWidth)+labelExtra:0;
        if(rail){
            const cell=width/gameState.boardWidth;
            rail.style.width=width+'px';
            rail.style.height=railHeight+'px';
            rail.style.setProperty('--bay-cell',cell+'px');
        }
        const effects=document.getElementById('game-effects-canvas');
        if(effects){
            effects.style.width=width+'px';
            effects.style.height=height+'px';
            effects.style.top=railHeight+'px';
        }
        wrapper.style.height=(height+railHeight+frameY)+'px';
    }

    installBoardGestures(canvas) {
        // Optional direct gestures supplement the thumb buttons, not replace them.
        // Horizontal/vertical motion snaps to whole cells; tapping rotates.
        const begin=event=>{
            if(event.pointerType==='mouse'||this.boardGesture||gameState.isPaused||gameState.isGameOver)return;
            if(!this.getTouchPlayer())return;
            event.preventDefault();
            this.boardGesture={id:event.pointerId,x:event.clientX,y:event.clientY,
                lastX:event.clientX,lastY:event.clientY,travel:0,started:performance.now()};
            try{canvas.setPointerCapture(event.pointerId);}catch{}
        };
        const move=event=>{
            const gesture=this.boardGesture;
            if(!gesture||gesture.id!==event.pointerId||gameState.isPaused)return;
            const player=this.getTouchPlayer();
            if(!player)return;
            event.preventDefault();
            this.noteSpawnAction(player);
            const cell=Math.max(15,canvas.getBoundingClientRect().width/gameState.boardWidth*.85);
            // Move in the axis that was deliberately dragged; no accidental hard drops.
            let dx=event.clientX-gesture.lastX,dy=event.clientY-gesture.lastY;
            gesture.travel=Math.max(gesture.travel,Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y));
            if(Math.abs(dx)>=cell&&Math.abs(event.clientX-gesture.x)>Math.abs(event.clientY-gesture.y)*.9){
                const steps=Math.max(-8,Math.min(8,Math.trunc(dx/cell)));
                for(let n=0;n<Math.abs(steps);n++)player.move(Math.sign(steps));
                gesture.lastX+=steps*cell;
                this.drawBoard();
            }else if(dy>=cell&&event.clientY-gesture.y>Math.abs(event.clientX-gesture.x)*1.1){
                const steps=Math.min(8,Math.trunc(dy/cell));
                for(let n=0;n<steps;n++)player.drop();
                gesture.lastY+=steps*cell;
                this.drawBoard();
                this.updateTeamStatsIfNeeded();
                this.updatePlayerInfo(player);
                this.drawNextPiece(player);
            }
        };
        const finish=(event,cancelled=false)=>{
            const gesture=this.boardGesture;
            if(!gesture||gesture.id!==event.pointerId)return;
            this.boardGesture=null;
            const player=this.getTouchPlayer();
            if(!cancelled&&player&&!gameState.isPaused&&!gameState.isGameOver&&
                gesture.travel<12&&performance.now()-gesture.started<450){
                player.rotate();
                this.drawBoard();
            }
        };
        canvas.addEventListener('pointerdown',begin);
        canvas.addEventListener('pointermove',move);
        canvas.addEventListener('pointerup',event=>finish(event));
        canvas.addEventListener('pointercancel',event=>finish(event,true));
        canvas.addEventListener('lostpointercapture',event=>finish(event,true));
    }

    getActionForCode(player, code) {
        if (!player || !player.keys) return null;

        return Object.keys(player.keys).find(action => player.keys[action] === code) || null;
    }

    getInputState(playerId, action) {
        const states = gameState.inputStates.get(playerId);
        if (!states) return null;
        return states[action];
    }

    activateMovementAction(player, action) {
        const state = this.getInputState(player.id, action);
        if (!state) return false;

        let moved = false;
        if (!state.active) {
            state.active = true;
            state.heldTime = 0;
            state.hasFiredInitial = true;
            player.move(action === 'left' ? -1 : 1);
            moved = true;
        }

        return moved;
    }

    activateSoftDrop(player) {
        const state = this.getInputState(player.id, 'down');
        if (!state) return;

        if (!state.active) {
            state.active = true;
            state.heldTime = 0;
            state.hasFiredInitial = false;
        }
    }

    releaseContinuousAction(playerId, action) {
        const state = this.getInputState(playerId, action);
        if (!state) return;

        state.active = false;
        state.heldTime = 0;
        state.hasFiredInitial = false;
    }

    applyContinuousInputs(player, deltaTime) {
        const states = gameState.inputStates.get(player.id);
        if (!states) return;

        const moveRepeat = this.moveRepeatInterval;

        ['left', 'right'].forEach(direction => {
            const state = states[direction];
            if (!state) return;

            if (!state.active) {
                state.heldTime = 0;
                return;
            }

            state.heldTime += deltaTime;

            if (!state.hasFiredInitial) {
                player.move(direction === 'left' ? -1 : 1);
                state.hasFiredInitial = true;
                state.heldTime = 0;
                return;
            }

            if (state.heldTime >= moveRepeat) {
                player.move(direction === 'left' ? -1 : 1);
                state.heldTime = Math.max(0, state.heldTime - moveRepeat);
            }
        });

        const downState = states.down;
        if (!downState) return;

        if (!downState.active) {
            downState.heldTime = 0;
            downState.hasFiredInitial = false;
            return;
        }

        downState.heldTime += deltaTime;

        const dropInterval = downState.hasFiredInitial ? this.softDropRepeatInterval : this.softDropInitialDelay;
        if (!downState.hasFiredInitial || downState.heldTime >= dropInterval) {
            player.drop();
            downState.hasFiredInitial = true;
            downState.heldTime = 0;
        }
    }

    handleKeyPress(e) {
        if(e.code==='Backquote'&&!e.repeat&&!e.target?.closest?.('input,textarea,[contenteditable="true"]')){
            e.preventDefault();this.toggleDebugMenu();return;
        }
        if(e.code==='Escape'&&!document.getElementById('blockies-debug')?.hidden){
            const debug=document.getElementById('blockies-debug');
            if(debug){e.preventDefault();this.toggleDebugMenu();return;}
        }
        const code = normalizeKeyCode(e.code);
        const isGameActive = this.screens.gameScreen.classList.contains('active') && gameState.players.length;

        if (code === 'Escape') {
            if (isGameActive && !gameState.isGameOver) {
                this.togglePause();
            }
            e.preventDefault();
            return;
        }

        if (!isGameActive || gameState.isPaused || gameState.isGameOver) {
            return;
        }

        if (e.repeat) {
            e.preventDefault();
            return;
        }

        let handled = false;
        const infoUpdates = new Set();
        let boardNeedsRedraw = false;

        gameState.players.forEach(player => {
            if (!this.isPlayerControllable(player)) return;

            const action = this.getActionForCode(player, code);
            if (!action) return;

            handled = true;
            this.noteSpawnAction(player);

            switch (action) {
                case 'left':
                case 'right':
                    if (this.activateMovementAction(player, action)) {
                        boardNeedsRedraw = true;
                    }
                    break;
                case 'down':
                    this.activateSoftDrop(player);
                    break;
                case 'rotate':
                    player.rotate();
                    boardNeedsRedraw = true;
                    break;
                case 'drop':
                    player.hardDrop();
                    boardNeedsRedraw = true;
                    infoUpdates.add(player);
                    break;
                default:
                    break;
            }
        });

        if (!handled) {
            return;
        }

        e.preventDefault();

        infoUpdates.forEach(player => {
            this.updatePlayerInfo(player);
            this.drawNextPiece(player);
        });

        if (boardNeedsRedraw) {
            this.drawBoard();
        }

        this.updateTeamStatsIfNeeded();
    }

    handleKeyRelease(e) {
        const code = normalizeKeyCode(e.code);
        const isGameActive = this.screens.gameScreen.classList.contains('active') && gameState.players.length;

        if (!isGameActive) {
            return;
        }

        let handled = false;

        gameState.players.forEach(player => {
            if (!this.isPlayerControllable(player)) return;

            const action = this.getActionForCode(player, code);
            if (!action) return;

            if (action === 'left' || action === 'right' || action === 'down') {
                this.releaseContinuousAction(player.id, action);
                handled = true;
            }
        });

        if (handled) {
            e.preventDefault();
        }
    }

    togglePause() {
        if (gameState.isGameOver) return;
        if (!this.isOnlineMode && !gameState.isPaused) this.saveSoloCheckpoint(true);
        if (this.isOnlineMode) {
            if (networkManager.hostId === networkManager.socket.id) networkManager.togglePause();
            return;
        }
        gameState.isPaused = !gameState.isPaused;
        
        if (gameState.isPaused) {
            this.showModal('pause');
        } else {
            this.hideModal('pause');
            gameState.lastTime = performance.now();
        }
    }

    restart() {
        if (!this.isOnlineMode && !gameState.isGameOver &&
            !window.confirm(currentLanguage==='ru'?'Начать новую партию? Текущий прогресс будет потерян.':'Start a new match? Current progress will be lost.')) return;
        if (this.isOnlineMode) {
            if (networkManager.hostId === networkManager.socket.id) networkManager.requestRematch();
            return;
        }
        this.hideModal('pause');
        this.hideModal('gameOver');
        this.startGame(gameState.numPlayers);
    }

    quitToMenu() {
        const banner=document.getElementById('online-network-status');
        if(banner)banner.hidden=true;
        if (!this.isOnlineMode) this.saveSoloCheckpoint(true);
        if (this.isOnlineMode && !window.confirm('Покинуть сетевую комнату? Остальные смогут продолжить игру.')) return;
        clearTimeout(this.spawnFocusTimer);
        this.boardEffects.reset();
        if (this.isOnlineMode) networkManager.leaveRoom();
        this.releaseTouchControls?.();
        this.gameLoopRun = (this.gameLoopRun || 0) + 1;
        this.hideModal('pause');
        this.hideModal('gameOver');
        gameState.isPaused = false;
        gameState.isGameOver = false;
        gameState.players = [];
        gameState.inputStates = new Map();
        resetSharedStats();
        
        // Reset online mode flags
        this.isOnlineMode = false;
        this.networkPlayers = {};
        this.localPlayerIndex = -1;
        
        this.showScreen('mainMenu');
        this.refreshTouchStatus();

        const teamStats = document.getElementById('team-stats');
        if (teamStats) {
            teamStats.classList.remove('visible');
            this.resetTeamStatsDisplay();
        }
    }

    showGameOver() {
        if (!this.isOnlineMode && gameState.numPlayers === 1) clearSolo();
        const scoresDiv = document.getElementById('final-scores');
        scoresDiv.replaceChildren();
        const ru = currentLanguage === 'ru';
        const {score,level,lines} = gameState.sharedStats;
        const board = gameState.board || [];
        const locked = board.reduce((sum,row)=>sum+row.filter(Boolean).length,0);
        const boardArea = getBoardWidth()*BOARD_HEIGHT;
        const occupancy = boardArea ? Math.round(locked/boardArea*100) : 0;
        const isCoop = gameState.numPlayers > 1;
        const mode = this.isOnlineMode ? (ru?'Онлайн-команда':'Online team') :
            isCoop ? (ru?'Локальная команда':'Local team') : (ru?'Одиночная партия':'Solo run');

        const overview=document.createElement('div');
        overview.className='result-score';
        const label=document.createElement('span');
        label.className='result-score__label';
        label.textContent=ru?'ОБЩИЙ СЧЁТ':'TEAM SCORE';
        const value=document.createElement('strong');
        value.className='result-score__value';
        value.textContent=formatNumber(score);
        const context=document.createElement('span');
        context.className='result-score__context';
        context.textContent=mode+' · '+gameState.numPlayers+' '+(ru?'игр.':'player(s)');
        overview.append(label,value,context);
        scoresDiv.append(overview);

        const metrics=document.createElement('div');
        metrics.className='result-metrics';
        const metricItems=[
            [formatNumber(lines),ru?'Линий собрано':'Lines cleared'],
            [String(level),ru?'Уровень':'Level'],
            [occupancy+'%',ru?'Поле занято':'Board occupied']
        ];
        for(const [metricValue,metricLabel] of metricItems){
            const tile=document.createElement('div');
            tile.className='result-metric';
            const number=document.createElement('strong');
            number.textContent=metricValue;
            const caption=document.createElement('span');
            caption.textContent=metricLabel;
            tile.append(number,caption);
            metrics.append(tile);
        }
        scoresDiv.append(metrics);

        const details=document.createElement('div');
        details.className='result-lower';
        const team=document.createElement('section');
        team.className='result-players';
        const teamTitle=document.createElement('h3');
        teamTitle.textContent=ru?'УЧАСТНИКИ':'PLAYERS';
        team.append(teamTitle);
        for(const player of gameState.players){
            const entry=document.createElement('div');
            entry.className='result-player';
            entry.style.setProperty('--player-color',player.color);
            const swatch=document.createElement('span');
            swatch.className='result-player__swatch';
            const name=document.createElement('span');
            name.className='result-player__name';
            name.textContent=player.name||((ru?'Игрок ':'Player ')+(player.id+1));
            const status=document.createElement('span');
            status.className='result-player__status';
            status.textContent=player.gameOver?(ru?'Выбыл':'Out'):(ru?'На поле':'Playing');
            entry.append(swatch,name,status);
            team.append(entry);
        }
        details.append(team);
        const boardSection=document.createElement('section');
        boardSection.className='result-board';
        const boardTitle=document.createElement('h3');
        boardTitle.textContent=ru?'ПОЛЕ НА ФИНИШЕ':'FINAL BOARD';
        const canvas=document.createElement('canvas');
        canvas.className='result-board__canvas';
        const cell=8;
        const width=getBoardWidth();
        canvas.width=width*cell;
        canvas.height=BOARD_HEIGHT*cell;
        const ctx=canvas.getContext('2d');
        if(ctx){
            ctx.fillStyle='#142629';ctx.fillRect(0,0,canvas.width,canvas.height);
            for(let y=0;y<BOARD_HEIGHT;y++){
                for(let x=0;x<width;x++){
                    const owner=board[y]?.[x];
                    if(!owner)continue;
                    ctx.fillStyle=gameState.players[owner-1]?.color||'#9daea6';
                    ctx.fillRect(x*cell+1,y*cell+1,cell-2,cell-2);
                }
            }
        }
        const legend=document.createElement('p');
        legend.className='result-board__description';
        legend.textContent=ru?`${locked} занятых клеток`:`${locked} filled cells`;
        boardSection.append(boardTitle,canvas,legend);
        details.append(boardSection);
        scoresDiv.append(details);

        this.refreshRematchPermission();
        this.showModal('gameOver');
    }

    refreshRematchPermission(){
        const again=document.getElementById('play-again-btn');
        if(!again)return;
        const allowed=!this.isOnlineMode||networkManager.hostId===networkManager.socket.id;
        again.disabled=!allowed;
        again.textContent=this.isOnlineMode
            ? (allowed ? (currentLanguage==='ru'?'Новый раунд':'New round') :
                (currentLanguage==='ru'?'Раунд начинает ведущий':'Host starts next round'))
            : t('playAgain');
    }

    showCoopSetup() {
        this.showScreen('coopSetup');
        this.updateCoopPlayerConfig(2); // Local co-op begins with two players
    }

    selectPlayerCount(btn) {
        // Update button states
        document.querySelectorAll('.player-count-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const count = parseInt(btn.dataset.count);
        this.updateCoopPlayerConfig(count);
    }

    updateCoopPlayerConfig(numPlayers) {
        let names=[];
        try{names=JSON.parse(localStorage.getItem('pocket-works:blockies:coop-names')||'[]');}
        catch{}
        const container = document.getElementById('coop-players-config');
        container.innerHTML = '';

        for (let i = 0; i < numPlayers; i++) {
            const card = document.createElement('div');
            card.className = 'coop-player-card';
            
            const color = gameState.settings.colors[i] || DEFAULT_COLORS[i];
            const keys = gameState.settings.keys[i] || DEFAULT_KEYS[i];
            
            card.innerHTML = `
                <h4>
                    <span class="player-color-badge" style="background: ${color};"></span>
                    ${t('player')} ${i + 1}
                </h4>
                <label class="coop-name-label">Ник игрока
                    <input type="text" class="coop-name-input" id="coop-nickname-${i}" maxlength="20" autocomplete="off" placeholder="Игрок ${i+1}">
                </label>
                <div class="color-picker">
                    <label>${t('blockColor')}</label>
                    <input type="color" id="coop-color-${i}" value="${color}">
                </div>
                <div class="key-bindings">
                    <div class="key-binding">
                        <label>${t('left')}:</label>
                        <input type="text" id="coop-key-${i}-left" value="${formatKeyLabel(keys.left)}" 
                               data-key-code="${keys.left}" readonly>
                    </div>
                    <div class="key-binding">
                        <label>${t('right')}:</label>
                        <input type="text" id="coop-key-${i}-right" value="${formatKeyLabel(keys.right)}" 
                               data-key-code="${keys.right}" readonly>
                    </div>
                    <div class="key-binding">
                        <label>${t('down')}:</label>
                        <input type="text" id="coop-key-${i}-down" value="${formatKeyLabel(keys.down)}" 
                               data-key-code="${keys.down}" readonly>
                    </div>
                    <div class="key-binding">
                        <label>${t('rotate')}:</label>
                        <input type="text" id="coop-key-${i}-rotate" value="${formatKeyLabel(keys.rotate)}" 
                               data-key-code="${keys.rotate}" readonly>
                    </div>
                    <div class="key-binding">
                        <label>${t('drop')}:</label>
                        <input type="text" id="coop-key-${i}-drop" value="${formatKeyLabel(keys.drop)}" 
                               data-key-code="${keys.drop}" readonly>
                    </div>
                </div>
            `;
            
            container.appendChild(card);
            const nickname=card.querySelector('.coop-name-input');
            if(nickname)nickname.value=String(names[i]||'').slice(0,20);

            // Add event listener for key binding inputs
            const actions = ['left', 'right', 'down', 'rotate', 'drop'];
            actions.forEach(action => {
                const input = document.getElementById(`coop-key-${i}-${action}`);
                if (input) {
                    input.addEventListener('click', () => this.captureKey(input, i, action));
                }
            });

            // Add event listener for color picker
            const colorInput = document.getElementById(`coop-color-${i}`);
            if (colorInput) {
                colorInput.addEventListener('change', (e) => {
                    const selectedColor = e.target.value;
                    
                    // Check if color is too dark
                    if (isColorTooDark(selectedColor)) {
                        const brighterColor = suggestBrighterColor(selectedColor);
                        const confirmMsg = currentLanguage === 'ru' 
                            ? `Выбранный цвет слишком тёмный и может быть плохо виден на игровом поле. Использовать более яркий цвет вместо этого?`
                            : `The selected color is too dark and may be hard to see on the game board. Use a brighter color instead?`;
                        
                        if (confirm(confirmMsg)) {
                            e.target.value = brighterColor;
                            gameState.settings.colors[i] = brighterColor;
                            const badge = card.querySelector('.player-color-badge');
                            if (badge) badge.style.background = brighterColor;
                        } else {
                            gameState.settings.colors[i] = selectedColor;
                            const badge = card.querySelector('.player-color-badge');
                            if (badge) badge.style.background = selectedColor;
                        }
                    } else {
                        gameState.settings.colors[i] = selectedColor;
                        const badge = card.querySelector('.player-color-badge');
                        if (badge) badge.style.background = selectedColor;
                    }
                });
            }
        }
    }

    captureKey(input, playerIndex, action) {
        input.value = 'Press a key...';
        input.classList.add('capturing');
        
        const handler = (e) => {
            e.preventDefault();
            const code = e.code || e.key;
            input.value = formatKeyLabel(code);
            input.dataset.keyCode = code;
            gameState.settings.keys[playerIndex][action] = code;
            input.classList.remove('capturing');
            document.removeEventListener('keydown', handler);
        };
        
        document.addEventListener('keydown', handler);
    }

    startCoopGame() {
        // Get the selected player count
        const activeBtn = document.querySelector('.player-count-btn.active');
        const numPlayers = activeBtn ? parseInt(activeBtn.dataset.count) : 1;
        
        // Save the current co-op settings
        for (let i = 0; i < numPlayers; i++) {
            const colorInput = document.getElementById(`coop-color-${i}`);
            if (colorInput) {
                gameState.settings.colors[i] = colorInput.value;
            }
        }
        
        this.localPlayerNames=Array.from({length:numPlayers},(_,i)=>
            document.getElementById(`coop-nickname-${i}`)?.value.trim().slice(0,20)||`Игрок ${i+1}`);
        localStorage.setItem('pocket-works:blockies:coop-names',JSON.stringify(this.localPlayerNames));
        // Save to localStorage
        localStorage.setItem('pocket-works:blockies:settings', JSON.stringify(gameState.settings));
        
        // Start the game
        this.startGame(numPlayers);
    }

    showOnlineLobby(inviteRoom=null) {
        this.showScreen('onlineLobby');
        this.updateConnectionStatus('connecting');
        
        // Setup network callbacks
        networkManager.on('connect', () => {
            this.updateConnectionStatus('connected');
            
            // Send nickname if available
            const nicknameInput = document.getElementById('nickname-input');
            if (nicknameInput && nicknameInput.value.trim()) {
                networkManager.setNickname(nicknameInput.value.trim());
            }
        });

        networkManager.on('disconnect', () => {
            this.updateConnectionStatus('disconnected');
        });

        networkManager.on('roomsList', (rooms) => {
            this.showRoomsList(rooms);
        });

        networkManager.on('roomCreated', (room) => {
            this.showRoomView(room);
        });

        networkManager.on('roomJoined', (room) => {
            this.showRoomView(room);
        });

        networkManager.on('roomUpdate', (room) => {
            this.updateRoomView(room);
        });

        networkManager.on('leftRoom', () => {
            this.hideRoomView();
            if(this.isOnlineMode){
                this.releaseTouchControls?.();
                this.gameLoopRun=(this.gameLoopRun||0)+1;
                this.isOnlineMode=false;
                gameState.players=[];
                this.hideModal('gameOver');
                this.hideModal('pause');
                this.showScreen('onlineLobby');
            }
        });

        networkManager.on('gameStart', (data) => {
            this.startOnlineGame(data);
        });

        networkManager.on('error', (message) => {
            // Provide user-friendly error messages
            let userMessage = message;
            if (message.includes('Socket.io client not available') || message.includes('Socket.io client')) {
                userMessage = t('socketIoNotAvailable');
            } else if (message.includes('Connection failed') || message.includes('failed')) {
                userMessage = t('serverUnavailable');
            }
            this.showStyledMessage(t('networkError'), userMessage, 'error');
        });

        networkManager.on('snapshot', data => applyNetworkSnapshot(data));
        networkManager.on('hostChanged', () => {
            if(networkManager.currentRoom)this.updateRoomView(networkManager.currentRoom);
            this.refreshRematchPermission();
        });
        networkManager.on('connectionHealth', ({status}) => {
            const banner=document.getElementById('online-network-status');
            if (!banner) return;
            banner.hidden = status === 'online' || !this.isOnlineMode;
            const statusText=status==='offline' ? t('recoveryOffline') :
                status==='recovering' ? t('recoveryRestoring') :
                status==='stalled' ? t('recoveryStalled') : '';
            banner.replaceChildren();
            if(status!=='online'&&this.isOnlineMode){
                const label=document.createElement('span');
                label.textContent=statusText;
                banner.append(label);
                const retry=document.createElement('button');
                retry.type='button';
                retry.className='net-retry';
                retry.textContent=currentLanguage==='ru'?'Переподключиться':'Reconnect';
                retry.addEventListener('click',()=>networkManager.reconnect());
                banner.append(retry);
            }
            if (status !== 'online') this.releaseTouchControls?.();
            this.refreshTouchStatus();
        });
        networkManager.on('onlinePause', ({paused,isHost}) => {
            const pause = document.getElementById('pause-btn');
            const resume = document.getElementById('resume-btn');
            if (pause) {pause.disabled = !isHost;pause.title = isHost ? 'Пауза для всей комнаты' : 'Паузой управляет ведущий';}
            if (resume) resume.disabled = !isHost;
            if (this.isOnlineMode && this.screens.gameScreen.classList.contains('active') && !gameState.isGameOver) {
                const changed = gameState.isPaused !== paused;
                gameState.isPaused = paused;
                document.querySelector('#pause-menu h2').textContent = paused ? 'Игра на паузе' : 'Пауза';
                if (paused) this.showModal('pause');
                else {
                    this.hideModal('pause');
                    if (changed) gameState.lastTime = performance.now();
                }
            }
        });
        networkManager.on('backToLobby', room => {
            this.releaseTouchControls?.();
            this.isOnlineMode = false;
            this.hideModal('pause');
            this.hideModal('gameOver');
            this.showScreen('onlineLobby');
            this.showRoomView(room);
        });
        if(networkManager.currentRoom)this.showRoomView(networkManager.currentRoom);
        const connection=inviteRoom?networkManager.joinRoom(inviteRoom):networkManager.connect();
        connection.then(()=>this.updateConnectionStatus(networkManager.connected?'connected':'disconnected'))
          .catch(()=>this.updateConnectionStatus('disconnected'));
    }

    updateConnectionStatus(status) {
        const statusEl = document.querySelector('.connection-status');
        const indicator = statusEl.querySelector('.status-indicator');
        const text = statusEl.querySelector('.status-text');
        
        indicator.className = 'status-indicator ' + status;
        
        switch(status) {
            case 'connecting':
                text.textContent = t('connectingToServer');
                break;
            case 'connected':
                text.textContent = t('connectedToServer');
                break;
            case 'disconnected':
                text.textContent = t('disconnectedFromServer');
                break;
        }
    }

    showRoomsList(rooms) {
        const container = document.getElementById('rooms-list');
        container.innerHTML = '';
        
        if (rooms.length === 0) {
            container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 20px;">
                <strong>${t('noRoomsAvailable')}</strong><br>
                ${t('createRoomPrompt')}
            </p>`;
        } else {
            rooms.forEach(room => {
                const roomDiv = document.createElement('div');
                roomDiv.className = 'room-item';
                roomDiv.innerHTML = `
                    <div class="room-info"><h4></h4><p></p></div>
                    <button class="btn btn-primary btn-small">Join</button>
                `;
                roomDiv.querySelector('h4').textContent=String(room.name||'Комната');
                roomDiv.querySelector('p').textContent=`${Number(room.players)||0}/${Number(room.maxPlayers)||4} players`;
                roomDiv.querySelector('.btn').addEventListener('click', () => this.joinRoom(room.id));
                container.appendChild(roomDiv);
            });
        }
    }

    createRoom() {
        const roomName = 'Blockies';
        if (roomName) {
            networkManager.createRoom(roomName);
        }
    }

    joinRoom(roomId) {
        networkManager.joinRoom(roomId);
    }

    leaveRoom() {
        networkManager.leaveRoom();
    }

    toggleReady() {
        networkManager.toggleReady();
    }

    showRoomView(room) {
        const roomView = document.getElementById('room-view');
        const roomsSection = document.querySelector('.rooms-section');
        
        if (roomView && roomsSection) {
            roomsSection.style.display = 'none';
            roomView.style.display = 'block';
            this.updateRoomView(room);
        }
    }

    hideRoomView() {
        const roomView = document.getElementById('room-view');
        const roomsSection = document.querySelector('.rooms-section');
        
        if (roomView && roomsSection) {
            roomView.style.display = 'none';
            roomsSection.style.display = 'block';
        }
    }

    updateRoomView(room) {
        const roomNameEl = document.getElementById('room-name');
        const playersListEl = document.getElementById('room-players-list');
        const colorOptionsEl = document.getElementById('color-options');
        const statusEl = document.getElementById('room-status');
        
        if (roomNameEl) {
            roomNameEl.textContent = room.name;
        }

        // Update players list
        if (playersListEl) {
            playersListEl.innerHTML = '';
            room.players.forEach(player => {
                const playerDiv = document.createElement('div');
                playerDiv.className = 'room-player-item';
                const color = document.createElement('div');
                color.className = 'room-player-color';
                color.style.background = player.color;
                const name = document.createElement('div');
                name.className = 'room-player-name';
                name.textContent = player.name;
                const status = document.createElement('div');
                status.className = 'room-player-status';
                status.textContent=player.id===room.hostId
                    ? (currentLanguage==='ru'?'Ведущий':'Host')
                    : (player.ready ? (currentLanguage==='ru'?'Готов':'Ready') : (currentLanguage==='ru'?'Не готов':'Not ready'));
                playerDiv.append(color,name,status);
                playersListEl.appendChild(playerDiv);
            });
        }

        // Update color options
        if (colorOptionsEl) {
            colorOptionsEl.innerHTML = '';
            const COLORS = ['#FF1493', '#00D9FF', '#FFDB58', '#39FF14'];
            const myPlayer = room.players.find(p => p.id === networkManager.socket.id);
            
            COLORS.forEach(color => {
                const colorDiv = document.createElement('div');
                colorDiv.className = 'color-option';
                colorDiv.style.background = color;
                
                const isUsed = room.players.some(p => p.color === color);
                const isMyColor = myPlayer && myPlayer.color === color;
                
                if (isMyColor) {
                    colorDiv.classList.add('selected');
                } else if (isUsed) {
                    colorDiv.classList.add('disabled');
                } else {
                    colorDiv.addEventListener('click', () => {
                        networkManager.changeColor(color);
                    });
                }
                
                colorOptionsEl.appendChild(colorDiv);
            });
        }

        const readyButton = document.getElementById('ready-btn');
        if (readyButton) {
            const own = room.players.find(p => p.id === networkManager.socket.id);
            readyButton.textContent = own?.ready
              ? (currentLanguage==='ru'?'Отменить готовность':'Not ready')
              : t('ready');
            readyButton.disabled = !own;
        }
        // Update status
        if (statusEl) {
            const readyCount = room.players.filter(p => p.ready).length;
            if (readyCount === room.players.length && room.players.length > 0) {
                statusEl.textContent = currentLanguage==='ru'?'Начинаем игру…':'Starting game…';
                statusEl.dataset.state='ready';
            } else {
                statusEl.textContent = currentLanguage==='ru'
                  ? `Готовы: ${readyCount} из ${room.players.length}`
                  : `Ready: ${readyCount} of ${room.players.length}`;
                statusEl.dataset.state='waiting';
            }
        }
    }

    startOnlineGame(data) {
        const banner=document.getElementById('online-network-status');
        if(banner)banner.hidden=true;
        this.hideModal('gameOver');
        this.hideModal('pause');
        this.releaseTouchControls?.();
        // Map network players to game players
        const numPlayers = data.players.length;
        
        // Store network player info for synchronization
        this.networkPlayers = {};
        this.localPlayerIndex = -1;
        this.isOnlineMode = true; // Flag to indicate online mode
        this.onlineParticipantNames=data.players.map(p=>p.name);
        
        // Update game state with player colors from network and map IDs
        data.players.forEach((netPlayer, index) => {
            gameState.settings.colors[index] = netPlayer.color;
            this.networkPlayers[netPlayer.id] = index;
            
            // Identify which player is the local player
            if (networkManager.socket && netPlayer.id === networkManager.socket.id) {
                this.localPlayerIndex = index;
            }
        });
        
        // Start the game with proper player count and shared seed
        const seed = normalizeSeed(data.seed ?? Date.now());
        this.startGame(numPlayers, seed);
        
        // Set up online synchronization
        this.setupOnlineSync();
        
        console.log('Online game started with players:', data.players);
        console.log('Local player index:', this.localPlayerIndex);
    }
    
    setupOnlineSync() {
        if (!networkManager.socket) return;
        
        const VALID_ACTIONS = ['move', 'rotate', 'drop', 'hardDrop'];
        
        // Listen for remote player inputs
        networkManager.on('playerInput', (data) => {
            // Validate input data
            if (!data || typeof data.playerId !== 'string' || typeof data.action !== 'string') {
                console.warn('Invalid player input data received:', data);
                return;
            }
            
            // Validate action type
            if (!VALID_ACTIONS.includes(data.action)) {
                console.warn('Invalid action type received:', data.action);
                return;
            }
            
            const playerIndex = this.networkPlayers[data.playerId];
            if (playerIndex !== undefined && playerIndex !== this.localPlayerIndex) {
                const player = gameState.players[playerIndex];
                if (player && !player.gameOver) {
                    // Apply the action from remote player
                    switch (data.action) {
                        case 'move':
                            // Validate direction is -1 or 1
                            if (typeof data.direction === 'number' && (data.direction === -1 || data.direction === 1)) {
                                player.move(data.direction, { broadcast: false });
                            } else {
                                console.warn('Invalid move direction:', data.direction);
                            }
                            break;
                        case 'rotate':
                            player.rotate({ broadcast: false });
                            break;
                        case 'drop':
                            player.drop({ broadcast: false });
                            break;
                        case 'hardDrop':
                            player.hardDrop({ broadcast: false });
                            break;
                    }
                }
            }
        });
    }

    showStyledMessage(title, message, type = 'info') {
        // Create or get message overlay
        let overlay = document.getElementById('message-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'message-overlay';
            overlay.className = 'message-overlay';
            document.body.appendChild(overlay);
        }
        
        // Create message box
        const messageBox = document.createElement('div');
        messageBox.className = `message-box message-${type}`;
        
        const titleEl = document.createElement('h3');
        titleEl.textContent = title;
        messageBox.appendChild(titleEl);
        
        const messageEl = document.createElement('p');
        messageEl.textContent = message;
        messageEl.style.whiteSpace = 'pre-wrap';
        messageBox.appendChild(messageEl);
        
        overlay.innerHTML = '';
        overlay.appendChild(messageBox);
        overlay.style.display = 'flex';
        
        // Auto hide after delay for success messages
        if (type === 'success') {
            setTimeout(() => {
                overlay.style.display = 'none';
            }, 2000);
        } else {
            // Add close button for warnings/errors
            const closeBtn = document.createElement('button');
            closeBtn.textContent = 'OK';
            closeBtn.className = 'btn btn-primary';
            closeBtn.onclick = () => {
                overlay.style.display = 'none';
            };
            messageBox.appendChild(closeBtn);
        }
    }

    showSettings() {
        if(this.isOnlineMode && this.screens.gameScreen.classList.contains('active') &&
           !gameState.isPaused && !gameState.isGameOver){
            this.showStyledMessage(currentLanguage==='ru'?'Настройки':'Settings',
                currentLanguage==='ru'?'Во время сетевой партии настройки доступны после паузы.':'Pause the online match before opening settings.','info');
            return;
        }
        if(!this.isOnlineMode && this.screens.gameScreen.classList.contains('active') &&
           !gameState.isPaused && !gameState.isGameOver){
            this.saveSoloCheckpoint(true);
            gameState.isPaused=true;
            this.settingsPausedLocalGame=true;
        }
        if(!this.screens.settingsScreen.classList.contains('active')){
            this.settingsPausedModal=this.modals.pause.classList.contains('active');
            if(this.settingsPausedModal)this.hideModal('pause');
        }
        this.cancelKeyCapture();
        clearTimeout(this.settingsReturnTimer);
        const container = document.getElementById('settings-container');
        container.innerHTML = '';

        // Add global settings section
        const globalDiv = document.createElement('div');
        globalDiv.className = 'global-settings';
        globalDiv.innerHTML = `
            <h3>${t('globalSettings')}</h3>
            <div class="setting-item">
                <label>
                    <input type="checkbox" id="sound-enabled" ${soundManager.enabled ? 'checked' : ''}>
                    ${t('soundEffects')}
                </label>
            </div>
        `;
        container.appendChild(globalDiv);

        // Only show settings for the current number of players, or all 4 if no game is active
        const numPlayersToShow = this.screens.gameScreen.classList.contains('active') &&
            gameState.numPlayers > 0 ? gameState.numPlayers : 4;

        const playersTitle = document.createElement('h3');
        playersTitle.textContent = t('playerSettings');
        playersTitle.style.marginTop = '24px';
        container.appendChild(playersTitle);

        for (let i = 0; i < numPlayersToShow; i++) {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'player-settings';
            
            const title = document.createElement('h3');
            title.textContent = `${t('player')} ${i + 1}`;
            playerDiv.appendChild(title);

            // Color picker
            const colorDiv = document.createElement('div');
            colorDiv.className = 'color-picker';
            const colorValue = gameState.settings.colors[i] || DEFAULT_COLORS[i];
            colorDiv.innerHTML = `
                <label>${t('blockColor')}</label>
                <input type="color" id="color-${i}" value="${colorValue}">
            `;
            if(this.isOnlineMode && this.screens.gameScreen.classList.contains('active')){
                const picker=colorDiv.querySelector('input[type="color"]');
                if(picker){
                    picker.disabled=true;
                    picker.title=currentLanguage==='ru'?'Цвет сетевого игрока меняется в комнате':'Change online colors in the lobby';
                }
            }
            playerDiv.appendChild(colorDiv);

            // Key bindings - in a more compact grid
            const keysDiv = document.createElement('div');
            keysDiv.className = 'key-bindings';
            
            const actions = ['left', 'right', 'down', 'rotate', 'drop'];
            
            actions.forEach((action, idx) => {
                const bindingDiv = document.createElement('div');
                bindingDiv.className = 'key-binding';
                const currentCode = normalizeKeyCode(gameState.settings.keys[i][action] || DEFAULT_KEYS[i][action]);
                bindingDiv.innerHTML = `
                    <label>${t(action)}:</label>
                    <input type="text" id="key-${i}-${action}"
                           value="${formatKeyLabel(currentCode)}"
                           readonly
                           data-player="${i}"
                           data-action="${action}"
                           data-key-code="${currentCode}">
                `;
                keysDiv.appendChild(bindingDiv);
            });

            playerDiv.appendChild(keysDiv);
            
            // Gamepad assignment
            const gamepadDiv = document.createElement('div');
            gamepadDiv.className = 'gamepad-picker';
            gamepadDiv.innerHTML = `
                <label>${t('gamepad')}</label>
                <select id="gamepad-${i}" class="gamepad-select">
                    <option value="">${t('keyboard')}</option>
                </select>
            `;
            playerDiv.appendChild(gamepadDiv);
            
            container.appendChild(playerDiv);
        }
        
        // Populate gamepad dropdowns
        scanGamepads();
        const gamepads = gameState.gamepads.connected;
        
        for (let i = 0; i < numPlayersToShow; i++) {
            const select = document.getElementById(`gamepad-${i}`);
            if (!select) continue;
            
            // Add gamepad options
            gamepads.forEach(gp => {
                const option = document.createElement('option');
                option.value = gp.index;
                option.textContent = `Gamepad ${gp.index + 1}`;
                
                // Check if this gamepad is already assigned to this player
                if (gameState.gamepads.assignments[gp.index] === i) {
                    option.selected = true;
                }
                
                select.appendChild(option);
            });
        }

        // Add event listeners for key binding inputs
        document.querySelectorAll('.key-binding input').forEach(input => {
            input.addEventListener('click', (e) => this.captureKey(e.target));
        });

        this.showScreen('settingsScreen');
    }

    cancelKeyCapture(){
        const capture=this.activeKeyCapture;
        if(!capture)return;
        document.removeEventListener('keydown',capture.handler,true);
        if(capture.input.isConnected){
            capture.input.classList.remove('capturing');
            if(capture.input.value===capture.placeholder)capture.input.value=capture.previous;
        }
        this.activeKeyCapture=null;
    }

    captureKey(input) {
        this.cancelKeyCapture();
        const previous=input.value;
        const placeholder=currentLanguage==='ru'?'Нажмите клавишу…':'Press a key…';
        input.value=placeholder;
        input.classList.add('capturing');
        const handler=(event)=>{
            event.preventDefault();
            event.stopImmediatePropagation();
            if(event.code==='Backquote'){
                input.value=previous; // reserved for the global Pocket Works debug menu
            }else if(event.code!=='Escape'){
                const code=normalizeKeyCode(event.code||event.key);
                if(code){
                    input.dataset.keyCode=code;
                    input.value=formatKeyLabel(code);
                }else input.value=previous;
            }else input.value=previous;
            this.cancelKeyCapture();
        };
        this.activeKeyCapture={input,handler,previous,placeholder};
        document.addEventListener('keydown',handler,true);
    }

    saveSettings() {
        this.cancelKeyCapture();
        const numPlayersToSave = this.previousScreen==='gameScreen' &&
            gameState.numPlayers > 0 ? gameState.numPlayers : 4;

        // Collect settings without applying any of them until all checks pass.
        const newColors = [];
        const newKeys = [];
        
        // Collect colors
        for (let i = 0; i < numPlayersToSave; i++) {
            const colorInput = document.getElementById(`color-${i}`);
            if (colorInput) {
                newColors[i] = colorInput.value;
            }
        }
        
        // Check for dark colors and warn user
        const darkColorWarnings = [];
        for (let i = 0; i < numPlayersToSave; i++) {
            if (newColors[i] && isColorTooDark(newColors[i])) {
                darkColorWarnings.push(`${t('player')} ${i + 1}`);
            }
        }
        
        if (darkColorWarnings.length > 0) {
            const warningMsg = currentLanguage === 'ru'
                ? `Следующие игроки используют слишком тёмные цвета, которые могут быть плохо видны: ${darkColorWarnings.join(', ')}. Продолжить?`
                : `The following players are using very dark colors that may be hard to see: ${darkColorWarnings.join(', ')}. Continue anyway?`;
            
            if (!confirm(warningMsg)) {
                return;
            }
        }

        // Check for color conflicts
        const colorConflicts = [];
        for (let i = 0; i < numPlayersToSave; i++) {
            for (let j = i + 1; j < numPlayersToSave; j++) {
                if (newColors[i] && newColors[j] && newColors[i] === newColors[j]) {
                    colorConflicts.push(`Player ${i + 1} and Player ${j + 1} have the same color`);
                }
            }
        }
        
        if (colorConflicts.length > 0) {
            this.showStyledMessage(t('colorConflict'), colorConflicts.join('\n') + '\n\n' + t('colorConflictMsg'), 'warning');
            return;
        }

        // Collect key bindings
        for (let i = 0; i < numPlayersToSave; i++) {
            newKeys[i] = {};
            const actions = ['left', 'right', 'down', 'rotate', 'drop'];
            actions.forEach(action => {
                const keyInput = document.getElementById(`key-${i}-${action}`);
                if (keyInput) {
                    const storedCode = keyInput.dataset.keyCode || '';
                    const finalCode = normalizeKeyCode(storedCode || keyInput.value);
                    if (finalCode) {
                        newKeys[i][action] = finalCode;
                    }
                }
            });
        }

        // Check for key conflicts between players
        const keyConflicts = [];
        const keyUsage = new Map(); // Map of key -> [{player, action}]
        
        for (let i = 0; i < numPlayersToSave; i++) {
            const actions = ['left', 'right', 'down', 'rotate', 'drop'];
            actions.forEach(action => {
                const key = newKeys[i]?.[action];
                if (key) {
                    if (!keyUsage.has(key)) {
                        keyUsage.set(key, []);
                    }
                    keyUsage.get(key).push({ player: i + 1, action });
                }
            });
        }
        
        // Find conflicts
        keyUsage.forEach((usages, key) => {
            if (usages.length > 1) {
                const description = usages.map(u => `Player ${u.player} (${t(u.action)})`).join(', ');
                keyConflicts.push(`Key "${formatKeyLabel(key)}" is used by: ${description}`);
            }
        });
        
        if (keyConflicts.length > 0) {
            this.showStyledMessage(t('keyBindingConflict'), keyConflicts.join('\n') + '\n\n' + t('keyBindingConflictMsg'), 'warning');
            return;
        }

        // Check for gamepad conflicts
        const gamepadConflicts = [];
        const gamepadUsage = new Map();
        
        for (let i = 0; i < numPlayersToSave; i++) {
            const select = document.getElementById(`gamepad-${i}`);
            if (select && select.value !== '') {
                const gamepadIndex = parseInt(select.value);
                if (!gamepadUsage.has(gamepadIndex)) {
                    gamepadUsage.set(gamepadIndex, []);
                }
                gamepadUsage.get(gamepadIndex).push(i + 1);
            }
        }
        
        gamepadUsage.forEach((players, gamepadIndex) => {
            if (players.length > 1) {
                gamepadConflicts.push(`Gamepad ${gamepadIndex + 1} is assigned to: Player ${players.join(', Player ')}`);
            }
        });
        
        if (gamepadConflicts.length > 0) {
            this.showStyledMessage(t('gamepadConflict'), gamepadConflicts.join('\n') + '\n\n' + t('gamepadConflictMsg'), 'warning');
            return;
        }

        // All validations passed. Persist sound and controls together.
        const soundCheckbox = document.getElementById('sound-enabled');
        if(soundCheckbox)soundManager.setEnabled(soundCheckbox.checked);
        for (let i = 0; i < numPlayersToSave; i++) {
            gameState.settings.colors[i] = newColors[i];
            gameState.settings.keys[i] = newKeys[i];
        }
        
        // Save gamepad assignments
        gameState.gamepads.assignments = {};
        for (let i = 0; i < numPlayersToSave; i++) {
            const select = document.getElementById(`gamepad-${i}`);
            if (select && select.value !== '') {
                const gamepadIndex = parseInt(select.value);
                gameState.gamepads.assignments[gamepadIndex] = i;
            }
        }

        // Apply local controls to the resumed live round. Network colors
        // stay server-authoritative; keyboard controls remain per-device.
        if(this.previousScreen==='gameScreen' && gameState.players.length){
            this.releaseTouchControls?.();
            for(const player of gameState.players){
                if(this.isOnlineMode && player.id!==this.localPlayerIndex)continue;
                if(newKeys[player.id])player.keys={...newKeys[player.id]};
                if(!this.isOnlineMode && newColors[player.id])player.color=newColors[player.id];
                gameState.inputStates?.set(player.id,{
                    left:createActionState(),right:createActionState(),down:createActionState()
                });
                this.updatePlayerInfo(player);
                this.drawNextPiece(player);
            }
            this.drawBoard();
        }

        // Save to localStorage
        localStorage.setItem('pocket-works:blockies:settings', JSON.stringify(gameState.settings));
        localStorage.setItem('pocket-works:blockies:gamepad-assignments', JSON.stringify(gameState.gamepads.assignments));

        // Show success message
        this.showStyledMessage(t('settingsSaved'), t('settingsSavedMsg'), 'success');

        // Return to previous screen after a short delay
        clearTimeout(this.settingsReturnTimer);
        this.settingsReturnTimer=setTimeout(()=>{
            this.settingsReturnTimer=null;
            if(this.screens.settingsScreen.classList.contains('active'))this.hideSettings();
        },900);
    }

    resetSettings() {
        if(!window.confirm(currentLanguage==='ru'
            ?'Сбросить клавиши, цвета и назначения геймпадов?'
            :'Reset keys, colors and gamepad assignments?'))return;
        this.cancelKeyCapture();
        // Reset to defaults
        gameState.settings.colors = [...DEFAULT_COLORS];
        gameState.settings.keys = JSON.parse(JSON.stringify(DEFAULT_KEYS));
        gameState.gamepads.assignments = {};
        
        // Clear localStorage
        localStorage.removeItem('pocket-works:blockies:settings');
        localStorage.removeItem('pocket-works:blockies:gamepad-assignments');
        
        // Show success message
        this.showStyledMessage(t('settingsReset'), t('settingsResetMsg'), 'success');
        
        // Rebuild immediately: no delayed screen change after the user navigates away.
        this.showSettings();
    }

    hideSettings() {
        this.cancelKeyCapture();
        clearTimeout(this.settingsReturnTimer);
        this.settingsReturnTimer=null;
        const destination=this.previousScreen||'mainMenu';
        this.showScreen(destination);
        if(destination==='gameScreen'){
            if(this.settingsPausedLocalGame && !this.isOnlineMode && !gameState.isGameOver){
                gameState.isPaused=false;
                gameState.lastTime=performance.now();
            }
            if(this.settingsPausedModal && gameState.isPaused)this.showModal('pause');
        }
        this.settingsPausedLocalGame=false;
        this.settingsPausedModal=false;
    }
}

// Initialize the game
function init() {
    // Load language preference
    const savedLanguage = localStorage.getItem('pocket-works:blockies:language');
    if (savedLanguage && TRANSLATIONS[savedLanguage]) {
        currentLanguage = savedLanguage;
        const langSelector = document.getElementById('language-selector');
        if (langSelector) {
            langSelector.value = savedLanguage;
        }
    }
    updateUILanguage();
    
    // Load settings from localStorage
    const savedSettings = localStorage.getItem('pocket-works:blockies:settings');
    if (savedSettings) {
        try {
            const parsed = JSON.parse(savedSettings);
            if (parsed && typeof parsed === 'object') {
                if (Array.isArray(parsed.colors) && parsed.colors.length) {
                    const colors = parsed.colors.slice(0, DEFAULT_COLORS.length);
                    while (colors.length < DEFAULT_COLORS.length) {
                        colors.push(DEFAULT_COLORS[colors.length]);
                    }
                    gameState.settings.colors = colors;
                }

                if (Array.isArray(parsed.keys)) {
                    const actions = ['left', 'right', 'down', 'rotate', 'drop'];
                    const keysArray = parsed.keys.slice(0, DEFAULT_KEYS.length);
                    gameState.settings.keys = keysArray.map((keySet = {}, index) => {
                        const defaults = DEFAULT_KEYS[index] || DEFAULT_KEYS[0];
                        const normalizedSet = {};
                        actions.forEach(action => {
                            const candidate = keySet[action] || defaults[action];
                            normalizedSet[action] = normalizeKeyCode(candidate);
                        });
                        return normalizedSet;
                    });
                }
            }
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    }

    if (!Array.isArray(gameState.settings.keys)) {
        gameState.settings.keys = JSON.parse(JSON.stringify(DEFAULT_KEYS));
    } else {
        const actions = ['left', 'right', 'down', 'rotate', 'drop'];
        gameState.settings.keys = gameState.settings.keys.slice(0, DEFAULT_KEYS.length);
        while (gameState.settings.keys.length < DEFAULT_KEYS.length) {
            const index = gameState.settings.keys.length;
            const defaults = DEFAULT_KEYS[index] || DEFAULT_KEYS[0];
            const filled = {};
            actions.forEach(action => {
                filled[action] = defaults[action];
            });
            gameState.settings.keys.push(filled);
        }
    }
    
    // Load gamepad assignments
    const savedGamepadAssignments = localStorage.getItem('pocket-works:blockies:gamepad-assignments');
    if (savedGamepadAssignments) {
        try {
            gameState.gamepads.assignments = JSON.parse(savedGamepadAssignments);
        } catch (e) {
            console.error('Failed to load gamepad assignments:', e);
        }
    }

    const ui = new UIManager();
    window.uiManager = ui;
    const invite = new URLSearchParams(location.search).get('room');
    if(invite){document.querySelector('#join-code').value=invite;ui.showOnlineLobby(invite);}
}

// Start the game when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

for(const [method,action] of [['move','move'],['rotate','rotate'],['drop','drop'],['hardDrop','hardDrop']]){
 const original=Player.prototype[method];
 Player.prototype[method]=function(...args){if(window.uiManager?.isOnlineMode){networkManager.sendPlayerInput({action,...(method==='move'?{direction:args[0]}:{})});return;}return original.apply(this,args);};
}
function applyNetworkSnapshot(s){
  const ui=window.uiManager;
  if(!s||!ui?.isOnlineMode)return;
  const oldBoard=gameState.board;
  const oldScore=gameState.sharedStats.score||0;
  const oldLines=gameState.sharedStats.lines||0;
  const previousGameOver=gameState.isGameOver;
  const lineDelta=Math.max(0,(s.sharedStats?.lines||0)-oldLines);
  const freshClear=lineDelta>0;
  const detail=freshClear?s.sharedStats?.lastClearDetail:null;
  const newlyLocked=!freshClear?getNewLockedCells(oldBoard,s.board):[];
  gameState.board=s.board;
  // Snapshots repeat the last-clear metadata: only celebrate a new increase in lines.
  gameState.sharedStats={...s.sharedStats,lastClearDetail:detail||null};
  gameState.sharedStatsDirty=(s.sharedStats?.score!==oldScore||freshClear||
    gameState.sharedStats.comboChain!==ui.lastComboChain);
  gameState.isGameOver=s.isGameOver;
  s.players.forEach((data,i)=>{const player=gameState.players[i];if(player){
    const keys=player.keys;Object.assign(player,data,{keys});
    ui.updatePlayerInfo(player);ui.drawNextPiece(player);
  }});
  if(freshClear){
    soundManager.lineClear(lineDelta,detail?.comboChain||1);
    ui.onLinesCleared([],detail||{linesCleared:lineDelta,comboChain:gameState.sharedStats.comboChain});
  }else if(newlyLocked.length>0&&newlyLocked.length<=4){
    // The server owns collisions. Effects only inspect the accepted board snapshot.
    const color=gameState.players[newlyLocked[0].owner-1]?.color||'#a5dbcb';
    ui.boardEffects.landing(newlyLocked,color,{hard:false});
    soundManager.land(false);
  }
  if(!previousGameOver&&s.isGameOver)soundManager.gameOver();
  ui.drawBoard();ui.updateTeamStatsIfNeeded();ui.updateBlockedLanes();
}

document.querySelector('#join-code-btn').onclick=()=>networkManager.joinRoom(document.querySelector('#join-code').value.trim());
document.querySelector('#copy-room-code')?.addEventListener('click',async()=>{
 const code=networkManager.code;
 if(!code)return;
 const link=new URL(location.href);link.searchParams.set('room',networkManager.roomId||code);
 try{await navigator.clipboard.writeText(link.href);document.querySelector('#copy-room-code').textContent='Ссылка скопирована';setTimeout(()=>{const b=document.querySelector('#copy-room-code');if(b)b.textContent='Пригласить';},1800);}
 catch{
    if(navigator.share){
      try{await navigator.share({title:'Blockies',url:link.href});return;}
      catch(error){if(error.name==='AbortError')return;}
    }
    window.uiManager?.showStyledMessage('Ссылка на комнату',link.href,'info');
  }
});
document.addEventListener('visibilitychange',()=>{
  const ui=window.uiManager;
  if(!ui || ui.isOnlineMode)return;
  if(document.hidden && !gameState.isPaused && !gameState.isGameOver &&
    ui.screens.gameScreen.classList.contains('active') && gameState.players.length){
    ui.saveSoloCheckpoint(true);
    gameState.isPaused=true;
    ui.showModal('pause');
  }
});
window.addEventListener('pagehide',()=>window.uiManager?.saveSoloCheckpoint(true));
// Opening the collection must not allow solo/local pieces to fall behind the modal.
window.addEventListener('blockies:awards-visibility',event=>{
    const ui=window.uiManager;
    if(!ui)return;
    if(event.detail?.visible){
        ui.awardsPausedLocal=!ui.isOnlineMode&&!gameState.isPaused&&!gameState.isGameOver&&
            ui.screens.gameScreen.classList.contains('active');
        if(ui.awardsPausedLocal){
            ui.releaseTouchControls?.();
            for(const states of gameState.inputStates.values())for(const state of Object.values(states)){
                state.active=false;state.heldTime=0;state.hasFiredInitial=false;
            }
            ui.saveSoloCheckpoint(true);
            gameState.isPaused=true;
        }
    }else if(ui.awardsPausedLocal){
        ui.awardsPausedLocal=false;
        if(!ui.isOnlineMode&&!gameState.isGameOver&&ui.screens.gameScreen.classList.contains('active')){
            gameState.lastTime=performance.now();gameState.isPaused=false;
        }
    }
});
window.render_game_to_text=()=>JSON.stringify({coordinates:'cells, x right, y down, top-left origin',online:!!window.uiManager?.isOnlineMode,paused:gameState.isPaused,gameOver:gameState.isGameOver,board:gameState.board,score:gameState.sharedStats,players:gameState.players.map(p=>({id:p.id,position:p.position,piece:p.currentPiece,next:p.nextPiece,gameOver:p.gameOver}))});
window.advanceTime=ms=>{if(window.uiManager&&!gameState.isPaused&&!window.uiManager.isOnlineMode){for(let t=0;t<ms;t+=16.667)for(const p of gameState.players)if(!p.gameOver)p.update(Math.min(16.667,ms-t));window.uiManager.drawBoard();}};

