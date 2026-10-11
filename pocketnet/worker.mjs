// Same-origin PocketNet and Pocket ID APIs. All remaining paths are static assets.
export { PocketNetHub } from './hub.mjs';
export { PocketIdentity } from '../pocket-id/hub.mjs';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/privacy' && (request.method === 'GET' || request.method === 'HEAD')) {
      // Avoid Cloudflare's .html -> extensionless redirect loop.
      const asset = await env.ASSETS.fetch(new Request(new URL('/privacy.txt', url), request));
      if (!asset.ok) return asset;
      const headers = new Headers(asset.headers);
      headers.set('content-type', 'text/html; charset=utf-8');
      headers.set('x-content-type-options', 'nosniff');
      return new Response(request.method === 'HEAD' ? null : asset.body, { status: asset.status, headers });
    }
    if (url.pathname.startsWith('/pocket-id/')) {
      return env.POCKET_ID.get(env.POCKET_ID.idFromName('pocket-id-global-v1')).fetch(request);
    }
    if (url.pathname.startsWith('/pocketnet/')) {
      return env.POCKETNET.get(env.POCKETNET.idFromName('pocket-works-global-v1')).fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};
