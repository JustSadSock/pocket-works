import { describe, expect, it } from 'vitest';
import { addItem, freshSave, normalizeSave, removeItem, resolveHiddenCheck } from './state';
import { DIALOGUES, RITUAL_LINES } from './content';

describe('third-oath state', () => {
  it('normalizes corrupted values into a playable save', () => {
    const save = normalizeSave({ health: -5, maxHealth: 5, resolve: 400, inventory: ['x', 'x', 3] });
    expect(save.health).toBeGreaterThan(0);
    expect(save.resolve).toBe(100);
    expect(save.inventory).toEqual(['x']);
  });

  it('migrates a completed 0.1 save into the start of Chapter II', () => {
    const save = normalizeSave({
      schema: 1,
      completed: true,
      health: 4,
      maxHealth: 5,
      flags: { hallAwakened: true },
      position: { x: 450, y: 360 },
      checkpoint: { x: 450, y: 600 }
    });
    expect(save.schema).toBe(2);
    expect(save.chapter).toBe(2);
    expect(save.completed).toBe(false);
    expect(save.flags.chapter1Complete).toBe(true);
    expect(save.position).toEqual({ x: 450, y: 210 });
    expect(save.checkpoint).toEqual({ x: 450, y: 210 });
  });

  it('keeps item operations idempotent', () => {
    const save = freshSave();
    addItem(save, 'oath-stone');
    addItem(save, 'oath-stone');
    expect(save.inventory).toEqual(['oath-stone']);
    removeItem(save, 'oath-stone');
    expect(save.inventory).toHaveLength(0);
  });

  it('persists hidden check outcomes deterministically', () => {
    const save = freshSave();
    const first = resolveHiddenCheck(save, 'altar-seam', 'insight', 13);
    const second = resolveHiddenCheck(save, 'altar-seam', 'insight', 99);
    expect(second).toBe(first);
  });

  it('has no dangling dialogue targets', () => {
    const ids = new Set(Object.keys(DIALOGUES));
    for (const node of Object.values(DIALOGUES)) {
      for (const option of node.options) {
        if (option.next) expect(ids.has(option.next)).toBe(true);
        if (option.failNext) expect(ids.has(option.failNext)).toBe(true);
      }
    }
    expect(RITUAL_LINES).toHaveLength(4);
  });
});
