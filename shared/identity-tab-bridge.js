// Pocket ID session changes travel between tabs without sending identity data.
// The receiving tab always resolves the current account from /pocket-id/me.
export const ACCOUNT_SIGNAL_KEY = 'pocket-works:identity-session-revision';

export function createIdentityTabBridge({
  onChange,
  BroadcastChannelType = globalThis.BroadcastChannel,
  windowTarget = typeof window === 'undefined' ? null : window,
  storage,
  clock = () => Date.now()
} = {}) {
  if (typeof onChange !== 'function') throw new TypeError('onChange callback required');
  // In sandboxed or privacy-restricted browsers the storage getter itself throws.
  let safeStorage=storage ?? null;
  if(storage===undefined){
    try{safeStorage=windowTarget?.localStorage||null;}catch{safeStorage=null;}
  }
  const channel = typeof BroadcastChannelType === 'function'
    ? new BroadcastChannelType('pocket-works:identity-session') : null;
  let lastSignal = -Infinity;
  let closed = false;

  function remoteChange() {
    if (closed) return;
    const now = clock();
    // A noisy tab cannot cause a request storm across the entire browser.
    if (now - lastSignal < 500) return;
    lastSignal = now;
    Promise.resolve().then(() => onChange()).catch(() => {});
  }
  function onMessage(event) {
    if (event?.data?.type === 'session-changed') remoteChange();
  }
  function onStorage(event) {
    if (event?.key === ACCOUNT_SIGNAL_KEY && event.newValue) remoteChange();
  }
  channel?.addEventListener('message', onMessage);
  windowTarget?.addEventListener?.('storage', onStorage);
  return {
    notify() {
      if (closed) return;
      try { channel?.postMessage({type:'session-changed'}); } catch {}
      // Browsers without BroadcastChannel still receive the storage event.
      try { safeStorage?.setItem(ACCOUNT_SIGNAL_KEY, String(clock()) + ':' + crypto.randomUUID()); }
      catch { /* LocalStorage may be blocked; BroadcastChannel remains available. */ }
    },
    close() {
      if (closed) return;
      closed = true;
      channel?.removeEventListener('message', onMessage);
      channel?.close?.();
      windowTarget?.removeEventListener?.('storage', onStorage);
    }
  };
}
