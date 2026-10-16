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
    facts.textContent = 'Проверяем устройство…';
    setStatus('');
    const details = [
      ['Версия оболочки', document.querySelector('meta[name="pocket-works-build"]')?.content],
      ['Подключение', navigator.onLine ? 'Онлайн' : 'Без интернета'],
      ['Приложений', getRegistrySnapshot()?.apps?.length ?? 'Не загружено'],
      ['Каталог обновлён', getRegistrySnapshot()?.savedAt
        ? new Date(getRegistrySnapshot().savedAt).toLocaleString() : 'Копии пока нет']
    ];
    const saved = store.getStatus();
    details.push(['Моя коллекция', saved.warning || (saved.localOk && saved.dbOk ? 'LocalStorage + IndexedDB' :
      saved.localOk ? 'LocalStorage' : saved.dbOk ? 'IndexedDB' : 'Не сохранено')]);
    const tasks = [
      async () => ['Установленных приложений', (await navigator.serviceWorker.getRegistrations())
        .filter(reg => new URL(reg.scope).pathname.includes('/apps/')).length],
      async () => ['Кешей браузера', (await caches.keys()).length],
      async () => {
        const estimated = await navigator.storage?.estimate?.();
        return ['Занято на устройстве', estimated && estimated.usage != null
          ? `${(estimated.usage / (1024 * 1024)).toFixed(1)} MiB` : 'Недоступно'];
      },
      async () => {
        const registration = await navigator.serviceWorker.getRegistration('./');
        return ['Кеш оболочки', registration?.active ? 'Активен' : 'Не активен'];
      }
    ];
    const inspected = await Promise.all(tasks.map(task => task().catch(error => ['Проверка недоступна', error.message])));
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
      setStatus('Отчёт скопирован.');
    } catch (error) { setStatus(`Не удалось скопировать отчёт: ${error.message}`, true); }
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
      setStatus('Резервная копия скачана.');
    } catch (error) { setStatus(`Не удалось скачать копию: ${error.message}`, true); }
  });

  document.querySelector('#tools-import').addEventListener('click', () => {
    importFile.value = '';
    importFile.click();
  });
  importFile.addEventListener('change', async () => {
    const file = importFile.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setStatus('Файл больше 1 МБ.', true);
      return;
    }
    try {
      const record = JSON.parse(await file.text());
      if (record?.schema !== 'pocket-works-personal-shelf-v2') {
        throw new Error('Неподдерживаемый формат копии');
      }
      if (!window.confirm('Восстановить избранное, недавние приложения и сортировку из этого файла?')) return;
      await store.importBackup(record);
      setStatus('Моя коллекция imported and saved.');
      await inspect();
      setStatus('Моя коллекция imported and saved.');
    } catch (error) { setStatus(`Не удалось восстановить: ${error.message}`, true); }
  });

  document.querySelector('#tools-repair').addEventListener('click', async () => {
    if (!navigator.onLine) {
      setStatus('Для восстановления оболочки нужен интернет.', true);
      return;
    }
    if (!window.confirm('Очистить кеш оболочки и перезагрузить PocketWorks? Игры и сохранения останутся на месте.')) return;
    const button = document.querySelector('#tools-repair');
    button.disabled = true;
    setStatus('Восстанавливаем оболочку…');
    try {
      const names = (await caches.keys()).filter(name => name.startsWith('pocket-works-launcher-'));
      await Promise.all(names.map(name => caches.delete(name)));
      const registration = await navigator.serviceWorker.getRegistration('./');
      // A same-version update() does not reinstall the worker or refill its precache.
      // Re-registering after reload always executes the normal atomic install.
      await registration?.unregister();
      setStatus('Кеш очищен. Загружаем актуальную оболочку…');
      location.reload();
    } catch (error) {
      button.disabled = false;
      setStatus(`Не удалось восстановить: ${error.message}`, true);
    }
  });

  // These are routed through the same controls as the launcher, not shadow buttons.
  window.addEventListener('pocketworks:shell-tools-open', () => {
    open.click();
  });
  return { inspect, setStatus };
}
