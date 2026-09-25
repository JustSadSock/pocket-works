import Phaser from 'phaser';
import { BroadcastAudio } from './audio';
import { encoreStage, gradeFor, stageById } from './content';
import type { BossKind, InputState, StageDefinition, StageStats } from './types';

export const inputState: InputState = {
  axis: 0,
  jumpQueued: false,
  dashQueued: false,
  specialQueued: false
};

export const audio = new BroadcastAudio();

type PlayMode = 'campaign' | 'archive' | 'encore';

type StartData = {
  stageId: number;
  mode: PlayMode;
  seed?: number;
};

type HudDetail = {
  hp: number;
  maxHp: number;
  signal: number;
  maxSignal: number;
  stage: StageDefinition;
  bossHp?: number;
  bossMaxHp?: number;
};

type DeadAirController = {
  game: Phaser.Game;
  startStage: (stageId: number, mode?: PlayMode, seed?: number) => void;
  pause: () => void;
  resume: () => void;
  restart: () => void;
  quit: () => void;
  destroy: () => void;
};

const WORLD_H = 720;
const GROUND_Y = 652;
const PLAYER_W = 42;
const PLAYER_H = 62;
const MAX_HP = 5;
const MAX_SIGNAL = 3;

const emit = <T>(name: string, detail: T) => window.dispatchEvent(new CustomEvent(name, { detail }));

function seeded(seed: number) {
  let x = seed | 0 || 1;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return ((x >>> 0) % 100000) / 100000;
  };
}

class PlayScene extends Phaser.Scene {
  private stage!: StageDefinition;
  private mode: PlayMode = 'campaign';
  private runSeed = 1;
  private player!: Phaser.Physics.Arcade.Sprite;
  private boss!: Phaser.Physics.Arcade.Sprite;
  private enemies!: Phaser.Physics.Arcade.Group;
  private playerBullets!: Phaser.Physics.Arcade.Group;
  private hostileBullets!: Phaser.Physics.Arcade.Group;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private fx!: Phaser.GameObjects.Graphics;
  private darkness?: Phaser.GameObjects.Rectangle;
  private staticNoise?: Phaser.GameObjects.Graphics;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyA?: Phaser.Input.Keyboard.Key;
  private keyD?: Phaser.Input.Keyboard.Key;
  private keySpace?: Phaser.Input.Keyboard.Key;
  private keyShift?: Phaser.Input.Keyboard.Key;
  private keyE?: Phaser.Input.Keyboard.Key;
  private lastShotAt = 0;
  private lastJumpAt = -9999;
  private lastDashAt = -9999;
  private dashUntil = 0;
  private invulnerableUntil = 0;
  private hp = MAX_HP;
  private signal = 0;
  private bossActive = false;
  private bossStartedAt = 0;
  private bossLastAttack = 0;
  private bossAttackIndex = 0;
  private bossMaxHp = 1;
  private bossPhase = 1;
  private stageStartedAt = 0;
  private damageTaken = 0;
  private parries = 0;
  private shotsFired = 0;
  private shotsHit = 0;
  private score = 0;
  private encounterIndex = 0;
  private encounterWall?: Phaser.Physics.Arcade.Image;
  private encounterActive = false;
  private encounterThresholds: number[] = [];
  private bossLeftWall?: Phaser.Physics.Arcade.Image;
  private bossRightWall?: Phaser.Physics.Arcade.Image;
  private finishLocked = false;
  private previousBossHp = 1;
  private cameraNoise = 0;
  private glitchUntil = 0;

  constructor() {
    super('play');
  }

  init(data: StartData = { stageId: 1, mode: 'campaign' }) {
    this.mode = data.mode || 'campaign';
    this.runSeed = data.seed ?? (data.stageId * 947 + (this.mode === 'encore' ? Date.now() % 100000 : 0));
    this.stage = this.mode === 'encore' ? encoreStage(this.runSeed) : stageById(data.stageId);
    this.hp = MAX_HP;
    this.signal = 0;
    this.bossActive = false;
    this.bossPhase = 1;
    this.bossAttackIndex = 0;
    this.finishLocked = false;
    this.encounterIndex = 0;
    this.encounterActive = false;
    this.damageTaken = 0;
    this.parries = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.score = 0;
    this.lastShotAt = 0;
    this.lastJumpAt = -9999;
    this.lastDashAt = -9999;
    this.dashUntil = 0;
    this.invulnerableUntil = 0;
    this.stageStartedAt = performance.now();
    this.encounterThresholds = Array.from(
      { length: this.stage.encounterCount },
      (_, i) => Math.round((this.stage.runLength * (i + 1)) / (this.stage.encounterCount + 1))
    );
  }

  create() {
    this.makeTextures();
    this.physics.world.setBounds(0, 0, this.stage.runLength + 1800, WORLD_H);
    this.physics.world.gravity.y = this.stage.gravity;
    this.cameras.main.setBackgroundColor(this.stage.palette.sky);
    this.cameras.main.setBounds(0, 0, this.stage.runLength + 1800, WORLD_H);
    this.drawBackdrop();

    this.platforms = this.physics.add.staticGroup();
    this.enemies = this.physics.add.group();
    this.playerBullets = this.physics.add.group({ maxSize: 90 });
    this.hostileBullets = this.physics.add.group({ maxSize: 160 });

    this.buildRun();
    this.createPlayer();
    this.createBoss();
    this.bindPhysics();
    this.bindKeyboard();

    this.cameras.main.startFollow(this.player, true, 0.11, 0.11, -180, 70);
    this.cameras.main.setDeadzone(240, 160);
    this.cameras.main.fadeIn(320, 16, 18, 18);

    this.fx = this.add.graphics().setDepth(60);
    this.createNoiseOverlay();

    emit('dead-air:started', { stage: this.stage, mode: this.mode });
    this.pushHud();
  }

  private bindKeyboard() {
    if (!this.input.keyboard) return;
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyShift = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.keyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
  }

