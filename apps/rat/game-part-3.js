class Regiment {
  constructor(config, team, slotIndex) {
    this.id = `${team}-${config.id}`;
    this.baseId = config.id;
    this.type = config.type;
    this.team = team;
    this.slot = config.slot;
    this.formation = config.formation;
    this.x = SLOT_X[config.slot];
    this.y = team === 0 ? 950 : 230;
    this.anchorX = this.x;
    this.anchorY = this.y;
    this.objective = { x: this.x, y: team === 0 ? 520 : 660 };
    this.manualObjective = null;
    this.morale = 1;
    this.routed = false;
    this.casualtyShock = 0;
    this.targetRegiment = null;
    this.slotIndex = slotIndex;
    this.bannerPhase = Math.random() * Math.PI * 2;
    const count = TYPE_DATA[this.type].count;
    const offsets = formationOffsets(count, this.formation, team === 0 ? -1 : 1);
    this.units = offsets.map((offset, index) => new Unit(this, offset, index));
  }
  aliveUnits() { return this.units.filter((unit) => !unit.dead && !unit.retreating); }
  activeCount() { return this.units.reduce((sum, unit) => sum + (!unit.dead && !unit.retreating ? 1 : 0), 0); }
  totalStanding() { return this.units.reduce((sum, unit) => sum + (!unit.dead ? 1 : 0), 0); }
  center() {
    const alive = this.aliveUnits();
    if (!alive.length) return { x: this.x, y: this.y };
    return {
      x: alive.reduce((sum, unit) => sum + unit.x, 0) / alive.length,
      y: alive.reduce((sum, unit) => sum + unit.y, 0) / alive.length
    };
  }
}

