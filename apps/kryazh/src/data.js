export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 48;
export const SEA_LEVEL = 19;

const block = (id, name, color, extra = {}) => ({
  id, name, color, solid: true, opaque: true, hardness: 1, stack: 64,
  preferredTool: null, requiredTier: 0, drops: id, ...extra
});

export const BLOCKS = [
  block(0, 'Air', '#000000', { solid: false, opaque: false, hardness: 0, drops: 0, stack: 0 }),
  block(1, 'Meadow Turf', '#6f9d4d', { hardness: .55, preferredTool: 'shovel', drops: 2 }),
  block(2, 'Loam', '#7a5135', { hardness: .5, preferredTool: 'shovel' }),
  block(3, 'Ridge Stone', '#767873', { hardness: 1.6, preferredTool: 'pickaxe', requiredTier: 1, drops: 12 }),
  block(4, 'Amber Sand', '#d7bd72', { hardness: .45, preferredTool: 'shovel', gravity: true }),
  block(5, 'Salt Snow', '#e8f0ef', { hardness: .3, preferredTool: 'shovel' }),
  block(6, 'Mire Clay', '#536850', { hardness: .65, preferredTool: 'shovel' }),
  block(7, 'Water', '#3b80a4', { solid: false, opaque: false, liquid: true, hardness: Infinity, drops: 0 }),
  block(8, 'Emberwood Log', '#7a4b2e', { hardness: 1.1, preferredTool: 'axe', flammable: true, axis: true }),
  block(9, 'Emberwood Leaves', '#4d7f3f', { hardness: .22, opaque: false, flammable: true, decay: true, drops: 0 }),
  block(10, 'Pale Log', '#d8d1b8', { hardness: 1.05, preferredTool: 'axe', flammable: true, axis: true }),
  block(11, 'Pale Leaves', '#7ea864', { hardness: .22, opaque: false, flammable: true, decay: true, drops: 0 }),
  block(12, 'Rubble', '#85827a', { hardness: 1.2, preferredTool: 'pickaxe', requiredTier: 1 }),
  block(13, 'Copper Bloom', '#8f7665', { hardness: 2.2, preferredTool: 'pickaxe', requiredTier: 1, drops: 45 }),
  block(14, 'Tin Vein', '#9aa7a5', { hardness: 2.35, preferredTool: 'pickaxe', requiredTier: 2, drops: 46 }),
  block(15, 'Sunstone', '#d9a64c', { hardness: 2.8, preferredTool: 'pickaxe', requiredTier: 2, drops: 47, light: 5 }),
  block(16, 'Deep Slate', '#3e4548', { hardness: 2.7, preferredTool: 'pickaxe', requiredTier: 2 }),
  block(17, 'Root Bed', '#202427', { hardness: Infinity, drops: 0 }),
  block(18, 'Ember Planks', '#a56e43', { hardness: .85, preferredTool: 'axe', flammable: true }),
  block(19, 'Pale Planks', '#d1b887', { hardness: .85, preferredTool: 'axe', flammable: true }),
  block(20, 'Stone Brick', '#85877f', { hardness: 1.8, preferredTool: 'pickaxe', requiredTier: 1 }),
  block(21, 'Glassleaf', '#9fd1c8', { hardness: .25, opaque: false, drops: 0 }),
  block(22, 'Glow Reed', '#d9dd6d', { solid: false, opaque: false, hardness: .1, drops: 52, light: 9, plant: true }),
  block(23, 'Tall Grass', '#78a85f', { solid: false, opaque: false, hardness: .08, drops: 0, plant: true }),
  block(24, 'Bluecap', '#6687a9', { solid: false, opaque: false, hardness: .08, drops: 53, plant: true }),
  block(25, 'Farmland', '#5d3c2b', { hardness: .55, preferredTool: 'shovel', hydratedVariant: 26 }),
  block(26, 'Wet Farmland', '#493226', { hardness: .55, preferredTool: 'shovel', dryVariant: 25 }),
  block(27, 'Sprout', '#73a24f', { solid: false, opaque: false, hardness: .08, drops: 54, plant: true, crop: 1 }),
  block(28, 'Young Crop', '#94b652', { solid: false, opaque: false, hardness: .08, drops: 54, plant: true, crop: 2 }),
  block(29, 'Ripe Crop', '#d2bd5b', { solid: false, opaque: false, hardness: .08, drops: 55, plant: true, crop: 3 }),
  block(30, 'Craft Bench', '#8b5e3b', { hardness: 1, preferredTool: 'axe', functional: 'craft' }),
  block(31, 'Kiln', '#555b59', { hardness: 2, preferredTool: 'pickaxe', requiredTier: 1, functional: 'furnace' }),
  block(32, 'Crate', '#8a633d', { hardness: 1, preferredTool: 'axe', functional: 'chest' }),
  block(33, 'Ladder', '#b58a52', { solid: false, opaque: false, hardness: .35, preferredTool: 'axe', climbable: true }),
  block(34, 'Torch', '#e79e4a', { solid: false, opaque: false, hardness: .1, light: 12, drops: 34 }),
  block(35, 'Door', '#8d633e', { opaque: false, hardness: .8, preferredTool: 'axe', functional: 'door', thin: true }),
  block(36, 'Fence', '#9a7046', { opaque: false, hardness: .9, preferredTool: 'axe', fence: true }),
  block(37, 'Wood Slab', '#a56e43', { opaque: true, hardness: .75, preferredTool: 'axe', slab: true }),
  block(38, 'Stone Steps', '#797b76', { opaque: true, hardness: 1.5, preferredTool: 'pickaxe', requiredTier: 1, stairs: true }),
  block(39, 'Coal Peat', '#4c4844', { hardness: .7, preferredTool: 'shovel', drops: 51 }),
  block(40, 'Ice', '#9bc7d1', { hardness: .5, opaque: false, slippery: true }),
  block(41, 'Basalt', '#4a4b4a', { hardness: 2.5, preferredTool: 'pickaxe', requiredTier: 2 }),
  block(42, 'Luminous Ore', '#61c9b8', { hardness: 3.2, preferredTool: 'pickaxe', requiredTier: 3, drops: 48, light: 7 }),
  block(43, 'Fire', '#f48742', { solid: false, opaque: false, hardness: 0, drops: 0, light: 14, fire: true }),
];

