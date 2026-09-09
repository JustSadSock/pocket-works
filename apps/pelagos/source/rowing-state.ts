import { clamp } from './core';

let rowingDemand = 0;

export function setRowingDemand(value: number): void {
  rowingDemand = clamp(Number.isFinite(value) ? value : 0, 0, 1);
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.pelagosRowDemand = rowingDemand.toFixed(3);
  }
}

export function getRowingDemand(): number {
  return rowingDemand;
}

export function resetRowingDemand(): void {
  setRowingDemand(0);
}
