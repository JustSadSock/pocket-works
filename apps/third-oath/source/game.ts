import Phaser from 'phaser';
import { audio } from './audio';
import { DIALOGUES, RITUAL_LINES, ZONES, type DialogueNode } from './content';
import {
  addItem,
  hasItem,
  persistSave,
  removeItem,
  resolveHiddenCheck,
  type GameMode,
  type SaveState
} from './state';

export const inputState = {
  moveX: 0,
  moveY: 0,
  attackPressed: false,
  attackHeld: false,
  guardHeld: false,
  guardPressedAt: 0,
  abilityPressed: false,
  interactPressed: false
};

export interface DialogueView {
  speaker: string;
  text: string;
  options: Array<{ id: string; label: string }>;
}

export interface GameCallbacks {
  onHud: (health: number, maxHealth: number, resolve: number, combat: boolean) => void;
  onPrompt: (label: string | null) => void;
  onDialogue: (view: DialogueView | null) => void;
  onZone: (name: string, kicker: string) => void;
  onToast: (text: string) => void;
  onRitual: (text: string | null) => void;
  onMode: (mode: GameMode) => void;
  onDeath: () => void;
  onComplete: () => void;
  onSave: (save: SaveState) => void;
}

interface Interactable {
  id: string;
  x: number;
  y: number;
  radius: number;
  label: string;
  active?: () => boolean;
  action: () => void;
}

interface EnemyState {
  body: Phaser.Physics.Arcade.Image;
  visual: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Arc;
  health: number;
  cooldown: number;
  windup: number;
  stun: number;
  dead: boolean;
}

type SceneContext = { save: SaveState; callbacks: GameCallbacks };

const WORLD = { left: 80, top: 70, width: 740, height: 2240 };

function noise01(x: number, y: number, seed = 17) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 33.71) * 43758.5453;
  return n - Math.floor(n);
}

