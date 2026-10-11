// Same-origin PocketNet API. Static assets continue to use Cloudflare's asset routing.
export { PocketNetHub } from './hub.mjs';

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/pocketnet/')) {
      return env.POCKETNET.get(env.POCKETNET.idFromName('pocket-works-global-v1')).fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};
