// Launcher artwork is independent of an application's install identity and saves.
// Small marks stay stable; captured screens are reserved for the detail view.
const authored = new Set(['art-cabinet', 'oskolki', 'ne-tem-golosom']);
export function catalogIconUrl(app) {
  const path = authored.has(app.slug)
    ? `./shared/catalog-art/${app.slug}.svg?v=1`
    : `${app.path}icons/icon.svg?v=${encodeURIComponent(app.version || '0')}`;
  return new URL(path, document.baseURI).href;
}

const paths = {
  pin: '<path d="m9 3 6 0-1 6 4 4v2h-5v6l-2-3v-3H6v-2l4-4z"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  play: '<path d="m9 5 10 7-10 7z"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  up: '<path d="m6 14 6-6 6 6M12 8v12"/>',
  down: '<path d="m6 10 6 6 6-6M12 4v12"/>',
  grip: '<path d="M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01" stroke-width="3.5"/>',
  half: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 5v14"/>',
  wide: '<rect x="3" y="7" width="18" height="10" rx="2"/>',
  large: '<rect x="4" y="3" width="16" height="18" rx="2"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>'
};
export function systemIcon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.more}</svg>`;
}
