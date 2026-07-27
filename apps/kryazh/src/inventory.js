import { ITEM_BY_ID, RECIPES } from './data.js';
export const emptySlot = () => ({ id: 0, count: 0, durability: 0 });
export function createInventory(size = 36) { return Array.from({ length: size }, emptySlot); }
export function normalizeSlot(slot) {
  if (!slot || !Number.isInteger(slot.id) || !Number.isFinite(slot.count) || slot.count <= 0 || !ITEM_BY_ID[slot.id]) return emptySlot();
  const item = ITEM_BY_ID[slot.id];
  return { id: slot.id, count: Math.min(Math.floor(slot.count), item.stack ?? 64), durability: Math.max(0, Number(slot.durability) || 0) };
}
export function addItem(inv, id, count = 1, durability = 0) {
  const item = ITEM_BY_ID[id]; if (!item || count <= 0) return count;
  const max = item.stack ?? 64;
  if (max > 1) for (const slot of inv) if (slot.id === id && slot.count < max) { const take = Math.min(count, max - slot.count); slot.count += take; count -= take; if (!count) return 0; }
  for (const slot of inv) if (!slot.id) { const take = Math.min(count, max); Object.assign(slot, { id, count: take, durability: durability || item.durability || 0 }); count -= take; if (!count) return 0; }
  return count;
}
export function removeItem(inv, id, count = 1) {
  let left = count;
  for (let i = inv.length - 1; i >= 0 && left > 0; i--) if (inv[i].id === id) { const take = Math.min(left, inv[i].count); inv[i].count -= take; left -= take; if (!inv[i].count) inv[i] = emptySlot(); }
  return count - left;
}
export const countItem = (inv, id) => inv.reduce((n, s) => n + (s.id === id ? s.count : 0), 0);
function recipeNeeds(recipe) {
  const needs = new Map();
  const ids = recipe.shapeless || recipe.shape.flat().filter(Boolean);
  ids.forEach((id) => needs.set(id, (needs.get(id) || 0) + 1));
  return needs;
}
export function canCraft(inv, recipe) { return [...recipeNeeds(recipe)].every(([id, n]) => countItem(inv, id) >= n); }
export function craft(inv, recipeId, amount = 1, station = false) {
  const recipe = RECIPES.find((r) => r.id === recipeId);
  if (!recipe || (recipe.station && !station)) return 0;
  let made = 0;
  while (made < amount && canCraft(inv, recipe)) {
    const backup = inv.map((s) => ({...s}));
    for (const [id, n] of recipeNeeds(recipe)) removeItem(inv, id, n);
    if (addItem(inv, recipe.out[0], recipe.out[1]) > 0) { for (let i=0;i<inv.length;i++) inv[i]=backup[i]; break; }
    made++;
  }
  return made;
}
export function moveStack(inv, from, to, split = false) {
  if (from === to || !inv[from]) return;
  const a = inv[from], b = inv[to]; if (!a.id) return;
  if (!b.id) {
    if (split && a.count > 1) { const n = Math.ceil(a.count / 2); inv[to] = {...a, count:n}; a.count -= n; }
    else { inv[to] = a; inv[from] = emptySlot(); }
    return;
  }
  if (a.id === b.id && (ITEM_BY_ID[a.id].stack ?? 64) > 1) { const max = ITEM_BY_ID[a.id].stack ?? 64; const n = Math.min(a.count, max - b.count); b.count += n; a.count -= n; if (!a.count) inv[from] = emptySlot(); }
  else { inv[from] = b; inv[to] = a; }
}
export function damageTool(slot, amount = 1) { if (!slot?.id || !ITEM_BY_ID[slot.id]?.durability) return false; slot.durability -= amount; if (slot.durability <= 0) { Object.assign(slot, emptySlot()); return true; } return false; }