  private makeTextures() {
    const make = (key: string, width: number, height: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
      if (this.textures.exists(key)) return;
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      draw(g);
      g.generateTexture(key, width, height);
      g.destroy();
    };

    const { ink, paper, accent, secondary, hazard, parry } = this.stage.palette;
    make('da-player', 58, 76, (g) => {
      g.fillStyle(ink).fillRoundedRect(6, 6, 46, 64, 8);
      g.fillStyle(paper).fillRect(14, 15, 30, 26);
      g.fillStyle(accent).fillRect(17, 19, 24, 7);
      g.lineStyle(4, paper).strokeLineShape(new Phaser.Geom.Line(16, 54, 4, 68));
      g.strokeLineShape(new Phaser.Geom.Line(42, 54, 54, 68));
      g.fillStyle(secondary).fillCircle(45, 49, 6);
    });
    make('da-platform', 192, 28, (g) => {
      g.fillStyle(ink).fillRect(0, 0, 192, 28);
      g.fillStyle(paper, 0.22).fillRect(0, 0, 192, 6);
      for (let x=12;x<192;x+=26) g.fillStyle(paper, 0.11).fillRect(x, 9, 2, 13);
    });
    make('da-ground', 256, 76, (g) => {
      g.fillStyle(ink).fillRect(0, 0, 256, 76);
      g.fillStyle(accent, 0.85).fillRect(0, 0, 256, 5);
      for (let i=0;i<42;i++) {
        const x=(i*71)%252, y=10+((i*29)%58);
        g.fillStyle(paper, i%3===0?0.14:0.07).fillRect(x,y,4+(i%7),2);
      }
    });
    make('da-enemy-walker', 58, 54, (g) => {
      g.fillStyle(secondary).fillRoundedRect(5, 7, 48, 37, 10);
      g.lineStyle(4, ink).strokeRoundedRect(5, 7, 48, 37, 10);
      g.fillStyle(paper).fillCircle(20, 24, 4).fillCircle(38, 24, 4);
      g.lineStyle(5, ink).strokeLineShape(new Phaser.Geom.Line(16,43,10,53));
      g.strokeLineShape(new Phaser.Geom.Line(42,43,49,53));
    });
    make('da-enemy-flyer', 64, 44, (g) => {
      g.fillStyle(paper).fillEllipse(32, 22, 42, 28);
      g.lineStyle(4, ink).strokeEllipse(32,22,42,28);
      g.fillStyle(accent).fillTriangle(5,22,20,9,20,35);
      g.fillTriangle(59,22,44,9,44,35);
      g.fillStyle(ink).fillCircle(33,22,5);
    });
    make('da-enemy-turret', 62, 58, (g) => {
      g.fillStyle(ink).fillRect(10,16,42,36);
      g.fillStyle(hazard).fillRect(18,6,26,20);
      g.fillStyle(paper).fillRect(25,10,12,7);
      g.fillStyle(secondary).fillRect(0,29,18,8);
    });
    make('da-shot', 18, 8, (g) => {
      g.fillStyle(paper).fillRoundedRect(0,1,18,6,3);
      g.fillStyle(accent).fillRect(12,2,6,4);
    });
    make('da-hostile', 16, 16, (g) => {
      g.fillStyle(hazard).fillCircle(8,8,7);
      g.lineStyle(2, ink).strokeCircle(8,8,7);
    });
    make('da-parry', 20, 20, (g) => {
      g.fillStyle(parry).fillCircle(10,10,9);
      g.lineStyle(3, paper).strokeCircle(10,10,7);
    });
    make('da-boss', 230, 230, (g) => this.drawBossTexture(g, this.stage.bossKind));
  }

  private drawBossTexture(g: Phaser.GameObjects.Graphics, kind: BossKind) {
    const { ink, paper, accent, secondary, hazard } = this.stage.palette;
    const base = () => {
      g.fillStyle(ink).fillEllipse(115,120,176,176);
      g.fillStyle(paper).fillEllipse(115,116,142,132);
      g.lineStyle(8, ink).strokeEllipse(115,116,142,132);
    };
    base();
    switch (kind) {
      case 'weather':
        g.fillStyle(secondary).fillCircle(80,87,38).fillCircle(124,78,45).fillCircle(153,98,36);
        g.fillStyle(hazard).fillTriangle(105,110,83,170,122,145);
        g.fillStyle(ink).fillRect(66,55,94,15);
        break;
      case 'chef':
        g.fillStyle(paper).fillCircle(78,56,35).fillCircle(115,45,42).fillCircle(152,58,34);
        g.fillStyle(accent).fillRect(70,138,90,46);
        g.fillStyle(ink).fillCircle(92,106,8).fillCircle(140,106,8);
        g.lineStyle(6, ink).beginPath().arc(116,128,31,0.15,Math.PI-0.15,false).strokePath();
        break;
      case 'sport':
        g.fillStyle(secondary).fillCircle(115,115,70);
        g.lineStyle(7, paper).strokeCircle(115,115,54);
        g.lineStyle(7, paper).strokeLineShape(new Phaser.Geom.Line(65,115,165,115));
        g.strokeLineShape(new Phaser.Geom.Line(115,65,115,165));
        break;
      case 'puppet':
        g.fillStyle(accent).fillCircle(115,97,55);
        g.fillStyle(paper).fillCircle(94,92,11).fillCircle(136,92,11);
        g.fillStyle(ink).fillCircle(94,92,4).fillCircle(136,92,4);
        g.lineStyle(7, ink).strokeLineShape(new Phaser.Geom.Line(84,141,146,141));
        g.lineStyle(5, secondary).strokeLineShape(new Phaser.Geom.Line(68,40,91,77));
        g.strokeLineShape(new Phaser.Geom.Line(162,40,139,77));
        break;
      case 'noir':
        g.fillStyle(ink).fillTriangle(52,82,178,82,132,30);
        g.fillRect(70,74,95,20);
        g.fillStyle(paper).fillRect(82,101,66,45);
        g.fillStyle(accent).fillRect(84,149,62,8);
        break;
      case 'signal':
        for (let i=0;i<7;i++) g.fillStyle([accent,secondary,hazard,paper][i%4]).fillRect(52+i*18,69,18,93);
        g.fillStyle(ink).fillRect(55,106,120,18);
        g.fillStyle(paper).fillCircle(115,115,20);
        break;
      case 'auction':
        g.fillStyle(accent).fillRect(66,88,98,70);
        g.fillStyle(paper).fillRect(83,64,64,34);
        g.fillStyle(ink).fillRect(92,106,46,12);
        g.fillStyle(hazard).fillRect(132,35,24,84).fillRect(118,35,52,25);
        break;
      case 'western':
        g.fillStyle(secondary).fillTriangle(45,83,185,83,115,36);
        g.fillStyle(ink).fillRect(66,76,98,18);
        g.fillStyle(paper).fillRect(78,96,74,56);
        g.fillStyle(accent).fillRect(83,147,64,12);
        break;
      case 'laboratory':
        g.fillStyle(secondary,0.85).fillCircle(115,112,65);
        g.lineStyle(6, ink).strokeCircle(115,112,65);
        g.fillStyle(paper).fillCircle(92,101,13).fillCircle(140,101,13);
        g.fillStyle(hazard).fillCircle(116,139,19);
        for (let i=0;i<5;i++) g.fillStyle(accent,0.8).fillCircle(55+i*31,55+(i%2)*18,8+i%3);
        break;
      case 'band':
        g.fillStyle(accent).fillCircle(115,112,67);
        g.fillStyle(ink).fillCircle(91,102,12).fillCircle(139,102,12);
        g.fillStyle(paper).fillRect(77,139,76,15);
        g.lineStyle(6, secondary).strokeCircle(115,112,83);
        g.fillStyle(hazard).fillTriangle(92,29,115,65,138,29);
        break;
      case 'court':
        g.fillStyle(paper).fillRect(70,82,90,80);
        g.fillStyle(ink).fillRect(78,96,74,14).fillRect(84,126,62,12);
        g.fillStyle(accent).fillRect(132,35,22,85).fillRect(112,35,62,24);
        break;
      case 'astrology':
        g.fillStyle(secondary).fillCircle(115,115,70);
        g.lineStyle(5, paper).strokeCircle(115,115,50);
        g.lineStyle(3, hazard).strokeCircle(115,115,82);
        for (let i=0;i<8;i++) {
          const a=i*Math.PI/4; g.fillStyle(i%2?accent:paper).fillCircle(115+Math.cos(a)*80,115+Math.sin(a)*80,6);
        }
        break;
      case 'director':
        g.fillStyle(accent).fillRect(55,72,120,88);
        g.fillStyle(ink).fillRect(68,85,94,42);
        g.fillStyle(paper).fillCircle(91,106,11).fillCircle(139,106,11);
        g.fillStyle(secondary).fillRect(75,141,80,10);
        g.lineStyle(6,hazard).strokeCircle(115,115,91);
        break;
    }
  }

