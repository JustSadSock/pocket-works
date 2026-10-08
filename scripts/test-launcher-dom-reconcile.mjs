import assert from 'node:assert/strict';
import { reconcileKeyed, setText } from '../shared/launcher-dom-reconcile.js';

const container = {
  children: [],
  moves: 0,
  insertBefore(node, anchor) {
    if (node.parentNode) node.parentNode.children.splice(node.parentNode.children.indexOf(node), 1);
    const index = anchor ? this.children.indexOf(anchor) : this.children.length;
    this.children.splice(index, 0, node);
    node.parentNode = this;
    this.moves++;
  }
};
function nodeFor(slug) {
  return {
    dataset: { slug },
    parentNode: null,
    textContent: '',
    get nextElementSibling() {
      if (!this.parentNode) return null;
      return this.parentNode.children[this.parentNode.children.indexOf(this) + 1] || null;
    },
    remove() {
      if (!this.parentNode) return;
      const list = this.parentNode.children;
      list.splice(list.indexOf(this), 1);
      this.parentNode = null;
    }
  };
}
const options = {
  key: item => item.slug,
  create: item => nodeFor(item.slug),
  patch: (node, item) => setText(node, item.name)
};
const first = [{ slug: 'a', name: 'Alpha' }, { slug: 'b', name: 'Beta' }, { slug: 'c', name: 'Gamma' }];
reconcileKeyed(container, first, options);
const originals = [...container.children];
assert.deepEqual(container.children.map(n => n.dataset.slug), ['a', 'b', 'c']);
const afterInitialMoves = container.moves;
reconcileKeyed(container, first, options);
assert.equal(container.moves, afterInitialMoves, 'unchanged list causes no DOM insertions');
assert.ok(container.children.every((node, i) => node === originals[i]), 'all elements retain identity');

const changed = [{ slug: 'c', name: 'Gamma 2' }, { slug: 'a', name: 'Alpha' }, { slug: 'd', name: 'Delta' }];
reconcileKeyed(container, changed, options);
assert.deepEqual(container.children.map(n => n.dataset.slug), ['c', 'a', 'd']);
assert.equal(container.children[0], originals[2], 'sorting reuses card DOM');
assert.equal(container.children[1], originals[0], 'filtering reuses card DOM');
assert.equal(container.children[0].textContent, 'Gamma 2', 'content is patched in place');
assert.equal(originals[1].parentNode, null, 'removed cards are detached');
reconcileKeyed(container, [], options);
assert.equal(container.children.length, 0, 'empty state clears displayed cards');
console.log('Keyed DOM list identity, reordering and empty-state checks passed.');
