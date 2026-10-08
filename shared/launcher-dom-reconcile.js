// Stable keyed DOM reconciliation. Unchanged cards preserve their DOM nodes,
// focus, icon preview and running animations across search, sort and refresh.
export function reconcileKeyed(container, items, { key, create, patch, remove } = {}) {
  if (!container || !Array.isArray(items)) throw new TypeError('Invalid keyed list');
  const existing = new Map();
  for (const node of [...container.children]) {
    if (node.dataset?.slug) existing.set(node.dataset.slug, node);
  }
  let anchor = null;
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    const id = key(item);
    let node = existing.get(id);
    if (node) existing.delete(id);
    else node = create(item);
    patch(node, item, index);
    if (node.nextElementSibling !== anchor || node.parentNode !== container) {
      container.insertBefore(node, anchor);
    }
    anchor = node;
  }
  for (const node of existing.values()) {
    remove?.(node);
    node.remove();
  }
}

export function setText(element, text) {
  const next = String(text ?? '');
  if (element.textContent !== next) element.textContent = next;
}