  private drawBackdrop() {
    const { paper, ink, accent, secondary, sky } = this.stage.palette;
    this.add.rectangle(0, 0, this.stage.runLength + 1800, WORLD_H, sky).setOrigin(0,0).setDepth(-20);
    const far = this.add.graphics().setDepth(-19);
    const rnd = seeded(this.runSeed + 77);
    for (let i=0;i<44;i++) {
      const x = i * ((this.stage.runLength + 1600) / 43);
      const h = 70 + rnd()*180;
      far.fillStyle(i%3===0?accent:secondary, 0.13 + rnd()*0.08);
      far.fillRect(x, GROUND_Y-h, 70+rnd()*150, h);
      far.fillStyle(paper, 0.08);
      for (let w=0;w<4;w++) far.fillRect(x+12+w*19, GROUND_Y-h+18, 7, 4);
    }
    const mast = this.add.graphics().setDepth(-18);
    for (let x=280;x<this.stage.runLength+1200;x+=680) {
      mast.lineStyle(4, ink, 0.17);
      mast.strokeLineShape(new Phaser.Geom.Line(x,140,x,GROUND_Y));
      mast.strokeCircle(x,140,28);
      mast.lineStyle(2,paper,0.13);
      mast.strokeCircle(x,140,52);
      mast.strokeCircle(x,140,78);
    }
  }

  private createNoiseOverlay() {
    this.staticNoise = this.add.graphics().setScrollFactor(0).setDepth(90);
    this.refreshNoise();
    this.time.addEvent({ delay: 85, loop: true, callback: () => this.refreshNoise() });
  }

  private refreshNoise() {
    if (!this.staticNoise) return;
    this.staticNoise.clear();
    const ink = this.stage.palette.ink;
    for (let i=0;i<55;i++) {
      const y = Math.random()*WORLD_H;
      this.staticNoise.fillStyle(ink, 0.018 + Math.random()*0.025);
      this.staticNoise.fillRect(Math.random()*1280,y,20+Math.random()*150,1);
    }
  }

  private buildRun() {
    const rnd = seeded(this.runSeed + this.stage.id*41);
    const worldWidth = this.stage.runLength + 1800;
    for (let x=0;x<worldWidth;x+=252) {
      const ground = this.physics.add.staticImage(x+126, GROUND_Y+34, 'da-ground');
      ground.setDepth(4);
      this.platforms.add(ground);
    }

    for (let x=620;x<this.stage.runLength-250;x+=320+Math.floor(rnd()*210)) {
      if (rnd() < 0.78) {
        const y = 505 - Math.floor(rnd()*170);
        const platform = this.physics.add.staticImage(x, y, 'da-platform');
        platform.setScale(0.65+rnd()*0.62, 1).refreshBody().setDepth(3);
        this.platforms.add(platform);
      }
    }

    const ambientCount = Math.floor((this.stage.runLength / 520) * this.stage.enemyDensity);
    for (let i=0;i<ambientCount;i++) {
      const x = 900 + rnd()*(this.stage.runLength-1300);
      this.spawnEnemy(x, GROUND_Y-70, i%3===1?'flyer':i%5===0?'turret':'walker');
    }

    const arenaStart = this.stage.runLength + 250;
    for (let x=arenaStart;x<arenaStart+1300;x+=250) {
      const ground = this.physics.add.staticImage(x, GROUND_Y+34, 'da-ground');
      this.platforms.add(ground);
    }
    const arenaPlatformA = this.physics.add.staticImage(arenaStart+360, 490, 'da-platform').setScale(1.05,1).refreshBody();
    const arenaPlatformB = this.physics.add.staticImage(arenaStart+930, 430, 'da-platform').setScale(0.86,1).refreshBody();
    this.platforms.add(arenaPlatformA);
    this.platforms.add(arenaPlatformB);
  }

  private createPlayer() {
    this.player = this.physics.add.sprite(210, GROUND_Y-90, 'da-player');
    this.player.setDepth(20).setCollideWorldBounds(true).setBounce(0);
    (this.player.body as Phaser.Physics.Arcade.Body).setSize(PLAYER_W, PLAYER_H).setOffset(8, 10);
    this.player.setDragX(1250).setMaxVelocity(440, 900);
  }

  private createBoss() {
    const x = this.stage.runLength + 1070;
    this.bossMaxHp = Math.round(this.stage.baseBossHp * (this.mode === 'archive' ? 1.06 : 1));
    this.previousBossHp = this.bossMaxHp;
    this.boss = this.physics.add.sprite(x, GROUND_Y-180, 'da-boss');
    this.boss.setScale(this.stage.bossScale).setDepth(18).setVisible(false).setActive(false);
    (this.boss.body as Phaser.Physics.Arcade.Body).setAllowGravity(false).setImmovable(true).setSize(150,170).setOffset(40,30);
    this.boss.setData('hp', this.bossMaxHp);
  }