export const BLOCK_BY_ID = Object.fromEntries(BLOCKS.map((b) => [b.id, b]));

const item = (id, name, icon, extra = {}) => ({ id, name, icon, stack: 64, ...extra });
export const ITEMS = [
  ...BLOCKS.filter((b) => b.id > 0 && b.drops !== 0).map((b) => item(b.id, b.name, `block:${b.id}`, { place: b.id, stack: b.stack })),
  item(44, 'Raw Copper', 'ore:copper'), item(45, 'Copper Bloom', 'ore:copper'),
  item(46, 'Tin Chunk', 'ore:tin'), item(47, 'Sunstone Shard', 'ore:sun'), item(48, 'Lumen Crystal', 'ore:lumen'),
  item(49, 'Stick', 'tool:stick'), item(50, 'Fiber', 'food:fiber'), item(51, 'Coal Peat', 'ore:coal', { fuel: 80 }),
  item(52, 'Glow Reed', 'plant:reed'), item(53, 'Bluecap', 'plant:cap', { food: 2 }), item(54, 'Grain Seed', 'plant:seed'), item(55, 'Grain', 'food:grain', { food: 3 }),
  item(56, 'Raw Meat', 'food:raw', { food: 2 }), item(57, 'Roasted Meat', 'food:cooked', { food: 7 }), item(58, 'Flatbread', 'food:bread', { food: 5 }),
  item(59, 'Copper Ingot', 'ore:copperbar'), item(60, 'Tin Ingot', 'ore:tinbar'), item(61, 'Bronze Ingot', 'ore:bronze'),
  item(62, 'Wood Pick', 'tool:pick', { tool: 'pickaxe', tier: 1, speed: 2.2, damage: 2, durability: 55, stack: 1 }),
  item(63, 'Stone Pick', 'tool:pick', { tool: 'pickaxe', tier: 2, speed: 4.2, damage: 3, durability: 120, stack: 1 }),
  item(64, 'Bronze Pick', 'tool:pick', { tool: 'pickaxe', tier: 3, speed: 6.2, damage: 4, durability: 260, stack: 1 }),
  item(65, 'Wood Axe', 'tool:axe', { tool: 'axe', tier: 1, speed: 2.5, damage: 4, durability: 55, stack: 1 }),
  item(66, 'Stone Axe', 'tool:axe', { tool: 'axe', tier: 2, speed: 4.4, damage: 5, durability: 120, stack: 1 }),
  item(67, 'Wood Shovel', 'tool:shovel', { tool: 'shovel', tier: 1, speed: 2.8, damage: 2, durability: 55, stack: 1 }),
  item(68, 'Stone Shovel', 'tool:shovel', { tool: 'shovel', tier: 2, speed: 5, damage: 3, durability: 120, stack: 1 }),
  item(69, 'Stone Blade', 'tool:sword', { tool: 'sword', tier: 2, speed: 1, damage: 6, durability: 140, stack: 1 }),
  item(70, 'Bronze Blade', 'tool:sword', { tool: 'sword', tier: 3, speed: 1, damage: 8, durability: 300, stack: 1 }),
  item(71, 'Tiller', 'tool:hoe', { tool: 'hoe', tier: 1, speed: 1, damage: 1, durability: 80, stack: 1 }),
  item(72, 'Slingbow', 'tool:bow', { tool: 'bow', damage: 5, durability: 180, stack: 1 }),
  item(73, 'Stone Dart', 'tool:dart'), item(74, 'Buckler', 'armor:shield', { armor: 2, durability: 180, stack: 1 }),
  item(75, 'Fiber Hood', 'armor:head', { armorSlot: 'head', armor: 1, durability: 90, stack: 1 }),
  item(76, 'Fiber Vest', 'armor:chest', { armorSlot: 'chest', armor: 2, durability: 120, stack: 1 }),
  item(77, 'Fiber Leggings', 'armor:legs', { armorSlot: 'legs', armor: 1, durability: 110, stack: 1 }),
  item(78, 'Fiber Boots', 'armor:feet', { armorSlot: 'feet', armor: 1, durability: 80, stack: 1 }),
  item(79, 'Bronze Helm', 'armor:head', { armorSlot: 'head', armor: 2, durability: 220, stack: 1 }),
  item(80, 'Bronze Cuirass', 'armor:chest', { armorSlot: 'chest', armor: 5, durability: 300, stack: 1 }),
  item(81, 'Bronze Greaves', 'armor:legs', { armorSlot: 'legs', armor: 4, durability: 280, stack: 1 }),
  item(82, 'Bronze Boots', 'armor:feet', { armorSlot: 'feet', armor: 2, durability: 240, stack: 1 }),
];
export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export const RECIPES = [
  { id: 'planks', label: 'Planks', out: [18, 4], shapeless: [8] },
  { id: 'pale-planks', label: 'Pale Planks', out: [19, 4], shapeless: [10] },
  { id: 'sticks', label: 'Sticks', out: [49, 4], shape: [[18], [18]] },
  { id: 'bench', label: 'Craft Bench', out: [30, 1], shape: [[18,18],[18,18]] },
  { id: 'crate', label: 'Crate', out: [32, 1], shape: [[18,18,18],[18,0,18],[18,18,18]], station: true },
  { id: 'kiln', label: 'Kiln', out: [31, 1], shape: [[12,12,12],[12,0,12],[12,12,12]], station: true },
  { id: 'torch', label: 'Torch', out: [34, 4], shape: [[51],[49]] },
  { id: 'ladder', label: 'Ladder', out: [33, 4], shape: [[49,0,49],[49,49,49],[49,0,49]], station: true },
  { id: 'door', label: 'Door', out: [35, 1], shape: [[18,18],[18,18],[18,18]], station: true },
  { id: 'fence', label: 'Fence', out: [36, 3], shape: [[18,49,18],[18,49,18]], station: true },
  { id: 'slab', label: 'Wood Slab', out: [37, 6], shape: [[18,18,18]], station: true },
  { id: 'stone-brick', label: 'Stone Brick', out: [20, 4], shape: [[12,12],[12,12]], station: true },
  { id: 'wood-pick', label: 'Wood Pick', out: [62,1], shape: [[18,18,18],[0,49,0],[0,49,0]], station: true },
  { id: 'stone-pick', label: 'Stone Pick', out: [63,1], shape: [[12,12,12],[0,49,0],[0,49,0]], station: true },
  { id: 'bronze-pick', label: 'Bronze Pick', out: [64,1], shape: [[61,61,61],[0,49,0],[0,49,0]], station: true },
  { id: 'wood-axe', label: 'Wood Axe', out: [65,1], shape: [[18,18],[18,49],[0,49]], station: true },
  { id: 'stone-axe', label: 'Stone Axe', out: [66,1], shape: [[12,12],[12,49],[0,49]], station: true },
  { id: 'wood-shovel', label: 'Wood Shovel', out: [67,1], shape: [[18],[49],[49]], station: true },
  { id: 'stone-shovel', label: 'Stone Shovel', out: [68,1], shape: [[12],[49],[49]], station: true },
  { id: 'stone-blade', label: 'Stone Blade', out: [69,1], shape: [[12],[12],[49]], station: true },
  { id: 'bronze-blade', label: 'Bronze Blade', out: [70,1], shape: [[61],[61],[49]], station: true },
  { id: 'tiller', label: 'Tiller', out: [71,1], shape: [[18,18],[0,49],[0,49]], station: true },
  { id: 'slingbow', label: 'Slingbow', out: [72,1], shape: [[49,50],[49,0,50],[49,50]], station: true },
  { id: 'darts', label: 'Stone Darts', out: [73,8], shapeless: [12,49], station: true },
  { id: 'flatbread', label: 'Flatbread', out: [58,1], shape: [[55,55,55]], station: true },
];

