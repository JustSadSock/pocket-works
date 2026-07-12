const nativeStartViewTransition = typeof document.startViewTransition === 'function'
  ? document.startViewTransition.bind(document)
  : null;

let activeTransition = null;

function immediateTransition(updateCallback) {
  let result;
  try {
    result = updateCallback?.();
  } catch (error) {
    result = Promise.reject(error);
  }

  const completion = Promise.resolve(result);
  return {
    ready: Promise.resolve(),
    updateCallbackDone: completion,
    finished: completion,
    skipTransition() {}
  };
}

export function installViewTransitionGuard() {
  if (!nativeStartViewTransition || document.startViewTransition?.__pocketWorksGuarded) return false;

  const guardedStart = (updateCallback) => {
    if (activeTransition) {
      activeTransition.cancelled = true;
      activeTransition.transition.skipTransition();
      activeTransition = null;
      return immediateTransition(updateCallback);
    }

    const state = { cancelled: false, transition: null };
    const transition = nativeStartViewTransition(() => {
      if (state.cancelled) return undefined;
      return updateCallback?.();
    });
    state.transition = transition;
    activeTransition = state;

    transition.finished
      .catch(() => {})
      .finally(() => {
        if (activeTransition === state) activeTransition = null;
      });

    return transition;
  };

  Object.defineProperty(guardedStart, '__pocketWorksGuarded', { value: true });

  try {
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      writable: true,
      value: guardedStart
    });
    return true;
  } catch {
    return false;
  }
}

installViewTransitionGuard();