  private bindPhysics() {
    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.enemies, this.platforms);
    this.physics.add.overlap(this.playerBullets, this.enemies, (a,b) => this.onPlayerBulletEnemy(a as Phaser.Physics.Arcade.Image, b as Phaser.Physics.Arcade.Sprite));
    this.physics.add.overlap(this.playerBullets, this.boss, (a) => this.onPlayerBulletBoss(a as Phaser.Physics.Arcade.Image));
    this.physics.add.overlap(this.hostileBullets, this.player, (a) => this.onHostileBulletPlayer(a as Phaser.Physics.Arcade.Image));
    this.physics.add.overlap(this.enemies, this.player, () => this.damagePlayer(1, this.player.x < (this.enemies.getFirstAlive()?.x ?? this.player.x) ? -1 : 1));
    this.physics.add.overlap(this.boss, this.player, () => this.damagePlayer(1, this.player.x < this.boss.x ? -1 : 1));
  }

  update(time: number, delta: number) {
    if (!this.player?.active || this.finishLocked) return;
    this.handleInput(time);
    this.updateEnemies(time, delta);
    this.updateBullets(time, delta);
    this.updateEncounters();
    this.checkBossStart();
    if (this.bossActive) this.updateBoss(time, delta);
    this.updateCameraFx(time);
    this.autoFire(time);
    this.pushHud();
  }

  private handleInput(time: number) {
    let axis = inputState.axis;
    if (this.cursors?.left?.isDown || this.keyA?.isDown) axis = -1;
    if (this.cursors?.right?.isDown || this.keyD?.isDown) axis = 1;
    if (Math.abs(axis) < 0.08) axis = 0;

    const speed = this.stage.moveSpeed * (time < this.dashUntil ? 2.15 : 1);
    if (axis !== 0) {
      this.player.setVelocityX(axis * speed);
      this.player.setFlipX(axis < 0);
    } else if (time >= this.dashUntil) {
      this.player.setVelocityX((this.player.body as Phaser.Physics.Arcade.Body).velocity.x * 0.78);
    }

    const grounded = (this.player.body as Phaser.Physics.Arcade.Body).blocked.down || (this.player.body as Phaser.Physics.Arcade.Body).touching.down;
    const jumpPressed = inputState.jumpQueued || (!!this.cursors && Phaser.Input.Keyboard.JustDown(this.cursors.up)) || (!!this.keySpace && Phaser.Input.Keyboard.JustDown(this.keySpace));
    if (jumpPressed) {
      inputState.jumpQueued = false;
      if (grounded) {
        this.player.setVelocityY(-515);
        this.lastJumpAt = time;
        audio.jump();
      } else {
        this.lastJumpAt = time;
      }
    }

    const dashPressed = inputState.dashQueued || (!!this.keyShift && Phaser.Input.Keyboard.JustDown(this.keyShift));
    if (dashPressed) {
      inputState.dashQueued = false;
      if (time - this.lastDashAt > 620) {
        this.lastDashAt = time;
        this.dashUntil = time + 210;
        this.invulnerableUntil = Math.max(this.invulnerableUntil, time + 235);
        const direction = axis || (this.player.flipX ? -1 : 1);
        this.player.setVelocity(direction * 620, Math.min(0, (this.player.body as Phaser.Physics.Arcade.Body).velocity.y));
        this.player.setTint(this.stage.palette.paper);
        this.time.delayedCall(230, () => this.player?.clearTint());
        this.cameras.main.shake(70, 0.0025);
        audio.dash();
      }
    }

    const specialPressed = inputState.specialQueued || (!!this.keyE && Phaser.Input.Keyboard.JustDown(this.keyE));
    if (specialPressed) {
      inputState.specialQueued = false;
      if (this.signal >= 1) this.useSpecial();
    }
  }

  private useSpecial() {
    this.signal = Math.max(0, this.signal - 1);
    audio.special();
    this.cameras.main.flash(170, 245, 216, 170, false);
    this.fx.lineStyle(10, this.stage.palette.parry, 0.85).strokeCircle(this.player.x, this.player.y, 30);
    this.tweens.addCounter({
      from: 30, to: 360, duration: 330,
      onUpdate: (tw) => {
        this.fx.clear();
        this.fx.lineStyle(7, this.stage.palette.parry, 0.62*(1-tw.progress)).strokeCircle(this.player.x,this.player.y,tw.getValue() ?? 30);
      },
      onComplete: () => this.fx.clear()
    });
    for (const child of this.hostileBullets.getChildren()) {
      const bullet = child as Phaser.Physics.Arcade.Image;
      if (!bullet.active) continue;
      if (Phaser.Math.Distance.Between(this.player.x,this.player.y,bullet.x,bullet.y) < 390) bullet.disableBody(true,true);
    }
    for (const child of this.enemies.getChildren()) {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (enemy.active && Phaser.Math.Distance.Between(this.player.x,this.player.y,enemy.x,enemy.y) < 330) this.damageEnemy(enemy, 85);
    }
    if (this.bossActive && Phaser.Math.Distance.Between(this.player.x,this.player.y,this.boss.x,this.boss.y) < 520) this.damageBoss(135);
  }

  private autoFire(time: number) {
    const interval = this.mode === 'encore' ? 250 : 235;
    if (time - this.lastShotAt < interval) return;
    const target = this.findTarget();
    if (!target) return;
    this.lastShotAt = time;
    this.shotsFired++;
    const bullet = this.playerBullets.get(this.player.x + (this.player.flipX?-18:18), this.player.y-6, 'da-shot') as Phaser.Physics.Arcade.Image | null;
    if (!bullet) return;
    bullet.enableBody(true, this.player.x, this.player.y-6, true, true);
    bullet.setDepth(17).setScale(1).setTint(this.stage.palette.paper);
    const bulletBody = bullet.body as Phaser.Physics.Arcade.Body;
    bulletBody.setAllowGravity(false);
    const angle = Phaser.Math.Angle.Between(this.player.x,this.player.y,target.x,target.y);
    this.physics.velocityFromRotation(angle, 780, bulletBody.velocity);
    bullet.setRotation(angle);
    bullet.setData('born', time);
    audio.shot();
  }

  private findTarget(): Phaser.GameObjects.Components.Transform | null {
    let best: Phaser.GameObjects.Components.Transform | null = null;
    let dist = 950;
    if (this.bossActive && this.boss.active) {
      const d = Phaser.Math.Distance.Between(this.player.x,this.player.y,this.boss.x,this.boss.y);
      if (d < dist) { best = this.boss; dist = d; }
    }
    for (const child of this.enemies.getChildren()) {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) continue;
      const d = Phaser.Math.Distance.Between(this.player.x,this.player.y,enemy.x,enemy.y);
      if (d < dist) { best = enemy; dist = d; }
    }
    return best;
  }

  private spawnEnemy(x: number, y: number, kind: 'walker'|'flyer'|'turret') {
    const key = kind === 'flyer' ? 'da-enemy-flyer' : kind === 'turret' ? 'da-enemy-turret' : 'da-enemy-walker';
    const enemy = this.enemies.create(x,y,key) as Phaser.Physics.Arcade.Sprite;
    enemy.setDepth(12).setData('kind',kind).setData('hp',kind==='turret'?70:kind==='flyer'?48:58).setData('nextShot',0).setData('originY',y);
    const enemyBody = enemy.body as Phaser.Physics.Arcade.Body;
    enemyBody.setSize(kind==='flyer'?48:45,kind==='turret'?54:42);
    enemyBody.setAllowGravity(kind!=='flyer');
    if (kind==='turret') enemy.setImmovable(true);
    return enemy;
  }

  private updateEnemies(time: number, delta: number) {
    for (const child of this.enemies.getChildren()) {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) continue;
      const kind = enemy.getData('kind') as string;
      const dx = this.player.x - enemy.x;
      if (kind === 'walker') {
        if (Math.abs(dx) < 580) enemy.setVelocityX(Math.sign(dx)*70*(1+this.stage.id*0.02));
        if (Math.abs(dx) < 250 && time > (enemy.getData('nextShot')||0)) {
          enemy.setData('nextShot',time+1500-Math.min(520,this.stage.id*28));
          this.fireFrom(enemy.x,enemy.y-8,this.player.x,this.player.y,215+this.stage.id*7, this.stage.id>3?0.16:0.08);
        }
      } else if (kind === 'flyer') {
        const oy = Number(enemy.getData('originY'));
        enemy.y = oy + Math.sin((time+enemy.x)*0.003)*45;
        enemy.setVelocityX(Math.abs(dx)<640?Math.sign(dx)*30:0);
        if (Math.abs(dx)<520 && time > (enemy.getData('nextShot')||0)) {
          enemy.setData('nextShot',time+1250-Math.min(400,this.stage.id*22));
          this.fireFrom(enemy.x,enemy.y,this.player.x,this.player.y,245+this.stage.id*7,0.22);
        }
      } else if (kind === 'turret') {
        if (Math.abs(dx)<660 && time > (enemy.getData('nextShot')||0)) {
          enemy.setData('nextShot',time+1050-Math.min(330,this.stage.id*18));
          this.fireFan(enemy.x,enemy.y-10,Math.atan2(this.player.y-enemy.y,this.player.x-enemy.x),3+(this.stage.id>8?2:0),0.24,250+this.stage.id*5,0.18);
        }
      }
      if (enemy.y > WORLD_H+100) enemy.disableBody(true,true);
    }
    void delta;
  }

  private updateBullets(time: number, delta: number) {
    for (const child of this.playerBullets.getChildren()) {
      const bullet = child as Phaser.Physics.Arcade.Image;
      if (bullet.active && time - Number(bullet.getData('born')||time) > 1700) bullet.disableBody(true,true);
    }
    for (const child of this.hostileBullets.getChildren()) {
      const bullet = child as Phaser.Physics.Arcade.Image;
      if (!bullet.active) continue;
      if (bullet.getData('homing')) {
        const angle = Phaser.Math.Angle.Between(bullet.x,bullet.y,this.player.x,this.player.y);
        const desired = new Phaser.Math.Vector2(Math.cos(angle),Math.sin(angle)).scale(Number(bullet.getData('speed')||240));
        (bullet.body as Phaser.Physics.Arcade.Body).velocity.lerp(desired, Math.min(1, delta/1100));
      }
      if (time - Number(bullet.getData('born')||time) > 5200 || bullet.y > WORLD_H+120 || bullet.y < -140) bullet.disableBody(true,true);
    }
  }

  private onPlayerBulletEnemy(bullet: Phaser.Physics.Arcade.Image, enemy: Phaser.Physics.Arcade.Sprite) {
    if (!bullet.active || !enemy.active) return;
    bullet.disableBody(true,true);
    this.shotsHit++;
    this.damageEnemy(enemy, 9);
  }

  private damageEnemy(enemy: Phaser.Physics.Arcade.Sprite, amount: number) {
    const hp = Number(enemy.getData('hp')||1)-amount;
    enemy.setData('hp',hp);
    enemy.setTint(this.stage.palette.paper);
    this.time.delayedCall(55,()=>enemy.active&&enemy.clearTint());
    if (hp<=0) {
      this.score += 190;
      enemy.disableBody(true,true);
      audio.hit();
      this.burst(enemy.x,enemy.y,this.stage.palette.accent,7);
    }
  }

  private onPlayerBulletBoss(bullet: Phaser.Physics.Arcade.Image) {
    if (!bullet.active || !this.bossActive || !this.boss.active) return;
    bullet.disableBody(true,true);
    this.shotsHit++;
    this.damageBoss(8);
  }

  private damageBoss(amount: number) {
    if (!this.bossActive || !this.boss.active) return;
    const hp = Math.max(0, Number(this.boss.getData('hp')||0)-amount);
    this.boss.setData('hp',hp);
    this.score += amount*2;
    this.boss.setTint(this.stage.palette.paper);
    this.time.delayedCall(42,()=>this.boss?.active&&this.boss.clearTint());
    if (this.previousBossHp - hp >= 70) {
      this.previousBossHp = hp;
      audio.hit();
      this.burst(this.boss.x+Phaser.Math.Between(-55,55),this.boss.y+Phaser.Math.Between(-60,60),this.stage.palette.accent,4);
    }
    const ratio = hp/this.bossMaxHp;
    const nextPhase = ratio <= 0.33 ? 3 : ratio <= 0.66 ? 2 : 1;
    if (nextPhase !== this.bossPhase) {
      this.bossPhase = nextPhase;
      this.glitchUntil = this.time.now + 650;
      this.cameras.main.flash(180, 236, 80, 61, false);
      this.cameras.main.shake(220,0.007);
      this.bossAttackIndex += 2;
    }
    if (hp<=0) this.completeStage();
  }

  private onHostileBulletPlayer(bullet: Phaser.Physics.Arcade.Image) {
    if (!bullet.active) return;
    const parry = Boolean(bullet.getData('parry'));
    const now = this.time.now;
    if (parry && (now-this.lastJumpAt<260 || now<this.dashUntil+70)) {
      bullet.disableBody(true,true);
      this.parries++;
      this.score += 420;
      this.signal = Math.min(MAX_SIGNAL, this.signal+1);
      this.player.setVelocityY(-360);
      this.invulnerableUntil = Math.max(this.invulnerableUntil, now+180);
      audio.parry();
      this.cameras.main.flash(80,255,92,200,false);
      this.burst(this.player.x,this.player.y,this.stage.palette.parry,10);
      return;
    }
    const impactDirection = (bullet.body as Phaser.Physics.Arcade.Body).velocity.x > 0 ? 1 : -1;
    bullet.disableBody(true,true);
    this.damagePlayer(1, impactDirection);
  }

  private damagePlayer(amount: number, direction: number) {
    const now = this.time.now;
    if (now < this.invulnerableUntil || now < this.dashUntil) return;
    this.invulnerableUntil = now + 950;
    this.hp = Math.max(0,this.hp-amount);
    this.damageTaken += amount;
    this.player.setVelocity(direction*280,-280);
    this.player.setTint(this.stage.palette.hazard);
    this.time.delayedCall(160,()=>this.player?.clearTint());
    this.cameras.main.shake(160,0.012);
    audio.hurt();
    emit('dead-air:haptic',{type:'hurt'});
    if (this.hp<=0) this.failStage();
  }

  private burst(x: number, y: number, color: number, count: number) {
    const g = this.add.graphics().setDepth(55);
    for (let i=0;i<count;i++) {
      const a=Math.random()*Math.PI*2, d=10+Math.random()*32;
      g.fillStyle(color,0.8).fillRect(x+Math.cos(a)*d,y+Math.sin(a)*d,3+Math.random()*6,2+Math.random()*5);
    }
    this.tweens.add({targets:g,alpha:0,duration:240,onComplete:()=>g.destroy()});
  }

  private updateEncounters() {
    if (this.bossActive) return;
    if (!this.encounterActive && this.encounterIndex < this.encounterThresholds.length && this.player.x >= this.encounterThresholds[this.encounterIndex]) {
      this.startEncounter(this.encounterIndex);
      this.encounterIndex++;
    }
    if (this.encounterActive && this.countEncounterEnemies()===0) {
      this.encounterActive=false;
      this.encounterWall?.destroy();
      this.encounterWall=undefined;
      this.score += 330;
      this.cameras.main.flash(70,235,220,195,false);
    }
  }

  private startEncounter(index: number) {
    this.encounterActive=true;
    const wallX=Math.min(this.stage.runLength-100,this.player.x+520);
    this.encounterWall=this.physics.add.staticImage(wallX,GROUND_Y-130,'da-platform').setScale(0.18,10).refreshBody().setAlpha(0.001);
    this.platforms.add(this.encounterWall);
    const count=4+Math.floor(this.stage.id*0.35)+index;
    for(let i=0;i<count;i++) {
      const side=i%2===0?1:-1;
      const x=Phaser.Math.Clamp(this.player.x+side*(230+((i*91)%330)),90,this.stage.runLength-120);
      const kind=(i+index)%5===0?'turret':(i+index)%3===0?'flyer':'walker';
      this.spawnEnemy(x,kind==='flyer'?390:GROUND_Y-80,kind);
    }
    this.cameras.main.shake(120,0.004);
  }

  private countEncounterEnemies() {
    let count=0;
    for(const child of this.enemies.getChildren()) if((child as Phaser.Physics.Arcade.Sprite).active && Math.abs((child as Phaser.Physics.Arcade.Sprite).x-this.player.x)<900) count++;
    return count;
  }

  private checkBossStart() {
    if (this.bossActive || this.player.x < this.stage.runLength+120) return;
    this.bossActive=true;
    this.bossStartedAt=this.time.now;
    this.boss.setVisible(true).setActive(true);
    this.boss.enableBody(false,this.stage.runLength+1070,GROUND_Y-180,true,true);
    (this.boss.body as Phaser.Physics.Arcade.Body).setAllowGravity(false).setImmovable(true);
    this.boss.setData('hp',this.bossMaxHp);
    const leftX=this.stage.runLength+30;
    const rightX=this.stage.runLength+1430;
    this.bossLeftWall=this.physics.add.staticImage(leftX,GROUND_Y-170,'da-platform').setScale(0.18,12).refreshBody().setAlpha(0.001);
    this.bossRightWall=this.physics.add.staticImage(rightX,GROUND_Y-170,'da-platform').setScale(0.18,12).refreshBody().setAlpha(0.001);
    this.platforms.add(this.bossLeftWall); this.platforms.add(this.bossRightWall);
    this.cameras.main.stopFollow();
    this.cameras.main.pan(this.stage.runLength+730,360,420,'Sine.easeInOut');
    this.cameras.main.setZoom(1.02);
    audio.bossCue();
    this.glitchUntil=this.time.now+800;
    emit('dead-air:boss',{stageId:this.stage.id});
  }

  private updateBoss(time: number, delta: number) {
    const interval=Math.max(560,1250-this.stage.id*26-this.bossPhase*85);
    if(time-this.bossLastAttack>interval){
      this.bossLastAttack=time;
      this.performBossAttack(this.stage.bossKind,this.bossAttackIndex++);
    }
    const baseY=GROUND_Y-182;
    this.boss.y=baseY+Math.sin((time-this.bossStartedAt)*0.0024)*28;
    this.boss.angle=Math.sin(time*0.0018)*3.2;
    if(this.bossPhase>=2) this.boss.x=(this.stage.runLength+1070)+Math.sin(time*0.0011)*90;
    void delta;
  }

  private performBossAttack(kind: BossKind, index: number) {
    const phase=this.bossPhase;
    switch(kind){
      case 'weather':
        index%3===0?this.rainAttack(7+phase*3):index%3===1?this.telegraphBeam(this.player.x,90,0.72):this.gustAttack(phase);
        break;
      case 'chef':
        index%3===0?this.fireFan(this.boss.x-60,this.boss.y,Math.PI,4+phase*2,0.42,290+phase*25,0.25):index%3===1?this.rainAttack(5+phase*2,true):this.groundWave(phase);
        break;
      case 'sport':
        index%3===0?this.bounceBallAttack(3+phase):index%3===1?this.chargeAttack(phase):this.fireFan(this.boss.x,this.boss.y,Math.PI,5+phase*2,0.62,250+phase*35,0.18);
        break;
      case 'puppet':
        index%3===0?this.stringAttack(3+phase):index%3===1?this.spawnBossMinions(2+phase):this.handSweep(phase);
        break;
      case 'noir':
        index%3===0?this.noirBlackout(phase):index%3===1?this.fireAimedBurst(3+phase*2,230+phase*30,0.18):this.telegraphBeam(this.player.x,105,0.85);
        break;
      case 'signal':
        index%3===0?this.scanAttack(phase):index%3===1?this.glitchSpread(phase):this.rainAttack(8+phase*3);
        break;
      case 'auction':
        index%3===0?this.rainAttack(7+phase*2,true):index%3===1?this.groundWave(phase+1):this.fireFan(this.boss.x,this.boss.y,Math.PI,5+phase*2,0.5,270+phase*25,0.22);
        break;
      case 'western':
        index%3===0?this.quickdraw(phase):index%3===1?this.fireFan(this.boss.x,this.boss.y,Math.PI,7+phase*2,0.72,320+phase*35,0.15):this.groundWave(phase);
        break;
      case 'laboratory':
        index%3===0?this.homingAttack(2+phase):index%3===1?this.telegraphBeam(this.player.x,100,0.7):this.spawnBossMinions(1+phase);
        break;
      case 'band':
        index%3===0?this.noteWave(phase):index%3===1?this.spotlightAttack(2+phase):this.fireFan(this.boss.x,this.boss.y,Math.PI,5+phase*2,0.9,250+phase*30,0.25);
        break;
      case 'court':
        index%3===0?this.paperFan(phase):index%3===1?this.groundWave(phase+1):this.telegraphBeam(this.player.x,120,0.82);
        break;
      case 'astrology':
        index%3===0?this.orbitBurst(phase):index%3===1?this.meteorAttack(5+phase*3):this.homingAttack(2+phase);
        break;
      case 'director':
        this.directorAttack(index,phase);
        break;
    }
  }

  private directorAttack(index:number,phase:number){
    const choices=[
      ()=>this.rainAttack(7+phase*3),
      ()=>this.fireFan(this.boss.x,this.boss.y,Math.PI,7+phase*2,0.7,300+phase*30,0.2),
      ()=>this.scanAttack(phase),
      ()=>this.homingAttack(2+phase),
      ()=>this.groundWave(phase+1),
      ()=>this.stringAttack(2+phase),
      ()=>this.quickdraw(phase),
      ()=>this.orbitBurst(phase)
    ];
    choices[index%choices.length]();
    if(phase===3 && index%2===0) choices[(index+3)%choices.length]();
  }

  private fireFrom(x:number,y:number,tx:number,ty:number,speed:number,parryChance=0.16,homing=false){
    const parry=Math.random()<parryChance;
    const bullet=this.hostileBullets.get(x,y,parry?'da-parry':'da-hostile') as Phaser.Physics.Arcade.Image|null;
    if(!bullet) return;
    bullet.enableBody(true,x,y,true,true);
    const bulletBody = bullet.body as Phaser.Physics.Arcade.Body;
    bulletBody.setAllowGravity(false);
    bullet.setDepth(16).setScale(1);
    const angle=Phaser.Math.Angle.Between(x,y,tx,ty);
    this.physics.velocityFromRotation(angle,speed,bulletBody.velocity);
    bullet.setData('born',this.time.now).setData('parry',parry).setData('homing',homing).setData('speed',speed);
  }

  private fireFan(x:number,y:number,angle:number,count:number,spread:number,speed:number,parryChance=0.18){
    for(let i=0;i<count;i++){
      const t=count===1?0.5:i/(count-1);
      const a=angle-spread/2+spread*t;
      const tx=x+Math.cos(a)*500, ty=y+Math.sin(a)*500;
      this.fireFrom(x,y,tx,ty,speed,parryChance);
    }
  }

  private fireAimedBurst(count:number,speed:number,parryChance:number){
    for(let i=0;i<count;i++) this.time.delayedCall(i*115,()=>this.fireFrom(this.boss.x-50,this.boss.y,this.player.x,this.player.y,speed,parryChance));
  }

  private rainAttack(count:number,heavy=false){
    const left=this.stage.runLength+120, width=1280;
    for(let i=0;i<count;i++) this.time.delayedCall(i*70,()=>{
      const x=left+Math.random()*width;
      const bullet=this.hostileBullets.get(x,-30,Math.random()<0.17?'da-parry':'da-hostile') as Phaser.Physics.Arcade.Image|null;
      if(!bullet) return;
      bullet.enableBody(true,x,-20,true,true);
      (bullet.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
      bullet.setVelocity(heavy?Phaser.Math.Between(-70,70):0,heavy?440:360+this.bossPhase*30);
      bullet.setData('born',this.time.now).setData('parry',bullet.texture.key==='da-parry');
      if(heavy) bullet.setScale(1.3);
    });
  }

  private telegraphBeam(x:number,width:number,alpha:number){
    const arenaMin=this.stage.runLength+70, arenaMax=this.stage.runLength+1420;
    const target=Phaser.Math.Clamp(x,arenaMin+width/2,arenaMax-width/2);
    const warning=this.add.rectangle(target,GROUND_Y/2,width,GROUND_Y,this.stage.palette.parry,0.18).setDepth(14);
    this.tweens.add({targets:warning,alpha:0.5,duration:420,yoyo:true,repeat:1,onComplete:()=>{
      warning.setFillStyle(this.stage.palette.hazard,alpha).setAlpha(alpha);
      if(Math.abs(this.player.x-target)<width*0.52 && this.player.y>100) this.damagePlayer(1,this.player.x<target?-1:1);
      this.cameras.main.shake(130,0.005);
      this.time.delayedCall(140,()=>warning.destroy());
    }});
  }

  private gustAttack(phase:number){
    const dir=this.player.x<this.boss.x?-1:1;
    const overlay=this.add.rectangle(640,360,1280,720,this.stage.palette.secondary,0.05).setScrollFactor(0).setDepth(45);
    this.tweens.add({targets:overlay,alpha:0.16,duration:160,yoyo:true,repeat:4,onComplete:()=>overlay.destroy()});
    const timer=this.time.addEvent({delay:40,repeat:18+phase*5,callback:()=>{
      if(this.player.active) this.player.setVelocityX((this.player.body as Phaser.Physics.Arcade.Body).velocity.x+dir*(18+phase*5));
    }});
    void timer;
  }

  private groundWave(phase:number){
    const dir=this.player.x<this.boss.x?-1:1;
    for(let i=0;i<2+phase;i++) this.time.delayedCall(i*240,()=>{
      const x=this.boss.x-dir*70;
      const bullet=this.hostileBullets.get(x,GROUND_Y-25,i===phase?'da-parry':'da-hostile') as Phaser.Physics.Arcade.Image|null;
      if(!bullet) return;
      bullet.enableBody(true,x,GROUND_Y-25,true,true);
      (bullet.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
      bullet.setScale(1.5,0.7).setVelocityX(dir*(360+phase*35));
      bullet.setData('born',this.time.now).setData('parry',i===phase);
    });
  }

  private bounceBallAttack(count:number){
    for(let i=0;i<count;i++){
      const bullet=this.hostileBullets.get(this.boss.x-80,this.boss.y-20,i===count-1?'da-parry':'da-hostile') as Phaser.Physics.Arcade.Image|null;
      if(!bullet) continue;
      bullet.enableBody(true,this.boss.x-80,this.boss.y-20,true,true);
      (bullet.body as Phaser.Physics.Arcade.Body).setAllowGravity(true);
      bullet.setBounce(0.86).setCollideWorldBounds(true).setVelocity(-260-i*18,-330-i*25).setScale(1.25);
      bullet.setData('born',this.time.now).setData('parry',i===count-1);
    }
  }

  private chargeAttack(phase:number){
    const start=this.boss.x, target=this.player.x>this.boss.x?this.stage.runLength+180:this.stage.runLength+1320;
    this.boss.setTint(this.stage.palette.hazard);
    this.time.delayedCall(260,()=>{
      this.tweens.add({targets:this.boss,x:target,duration:360-phase*35,ease:'Quad.easeIn',yoyo:true,hold:120,onComplete:()=>{this.boss.clearTint();this.boss.x=start;}});
    });
  }

  private stringAttack(count:number){
    const min=this.stage.runLength+140, max=this.stage.runLength+1370;
    for(let i=0;i<count;i++) this.time.delayedCall(i*190,()=>this.telegraphBeam(Phaser.Math.Between(min,max),54,0.8));
  }

  private spawnBossMinions(count:number){
    for(let i=0;i<count;i++){
      const x=this.stage.runLength+240+i*210;
      this.spawnEnemy(x, i%2?390:GROUND_Y-80, i%2?'flyer':'walker');
    }
  }

  private handSweep(phase:number){
    const y=GROUND_Y-55-(phase%2)*150;
    const dir=this.player.x<this.boss.x?-1:1;
    for(let i=0;i<4+phase;i++) this.time.delayedCall(i*85,()=>{
      const x=this.boss.x-dir*60;
      const bullet=this.hostileBullets.get(x,y,i===2?'da-parry':'da-hostile') as Phaser.Physics.Arcade.Image|null;
      if(!bullet) return;
      bullet.enableBody(true,x,y,true,true); (bullet.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
      bullet.setVelocityX(dir*(430+phase*30)).setScale(1.25,1.8);
      bullet.setData('born',this.time.now).setData('parry',i===2);
    });
  }

  private noirBlackout(phase:number){
    if(this.darkness) this.darkness.destroy();
    this.darkness=this.add.rectangle(640,360,1280,720,0x030405,0).setScrollFactor(0).setDepth(42);
    this.tweens.add({targets:this.darkness,alpha:0.72+phase*0.05,duration:280,yoyo:true,hold:900+phase*180,onComplete:()=>{this.darkness?.destroy();this.darkness=undefined;}});
    this.fireAimedBurst(2+phase*2,260+phase*30,0.32);
  }

  private scanAttack(phase:number){
    const ys=[170,330,500,610].slice(0,2+phase);
    ys.forEach((y,i)=>this.time.delayedCall(i*180,()=>{
      const warning=this.add.rectangle(this.stage.runLength+720,y,1420,34,this.stage.palette.parry,0.18).setDepth(14);
      this.tweens.add({targets:warning,alpha:0.55,duration:300,yoyo:true,repeat:1,onComplete:()=>{
        warning.setFillStyle(this.stage.palette.hazard,0.8).setAlpha(0.8);
        if(Math.abs(this.player.y-y)<46) this.damagePlayer(1,this.player.x<this.boss.x?-1:1);
        this.time.delayedCall(110,()=>warning.destroy());
      }});
    }));
  }

  private glitchSpread(phase:number){
    this.glitchUntil=this.time.now+520;
    for(let r=0;r<2+phase;r++) this.time.delayedCall(r*160,()=>this.fireFan(this.boss.x,this.boss.y,Math.PI,5+phase*2,1.4,250+phase*20,0.3));
  }

  private quickdraw(phase:number){
    const line=this.add.rectangle((this.player.x+this.boss.x)/2,this.player.y,Math.abs(this.player.x-this.boss.x),6,this.stage.palette.parry,0.28).setDepth(13);
    this.time.delayedCall(360-Math.min(120,phase*35),()=>{
      line.setFillStyle(this.stage.palette.hazard,0.95).setAlpha(1);
      if(Math.abs(this.player.y-line.y)<28) this.damagePlayer(1,this.player.x<this.boss.x?-1:1);
      this.time.delayedCall(90,()=>line.destroy());
    });
  }

  private homingAttack(count:number){
    for(let i=0;i<count;i++) this.time.delayedCall(i*190,()=>this.fireFrom(this.boss.x-60,this.boss.y-30,this.player.x,this.player.y,190+this.bossPhase*20,0.24,true));
  }

  private noteWave(phase:number){
    for(let i=0;i<6+phase*2;i++) this.time.delayedCall(i*105,()=>{
      const y=180+((i*97)%390);
      const bullet=this.hostileBullets.get(this.boss.x-70,y,i%5===0?'da-parry':'da-hostile') as Phaser.Physics.Arcade.Image|null;
      if(!bullet) return;
      bullet.enableBody(true,this.boss.x-70,y,true,true); (bullet.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
      bullet.setVelocity(-300-phase*30,Math.sin(i)*85).setData('born',this.time.now).setData('parry',i%5===0);
    });
  }

  private spotlightAttack(count:number){
    for(let i=0;i<count;i++) this.time.delayedCall(i*270,()=>this.telegraphBeam(this.stage.runLength+180+Math.random()*1160,120,0.78));
  }

  private paperFan(phase:number){
    this.fireFan(this.boss.x-40,this.boss.y-20,Math.PI,9+phase*3,1.1,245+phase*25,0.2);
  }

  private orbitBurst(phase:number){
    const count=8+phase*4;
    for(let i=0;i<count;i++){
      const a=(i/count)*Math.PI*2;
      this.fireFrom(this.boss.x,this.boss.y,this.boss.x+Math.cos(a)*400,this.boss.y+Math.sin(a)*400,220+phase*35,i%6===0?1:0);
    }
  }

  private meteorAttack(count:number){ this.rainAttack(count,true); }

  private updateCameraFx(time:number){
    if(time<this.glitchUntil){
      this.cameraNoise=Math.sin(time*0.13)*5;
      this.cameras.main.setRotation(Math.sin(time*0.07)*0.0028);
      this.cameras.main.setScroll(this.cameras.main.scrollX+this.cameraNoise*0.12,this.cameras.main.scrollY);
    } else {
      this.cameras.main.setRotation(0);
    }
  }

  private pushHud(){
    const bossHp=this.bossActive?Number(this.boss.getData('hp')||0):undefined;
    emit<HudDetail>('dead-air:hud',{hp:this.hp,maxHp:MAX_HP,signal:this.signal,maxSignal:MAX_SIGNAL,stage:this.stage,bossHp,bossMaxHp:this.bossActive?this.bossMaxHp:undefined});
  }

  private failStage(){
    if(this.finishLocked) return;
    this.finishLocked=true;
    this.player.setVelocity(0,0).setTint(this.stage.palette.hazard);
    this.physics.pause();
    this.cameras.main.fadeOut(620,16,18,18);
    audio.hurt();
    emit('dead-air:death',{stageId:this.stage.id,mode:this.mode});
    this.time.delayedCall(760,()=>{
      this.scene.restart({stageId:this.stage.id,mode:this.mode,seed:this.runSeed});
    });
  }

  private completeStage(){
    if(this.finishLocked) return;
    this.finishLocked=true;
    this.boss.setVelocity(0,0);
    this.physics.pause();
    const elapsedMs=Math.max(1,Math.round(performance.now()-this.stageStartedAt));
    const accuracy=this.shotsFired?this.shotsHit/this.shotsFired:0;
    this.score+=Math.round(2400+this.parries*370+accuracy*1200+Math.max(0,1800-elapsedMs/90)-this.damageTaken*240);
    const grade=gradeFor(this.score,this.damageTaken,elapsedMs,this.stage.id);
    const stats:StageStats={
      stageId:this.stage.id,mode:this.mode,startedAt:Date.now()-elapsedMs,elapsedMs,
      damageTaken:this.damageTaken,parries:this.parries,deaths:0,shotsHit:this.shotsHit,shotsFired:this.shotsFired,
      score:Math.max(0,Math.round(this.score)),grade
    };
    this.boss.setTint(this.stage.palette.paper);
    this.tweens.add({targets:this.boss,alpha:0,angle:22,scale:0.72,duration:620,ease:'Quad.easeIn'});
    this.cameras.main.flash(260,240,225,194,false);
    audio.win();
    emit('dead-air:complete',stats);
  }
}

export function createDeadAirGame(parent: string): DeadAirController {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 1280,
    height: 720,
    backgroundColor: '#161718',
    transparent: false,
    physics: {
      default: 'arcade',
      arcade: { gravity: { x: 0, y: 1180 }, debug: false }
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 1280,
      height: 720
    },
    render: {
      antialias: true,
      pixelArt: false,
      roundPixels: false,
      powerPreference: 'high-performance'
    },
    scene: [PlayScene],
    audio: { noAudio: true },
    input: { activePointers: 4 }
  });

  let lastStart: StartData = { stageId:1, mode:'campaign' };
  const startStage = (stageId:number,mode:PlayMode='campaign',seed?:number) => {
    lastStart={stageId,mode,seed};
    const scene=game.scene.getScene('play');
    if(scene?.scene.isActive() || scene?.scene.isPaused()) scene.scene.start('play',lastStart);
    else game.scene.start('play',lastStart);
  };

  return {
    game,
    startStage,
    pause:()=>game.scene.pause('play'),
    resume:()=>game.scene.resume('play'),
    restart:()=>game.scene.start('play',lastStart),
    quit:()=>game.scene.stop('play'),
    destroy:()=>game.destroy(true)
  };
}
