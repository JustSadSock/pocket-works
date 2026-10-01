import Phaser from 'phaser';
import { audio } from './audio';
import { canUseOath } from './core';
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
  private secretDoorBlocker: Phaser.Types.Physics.Arcade.ImageWithStaticBody | null = null;
  private cryptDoorBlocker: Phaser.Types.Physics.Arcade.ImageWithStaticBody | null = null;
  private towerDoorBlocker: Phaser.Types.Physics.Arcade.ImageWithStaticBody | null = null;
  private secretDoorVisual: Phaser.GameObjects.Graphics | null = null;
  private cryptDoorVisual: Phaser.GameObjects.Graphics | null = null;
  private towerDoorVisual: Phaser.GameObjects.Graphics | null = null;
  private facing = -Math.PI / 2;
  private walkPhase = 0;
  private stepClock = 0;
  private attackCooldown = 0;
  private attackAnim = 0;
  private hurtCooldown = 0;
  private zoneId = '';
  private runtimeSeconds = 0;
  private qaClock = 0;
  private autosaveClock = 5;
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
    g.fillStyle(0x171713, 1);
    g.fillRect(x, y, w, h);
    const tileW = 54;
    const tileH = 40;
    const palette = [0x29271f, 0x302d24, 0x25241e, 0x343027, 0x22221d, 0x2d2b23];
    for (let row = 0; row < Math.ceil(h / tileH); row += 1) {
      const yy = y + row * tileH;
      const offset = row % 2 ? -tileW / 2 : 0;
      for (let col = -1; col < Math.ceil(w / tileW) + 1; col += 1) {
        const xx = x + col * tileW + offset;
        const n = noise01(col + seed, row, seed);
        const edge = 1 + Math.floor(noise01(col, row, seed + 5) * 2);
        const color = palette[Math.floor(n * palette.length) % palette.length];

        g.fillStyle(0x0d0d0b, .72);
        g.fillRect(xx, yy, tileW, tileH);
        g.fillStyle(color, 1);
        g.fillRect(xx + edge, yy + edge, tileW - edge * 2, tileH - edge * 2);

        // Hand-painted bevel: a dim warm top edge and a colder lower edge stop the
        // floor from reading like a CSS grid while remaining cheap to render.
        g.lineStyle(1, 0x686151, .14 + n * .08);
        g.beginPath();
        g.moveTo(xx + 4, yy + 3);
        g.lineTo(xx + tileW - 5, yy + 3);
        g.moveTo(xx + 3, yy + 4);
        g.lineTo(xx + 3, yy + tileH - 5);
        g.strokePath();
        g.lineStyle(1, 0x090a09, .34);
        g.beginPath();
        g.moveTo(xx + 5, yy + tileH - 3);
        g.lineTo(xx + tileW - 4, yy + tileH - 3);
        g.strokePath();

        const stain = noise01(col * 3 + seed, row * 5, 41);
        if (stain > .63) {
          const sx = xx + 8 + noise01(col, row, 61) * (tileW - 16);
          const sy = yy + 7 + noise01(col, row, 67) * (tileH - 14);
          g.fillStyle(stain > .86 ? 0x11130f : 0x1b1b16, .18 + stain * .12);
          g.fillEllipse(sx, sy, 8 + stain * 13, 3 + stain * 6);
        }

        if (n > .72) {
          g.lineStyle(1, n > .9 ? 0x77705c : 0x11110f, n > .9 ? .22 : .58);
          g.beginPath();
          g.moveTo(xx + tileW * (.18 + noise01(col, row, 73) * .14), yy + 5);
          g.lineTo(xx + tileW * .48, yy + tileH * .43);
          g.lineTo(xx + tileW * (.38 + noise01(row, col, 79) * .18), yy + tileH - 6);
          g.strokePath();
        }

        // Small mineral flecks are intentionally sparse. They break procedural
        // repetition without turning the floor into visual noise.
        for (let fleck = 0; fleck < 2; fleck += 1) {
          const fx = xx + 7 + noise01(col * 7 + fleck, row, seed + 83) * (tileW - 14);
          const fy = yy + 6 + noise01(col, row * 9 + fleck, seed + 89) * (tileH - 12);
          g.fillStyle(fleck ? 0x958b73 : 0x0b0b0a, fleck ? .08 : .13);
          g.fillCircle(fx, fy, fleck ? .7 : 1.1);
        }
      }
    }
  }

  private drawWallVisual(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number) {
    const horizontal = w >= h;
    g.fillStyle(0x050505, .76);
    g.fillRect(x + 7, y + 10, w, h);

    // Walls have a readable top face and a dark inner lip. From the fixed 3/4
    // camera this tiny fake extrusion adds far more depth than another shader.
    g.fillStyle(0x464136, 1);
    g.fillRect(x, y, w, h);
    if (horizontal) {
      g.fillStyle(0x5b5444, .72);
      g.fillRect(x + 1, y + 1, w - 2, Math.min(6, h * .3));
      g.fillStyle(0x1e1d18, .72);
      g.fillRect(x + 1, y + h - 6, w - 2, 5);
    } else {
      g.fillStyle(0x585142, .58);
      g.fillRect(x + 1, y + 1, Math.min(6, w * .3), h - 2);
      g.fillStyle(0x1d1c18, .7);
      g.fillRect(x + w - 6, y + 1, 5, h - 2);
    }

    const major = horizontal ? w : h;
    const minor = horizontal ? h : w;
    const brick = 31;
    for (let p = 0; p < major; p += brick) {
      const n = noise01(x + p, y, 23);
      const inset = 2 + Math.floor(n * 2);
      g.fillStyle(n > .58 ? 0x514a3d : 0x3b382f, .48);
      if (horizontal) g.fillRect(x + p + inset, y + 8, Math.max(8, Math.min(brick - 4, w - p - inset)), Math.max(4, minor - 15));
      else g.fillRect(x + 8, y + p + inset, Math.max(4, minor - 15), Math.max(8, Math.min(brick - 4, h - p - inset)));
      if (n > .77) {
        g.lineStyle(1, 0x8a8068, .15);
        if (horizontal) {
          g.beginPath(); g.moveTo(x + p + 8, y + 10); g.lineTo(x + p + 20, y + h - 8); g.strokePath();
        } else {
          g.beginPath(); g.moveTo(x + 9, y + p + 8); g.lineTo(x + w - 8, y + p + 19); g.strokePath();
        }
      }
    }
    g.lineStyle(1, 0x8d826a, .24);
    g.strokeRect(x, y, w, h);
  }

  private drawChapelProps(g: Phaser.GameObjects.Graphics) {
    // Altar: stepped stone body, worn linen and shallow carved oath mark.
    g.fillStyle(0x070706, .62);
    g.fillEllipse(456, 1951, 204, 82);
    g.fillStyle(0x37352e, 1);
    g.fillRect(382, 1916, 136, 43);
    g.fillStyle(0x575144, 1);
    g.fillRect(370, 1905, 160, 19);
    g.fillStyle(0x726852, .35);
    g.fillRect(376, 1907, 148, 4);
    g.lineStyle(1, 0x9a8e73, .3);
    g.strokeRect(370, 1905, 160, 19);
    g.lineStyle(2, 0x151411, .72);
    g.strokeRect(382, 1916, 136, 43);
    g.fillStyle(0x8b8069, .18);
    g.fillRect(423, 1909, 54, 42);
    g.lineStyle(2, 0xb0a184, .24);
    g.beginPath();
    g.moveTo(450, 1913); g.lineTo(450, 1943);
    g.moveTo(435, 1926); g.lineTo(465, 1926);
    g.strokePath();

    // Wax and two mismatched candle holders keep the shrine grounded in use.
    for (const [cx, cy, tall] of [[404, 1897, 13], [496, 1899, 10]] as Array<[number, number, number]>) {
      g.fillStyle(0x312d25, 1); g.fillRect(cx - 4, cy, 8, 6);
      g.fillStyle(0xb5a27d, .66); g.fillRect(cx - 2, cy - tall, 4, tall);
      g.fillStyle(0xc79d5b, .78); g.fillCircle(cx, cy - tall - 3, 2.4);
      g.fillStyle(0xe1c98f, .58); g.fillCircle(cx, cy - tall - 4, 1.1);
    }

    for (let row = 0; row < 4; row += 1) {
      const yy = 2028 + row * 43;
      for (const xx of [270, 570]) {
        const worn = noise01(row, xx, 29);
        g.fillStyle(0x090807, .62);
        g.fillRect(xx - 80 + 6, yy + 10, 160, 24);
        // Rear support and legs make each pew read as furniture, not a bar.
        g.fillStyle(0x21180f, 1);
        g.fillRect(xx - 76, yy + 14, 8, 16);
        g.fillRect(xx + 68, yy + 14, 8, 16);
        g.fillStyle(worn > .55 ? 0x49331f : 0x3c2b1c, 1);
        g.fillRect(xx - 80, yy, 160, 18);
        g.fillStyle(0x65472b, .52);
        g.fillRect(xx - 73, yy + 3, 145, 3);
        g.fillStyle(0x2d2015, 1);
        g.fillRect(xx - 78, yy - 7, 156, 7);
        g.lineStyle(1, 0x806040, .18);
        g.beginPath();
        g.moveTo(xx - 62, yy + 9); g.lineTo(xx + 48, yy + 9);
        g.moveTo(xx - 20, yy + 4); g.lineTo(xx + 61, yy + 5);
        g.strokePath();
        if (worn > .68) {
          g.lineStyle(1, 0xa17a4c, .18);
          g.beginPath(); g.moveTo(xx - 28, yy + 2); g.lineTo(xx - 10, yy + 14); g.strokePath();
        }
      }
    }

    // Iron devotional basins.
    for (const xx of [245, 655]) {
      g.fillStyle(0x0b0b0a, .55); g.fillEllipse(xx + 4, 1822, 60, 24);
      g.fillStyle(0x373832, 1); g.fillCircle(xx, 1812, 27);
      g.lineStyle(3, 0x151613, .92); g.strokeCircle(xx, 1812, 17);
      g.lineStyle(1, 0x89816c, .26); g.strokeCircle(xx, 1812, 23);
      g.fillStyle(0x171a18, 1); g.fillEllipse(xx, 1813, 25, 12);
    }

    // Rubble and old candle drips keep the negative space from feeling generated.
    const debris = [[164,1988,6],[714,2058,5],[346,2168,4],[656,2187,7],[198,2112,3]] as Array<[number,number,number]>;
    for (const [dx,dy,r] of debris) {
      g.fillStyle(0x4b473c, .62); g.fillCircle(dx,dy,r);
      g.fillStyle(0x77705d, .15); g.fillCircle(dx-1.5,dy-1.5,Math.max(1,r*.45));
    }
  }

  private drawCryptProps(g: Phaser.GameObjects.Graphics) {
    for (const [x, y, open] of [[305, 1180, 1], [595, 1288, 0], [310, 1350, 0]] as Array<[number, number, number]>) {
      g.fillStyle(0x080807, .72);
      g.fillRoundedRect(x - 66 + 9, y - 29 + 11, 132, 58, 8);
      g.fillStyle(open ? 0x302f2a : 0x3d3b33, 1);
      g.fillRoundedRect(x - 66, y - 29, 132, 58, 8);
      g.fillStyle(0x565247, .42);
      g.fillRoundedRect(x - 58, y - 22, 116, 13, 5);
      g.lineStyle(2, 0x8e8775, .23);
      g.strokeRoundedRect(x - 60, y - 23, 120, 46, 6);
      g.lineStyle(1, 0x141412, .82);
      g.beginPath();
      g.moveTo(x - 38, y); g.lineTo(x + 38, y);
      g.moveTo(x, y - 15); g.lineTo(x, y + 16);
      g.strokePath();
      g.lineStyle(1, 0x8a806d, .12);
      g.beginPath();
      g.moveTo(x - 43, y + 15); g.lineTo(x - 18, y + 15);
      g.moveTo(x + 18, y + 15); g.lineTo(x + 43, y + 15);
      g.strokePath();
      if (open) {
        g.fillStyle(0x090a09, .88);
        g.fillRoundedRect(x - 49, y - 12, 98, 27, 4);
        g.lineStyle(2, 0x605b4e, .35);
        g.beginPath(); g.moveTo(x - 61, y - 25); g.lineTo(x + 57, y - 38); g.strokePath();
      }
    }

    // Damp barefoot impressions: subdued enough to be discovered, not quest-marker blue.
    for (const [fx,fy,flip] of [[470,1112,0],[486,1091,1],[470,1067,0]] as Array<[number,number,number]>) {
      g.fillStyle(0x4b4033, .2);
      g.fillEllipse(fx, fy, 31, 12);
      g.fillEllipse(fx + (flip ? -9 : 9), fy - 7, 9, 5);
    }

    // Wall-side ossuary shelves without the usual fantasy skull spam.
    g.fillStyle(0x211f1a, .7); g.fillRect(672, 1060, 25, 208);
    for (let sy = 1080; sy < 1250; sy += 42) {
      g.fillStyle(0x474338, .45); g.fillRect(676, sy, 17, 3);
      g.fillStyle(0xb0a68d, .16); g.fillEllipse(684, sy - 7, 13, 5);
    }
  }

  private drawHallProps(g: Phaser.GameObjects.Graphics) {
    const pedestals = [[300, 560], [450, 530], [600, 560]] as Array<[number, number]>;

    // The oath diagram is carved rather than glowing until the ritual responds.
    g.lineStyle(7, 0x0d0f0f, .44);
    g.beginPath();
    g.moveTo(300, 560); g.lineTo(450, 690); g.lineTo(600, 560);
    g.moveTo(450, 530); g.lineTo(450, 690);
    g.strokePath();
    g.lineStyle(2, 0x5e6869, .18);
    g.beginPath();
    g.moveTo(300, 560); g.lineTo(450, 690); g.lineTo(600, 560);
    g.moveTo(450, 530); g.lineTo(450, 690);
    g.strokePath();

    g.fillStyle(0x0a0a09, .72); g.fillCircle(450 + 5, 690 + 8, 45);
    g.fillStyle(0x24241f, 1); g.fillCircle(450, 690, 38);
    g.lineStyle(2, 0x6f6959, .23); g.strokeCircle(450, 690, 31);
    g.lineStyle(1, 0x8b8370, .13); g.strokeCircle(450, 690, 22);

    for (let index = 0; index < pedestals.length; index += 1) {
      const [x, y] = pedestals[index];
      g.fillStyle(0x080808, .72);
      g.fillEllipse(x + 7, y + 25, 91, 38);
      g.fillStyle(index === 2 ? 0x3a3932 : 0x454238, 1);
      g.fillCircle(x, y, 45);
      g.fillStyle(0x595448, .36);
      g.fillEllipse(x - 5, y - 8, 59, 27);
      g.lineStyle(3, 0x877f6a, .3);
      g.strokeCircle(x, y, 36);
      g.lineStyle(1, 0xa19983, .16);
      g.strokeCircle(x, y, 29);
      g.fillStyle(0x111210, 1);
      g.fillCircle(x, y, 15);
      g.lineStyle(2, 0x777565, .22);
      g.beginPath();
      if (index === 0) {
        g.moveTo(x - 8, y); g.lineTo(x + 8, y); g.moveTo(x, y - 8); g.lineTo(x, y + 8);
      } else if (index === 1) {
        g.moveTo(x, y - 9); g.lineTo(x + 7, y + 2); g.lineTo(x, y + 9); g.lineTo(x - 7, y + 2); g.closePath();
      } else {
        g.moveTo(x - 7, y - 5); g.lineTo(x + 7, y + 5);
        g.moveTo(x + 7, y - 5); g.lineTo(x - 7, y + 5);
      }
      g.strokePath();
    }

    // Broken concentric engraving around the central seal.
    for (const radius of [86, 128, 172]) {
      g.lineStyle(1, 0x5b5b50, radius === 86 ? .15 : .09);
      g.strokeCircle(450, 655, radius);
    }
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
      const body = this.walls.create(x + w / 2, y + h / 2, 'third-oath-marker') as Phaser.Types.Physics.Arcade.ImageWithStaticBody;
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

    if (!this.save.flags.secretDoorOpen) {
      this.secretDoorBlocker = wall(400, 1678, 100, 34);
      this.secretDoorVisual = this.createBarrierVisual(400, 1678, 100, 34, 'stone');
    }
    if (!this.save.flags.cryptWardenDefeated) {
      this.cryptDoorBlocker = wall(400, 988, 100, 36);
      this.cryptDoorVisual = this.createBarrierVisual(400, 988, 100, 36, 'gate');
    }
    if (!this.save.flags.hallAwakened) {
      this.towerDoorBlocker = wall(380, 306, 140, 40);
      this.towerDoorVisual = this.createBarrierVisual(380, 306, 140, 40, 'door');
    }
  }

  private createBarrierVisual(x: number, y: number, w: number, h: number, kind: 'stone' | 'gate' | 'door') {
    const g = this.add.graphics().setDepth(9);
    if (kind === 'stone') {
      g.fillStyle(0x3b382f, 1);
      g.fillRect(x, y, w, h);
      g.lineStyle(1, 0x746c59, .28);
      for (let xx = x + 12; xx < x + w; xx += 28) {
        g.beginPath(); g.moveTo(xx, y + 2); g.lineTo(xx - 7, y + h - 2); g.strokePath();
      }
      g.lineStyle(2, 0x171612, .75);
      g.beginPath(); g.moveTo(x + 5, y + h - 5); g.lineTo(x + w - 8, y + 6); g.strokePath();
    } else if (kind === 'gate') {
      g.fillStyle(0x11110f, .82); g.fillRect(x, y, w, h);
      g.lineStyle(4, 0x4a4a42, .94);
      for (let xx = x + 10; xx < x + w; xx += 15) {
        g.beginPath(); g.moveTo(xx, y); g.lineTo(xx, y + h); g.strokePath();
      }
      g.lineStyle(3, 0x696557, .55);
      g.beginPath(); g.moveTo(x, y + h * .54); g.lineTo(x + w, y + h * .54); g.strokePath();
    } else {
      g.fillStyle(0x201913, 1); g.fillRect(x, y, w, h);
      g.fillStyle(0x3c2e22, .88); g.fillRect(x + 8, y + 4, w - 16, h - 8);
      g.lineStyle(3, 0x6d5f4a, .55); g.strokeRect(x + 4, y + 2, w - 8, h - 4);
      g.lineStyle(2, 0x15110e, .9);
      for (let xx = x + 26; xx < x + w; xx += 28) {
        g.beginPath(); g.moveTo(xx, y + 4); g.lineTo(xx, y + h - 4); g.strokePath();
      }
      g.fillStyle(0x807056, .75); g.fillCircle(x + w - 20, y + h / 2, 3);
    }
    return g;
  }

  private createPlayer() {
    this.player = this.physics.add.image(this.save.position.x, this.save.position.y, 'third-oath-marker');
    this.player.setVisible(false).setCollideWorldBounds(true);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setCircle(10, 6, 6);
    body.setMaxVelocity(150, 150);
    this.physics.add.collider(this.player, this.walls);

    const shadow = this.add.ellipse(2, 16, 42, 18, 0x000000, .62);

    const boots = this.add.graphics();
    boots.fillStyle(0x181713, 1);
    boots.fillEllipse(-7, 15, 9, 15);
    boots.fillEllipse(7, 15, 9, 15);
    boots.fillStyle(0x514637, .28);
    boots.fillRect(-10, 12, 7, 3);
    boots.fillRect(3, 12, 7, 3);

    const cloak = this.add.graphics();
    cloak.fillStyle(0x171b1c, .96);
    cloak.beginPath();
    cloak.moveTo(-15, -2); cloak.lineTo(-17, 11); cloak.lineTo(-8, 29);
    cloak.lineTo(0, 33); cloak.lineTo(9, 29); cloak.lineTo(17, 11); cloak.lineTo(14, -2); cloak.closePath();
    cloak.fillPath();
    cloak.fillStyle(0x31383a, .68);
    cloak.beginPath();
    cloak.moveTo(-9, 2); cloak.lineTo(-9, 20); cloak.lineTo(0, 29); cloak.lineTo(8, 20); cloak.lineTo(9, 2); cloak.closePath();
    cloak.fillPath();
    cloak.lineStyle(1, 0x777a74, .2);
    cloak.beginPath(); cloak.moveTo(-13, 8); cloak.lineTo(0, 31); cloak.lineTo(13, 8); cloak.strokePath();
    cloak.lineStyle(1, 0x131515, .78);
    cloak.beginPath(); cloak.moveTo(0, 5); cloak.lineTo(0, 29); cloak.strokePath();
    this.knightCloak = cloak;

    const torso = this.add.graphics();
    // mail shadow / tunic
    torso.fillStyle(0x232725, 1); torso.fillRoundedRect(-13, -7, 26, 28, 7);
    torso.fillStyle(0x505451, 1); torso.fillRoundedRect(-10, -6, 20, 24, 6);
    torso.fillStyle(0x77786f, .34); torso.fillRect(-8, -4, 16, 4);
    // belt, buckle and breast strap
    torso.fillStyle(0x211b15, 1); torso.fillRect(-11, 9, 22, 5);
    torso.fillStyle(0x9a8059, .72); torso.fillRect(-2, 9, 4, 5);
    torso.lineStyle(2, 0x2b241b, .8);
    torso.beginPath(); torso.moveTo(-8, -4); torso.lineTo(8, 10); torso.strokePath();
    // asymmetrical pauldrons
    torso.fillStyle(0x686a64, .92); torso.fillEllipse(-13, -3, 11, 9);
    torso.fillStyle(0x4b504e, .96); torso.fillEllipse(13, -2, 10, 8);
    torso.lineStyle(1, 0xa8a294, .3); torso.strokeEllipse(-13, -3, 10, 8);
    // hood / head with warm skin barely visible
    torso.fillStyle(0x1c1d1b, 1); torso.fillCircle(0, -14, 10);
    torso.fillStyle(0x977d5c, .9); torso.fillEllipse(0, -13, 10, 9);
    torso.fillStyle(0x252724, 1);
    torso.beginPath();
    torso.moveTo(-9, -16); torso.lineTo(-5, -23); torso.lineTo(5, -23); torso.lineTo(10, -15);
    torso.lineTo(6, -9); torso.lineTo(0, -12); torso.lineTo(-6, -9); torso.closePath();
    torso.fillPath();
    torso.lineStyle(1, 0x7d7b72, .22); torso.beginPath(); torso.moveTo(-5,-20); torso.lineTo(5,-20); torso.strokePath();

    const shield = this.add.graphics();
    shield.fillStyle(0x16191a, .72);
    shield.beginPath();
    shield.moveTo(-11, -14); shield.lineTo(10, -10); shield.lineTo(11, 6); shield.lineTo(0, 18); shield.lineTo(-12, 6); shield.closePath();
    shield.fillPath();
    shield.lineStyle(2, 0x8b8069, .82); shield.strokePath();
    shield.fillStyle(0x394144, .82);
    shield.beginPath();
    shield.moveTo(-7, -10); shield.lineTo(6, -7); shield.lineTo(7, 4); shield.lineTo(0, 12); shield.lineTo(-8, 4); shield.closePath();
    shield.fillPath();
    shield.lineStyle(1, 0x9a9180, .42); shield.strokePath();
    shield.lineStyle(2, 0xb39a6f, .38);
    shield.beginPath(); shield.moveTo(0, -7); shield.lineTo(0, 10); shield.strokePath();
    shield.fillStyle(0x9d895f, .65);
    shield.fillCircle(0, 1, 2.2);
    this.knightShield = this.add.container(-17, 1, [shield]);

    const hammerG = this.add.graphics();
    hammerG.fillStyle(0x4c3927, 1); hammerG.fillRoundedRect(-2, -19, 4, 31, 1);
    hammerG.fillStyle(0x242827, 1); hammerG.fillRoundedRect(-12, -26, 24, 10, 2);
    hammerG.fillStyle(0x555957, .72); hammerG.fillRect(-10, -24, 20, 3);
    hammerG.lineStyle(1, 0xb0a893, .38); hammerG.strokeRoundedRect(-12, -26, 24, 10, 2);
    hammerG.fillStyle(0x242522, 1); hammerG.fillRect(8, -23, 8, 4);
    this.knightHammer = this.add.container(17, 3, [hammerG]);
    this.knightHammer.rotation = .3;

    this.knight = this.add.container(this.player.x, this.player.y, [shadow, boots, cloak, torso, this.knightShield, this.knightHammer]).setDepth(40);
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
    this.secretDoorVisual?.destroy();
    this.secretDoorBlocker = null;
    this.secretDoorVisual = null;
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
      this.towerDoorVisual?.destroy();
      this.towerDoorBlocker = null;
      this.towerDoorVisual = null;
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

    const shadow = this.add.ellipse(2, 15, 42, 17, 0x000000, .68);
    const cloak = this.add.graphics();
    cloak.fillStyle(0x111310, 1);
    cloak.beginPath();
    cloak.moveTo(-16, -4); cloak.lineTo(-18, 12); cloak.lineTo(-9, 31); cloak.lineTo(0, 35);
    cloak.lineTo(10, 31); cloak.lineTo(18, 12); cloak.lineTo(15, -4); cloak.closePath();
    cloak.fillPath();
    cloak.fillStyle(0x25271f, .92); cloak.fillRoundedRect(-12, -8, 24, 27, 7);
    cloak.fillStyle(0x090a09, 1); cloak.fillCircle(0, -14, 11);
    cloak.fillStyle(0x5b4a38, .28); cloak.fillEllipse(0, -13, 9, 6);
    cloak.lineStyle(2, 0x5f4d3b, .72);
    cloak.beginPath(); cloak.moveTo(-9, -1); cloak.lineTo(9, 6); cloak.strokePath();
    cloak.lineStyle(1, 0x7f735f, .18);
    cloak.beginPath(); cloak.moveTo(-10, 12); cloak.lineTo(0, 31); cloak.lineTo(10, 12); cloak.strokePath();
    const weapon = this.add.graphics();
    weapon.lineStyle(4, 0x4d4d46, 1); weapon.beginPath(); weapon.moveTo(13, -12); weapon.lineTo(23, 19); weapon.strokePath();
    weapon.fillStyle(0x282a27, 1); weapon.fillRect(18, 14, 17, 6);
    weapon.fillStyle(0x66645a, .46); weapon.fillRect(19, 15, 14, 2);
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
    if (!canUseOath(this.save.resolve) || (this.mode !== 'explore' && this.mode !== 'combat')) {
      if (!canUseOath(this.save.resolve)) this.toast('Недостаточно решимости.');
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
    this.cryptDoorVisual?.destroy();
    this.cryptDoorBlocker = null;
    this.cryptDoorVisual = null;
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

  saveNow() {
    this.commitSave();
  }

  pauseWorld() {
    if (this.mode === 'pause') return;
    this.modeBeforePause = this.mode;
    this.setMode('pause');
    this.physics.world.pause();
    this.time.paused = true;
    this.tweens.pauseAll();
  }

  resumeWorld() {
    if (this.mode !== 'pause') return;
    this.physics.world.resume();
    this.time.paused = false;
    this.tweens.resumeAll();
    const target = this.modeBeforePause === 'pause' ? 'explore' : this.modeBeforePause;
    if (target === 'dialogue' && this.currentDialogue) this.startDialogue(this.currentDialogue.id);
    else this.setMode(target);
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
    this.autosaveClock -= dt;
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

    if (this.autosaveClock <= 0 && (this.mode === 'explore' || this.mode === 'combat')) {
      this.autosaveClock = 5;
      this.commitSave();
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
    saveNow: () => scene.saveNow(),
    destroy: () => {
      inputState.moveX = 0; inputState.moveY = 0; inputState.guardHeld = false; inputState.attackHeld = false;
      game.destroy(true);
    }
  };
}