function angleDelta(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

class OathScene extends Phaser.Scene {
  private ctx: SceneContext;
  private save: SaveState;
  private callbacks: GameCallbacks;
  private mode: GameMode = 'explore';
  private modeBeforePause: GameMode = 'explore';
  private player!: Phaser.Physics.Arcade.Image;
  private knight!: Phaser.GameObjects.Container;
  private knightHammer!: Phaser.GameObjects.Container;
  private knightShield!: Phaser.GameObjects.Container;
  private knightCloak!: Phaser.GameObjects.Graphics;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private interactables: Interactable[] = [];
  private activeInteractable: Interactable | null = null;
  private currentDialogue: DialogueNode | null = null;
  private enemy: EnemyState | null = null;
  private secretDoorBlocker: Phaser.Physics.Arcade.StaticImage | null = null;
  private cryptDoorBlocker: Phaser.Physics.Arcade.StaticImage | null = null;
  private towerDoorBlocker: Phaser.Physics.Arcade.StaticImage | null = null;
  private facing = -Math.PI / 2;
  private walkPhase = 0;
  private stepClock = 0;
  private attackCooldown = 0;
  private attackAnim = 0;
  private hurtCooldown = 0;
  private zoneId = '';
  private runtimeSeconds = 0;
  private qaClock = 0;
  private ritualRunning = false;
  private pedestalOathGlow: Phaser.GameObjects.Image | null = null;
  private pedestalTearGlow: Phaser.GameObjects.Image | null = null;
  private ritualCenterGlow: Phaser.GameObjects.Image | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor(ctx: SceneContext) {
    super({ key: 'ThirdOathScene' });
    this.ctx = ctx;
    this.save = ctx.save;
    this.callbacks = ctx.callbacks;
  }

  create() {
    this.cameras.main.setBackgroundColor('#0c0b0a');
    this.cameras.main.setBounds(WORLD.left, WORLD.top, WORLD.width, WORLD.height);
    this.physics.world.setBounds(WORLD.left, WORLD.top, WORLD.width, WORLD.height);
    this.makeTextures();
    this.drawWorld();
    this.buildCollision();
    this.createPlayer();
    this.createAtmosphere();
    this.registerInteractables();
    this.restoreStoryVisuals();

    this.keys = this.input.keyboard?.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,E,Q,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    this.cameras.main.startFollow(this.player, true, 0.09, 0.09);
    this.cameras.main.setZoom(1);
    this.cameras.main.fadeIn(650, 12, 11, 10);

    this.setMode('explore');
    this.updateZone(true);
    this.syncHud();
    this.publishQA();
  }

  private setMode(next: GameMode) {
    this.mode = next;
    this.callbacks.onMode(next);
    this.callbacks.onPrompt(null);
    if (next !== 'dialogue') this.callbacks.onDialogue(null);
  }

  private makeTextures() {
    const marker = this.textures.createCanvas('third-oath-marker', 32, 32);
    marker?.refresh();

    const glow = this.textures.createCanvas('third-oath-glow', 256, 256);
    if (glow) {
      const c = glow.context;
      const gradient = c.createRadialGradient(128, 128, 0, 128, 128, 128);
      gradient.addColorStop(0, 'rgba(255,215,145,.86)');
      gradient.addColorStop(.15, 'rgba(228,169,86,.48)');
      gradient.addColorStop(.5, 'rgba(154,96,43,.14)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gradient;
      c.fillRect(0, 0, 256, 256);
      glow.refresh();
    }

    const blue = this.textures.createCanvas('third-oath-blue-glow', 256, 256);
    if (blue) {
      const c = blue.context;
      const gradient = c.createRadialGradient(128, 128, 0, 128, 128, 128);
      gradient.addColorStop(0, 'rgba(192,236,244,.9)');
      gradient.addColorStop(.16, 'rgba(92,167,190,.48)');
      gradient.addColorStop(.52, 'rgba(27,77,95,.12)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gradient;
      c.fillRect(0, 0, 256, 256);
      blue.refresh();
    }

    const fog = this.textures.createCanvas('third-oath-fog', 320, 180);
    if (fog) {
      const c = fog.context;
      const gradient = c.createRadialGradient(160, 90, 8, 160, 90, 155);
      gradient.addColorStop(0, 'rgba(180,184,174,.12)');
      gradient.addColorStop(.55, 'rgba(115,120,116,.05)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gradient;
      c.fillRect(0, 0, 320, 180);
      fog.refresh();
    }

    const dust = this.textures.createCanvas('third-oath-dust', 8, 8);
    if (dust) {
      const c = dust.context;
      const g = c.createRadialGradient(4, 4, 0, 4, 4, 4);
      g.addColorStop(0, 'rgba(235,221,188,.8)');
      g.addColorStop(1, 'rgba(235,221,188,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 8, 8);
      dust.refresh();
    }
  }

  private drawWorld() {
    const g = this.add.graphics().setDepth(0);
    this.drawRoom(g, 120, 1700, 660, 520, 1);
    this.drawRoom(g, 400, 1440, 100, 260, 3);
    this.drawRoom(g, 180, 1010, 540, 430, 7);
    this.drawRoom(g, 400, 850, 100, 160, 11);
    this.drawRoom(g, 130, 330, 640, 520, 13);
    this.drawRoom(g, 380, 80, 140, 250, 19);

    this.drawWallVisual(g, 105, 1684, 690, 24);
    this.drawWallVisual(g, 105, 2208, 690, 28);
    this.drawWallVisual(g, 104, 1685, 24, 550);
    this.drawWallVisual(g, 772, 1685, 24, 550);
    this.drawWallVisual(g, 105, 1684, 305, 28);
    this.drawWallVisual(g, 500, 1684, 295, 28);

    this.drawWallVisual(g, 384, 1424, 32, 278);
    this.drawWallVisual(g, 484, 1424, 32, 278);

    this.drawWallVisual(g, 164, 994, 572, 28);
    this.drawWallVisual(g, 164, 1432, 236, 28);
    this.drawWallVisual(g, 500, 1432, 236, 28);
    this.drawWallVisual(g, 164, 994, 24, 466);
    this.drawWallVisual(g, 712, 994, 24, 466);
    this.drawWallVisual(g, 164, 994, 236, 28);
    this.drawWallVisual(g, 500, 994, 236, 28);

    this.drawWallVisual(g, 384, 834, 32, 178);
    this.drawWallVisual(g, 484, 834, 32, 178);

    this.drawWallVisual(g, 114, 314, 672, 28);
    this.drawWallVisual(g, 114, 842, 286, 28);
    this.drawWallVisual(g, 500, 842, 286, 28);
    this.drawWallVisual(g, 114, 314, 24, 556);
    this.drawWallVisual(g, 762, 314, 24, 556);
    this.drawWallVisual(g, 114, 314, 266, 28);
    this.drawWallVisual(g, 520, 314, 266, 28);

    this.drawWallVisual(g, 364, 64, 172, 28);
    this.drawWallVisual(g, 364, 318, 172, 28);
    this.drawWallVisual(g, 364, 64, 24, 282);
    this.drawWallVisual(g, 512, 64, 24, 282);

    this.drawChapelProps(g);
    this.drawCryptProps(g);
    this.drawHallProps(g);
    this.drawCracks(g);
  }

  private drawRoom(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, seed: number) {
    g.fillStyle(0x1a1916, 1);
    g.fillRect(x, y, w, h);
    const tileW = 52;
    const tileH = 38;
    const palette = [0x23211d, 0x27251f, 0x201f1b, 0x2a2721, 0x1e1d1a];
    for (let row = 0; row < Math.ceil(h / tileH); row += 1) {
      const yy = y + row * tileH;
      const offset = row % 2 ? -tileW / 2 : 0;
      for (let col = -1; col < Math.ceil(w / tileW) + 1; col += 1) {
        const xx = x + col * tileW + offset;
        const n = noise01(col + seed, row, seed);
        const color = palette[Math.floor(n * palette.length) % palette.length];
        g.fillStyle(color, 1);
        g.fillRect(xx + 1, yy + 1, tileW - 2, tileH - 2);
        g.lineStyle(1, 0x0d0d0c, 0.55);
        g.strokeRect(xx + 1, yy + 1, tileW - 2, tileH - 2);
        if (n > .84) {
          g.lineStyle(1, 0x48443a, .25);
          g.beginPath();
          g.moveTo(xx + tileW * .25, yy + 4);
          g.lineTo(xx + tileW * .48, yy + tileH * .46);
          g.lineTo(xx + tileW * .4, yy + tileH - 5);
          g.strokePath();
        }
      }
    }
  }

  private drawWallVisual(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number) {
    g.fillStyle(0x090908, .72);
    g.fillRect(x + 5, y + 8, w, h);
    g.fillStyle(0x343128, 1);
    g.fillRect(x, y, w, h);
    const horizontal = w >= h;
    const major = horizontal ? w : h;
    const minor = horizontal ? h : w;
    const brick = 34;
    for (let p = 0; p < major; p += brick) {
      const n = noise01(x + p, y, 23);
      g.fillStyle(n > .58 ? 0x423d31 : 0x39352c, .55);
      if (horizontal) g.fillRect(x + p + 2, y + 2, Math.min(brick - 3, w - p - 2), minor - 4);
      else g.fillRect(x + 2, y + p + 2, minor - 4, Math.min(brick - 3, h - p - 2));
    }
    g.lineStyle(1, 0x77705b, .26);
    g.strokeRect(x, y, w, h);
  }

  private drawChapelProps(g: Phaser.GameObjects.Graphics) {
    g.fillStyle(0x12100e, .8);
    g.fillEllipse(450, 1946, 188, 78);
    g.fillStyle(0x454036, 1);
    g.fillRect(376, 1905, 148, 54);
    g.fillStyle(0x635a49, .48);
    g.fillRect(384, 1910, 132, 8);
    g.lineStyle(2, 0x85785d, .34);
    g.strokeRect(376, 1905, 148, 54);

    for (let row = 0; row < 4; row += 1) {
      const yy = 2028 + row * 43;
      for (const xx of [270, 570]) {
        g.fillStyle(0x0c0b09, .5);
        g.fillRect(xx - 78 + 5, yy + 8, 156, 22);
        g.fillStyle(0x34281d, 1);
        g.fillRect(xx - 78, yy, 156, 20);
        g.fillStyle(0x56412b, .45);
        g.fillRect(xx - 72, yy + 3, 144, 4);
        g.lineStyle(1, 0x130f0b, .8);
        g.strokeRect(xx - 78, yy, 156, 20);
      }
    }

    g.fillStyle(0x3c3932, 1);
    g.fillCircle(245, 1812, 25);
    g.fillCircle(655, 1812, 25);
    g.lineStyle(4, 0x1a1916, .9);
    g.strokeCircle(245, 1812, 16);
    g.strokeCircle(655, 1812, 16);
  }

  private drawCryptProps(g: Phaser.GameObjects.Graphics) {
    for (const [x, y] of [[305, 1180], [595, 1288], [310, 1350]] as Array<[number, number]>) {
      g.fillStyle(0x0d0d0b, .7);
      g.fillRoundedRect(x - 66 + 8, y - 29 + 9, 132, 58, 8);
      g.fillStyle(0x37362f, 1);
      g.fillRoundedRect(x - 66, y - 29, 132, 58, 8);
      g.lineStyle(2, 0x777064, .28);
      g.strokeRoundedRect(x - 60, y - 23, 120, 46, 6);
      g.lineStyle(1, 0x151513, .9);
      g.beginPath();
      g.moveTo(x - 36, y);
      g.lineTo(x + 36, y);
      g.strokePath();
    }
    g.fillStyle(0x5a4c3a, .22);
    g.fillEllipse(470, 1112, 46, 16);
    g.fillEllipse(486, 1091, 41, 15);
  }

  private drawHallProps(g: Phaser.GameObjects.Graphics) {
    const pedestals = [[300, 560], [450, 530], [600, 560]] as Array<[number, number]>;
    for (const [x, y] of pedestals) {
      g.fillStyle(0x0b0b0a, .7);
      g.fillEllipse(x + 6, y + 22, 82, 34);
      g.fillStyle(0x403d35, 1);
      g.fillCircle(x, y, 42);
      g.lineStyle(3, 0x716a57, .35);
      g.strokeCircle(x, y, 34);
      g.fillStyle(0x151512, 1);
      g.fillCircle(x, y, 14);
    }
    g.lineStyle(2, 0x37424a, .25);
    g.beginPath();
    g.moveTo(300, 560);
    g.lineTo(450, 690);
    g.lineTo(600, 560);
    g.moveTo(450, 530);
    g.lineTo(450, 690);
    g.strokePath();
    g.fillStyle(0x11110f, 1);
    g.fillCircle(450, 690, 36);
    g.lineStyle(2, 0x665f50, .25);
    g.strokeCircle(450, 690, 31);
  }

  private drawCracks(g: Phaser.GameObjects.Graphics) {
    const cracks = [
      [196, 1860, 280, 1822, 305, 1840],
      [682, 2130, 625, 2085, 602, 2050],
      [232, 1100, 284, 1076, 328, 1092],
      [680, 720, 638, 688, 650, 645],
      [226, 444, 268, 475, 248, 512]
    ];
    g.lineStyle(1, 0x090909, .88);
    for (const [x1, y1, x2, y2, x3, y3] of cracks) {
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.lineTo(x3, y3);
      g.strokePath();
    }
  }

  private buildCollision() {
    this.walls = this.physics.add.staticGroup();
    const wall = (x: number, y: number, w: number, h: number) => {
      const body = this.walls.create(x + w / 2, y + h / 2, 'third-oath-marker') as Phaser.Physics.Arcade.StaticImage;
      body.setVisible(false).setDisplaySize(w, h).refreshBody();
      return body;
    };

    wall(105, 2208, 690, 28); wall(104, 1685, 24, 550); wall(772, 1685, 24, 550);
    wall(105, 1684, 305, 28); wall(500, 1684, 295, 28);
    wall(384, 1424, 32, 278); wall(484, 1424, 32, 278);
    wall(164, 1432, 236, 28); wall(500, 1432, 236, 28); wall(164, 994, 24, 466); wall(712, 994, 24, 466);
    wall(164, 994, 236, 28); wall(500, 994, 236, 28);
    wall(384, 834, 32, 178); wall(484, 834, 32, 178);
    wall(114, 842, 286, 28); wall(500, 842, 286, 28); wall(114, 314, 24, 556); wall(762, 314, 24, 556);
    wall(114, 314, 266, 28); wall(520, 314, 266, 28);
    wall(364, 64, 172, 28); wall(364, 64, 24, 282); wall(512, 64, 24, 282);

    if (!this.save.flags.secretDoorOpen) this.secretDoorBlocker = wall(400, 1678, 100, 34);
    if (!this.save.flags.cryptWardenDefeated) this.cryptDoorBlocker = wall(400, 988, 100, 36);
    if (!this.save.flags.hallAwakened) this.towerDoorBlocker = wall(380, 306, 140, 40);
  }

  private createPlayer() {
    this.player = this.physics.add.image(this.save.position.x, this.save.position.y, 'third-oath-marker');
    this.player.setVisible(false).setCollideWorldBounds(true);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setCircle(10, 6, 6);
    body.setMaxVelocity(150, 150);
    this.physics.add.collider(this.player, this.walls);

    const shadow = this.add.ellipse(0, 13, 35, 15, 0x000000, .58);
    const cloak = this.add.graphics();
    cloak.fillStyle(0x272a2a, 1);
    cloak.fillTriangle(-13, 9, 13, 9, 0, 29);
    cloak.fillStyle(0x343838, .8);
    cloak.fillTriangle(-8, 7, 8, 7, 0, 22);
    cloak.lineStyle(1, 0x70716b, .25);
    cloak.beginPath(); cloak.moveTo(-13, 9); cloak.lineTo(0, 29); cloak.lineTo(13, 9); cloak.strokePath();
    this.knightCloak = cloak;

    const torso = this.add.graphics();
    torso.fillStyle(0x4a4b47, 1);
    torso.fillRoundedRect(-11, -8, 22, 25, 7);
    torso.fillStyle(0x1b1c1c, 1);
    torso.fillRect(-8, -4, 16, 5);
    torso.lineStyle(2, 0x8b8578, .5);
    torso.beginPath(); torso.moveTo(-7, 7); torso.lineTo(7, 7); torso.strokePath();
    torso.fillStyle(0x8d7753, 1);
    torso.fillCircle(0, -12, 8);
    torso.fillStyle(0x2a2926, 1);
    torso.fillCircle(0, -14, 6);

    const shield = this.add.graphics();
    shield.fillStyle(0x24282a, 1);
    shield.beginPath();
    shield.moveTo(-10, -12); shield.lineTo(8, -9); shield.lineTo(10, 6); shield.lineTo(0, 15); shield.lineTo(-10, 6); shield.closePath();
    shield.fillPath();
    shield.lineStyle(2, 0x81765e, .7); shield.strokePath();
    shield.lineStyle(2, 0x9b805d, .38); shield.beginPath(); shield.moveTo(0, -7); shield.lineTo(0, 10); shield.strokePath();
    this.knightShield = this.add.container(-15, 1, [shield]);

    const hammerG = this.add.graphics();
    hammerG.fillStyle(0x6b6254, 1); hammerG.fillRect(-2, -18, 4, 28);
    hammerG.fillStyle(0x373a39, 1); hammerG.fillRoundedRect(-10, -24, 20, 9, 2);
    hammerG.lineStyle(1, 0xa29a89, .45); hammerG.strokeRoundedRect(-10, -24, 20, 9, 2);
    this.knightHammer = this.add.container(15, 4, [hammerG]);
    this.knightHammer.rotation = .3;

    this.knight = this.add.container(this.player.x, this.player.y, [shadow, cloak, torso, this.knightShield, this.knightHammer]).setDepth(40);
  }

  private createAtmosphere() {
    const lights = [
      [220, 1980, 1.05], [680, 1980, .95], [225, 1120, .72], [675, 1340, .62],
      [210, 760, .58], [690, 760, .58], [450, 410, .42]
    ] as Array<[number, number, number]>;
    for (const [x, y, scale] of lights) {
      const glow = this.add.image(x, y, 'third-oath-glow').setBlendMode(Phaser.BlendModes.ADD).setAlpha(.42).setScale(scale).setDepth(15);
      this.tweens.add({ targets: glow, alpha: { from: .33, to: .5 }, scaleX: scale * 1.035, scaleY: scale * .98, duration: 1050 + x, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      const flame = this.add.graphics().setDepth(17);
      flame.fillStyle(0xc49a58, .88); flame.fillCircle(x, y, 3);
      flame.fillStyle(0xf0d9a0, .82); flame.fillCircle(x, y - 2, 1.5);
    }

    for (let i = 0; i < 7; i += 1) {
      const fog = this.add.image(170 + (i % 3) * 250, 420 + i * 285, 'third-oath-fog').setAlpha(.16).setDepth(12);
      fog.setScale(.8 + noise01(i, 3) * .7);
      this.tweens.add({ targets: fog, x: fog.x + 34 + i * 3, alpha: { from: .08, to: .18 }, duration: 6000 + i * 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    for (let i = 0; i < 42; i += 1) {
      const d = this.add.image(WORLD.left + 30 + noise01(i, 2) * (WORLD.width - 60), WORLD.top + noise01(i, 9) * WORLD.height, 'third-oath-dust')
        .setDepth(18).setAlpha(.12 + noise01(i, 4) * .3).setScale(.35 + noise01(i, 8) * .65);
      this.tweens.add({ targets: d, y: d.y - 28 - noise01(i, 7) * 45, alpha: { from: d.alpha * .45, to: d.alpha }, duration: 4200 + i * 113, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  private registerInteractables() {
    this.interactables = [
      {
        id: 'altar', x: 450, y: 1970, radius: 78, label: 'Осмотреть алтарь',
        action: () => {
          if (hasItem(this.save, 'oath-stone') || this.save.flags.oathPlaced) this.toast('Под плитой пусто.');
          else this.startDialogue('altar');
        }
      },
      {
        id: 'secret-door', x: 450, y: 1730, radius: 72, label: 'Осмотреть кладку',
        active: () => !this.save.flags.secretDoorOpen,
        action: () => this.openSecretDoor()
      },
      {
        id: 'sarcophagus', x: 305, y: 1180, radius: 78, label: 'Осмотреть саркофаг',
        action: () => this.startDialogue('sarcophagus')
      },
      {
        id: 'oath-pedestal', x: 300, y: 560, radius: 70, label: 'Положить Камень Клятвы',
        active: () => !this.save.flags.oathPlaced,
        action: () => this.placeStone('oath')
      },
      {
        id: 'tear-pedestal', x: 450, y: 530, radius: 70, label: 'Положить Слезу',
        active: () => !this.save.flags.tearPlaced,
        action: () => this.placeStone('tear')
      },
      {
        id: 'third-pedestal', x: 600, y: 560, radius: 70, label: 'Осмотреть третий пьедестал',
        action: () => this.toast(this.save.flags.hallAwakened ? 'Камень здесь так и не появился.' : 'Пусто. Здесь должно быть третье.')
      },
      {
        id: 'tower-door', x: 450, y: 340, radius: 74, label: 'Открыть дверь башни',
        active: () => this.save.flags.hallAwakened === true,
        action: () => this.completeChapter()
      }
    ];
  }

  private restoreStoryVisuals() {
    if (this.save.flags.oathPlaced) this.pedestalOathGlow = this.add.image(300, 560, 'third-oath-blue-glow').setDepth(19).setScale(.32).setAlpha(.48).setBlendMode(Phaser.BlendModes.ADD);
    if (this.save.flags.tearPlaced) this.pedestalTearGlow = this.add.image(450, 530, 'third-oath-blue-glow').setDepth(19).setScale(.32).setAlpha(.48).setBlendMode(Phaser.BlendModes.ADD);
    if (this.save.flags.hallAwakened) {
      this.ritualCenterGlow = this.add.image(450, 690, 'third-oath-blue-glow').setDepth(19).setScale(.75).setAlpha(.18).setBlendMode(Phaser.BlendModes.ADD);
      this.addFootprints();
    }
  }

  private openSecretDoor() {
    this.save.flags.secretDoorOpen = true;
    this.secretDoorBlocker?.destroy();
    this.secretDoorBlocker = null;
    this.cameras.main.shake(220, .004);
    audio.door();
    this.toast('За стеной — узкий спуск.');
    this.save.checkpoint = { x: 450, y: 1770 };
    this.save.position = { x: this.player.x, y: this.player.y };
    this.commitSave();
  }

  private placeStone(kind: 'oath' | 'tear') {
    const item = kind === 'oath' ? 'oath-stone' : 'tear-stone';
    if (!hasItem(this.save, item)) {
      this.toast(kind === 'oath' ? 'У тебя нет Камня Клятвы.' : 'Слеза ещё не найдена.');
      return;
    }
    removeItem(this.save, item);
    if (kind === 'oath') {
      this.save.flags.oathPlaced = true;
      this.pedestalOathGlow = this.add.image(300, 560, 'third-oath-blue-glow').setDepth(19).setScale(.12).setAlpha(.7).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: this.pedestalOathGlow, scale: .34, duration: 500, ease: 'Back.easeOut' });
    } else {
      this.save.flags.tearPlaced = true;
      this.pedestalTearGlow = this.add.image(450, 530, 'third-oath-blue-glow').setDepth(19).setScale(.12).setAlpha(.7).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: this.pedestalTearGlow, scale: .34, duration: 500, ease: 'Back.easeOut' });
    }
    audio.oath();
    this.cameras.main.shake(140, .003);
    this.commitSave();
    if (this.save.flags.oathPlaced && this.save.flags.tearPlaced && !this.save.flags.hallAwakened) {
      this.time.delayedCall(650, () => this.beginRitual());
    }
  }

  private beginRitual() {
    if (this.ritualRunning) return;
    this.ritualRunning = true;
    this.setMode('cutscene');
    this.player.setVelocity(0, 0);
    this.cameras.main.stopFollow();
    this.cameras.main.pan(450, 620, 650, 'Sine.easeInOut');
    this.cameras.main.zoomTo(1.1, 650, 'Sine.easeInOut');

    this.ritualCenterGlow = this.add.image(450, 690, 'third-oath-blue-glow').setDepth(20).setScale(.1).setAlpha(.72).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: this.ritualCenterGlow, scale: 1.05, alpha: .36, duration: 1700, ease: 'Sine.easeOut' });
    audio.oath();

    RITUAL_LINES.forEach((line, index) => {
      this.time.delayedCall(1000 + index * 1450, () => {
        this.callbacks.onRitual(line);
        audio.oath();
        if (index === 1) this.cameras.main.flash(140, 115, 186, 205, false);
      });
    });

    this.time.delayedCall(1000 + RITUAL_LINES.length * 1450, () => {
      this.callbacks.onRitual(null);
      this.save.flags.hallAwakened = true;
      this.towerDoorBlocker?.destroy();
      this.towerDoorBlocker = null;
      this.addFootprints();
      this.commitSave();
      audio.whisper();
      this.cameras.main.zoomTo(1, 650, 'Sine.easeInOut');
      this.cameras.main.startFollow(this.player, true, .09, .09);
      this.ritualRunning = false;
      this.startDialogue('echo');
    });
  }

  private addFootprints() {
    if (this.save.flags.footprintsShown) return;
    const g = this.add.graphics().setDepth(10);
    const points = [[462, 650], [438, 612], [458, 573], [439, 532], [459, 491], [441, 450], [457, 407], [444, 365]] as Array<[number, number]>;
    g.fillStyle(0x2c3539, .52);
    for (let i = 0; i < points.length; i += 1) {
      const [x, y] = points[i];
      g.fillEllipse(x, y, 11, 20);
      g.fillEllipse(x + (i % 2 ? 5 : -5), y - 8, 4, 7);
    }
    this.save.flags.footprintsShown = true;
    this.commitSave();
  }

  private startDialogue(id: string) {
    const node = DIALOGUES[id];
    if (!node) return;
    this.currentDialogue = node;
    this.setMode('dialogue');
    this.player.setVelocity(0, 0);
    const options = node.options.filter((option) => {
      if (option.requiresItem && !hasItem(this.save, option.requiresItem)) return false;
      if (option.requiresFlag && !this.save.flags[option.requiresFlag]) return false;
      return true;
    }).map((option) => ({ id: option.id, label: option.label }));
    this.callbacks.onDialogue({ speaker: node.speaker, text: node.text, options });
  }

  chooseDialogue(optionId: string) {
    if (!this.currentDialogue || this.mode !== 'dialogue') return;
    const option = this.currentDialogue.options.find((item) => item.id === optionId);
    if (!option) return;
    audio.ui();
    let next = option.next;
    if (option.skill && option.difficulty && option.checkId) {
      const passed = resolveHiddenCheck(this.save, option.checkId, option.skill, option.difficulty);
      next = passed ? option.next : option.failNext;
    }
    if (option.effect) this.applyDialogueEffect(option.effect);
    this.commitSave();
    if (next) {
      this.startDialogue(next);
    } else {
      this.currentDialogue = null;
      this.callbacks.onDialogue(null);
      this.setMode(this.enemy && !this.enemy.dead ? 'combat' : 'explore');
    }
  }

  private applyDialogueEffect(effect: string) {
    if (effect === 'take-oath-stone') {
      addItem(this.save, 'oath-stone');
      this.save.flags.altarTaken = true;
      audio.pickup();
      this.toast('КАМЕНЬ КЛЯТВЫ');
    } else if (effect === 'take-letter') {
      addItem(this.save, 'sun-letter');
      audio.pickup();
      this.toast('ПИСЬМО · СОЛНЦЕ И СТРЕЛА');
    } else if (effect === 'mark-barefoot') {
      this.save.flags.barefootTrailKnown = true;
      this.toast('След ведёт вверх.');
    } else if (effect === 'gave-name') {
      this.save.flags.gaveNameToElin = true;
    } else if (effect === 'kept-silence') {
      this.save.flags.resistedElin = true;
    }
  }

  private toast(text: string) {
    this.callbacks.onToast(text);
  }

  private spawnWarden() {
    if (this.enemy || this.save.flags.cryptWardenDefeated) return;
    const body = this.physics.add.image(485, 1190, 'third-oath-marker');
    body.setVisible(false);
    const arcade = body.body as Phaser.Physics.Arcade.Body;
    arcade.setCircle(11, 5, 5);
    this.physics.add.collider(body, this.walls);

    const shadow = this.add.ellipse(0, 12, 34, 14, 0x000000, .62);
    const cloak = this.add.graphics();
    cloak.fillStyle(0x171816, 1); cloak.fillTriangle(-15, 8, 15, 8, 0, 31);
    cloak.fillStyle(0x24251f, .9); cloak.fillRoundedRect(-11, -8, 22, 25, 7);
    cloak.fillStyle(0x0b0c0b, 1); cloak.fillCircle(0, -12, 9);
    cloak.lineStyle(2, 0x584a3d, .65); cloak.beginPath(); cloak.moveTo(-8, -1); cloak.lineTo(8, 5); cloak.strokePath();
    const weapon = this.add.graphics();
    weapon.lineStyle(4, 0x5f5b50, 1); weapon.beginPath(); weapon.moveTo(13, -10); weapon.lineTo(22, 18); weapon.strokePath();
    weapon.fillStyle(0x2d2d29, 1); weapon.fillRect(17, 14, 15, 5);
    const visual = this.add.container(body.x, body.y, [shadow, cloak, weapon]).setDepth(39);
    const ring = this.add.circle(body.x, body.y, 44, 0x8d4f3d, 0).setStrokeStyle(2, 0xa36a55, 0).setDepth(16);

    this.enemy = { body, visual, ring, health: 4, cooldown: .45, windup: 0, stun: 0, dead: false };
    this.setMode('combat');
    this.toast('В крипте кто-то дышит.');
  }

  private updateEnemy(dt: number) {
    const enemy = this.enemy;
    if (!enemy || enemy.dead) return;
    enemy.cooldown = Math.max(0, enemy.cooldown - dt);
    enemy.stun = Math.max(0, enemy.stun - dt);
    enemy.visual.setPosition(enemy.body.x, enemy.body.y);
    enemy.ring.setPosition(enemy.body.x, enemy.body.y);

    const dx = this.player.x - enemy.body.x;
    const dy = this.player.y - enemy.body.y;
    const distance = Math.hypot(dx, dy);

    if (enemy.stun > 0) {
      enemy.body.setVelocity(0, 0);
      enemy.visual.rotation += dt * 2.1;
      enemy.ring.setAlpha(0);
      return;
    }

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.body.setVelocity(0, 0);
      const progress = 1 - enemy.windup / .62;
      enemy.ring.setRadius(34 + progress * 22);
      enemy.ring.setStrokeStyle(2.5, 0xa86d58, .22 + progress * .7);
      if (enemy.windup <= 0) {
        enemy.ring.setStrokeStyle(2, 0xa86d58, 0);
        this.enemyStrike(distance);
        enemy.cooldown = 1.05;
      }
      return;
    }

    if (distance < 285 && distance > 58) {
      enemy.body.setVelocity((dx / distance) * 54, (dy / distance) * 54);
      enemy.visual.rotation = Math.atan2(dy, dx) + Math.PI / 2;
    } else {
      enemy.body.setVelocity(0, 0);
    }
    if (distance <= 70 && enemy.cooldown <= 0) {
      enemy.windup = .62;
      enemy.ring.setStrokeStyle(2, 0xa86d58, .3);
    }
  }

  private enemyStrike(distance: number) {
    if (distance > 78) return;
    const guardAge = performance.now() - inputState.guardPressedAt;
    if (inputState.guardHeld && guardAge < 220) {
      this.save.resolve = Math.min(100, this.save.resolve + 28);
      if (this.enemy) this.enemy.stun = .85;
      this.cameras.main.shake(120, .005);
      audio.block();
      this.toast('ПАРИРОВАНИЕ');
      this.syncHud();
      return;
    }
    if (inputState.guardHeld) {
      this.save.resolve = Math.min(100, this.save.resolve + 10);
      this.damagePlayer(.5);
      audio.block();
      return;
    }
    this.damagePlayer(1);
  }

  private damagePlayer(amount: number) {
    if (this.hurtCooldown > 0) return;
    this.hurtCooldown = .4;
    this.save.health = Math.max(0, this.save.health - amount);
    audio.hit();
    this.cameras.main.shake(180, .008);
    this.cameras.main.flash(110, 92, 28, 22, false);
    this.syncHud();
    this.commitSave();
    if (this.save.health <= 0) {
      this.setMode('dead');
      this.player.setVelocity(0, 0);
      this.enemy?.body.setVelocity(0, 0);
      this.callbacks.onDeath();
    }
  }

  private attack() {
    if (this.attackCooldown > 0 || (this.mode !== 'explore' && this.mode !== 'combat')) return;
    this.attackCooldown = .38;
    this.attackAnim = .24;
    audio.swing();
    const enemy = this.enemy;
    if (!enemy || enemy.dead) return;
    const dx = enemy.body.x - this.player.x;
    const dy = enemy.body.y - this.player.y;
    const dist = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    if (dist > 78 || Math.abs(angleDelta(angle, this.facing)) > 1.05) return;
    this.time.delayedCall(85, () => {
      if (!this.enemy || this.enemy.dead) return;
      this.enemy.health -= 1;
      this.enemy.stun = .24;
      this.save.resolve = Math.min(100, this.save.resolve + 13);
      this.cameras.main.shake(95, .004);
      audio.hit();
      this.syncHud();
      if (this.enemy.health <= 0) this.killWarden();
    });
  }

  private useAbility() {
    if (this.save.resolve < 40 || (this.mode !== 'explore' && this.mode !== 'combat')) {
      if (this.save.resolve < 40) this.toast('Недостаточно решимости.');
      return;
    }
    this.save.resolve -= 40;
    audio.oath();
    const ring = this.add.circle(this.player.x, this.player.y, 18, 0x4d9ab3, .16).setStrokeStyle(3, 0xa9d9e2, .85).setDepth(35);
    this.tweens.add({
      targets: ring,
      radius: 120,
      alpha: 0,
      duration: 430,
      ease: 'Sine.easeOut',
      onComplete: () => ring.destroy()
    });
    if (this.enemy && !this.enemy.dead) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.enemy.body.x, this.enemy.body.y);
      if (d < 118) {
        this.enemy.health -= 2;
        this.enemy.stun = 1.1;
        if (this.enemy.health <= 0) this.killWarden();
      }
    }
    this.cameras.main.flash(90, 82, 142, 161, false);
    this.syncHud();
    this.commitSave();
  }

  private killWarden() {
    const enemy = this.enemy;
    if (!enemy || enemy.dead) return;
    enemy.dead = true;
    enemy.body.setVelocity(0, 0);
    this.tweens.add({
      targets: enemy.visual,
      alpha: 0,
      scaleX: .72,
      scaleY: .72,
      duration: 520,
      ease: 'Sine.easeIn',
      onComplete: () => enemy.visual.destroy()
    });
    enemy.ring.destroy();
    enemy.body.destroy();
    this.save.flags.cryptWardenDefeated = true;
    addItem(this.save, 'tear-stone');
    this.save.checkpoint = { x: 450, y: 1320 };
    this.save.position = { x: this.player.x, y: this.player.y };
    this.cryptDoorBlocker?.destroy();
    this.cryptDoorBlocker = null;
    audio.pickup();
    this.toast('СЛЕЗА');
    this.setMode('explore');
    this.commitSave();
  }

  private updatePlayer(dt: number) {
    const canMove = this.mode === 'explore' || this.mode === 'combat';
    let mx = canMove ? inputState.moveX : 0;
    let my = canMove ? inputState.moveY : 0;
    if (canMove && this.keys) {
      if (this.keys.A?.isDown || this.keys.LEFT?.isDown) mx -= 1;
      if (this.keys.D?.isDown || this.keys.RIGHT?.isDown) mx += 1;
      if (this.keys.W?.isDown || this.keys.UP?.isDown) my -= 1;
      if (this.keys.S?.isDown || this.keys.DOWN?.isDown) my += 1;
    }
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const speed = inputState.guardHeld ? 76 : 124;
    this.player.setVelocity(mx * speed, my * speed);

    if (len > .08) {
      this.facing = Math.atan2(my, mx);
      this.walkPhase += dt * 8.8;
      this.stepClock -= dt;
      if (this.stepClock <= 0) {
        this.stepClock = .42;
        audio.step();
      }
    } else {
      this.walkPhase += dt * 2.1;
    }

    this.knight.setPosition(this.player.x, this.player.y + Math.sin(this.walkPhase) * (len > .08 ? 1.2 : .35));
    this.knight.rotation = this.facing + Math.PI / 2;
    this.knightCloak.scaleY = 1 + Math.sin(this.walkPhase * .5) * .025;
    this.knightShield.rotation = inputState.guardHeld ? -.38 : -.06 + Math.sin(this.walkPhase) * .04;
    if (this.attackAnim > 0) {
      const p = 1 - this.attackAnim / .24;
      this.knightHammer.rotation = -.65 + Math.sin(p * Math.PI) * 2.2;
    } else {
      this.knightHammer.rotation = .28 + Math.sin(this.walkPhase) * .05;
    }

    if (inputState.attackPressed || this.keys?.SPACE?.isDown && this.attackCooldown <= 0) {
      inputState.attackPressed = false;
      this.attack();
    }
    if (inputState.abilityPressed || this.keys?.Q?.isDown && this.attackCooldown <= 0) {
      inputState.abilityPressed = false;
      this.useAbility();
    }
    if (inputState.interactPressed || this.keys?.E?.isDown && this.activeInteractable) {
      inputState.interactPressed = false;
      this.activeInteractable?.action();
    }
  }

  private updateInteractable() {
    if (this.mode !== 'explore' && this.mode !== 'combat') {
      this.activeInteractable = null;
      this.callbacks.onPrompt(null);
      return;
    }
    let best: Interactable | null = null;
    let bestDistance = Infinity;
    for (const item of this.interactables) {
      if (item.active && !item.active()) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, item.x, item.y);
      if (d <= item.radius && d < bestDistance) {
        best = item;
        bestDistance = d;
      }
    }
    if (best?.id !== this.activeInteractable?.id) {
      this.activeInteractable = best;
      this.callbacks.onPrompt(best?.label ?? null);
    }
  }

  private updateZone(force = false) {
    const zone = ZONES.find((entry) => this.player.y >= entry.minY && this.player.y < entry.maxY);
    if (!zone || (!force && zone.id === this.zoneId)) return;
    this.zoneId = zone.id;
    this.callbacks.onZone(zone.name, zone.kicker);
  }

  private completeChapter() {
    if (!this.save.flags.hallAwakened) return;
    this.save.completed = true;
    this.save.position = { x: this.player.x, y: this.player.y };
    this.commitSave();
    audio.door();
    this.cameras.main.fadeOut(650, 10, 10, 9);
    this.setMode('complete');
    this.time.delayedCall(700, () => this.callbacks.onComplete());
  }

  private syncHud() {
    this.callbacks.onHud(this.save.health, this.save.maxHealth, this.save.resolve, this.mode === 'combat');
  }

  private commitSave() {
    this.save.position = { x: this.player.x, y: this.player.y };
    persistSave(this.save);
    this.callbacks.onSave(this.save);
    this.publishQA();
  }

  private publishQA() {
    (window as typeof window & { __PW_TEST_STATE__?: unknown }).__PW_TEST_STATE__ = {
      ready: true,
      app: 'third-oath',
      mode: this.mode,
      zone: this.zoneId,
      player: { x: Math.round(this.player?.x ?? this.save.position.x), y: Math.round(this.player?.y ?? this.save.position.y), health: this.save.health, resolve: this.save.resolve },
      enemy: this.enemy && !this.enemy.dead ? { health: this.enemy.health, x: Math.round(this.enemy.body.x), y: Math.round(this.enemy.body.y) } : null,
      inventory: [...this.save.inventory],
      flags: { ...this.save.flags },
      completed: this.save.completed
    };
  }

  pauseWorld() {
    if (this.mode === 'pause') return;
    this.modeBeforePause = this.mode;
    this.setMode('pause');
    this.physics.world.pause();
  }

  resumeWorld() {
    if (this.mode !== 'pause') return;
    this.physics.world.resume();
    this.setMode(this.modeBeforePause === 'pause' ? 'explore' : this.modeBeforePause);
  }

  resumeAfterComplete() {
    this.cameras.main.fadeIn(450, 10, 10, 9);
    this.cameras.main.startFollow(this.player, true, .09, .09);
    this.setMode('explore');
  }

  restartFromCheckpoint() {
    this.save.health = this.save.maxHealth;
    this.save.resolve = Math.max(0, this.save.resolve - 20);
    this.save.position = { ...this.save.checkpoint };
    persistSave(this.save);
    this.scene.restart();
  }

  update(_time: number, deltaMs: number) {
    const dt = Math.min(.05, deltaMs / 1000);
    this.runtimeSeconds += dt;
    this.qaClock -= dt;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.attackAnim = Math.max(0, this.attackAnim - dt);
    this.hurtCooldown = Math.max(0, this.hurtCooldown - dt);

    if (!this.enemy && !this.save.flags.cryptWardenDefeated && this.player.y < 1430 && this.player.y > 1020) this.spawnWarden();

    this.updatePlayer(dt);
    this.updateEnemy(dt);
    this.updateInteractable();
    this.updateZone();

    if (this.runtimeSeconds >= 1) {
      const whole = Math.floor(this.runtimeSeconds);
      this.runtimeSeconds -= whole;
      this.save.playSeconds += whole;
    }

    if (this.qaClock <= 0) {
      this.qaClock = .25;
      this.publishQA();
    }
  }
}

export function createThirdOathGame(parent: HTMLElement, save: SaveState, callbacks: GameCallbacks) {
  const scene = new OathScene({ save, callbacks });
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    transparent: false,
    backgroundColor: '#0c0b0a',
    render: { antialias: true, pixelArt: false, roundPixels: false, powerPreference: 'high-performance' },
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH, width: '100%', height: '100%' },
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
    scene: [scene],
    input: { activePointers: 3 }
  });

  return {
    chooseDialogue: (id: string) => scene.chooseDialogue(id),
    pause: () => scene.pauseWorld(),
    resume: () => scene.resumeWorld(),
    restartFromCheckpoint: () => scene.restartFromCheckpoint(),
    resumeAfterComplete: () => scene.resumeAfterComplete(),
    destroy: () => {
      inputState.moveX = 0; inputState.moveY = 0; inputState.guardHeld = false; inputState.attackHeld = false;
      game.destroy(true);
    }
  };
}
