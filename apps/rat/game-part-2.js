class Unit {
  constructor(regiment, offset, index) {
    const data = TYPE_DATA[regiment.type];
    this.regiment = regiment;
    this.team = regiment.team;
    this.type = regiment.type;
    this.index = index;
    this.x = regiment.x + offset.x;
    this.y = regiment.y + offset.y;
    this.previousX = this.x;
    this.previousY = this.y;
    this.vx = 0;
    this.vy = 0;
    this.hp = data.hp;
    this.maxHp = data.hp;
    this.speed = data.speed * rand(.94, 1.06);
    this.cooldown = rand(0, .45);
    this.attackAnim = 0;
    this.hitFlash = 0;
    this.dead = false;
    this.deathTime = 0;
    this.retreating = false;
    this.seed = Math.random() * Math.PI * 2;
    this.direction = regiment.team === 0 ? 'up' : 'down';
    this.facing = regiment.team === 0 ? -Math.PI / 2 : Math.PI / 2;
    this.target = null;
    this.retarget = 0;
    this.offset = offset;
    this.radius = regiment.type === 'spears' ? 10.5 : 10;
    this.mass = regiment.type === 'spears' ? 1.18 : regiment.type === 'archers' ? .9 : 1;
    this.walkCycle = Math.random() * 4;
    this.contact = 0;
    this.clashCooldown = rand(0, .5);
    this.blocked = 0;
    this.swingSide = Math.random() < .5 ? -1 : 1;
  }
}
