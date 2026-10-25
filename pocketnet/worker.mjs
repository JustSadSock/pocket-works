// Same-origin PocketNet and Pocket ID APIs. All remaining paths are static assets.
export { PocketNetHub } from './hub.mjs';
export { PocketIdentity } from '../pocket-id/hub.mjs';
export { PocketCloud } from '../pocket-cloud/hub.mjs';
export { PocketSocial } from '../pocket-social/hub.mjs';
import { handleMrxAsset } from './mrx-assets.mjs';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/ai-assets/')) {
      return handleMrxAsset(request,{cache:globalThis.caches?.default||null,waitUntil:ctx?.waitUntil?.bind(ctx)});
    }
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
      // Reject foreign-origin writes before forwarding to the Durable Object.
      // PocketIdentity independently repeats the same validation for all mutations.
      if (request.method === 'POST' && request.headers.get('origin') !== url.origin) {
        return new Response(JSON.stringify({error:'origin_or_content_type_denied'}), {
          status:403,
          headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
        });
      }
      const headers = new Headers(request.headers);
      for(const key of [...headers.keys()])if(key.startsWith('x-pw-'))headers.delete(key);
      return env.POCKET_ID.get(env.POCKET_ID.idFromName('pocket-id-global-v1')).fetch(new Request(request,{headers}));
    }
    if (url.pathname.startsWith('/pocket-cloud/')) {
      // The cookie is checked in Pocket ID, never in the browser.
      // The account ID passed to the cloud is minted at this trusted edge only.
      const idService=env.POCKET_ID.get(env.POCKET_ID.idFromName('pocket-id-global-v1'));
      let user;
      try {
        const reply=await idService.fetch(new Request(new URL('/pocket-id/me',url),{
          headers:{cookie:request.headers.get('cookie')||''}
        }));
        if(!reply.ok)return new Response(JSON.stringify({error:'identity_unavailable'}),{status:503,headers:{'content-type':'application/json'}});
        user=(await reply.json()).user;
      } catch {return new Response(JSON.stringify({error:'identity_unavailable'}),{status:503,headers:{'content-type':'application/json'}});}
      if(!user?.complete)return new Response(JSON.stringify({error:'sign_in_required'}),{
        status:401,headers:{'content-type':'application/json','cache-control':'no-store'}
      });
      const expected=request.headers.get('x-pw-expected-account');
      if(expected && expected!==user.id)return new Response(JSON.stringify({error:'account_changed'}),{
        status:409,headers:{'content-type':'application/json','cache-control':'no-store'}
      });
      const headers=new Headers(request.headers);
      for(const key of [...headers.keys()])if(key.startsWith('x-pw-'))headers.delete(key);
      headers.set('x-pw-account-id',user.id);
      const cloud=env.POCKET_CLOUD.get(env.POCKET_CLOUD.idFromName('account-v1:'+user.id));
      return cloud.fetch(new Request(request,{headers}));
    }
    if (url.pathname.startsWith('/pocket-social/')) {
      // Credentials and directory entries are supplied only by this trusted edge.
      const identity = env.POCKET_ID.get(env.POCKET_ID.idFromName('pocket-id-global-v1'));
      let user;
      try {
        const result = await identity.fetch(new Request(new URL('/pocket-id/me', url), {
          headers: { cookie: request.headers.get('cookie') || '' }
        }));
        if (!result.ok) throw Error('identity_not_ready');
        user = (await result.json()).user;
      } catch {
        return new Response(JSON.stringify({error:'identity_unavailable'}), {status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});
      }
      // A guest may read a public player portrait by ID, but cannot use social mutations or private features.
      const publicPortraitRead=!user?.complete && url.pathname==='/pocket-social/user' && request.method==='GET';
      if (!user?.complete && !publicPortraitRead) return new Response(JSON.stringify({error:'sign_in_required'}), {status:401,headers:{'content-type':'application/json','cache-control':'no-store'}});
      const headers = new Headers(request.headers);
      for (const key of [...headers.keys()]) if (key.startsWith('x-pw-')) headers.delete(key);
      if (publicPortraitRead) headers.set('x-pw-public-portrait', '1');
      else {
        headers.set('x-pw-account-id', user.id);
        headers.set('x-pw-account-name', user.nickname);
        headers.set('x-pw-account-avatar', user.avatar);
      }
      if (url.pathname === '/pocket-social/search' && request.method === 'GET') {
        const lookup = new URL('/pocket-id/directory', url);
        lookup.searchParams.set('q', url.searchParams.get('q') || '');
        const result = await identity.fetch(new Request(lookup,{headers:{cookie:request.headers.get('cookie')||'','x-pw-social-internal':'1'}}));
        if (!result.ok) return result;
        const rows = (await result.json()).users || [];
        headers.set('x-pw-directory', JSON.stringify(rows));
      }
      if (url.pathname === '/pocket-social/user' && request.method === 'GET') {
        const lookup = new URL('/pocket-id/public', url);
        lookup.searchParams.set('id', url.searchParams.get('id')||'');
        const lookupHeaders={cookie:request.headers.get('cookie')||'','x-pw-social-internal':'1'};
        if(publicPortraitRead)lookupHeaders['x-pw-public-portrait']='1';
        const result = await identity.fetch(new Request(lookup,{headers:lookupHeaders}));
        if (!result.ok) return result;
        const target=(await result.json()).user;
        if (target) headers.set('x-pw-target-user', JSON.stringify(target));
      }
      if ((url.pathname === '/pocket-social/invite' || url.pathname === '/pocket-social/invite-party') && request.method === 'POST') {
        let payload;
        try { payload = await request.clone().json(); } catch { payload = null; }
        if (!payload || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.gameId||'') ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.roomId||'')) {
          return new Response(JSON.stringify({error:'invalid_room'}),{status:400,headers:{'content-type':'application/json'}});
        }
        const hub=env.POCKETNET.get(env.POCKETNET.idFromName('pocket-works-global-v1'));
        const validation=await hub.fetch(new Request(new URL('/pocketnet/validate-invite',url),{
          method:'POST',headers:{'content-type':'application/json','x-pw-internal':'1','x-pw-account-id':user.id},
          body:JSON.stringify({roomId:payload.roomId,gameId:payload.gameId})
        }));
        if (!validation.ok) return validation;
        headers.set('x-pw-validated-room',payload.roomId);
      }
      if (url.pathname === '/pocket-social/invite-action' && request.method === 'POST') {
        let payload;
        try { payload=await request.clone().json(); } catch { payload=null; }
        if (payload?.action === 'accept') {
          const social=env.POCKET_SOCIAL.get(env.POCKET_SOCIAL.idFromName('pocket-social-global-v1'));
          const inspection=await social.fetch(new Request(new URL('/pocket-social/inspect-invite?id='+encodeURIComponent(payload.id||''),url),{
            headers:{'x-pw-account-id':user.id,'x-pw-account-name':user.nickname,'x-pw-account-avatar':user.avatar}
          }));
          if (!inspection.ok) return inspection;
          const invitation=(await inspection.json()).invite;
          const hub=env.POCKETNET.get(env.POCKETNET.idFromName('pocket-works-global-v1'));
          const validation=await hub.fetch(new Request(new URL('/pocketnet/validate-join',url),{
            method:'POST',headers:{'content-type':'application/json','x-pw-internal':'1'},
            body:JSON.stringify({roomId:invitation.roomId,gameId:invitation.gameId})
          }));
          if (!validation.ok) return validation;
          headers.set('x-pw-validated-invite',invitation.id);
        }
      }
      const social=env.POCKET_SOCIAL.get(env.POCKET_SOCIAL.idFromName('pocket-social-global-v1'));
      return social.fetch(new Request(request,{headers}));
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
