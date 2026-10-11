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
      // The edge worker, not the browser, vouches for account identity.
      // Never forward client-supplied x-pw-* headers to the room coordinator.
      const headers = new Headers(request.headers);
      for (const key of [...headers.keys()]) if (key.startsWith('x-pw-')) headers.delete(key);
      if (url.pathname === '/pocketnet/session' || url.pathname === '/pocketnet/ws') {
        const idService = env.POCKET_ID.get(env.POCKET_ID.idFromName('pocket-id-global-v1'));
        const identityRequest = new Request(new URL('/pocket-id/me', url.origin), {
          headers: { cookie: request.headers.get('cookie') || '' }
        });
        let user;
        try {
          const result = await idService.fetch(identityRequest);
          if (!result.ok) return new Response(JSON.stringify({error:'identity_unavailable'}),{
            status:503,headers:{'content-type':'application/json','cache-control':'no-store'}
          });
          user = (await result.json()).user;
        } catch {
          return new Response(JSON.stringify({error:'identity_unavailable'}),{
            status:503,headers:{'content-type':'application/json','cache-control':'no-store'}
          });
        }
        if (user?.complete) {
          headers.set('x-pw-account-id', user.id);
          headers.set('x-pw-account-name', user.nickname);
          headers.set('x-pw-account-avatar', user.avatar);
        } else if (user) {
          headers.set('x-pw-account-incomplete', '1');
        }
      }
      return env.POCKETNET.get(env.POCKETNET.idFromName('pocket-works-global-v1')).fetch(
        new Request(request, { headers })
      );
    }
    return env.ASSETS.fetch(request);
  }
};
