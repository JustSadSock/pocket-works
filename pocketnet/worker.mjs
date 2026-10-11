// Same-origin PocketNet and Pocket ID APIs. All remaining paths are static assets.
export { PocketNetHub } from './hub.mjs';
export { PocketIdentity } from '../pocket-id/hub.mjs';

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/pocket-id/')) {
      return env.POCKET_ID.get(env.POCKET_ID.idFromName('pocket-id-global-v1')).fetch(request);
    }
    if (url.pathname.startsWith('/pocketnet/')) {
      return env.POCKETNET.get(env.POCKETNET.idFromName('pocket-works-global-v1')).fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};
