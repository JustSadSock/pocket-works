export const STORAGE_KEY = 'pocket-works:bastion-bolt:profile';

export const AMMO = {
  bolt: {
    label: 'обычный болт', speed: 1, gravity: 1, wind: 1, drag: .006, mass: 7,
    damage: 52, radius: .28, fracture: 2.2, penetration: .58, restitution: .34,
    color: [.32,.19,.10], tip: [.72,.72,.65], trail: false,
    wood: 1.05, stone: .64, metal: .42,
  },
  heavy: {
    label: 'тяжёлый болт', speed: .88, gravity: 1.08, wind: .64, drag: .008, mass: 16,
    damage: 88, radius: .42, fracture: 3.1, penetration: 1.18, restitution: .24,
    color: [.24,.14,.08], tip: [.48,.48,.44], trail: false,
    wood: 1.12, stone: 1.32, metal: .82,
  },
  fire: {
    label: 'зажигательный', speed: .94, gravity: 1.02, wind: 1.12, drag: .007, mass: 8,
    damage: 38, radius: .32, fracture: 2.6, penetration: .5, restitution: .2,
    color: [.26,.11,.05], tip: [1,.30,.08], trail: true,
    wood: 2.35, stone: .32, metal: .24,
  },
  stone: {
    label: 'каменный снаряд', speed: .73, gravity: 1.16, wind: .72, drag: .014, mass: 34,
    damage: 74, radius: 1.05, fracture: 5.8, penetration: .18, restitution: .12,
    color: [.32,.31,.27], tip: [.38,.37,.32], trail: false,
    wood: 1.45, stone: 1.16, metal: .56,
  },
};

export const CAMPAIGN = [
  { id: 'breach', label: 'ЭТАП I · ПРОЛОМ', objective: 'Разрушьте главные ворота', reward: { heavy: 1, fire: 1 }, volley: 20 },
  { id: 'silence', label: 'ЭТАП II · ТИШИНА НА СТЕНАХ', objective: 'Выведите из строя обе башни', reward: { heavy: 1, stone: 1 }, volley: 17 },
  { id: 'heart', label: 'ЭТАП III · СЕРДЦЕ КРЕПОСТИ', objective: 'Обрушьте донжон', reward: {}, volley: 14 },
];
