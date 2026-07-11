export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export async function registerAppServiceWorker(path = './sw.js') {
  if (!('serviceWorker' in navigator)) return null;

  try {
    return await navigator.serviceWorker.register(path);
  } catch (error) {
    console.warn('Service worker registration failed', error);
    return null;
  }
}

export function createStorage(namespace) {
  if (!namespace || /\s/.test(namespace)) {
    throw new TypeError('Storage namespace must be a non-empty string without spaces');
  }

  const key = (name) => `${namespace}:${name}`;

  return {
    get(name, fallback = null) {
      try {
        const raw = localStorage.getItem(key(name));
        return raw === null ? fallback : JSON.parse(raw);
      } catch (error) {
        console.warn(`Could not read ${key(name)}`, error);
        return fallback;
      }
    },

    set(name, value) {
      try {
        localStorage.setItem(key(name), JSON.stringify(value));
        return true;
      } catch (error) {
        console.warn(`Could not write ${key(name)}`, error);
        return false;
      }
    },

    remove(name) {
      localStorage.removeItem(key(name));
    }
  };
}

export function watchConnectivity(onChange) {
  const emit = () => onChange(navigator.onLine);
  window.addEventListener('online', emit);
  window.addEventListener('offline', emit);
  emit();

  return () => {
    window.removeEventListener('online', emit);
    window.removeEventListener('offline', emit);
  };
}