export const SMELT_RECIPES = {
  45: { out: 59, time: 8 }, 46: { out: 60, time: 10 }, 56: { out: 57, time: 7 }
};

export const BIOMES = [
  { id: 0, name: 'Plains', surface: 1, sub: 2, fog: '#a8c7b2', sky: '#78a9c7', temp: .6, moisture: .5 },
  { id: 1, name: 'Emberwood', surface: 1, sub: 2, fog: '#8dae82', sky: '#719cb0', temp: .55, moisture: .7, tree: 8 },
  { id: 2, name: 'Pale Grove', surface: 1, sub: 2, fog: '#b9c9ad', sky: '#8bb2c7', temp: .45, moisture: .65, tree: 10 },
  { id: 3, name: 'Amber Waste', surface: 4, sub: 4, fog: '#d6c18c', sky: '#8fb3c5', temp: .95, moisture: .1 },
  { id: 4, name: 'Salt Expanse', surface: 5, sub: 2, fog: '#d9e5e7', sky: '#a5bfd0', temp: .05, moisture: .35 },
  { id: 5, name: 'High Ridges', surface: 3, sub: 3, fog: '#aeb7b3', sky: '#6e94ac', temp: .25, moisture: .4 },
  { id: 6, name: 'Mire', surface: 6, sub: 2, fog: '#708a74', sky: '#7c9e9c', temp: .7, moisture: .95 },
  { id: 7, name: 'Open Water', surface: 4, sub: 4, fog: '#719cae', sky: '#80adc3', temp: .5, moisture: 1 },
  { id: 8, name: 'Beach', surface: 4, sub: 4, fog: '#c9c09b', sky: '#87aec1', temp: .7, moisture: .6 },
];

export const CREATURE_TYPES = {
  grazer: { name: 'Moss Grazer', color: '#8ba86a', passive: true, hp: 10, speed: 1.15, drop: 56, dropCount: 2, biome: [0,1,2] },
  hopper: { name: 'Pale Hopper', color: '#d5c9ae', passive: true, hp: 6, speed: 1.7, drop: 50, dropCount: 2, biome: [0,2,4] },
  bogling: { name: 'Bogling', color: '#657b5d', neutral: true, hp: 16, speed: 1.25, damage: 3, drop: 51, biome: [6] },
  hollow: { name: 'Hollow', color: '#7c708f', hostile: true, hp: 18, speed: 1.55, damage: 4, drop: 51, night: true },
  crawler: { name: 'Stone Crawler', color: '#5f686b', hostile: true, hp: 14, speed: 1.4, damage: 3, drop: 12, cave: true },
  wisp: { name: 'Night Wisp', color: '#82b9c7', hostile: true, flying: true, hp: 8, speed: 1.9, damage: 2, drop: 48, night: true },
  ripple: { name: 'Ripplefin', color: '#4d94a7', passive: true, aquatic: true, hp: 7, speed: 1.5, drop: 56, biome: [7] },
};
