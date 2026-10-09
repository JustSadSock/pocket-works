import { getRegistrySnapshot } from './launcher-registry.js';

function escapeText(value) { return String(value ?? 'unknown'); }

export function installShelfTools({ store } = {}) {
  const dialog = document.querySelector('#shelf-tools');
  const open = document.querySelector('#shelf-tools-button');
  if (!dialog || !open || !store) return;
  const close = document.querySelector('#tools-close');
  const facts = document.querySelector('#tools-facts');
  const status = document.querySelector('#tools-status');
  const importFile = document.querySelector('#tools-import-file');
  const setStatus = (message, error = false) => {
    status.textContent = message;
    status.dataset.state = error ? 'error' : 'ok';
  };
  let diagnosticText = '';

  async function inspect() {
    facts.textContent = 'Reading device information…';
    setStatus('');
    const details = [
      ['Launcher version', document.querySelector('meta[name="pocket-works-build"]')?.content],
      ['Connection', navigator.onLine ? 'Online' : 'Offline'],
      ['Library entries', getRegistrySnapshot()?.apps?.length ?? 'Not loaded'],
      ['Last registry refresh', getRegistrySnapshot()?.savedAt
        ? new Date(getRegistrySnapshot().savedAt).toLocaleString() : 'No saved registry']
    ];
    const saved = store.getStatus();
    details.push(['Personal shelf', saved.warning || (saved.localOk && saved.dbOk ? 'LocalStorage + IndexedDB' :
      saved.localOk ? 'LocalStorage' : saved.dbOk ? 'IndexedDB' : 'Not persisted')]);
    const tasks = [
      async () => ['App workers', (await navigator.serviceWorker.getRegistrations())
        .filter(reg => new URL(reg.scope).pathname.includes('/apps/')).length],
      async () => ['Browser caches', (await caches.keys()).length],
      async () => {
        const estimated = await navigator.storage?.estimate?.();
        return ['Storage usage', estimated && estimated.usage != null
          ? `${(estimated.usage / (1024 * 1024)).toFixed(1)} MiB` : 'Not supported'];
      },
      async () => {
        const registration = await navigator.serviceWorker.getRegistration('./');
        return ['Launcher worker', registration?.active ? 'Active' : 'Not active'];
      }
    ];
    const inspected = await Promise.all(tasks.map(task => task().catch(error => ['Check unavailable', error.message])));
    details.push(...inspected);
    diagnosticText = details.map(([name, value]) => `${name}: ${escapeText(value)}`).join('\n');
    facts.replaceChildren();
    for (const [name, value] of details) {
      const item = document.createElement('div');
      const label = document.createElement('span');
      const result = document.createElement('strong');
      label.textContent = name;
      result.textContent = escapeText(value);
      item.append(label, result);
      facts.append(item);
    }
    return diagnosticText;
  }

  open.addEventListener('click', () => {
    if (!dialog.open) dialog.showModal();
    void inspect();
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  document.querySelector('#tools-recheck').addEventListener('click', () => void inspect());

  document.querySelector('#tools-copy').addEventListener('click', async () => {
    try {
      if (!diagnosticText) await inspect();
      await navigator.clipboard.writeText(diagnosticText);
      setStatus('Diagnostics copied.');
    } catch (error) { setStatus(`Unable to copy diagnostics: ${error.message}`, true); }
  });

  document.querySelector('#tools-export').addEventListener('click', () => {
    try {
      const text = JSON.stringify(store.exportBackup(), null, 2);
      const file = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `pocket-works-shelf-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('Shelf backup exported. Keep the file somewhere safe.');
    } catch (error) { setStatus(`Export failed: ${error.message}`, true); }
  });

  document.querySelector('#tools-import').addEventListener('click', () => {
    importFile.value = '';
    importFile.click();
  });
  importFile.addEventListener('change', async () => {
    const file = importFile.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setStatus('Backup exceeds the 1 MiB limit.', true);
      return;
    }
    try {
      const record = JSON.parse(await file.text());
      if (record?.schema !== 'pocket-works-personal-shelf-v2') {
        throw new Error('Unsupported backup format');
      }
      if (!window.confirm('Replace saved favorites, recents and sorting with this backup?')) return;
      await store.importBackup(record);
      setStatus('Personal shelf imported and saved.');
      await inspect();
      setStatus('Personal shelf imported and saved.');
    } catch (error) { setStatus(`Import failed: ${error.message}`, true); }
  });

  document.querySelector('#tools-repair').addEventListener('click', async () => {
    if (!navigator.onLine) {
      setStatus('An internet connection is required to repair the launcher.', true);
      return;
    }
    if (!window.confirm('Clear only the Pocket Works launcher cache and reload? Installed games and saved progress are kept.')) return;
    const button = document.querySelector('#tools-repair');
    button.disabled = true;
    setStatus('Repairing launcher cache…');
    try {
      const names = (await caches.keys()).filter(name => name.startsWith('pocket-works-launcher-'));
      await Promise.all(names.map(name => caches.delete(name)));
      const registration = await navigator.serviceWorker.getRegistration('./');
      // A same-version update() does not reinstall the worker or refill its precache.
      // Re-registering after reload always executes the normal atomic install.
      await registration?.unregister();
      setStatus('Launcher cache cleared. Reloading and reinstalling current shell…');
      location.reload();
    } catch (error) {
      button.disabled = false;
      setStatus(`Repair failed: ${error.message}`, true);
    }
  });

  // These are routed through the same controls as the launcher, not shadow buttons.
  window.addEventListener('pocketworks:shell-tools-open', () => {
    open.click();
  });
  return { inspect, setStatus };
}
