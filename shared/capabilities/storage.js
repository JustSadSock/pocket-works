function assertNamespace(namespace) {
  if (typeof namespace !== 'string' || namespace.trim() === '' || /\s/.test(namespace)) {
    throw new TypeError('Storage namespace must be a non-empty string without spaces');
  }
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

export function listNamespaceKeys(namespace) {
  assertNamespace(namespace);
  const prefix = `${namespace}:`;
  return Object.keys(localStorage).filter((key) => key.startsWith(prefix));
}

export function estimateNamespaceBytes(namespace) {
  return listNamespaceKeys(namespace).reduce((total, key) => {
    return total + byteLength(key) + byteLength(localStorage.getItem(key) || '');
  }, 0);
}

export function clearNamespace(namespace) {
  for (const key of listNamespaceKeys(namespace)) localStorage.removeItem(key);
}

export function createVersionedStore(options = {}) {
  const {
    namespace,
    version = 1,
    defaults = {},
    migrations = {},
    validate = (value) => value && typeof value === 'object' && !Array.isArray(value),
    onError = (error) => console.warn(`Storage failure for ${namespace}`, error)
  } = options;

  assertNamespace(namespace);
  if (!Number.isInteger(version) || version < 1) throw new TypeError('Store version must be a positive integer');

  const storageKey = `${namespace}:state`;
  const subscribers = new Set();
  let state = clone(defaults);

  const notify = () => {
    const snapshot = clone(state);
    for (const subscriber of subscribers) subscriber(snapshot);
  };

  const persist = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        version,
        updatedAt: new Date().toISOString(),
        data: state
      }));
      return true;
    } catch (error) {
      onError(error);
      return false;
    }
  };

  const load = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        state = clone(defaults);
        return state;
      }

      const envelope = JSON.parse(raw);
      let data = envelope?.data;
      let storedVersion = Number.isInteger(envelope?.version) ? envelope.version : 1;

      while (storedVersion < version) {
        const migrate = migrations[storedVersion];
        if (typeof migrate !== 'function') {
          throw new Error(`Missing migration from version ${storedVersion}`);
        }
        data = migrate(clone(data));
        storedVersion += 1;
      }

      if (storedVersion !== version || !validate(data)) {
        throw new Error('Stored state failed version or shape validation');
      }

      state = { ...clone(defaults), ...clone(data) };
      if (envelope.version !== version) persist();
      return state;
    } catch (error) {
      onError(error);
      state = clone(defaults);
      return state;
    }
  };

  load();

  return {
    namespace,
    version,
    get(name, fallback = null) {
      return Object.prototype.hasOwnProperty.call(state, name) ? clone(state[name]) : fallback;
    },
    getAll() {
      return clone(state);
    },
    set(name, value) {
      state[name] = clone(value);
      const saved = persist();
      notify();
      return saved;
    },
    patch(values) {
      if (!values || typeof values !== 'object' || Array.isArray(values)) {
        throw new TypeError('Store patch must be an object');
      }
      state = { ...state, ...clone(values) };
      const saved = persist();
      notify();
      return saved;
    },
    remove(name) {
      delete state[name];
      const saved = persist();
      notify();
      return saved;
    },
    replace(nextState) {
      if (!validate(nextState)) throw new TypeError('Replacement state failed validation');
      state = { ...clone(defaults), ...clone(nextState) };
      const saved = persist();
      notify();
      return saved;
    },
    reset() {
      state = clone(defaults);
      localStorage.removeItem(storageKey);
      notify();
    },
    clearNamespace() {
      clearNamespace(namespace);
      state = clone(defaults);
      notify();
    },
    export() {
      return {
        schema: 'pocket-works-store',
        namespace,
        version,
        exportedAt: new Date().toISOString(),
        data: clone(state)
      };
    },
    import(payload) {
      if (payload?.schema !== 'pocket-works-store') throw new TypeError('Unsupported store export');
      if (payload.namespace !== namespace) throw new TypeError('Store export belongs to another application');
      if (payload.version !== version) throw new TypeError(`Expected store version ${version}`);
      return this.replace(payload.data);
    },
    subscribe(callback) {
      subscribers.add(callback);
      callback(clone(state));
      return () => subscribers.delete(callback);
    },
    estimateBytes() {
      return estimateNamespaceBytes(namespace);
    }
  };
}
