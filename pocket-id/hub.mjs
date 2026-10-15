// Pocket ID: independent, SQLite-backed identity namespace for the whole launcher.
// Keep authentication data out of the PocketNet room coordinator.
const ID_COOKIE = '__Host-pw-id';
const OAUTH_COOKIE = '__Host-pw-oauth';
const SESSION_MS = 30 * 86400_000;
const OAUTH_MS = 10 * 60_000;
const encoder = new TextEncoder();
const AVATARS = Object.freeze(['clay','moss','ink','sun','wave','ember','plum','stone']);
// Activation codes are 192-bit random values distributed privately.
// Only their SHA-256 digests are deployed; each digest is redeemable once.
// More cosmetic/role rewards can be added here without changing the API.
const ACTIVATION_REWARDS = Object.freeze({
  'd21c8a7ded46033524792a31a84a71ddd050d0725a5790bc9cbeb659f7738ad5': 'role:administrator'
});
const h = { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', 'x-content-type-options':'nosniff' };
const response = (data, status=200, headers={}) => new Response(JSON.stringify(data), {status, headers:{...h,...headers}});
const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), x=>x.toString(16).padStart(2,'0')).join('');
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))), x=>x.toString(16).padStart(2,'0')).join('');
const cookie = (name,value,age) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const getCookie = (request,name) => (request.headers.get('cookie')||'').split(';').map(p=>p.trim()).find(p=>p.startsWith(name+'='))?.slice(name.length+1)||'';
const codeError = error => /UNIQUE constraint failed/i.test(String(error));
const publicUser = row => row && ({
  id:row.id, nickname:row.nickname, avatar:row.avatar,
  complete:Boolean(row.nickname), linkedGoogle:Boolean(row.google_sub), createdAt:row.created_at, updatedAt:row.updated_at
});
function validateNickname(value) {
  if(typeof value!=='string') return null;
  const name=value.trim().normalize('NFKC');
  if(name.length<3||name.length>20||!/^[\p{L}\p{N}_-]+$/u.test(name)||!/[\p{L}]/u.test(name)) return null;
  return { name, normalized:name.toLowerCase() };
}
function safeAvatar(value) { return AVATARS.includes(value) ? value : null; }
function allowWrite(request,url) {
  return request.headers.get('origin')===url.origin &&
    (request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()==='application/json';
}
async function readBody(request,maxLength=2048) {
  if(Number(request.headers.get('content-length')||0)>maxLength) return null;
  try { const str=await request.text(); return str.length<=maxLength?JSON.parse(str):null; } catch { return null; }
}
export class PocketIdentity {
  constructor(ctx,env) {
    this.ctx=ctx;
    this.env=env;
    this.sql=ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, google_sub TEXT UNIQUE, nickname TEXT,
      nickname_key TEXT UNIQUE, avatar TEXT NOT NULL DEFAULT 'clay',
      recovery_hash TEXT UNIQUE, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS login_sessions (
      token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS sessions_account_idx ON login_sessions(account_id)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS oauth_states (
      state_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL,
      verifier TEXT NOT NULL, linked_account TEXT,
      expires_at INTEGER NOT NULL
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS recovery_limits (
      source TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS global_archive (
      slug TEXT PRIMARY KEY, changed_at INTEGER NOT NULL, changed_by TEXT NOT NULL
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS global_pins (
      slug TEXT PRIMARY KEY, changed_at INTEGER NOT NULL, changed_by TEXT NOT NULL
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS account_entitlements (
      account_id TEXT NOT NULL, entitlement TEXT NOT NULL, granted_at INTEGER NOT NULL,
      PRIMARY KEY(account_id,entitlement)
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS code_redemptions (
      code_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL,
      entitlement TEXT NOT NULL, redeemed_at INTEGER NOT NULL
    )`);
  }
  query(sql,...params) { return this.sql.exec(sql,...params); }
  one(sql,...params) { return this.query(sql,...params).toArray()[0]||null; }
  userEntitlements(accountId) {
    if(!accountId) return [];
    return this.query('SELECT entitlement FROM account_entitlements WHERE account_id=? ORDER BY entitlement',
      accountId).toArray().map(row=>row.entitlement);
  }
  describeUser(row) {
    return row ? {...publicUser(row),entitlements:this.userEntitlements(row.id)} : null;
  }
  canManageGlobalArchive(user) {
    if(!user?.id) return false;
    if(this.one('SELECT 1 AS present FROM account_entitlements WHERE account_id=? AND entitlement=?',
      user.id,'role:administrator')) return true;
    // Existing allowlisted Pocket ID UUIDs remain supported.
    // Nicknames, emails and browser-provided headers are not admin credentials.
    const allowed=[this.env.POCKET_ADMIN_ACCOUNT_IDS,this.env.POCKET_ADMIN_ACCOUNT_ID]
      .filter(value=>typeof value==='string').join(',');
    return allowed.split(/[,;\s]+/).some(id=>id && id.toLowerCase()===user.id.toLowerCase());
  }
  globalArchiveSnapshot(canManage=false) {
    return {
      archived:this.query('SELECT slug FROM global_archive ORDER BY slug').toArray().map(row=>row.slug),
      pinned:this.query('SELECT slug FROM global_pins ORDER BY changed_at DESC, slug').toArray().map(row=>row.slug),
      canManage
    };
  }
  cleanup() {
    const now=Date.now();
    this.query('DELETE FROM oauth_states WHERE expires_at < ?',now);
    this.query('DELETE FROM login_sessions WHERE expires_at < ?',now);
    this.query('DELETE FROM recovery_limits WHERE reset_at < ?',now);
  }
  async session(request) {
    const raw=getCookie(request,ID_COOKIE);
    if(!/^[a-f0-9]{64}$/.test(raw)) return null;
    const row=this.one(`SELECT accounts.* FROM login_sessions
      INNER JOIN accounts ON accounts.id=login_sessions.account_id
      WHERE token_hash=? AND expires_at>?`,await digest(raw),Date.now());
    return row||null;
  }
  async issueSession(id) {
    const token=random();
    this.query('INSERT INTO login_sessions(token_hash,account_id,expires_at) VALUES(?,?,?)',
      await digest(token),id,Date.now()+SESSION_MS);
    return cookie(ID_COOKIE,token,Math.floor(SESSION_MS/1000));
  }
  limit(source,max=12) {
    const now=Date.now();
    const old=this.one('SELECT attempts,reset_at FROM recovery_limits WHERE source=?',source);
    const attempts=old&&old.reset_at>now?old.attempts+1:1;
    this.query(`INSERT INTO recovery_limits(source,attempts,reset_at) VALUES(?,?,?)
      ON CONFLICT(source) DO UPDATE SET attempts=excluded.attempts,reset_at=excluded.reset_at`,
      source,attempts,old&&old.reset_at>now?old.reset_at:now+15*60_000);
    return attempts<=max;
  }
  async fetch(request) {
    const url=new URL(request.url);
    const path=url.pathname;
    if(!path.startsWith('/pocket-id/')) return response({error:'not_found'},404);
    if(!['GET','POST'].includes(request.method)) return response({error:'method_not_allowed'},405,{allow:'GET, POST'});
    if(request.method==='POST'&&!allowWrite(request,url)) return response({error:'origin_or_content_type_denied'},403);
    try {
      if(!this.lastCleanup||Date.now()-this.lastCleanup>5*60_000) {
        this.lastCleanup=Date.now();
        this.cleanup();
      }
      if(path==='/pocket-id/redeem'&&request.method==='POST') {
        const user=await this.session(request);
        if(!user) return response({error:'sign_in_required'},401);
        if(!user.nickname) return response({error:'profile_incomplete'},409);
        // Limit guessing both by account and by IP; all success/invalid attempts count.
        const ip=request.headers.get('CF-Connecting-IP')||'unknown';
        if(!this.limit('redeem-user:'+user.id,12)||!this.limit('redeem-ip:'+ip,50))
          return response({error:'too_many_attempts'},429);
        const body=await readBody(request);
        const code=typeof body?.code==='string'?body.code.trim().toUpperCase():'';
        if(!/^PW-[A-Z0-9-]{16,96}$/.test(code)) return response({error:'invalid_activation_code'},400);
        const codeHash=await digest(code);
        const entitlement=ACTIVATION_REWARDS[codeHash];
        if(!entitlement) return response({error:'invalid_activation_code'},400);
        const prior=this.one('SELECT account_id FROM code_redemptions WHERE code_hash=?',codeHash);
        if(prior)return response({error:prior.account_id===user.id?'code_already_redeemed':'code_already_used'},409);
        const now=Date.now();
        try{
          this.ctx.storage.transactionSync(()=>{
            this.query('INSERT INTO code_redemptions(code_hash,account_id,entitlement,redeemed_at) VALUES(?,?,?,?)',
              codeHash,user.id,entitlement,now);
            this.query('INSERT INTO account_entitlements(account_id,entitlement,granted_at) VALUES(?,?,?) ON CONFLICT(account_id,entitlement) DO NOTHING',
              user.id,entitlement,now);
          });
        }catch(error){
          if(codeError(error))return response({error:'code_already_used'},409);
          throw error;
        }
        return response({ok:true,entitlement,user:this.describeUser(user)});
      }
      if(path==='/pocket-id/global-archive'&&request.method==='GET') {
        const user=await this.session(request);
        return response(this.globalArchiveSnapshot(this.canManageGlobalArchive(user)));
      }
      if(path==='/pocket-id/global-archive'&&request.method==='POST') {
        const user=await this.session(request);
        if(!user) return response({error:'sign_in_required'},401);
        if(!this.canManageGlobalArchive(user)) return response({error:'admin_required'},403);
        const body=await readBody(request,16384);
        const slugs=Array.isArray(body?.slugs)?body.slugs:[body?.slug];
        if(typeof body?.archived!=='boolean'||!slugs.length||slugs.length>100||
           slugs.some(slug=>typeof slug!=='string'||!/^[a-z0-9-]{1,96}$/.test(slug)))
          return response({error:'invalid_archive_action'},400);
        const unique=[...new Set(slugs)], changedAt=Date.now();
        this.ctx.storage.transactionSync(()=>{
          for(const slug of unique) {
            if(body.archived) this.query(`INSERT INTO global_archive(slug,changed_at,changed_by) VALUES(?,?,?)
              ON CONFLICT(slug) DO UPDATE SET changed_at=excluded.changed_at,changed_by=excluded.changed_by`,
              slug,changedAt,user.id);
            else this.query('DELETE FROM global_archive WHERE slug=?',slug);
          }
        });
        return response(this.globalArchiveSnapshot(true));
      }
      if(path==='/pocket-id/global-pins'&&request.method==='POST') {
        const user=await this.session(request);
        if(!user) return response({error:'sign_in_required'},401);
        if(!this.canManageGlobalArchive(user)) return response({error:'admin_required'},403);
        const body=await readBody(request,16384);
        const slugs=Array.isArray(body?.slugs)?body.slugs:[body?.slug];
        if(typeof body?.pinned!=='boolean'||!slugs.length||slugs.length>100||
           slugs.some(slug=>typeof slug!=='string'||!/^[a-z0-9-]{1,96}$/.test(slug)))
          return response({error:'invalid_pin_action'},400);
        const unique=[...new Set(slugs)],changedAt=Date.now();
        this.ctx.storage.transactionSync(()=>{
          for(const slug of unique) {
            if(body.pinned) this.query(`INSERT INTO global_pins(slug,changed_at,changed_by) VALUES(?,?,?)
              ON CONFLICT(slug) DO UPDATE SET changed_at=excluded.changed_at,changed_by=excluded.changed_by`,
              slug,changedAt,user.id);
            else this.query('DELETE FROM global_pins WHERE slug=?',slug);
          }
        });
        return response(this.globalArchiveSnapshot(true));
      }
      if(path==='/pocket-id/config'&&request.method==='GET')
        return response({ok:true,googleEnabled:Boolean(this.env.GOOGLE_CLIENT_ID&&this.env.GOOGLE_CLIENT_SECRET),avatars:AVATARS});
      if(path==='/pocket-id/me'&&request.method==='GET')
        return response({user:this.describeUser(await this.session(request))});
      if(path==='/pocket-id/directory'&&request.method==='GET') {
        if(request.headers.get('x-pw-social-internal')!=='1')return response({error:'not_found'},404);
        const requester=await this.session(request);
        if(!requester)return response({error:'sign_in_required'},401);
        if(!this.limit('directory:'+requester.id,150))return response({error:'too_many_attempts'},429);
        const q=(url.searchParams.get('q')||'').trim().normalize('NFKC').toLowerCase();
        if(q.length<2||q.length>20||!/^[\p{L}\p{N}_-]+$/u.test(q))
          return response({users:[]});
        const escaped=q.replace(/[\\%_]/g,c=>String.fromCharCode(92)+c);
        const rows=this.query("SELECT id,nickname,avatar FROM accounts WHERE nickname_key LIKE ? ESCAPE '\\' ORDER BY nickname_key LIMIT 12",escaped+'%').toArray();
        return response({users:rows});
      }
      if(path==='/pocket-id/public'&&request.method==='GET') {
        if(request.headers.get('x-pw-social-internal')!=='1')return response({error:'not_found'},404);
        if(!await this.session(request))return response({error:'sign_in_required'},401);
        const id=url.searchParams.get('id')||'';
        if(!/^[0-9a-f-]{36}$/i.test(id))return response({user:null});
        const row=this.one('SELECT id,nickname,avatar FROM accounts WHERE id=?',id);
        return response({user:row||null});
      }
      if(path==='/pocket-id/nickname'&&request.method==='GET') {
        const candidate=validateNickname(url.searchParams.get('value'));
        if(!candidate) return response({available:false,reason:'invalid_nickname'},400);
        const occupied=this.one('SELECT id FROM accounts WHERE nickname_key=?',candidate.normalized);
        return response({available:!occupied,reason:occupied?'nickname_taken':null});
      }
      if(path==='/pocket-id/register'&&request.method==='POST') {
        const body=await readBody(request);
        const candidate=validateNickname(body?.nickname);
        const avatar=safeAvatar(body?.avatar);
        if(!candidate||!avatar) return response({error:'invalid_profile'},400);
        if(await this.session(request)) return response({error:'already_signed_in'},409);
        const source=request.headers.get('CF-Connecting-IP')||'unknown';
        if(!this.limit('register:'+source,6)) return response({error:'too_many_attempts'},429);
        const id=crypto.randomUUID(), secret=random(), now=Date.now();
        try {
          this.query('INSERT INTO accounts(id,nickname,nickname_key,avatar,recovery_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
            id,candidate.name,candidate.normalized,avatar,await digest(id+'.'+secret),now,now);
        } catch(e) { if(codeError(e)) return response({error:'nickname_taken'},409); throw e; }
        const sessionCookie=await this.issueSession(id);
        const user=this.one('SELECT * FROM accounts WHERE id=?',id);
        return response({user:this.describeUser(user),recoveryCode:'PW1-'+id+'.'+secret},201,{'set-cookie':sessionCookie});
      }
      if(path==='/pocket-id/recover'&&request.method==='POST') {
        const body=await readBody(request);
        const match=/^PW1-([0-9a-f-]{36})\.([0-9a-f]{64})$/i.exec(body?.recoveryCode||'');
        if(!match) return response({error:'invalid_recovery_code'},400);
        const source=request.headers.get('CF-Connecting-IP')||'unknown';
        if(!this.limit('recover:'+source,10)) return response({error:'too_many_attempts'},429);
        const user=this.one('SELECT * FROM accounts WHERE id=? AND recovery_hash=?',match[1],await digest(match[1]+'.'+match[2].toLowerCase()));
        if(!user) return response({error:'invalid_recovery_code'},401);
        const sessionCookie=await this.issueSession(user.id);
        return response({user:this.describeUser(user)},200,{'set-cookie':sessionCookie});
      }
      if(path==='/pocket-id/profile'&&request.method==='POST') {
        const user=await this.session(request);
        if(!user) return response({error:'sign_in_required'},401);
        const body=await readBody(request), candidate=validateNickname(body?.nickname), avatar=safeAvatar(body?.avatar);
        if(!candidate||!avatar) return response({error:'invalid_profile'},400);
        try {
          this.query('UPDATE accounts SET nickname=?,nickname_key=?,avatar=?,updated_at=? WHERE id=?',
            candidate.name,candidate.normalized,avatar,Date.now(),user.id);
        } catch(e) { if(codeError(e)) return response({error:'nickname_taken'},409); throw e; }
        return response({user:this.describeUser(this.one('SELECT * FROM accounts WHERE id=?',user.id))});
      }
      if(path==='/pocket-id/new-key'&&request.method==='POST') {
        const user=await this.session(request);
        if(!user) return response({error:'sign_in_required'},401);
        const secret=random();
        this.query('UPDATE accounts SET recovery_hash=?,updated_at=? WHERE id=?',
          await digest(user.id+'.'+secret),Date.now(),user.id);
        return response({recoveryCode:'PW1-'+user.id+'.'+secret});
      }
      if(path==='/pocket-id/logout'&&request.method==='POST') {
        const raw=getCookie(request,ID_COOKIE);
        if(/^[a-f0-9]{64}$/.test(raw)) this.query('DELETE FROM login_sessions WHERE token_hash=?',await digest(raw));
        return response({ok:true},200,{'set-cookie':cookie(ID_COOKIE,'',0)});
      }
      if(path==='/pocket-id/login/google'&&request.method==='GET') return this.startGoogle(request,url);
      if(path==='/pocket-id/callback/google'&&request.method==='GET') return this.finishGoogle(request,url);
      return response({error:'not_found'},404);
    } catch(error) {
      console.error('pocket_id_error',String(error));
      return response({error:'internal_error'},500);
    }
  }
  async startGoogle(request,url) {
    if(!this.env.GOOGLE_CLIENT_ID||!this.env.GOOGLE_CLIENT_SECRET)
      return response({error:'google_not_configured'},503);
    // Avoid unbounded temporary-state storage during malicious requests.
    const source=request.headers.get('CF-Connecting-IP')||'unknown';
    if(!this.limit('oauth:'+source,25)) return response({error:'too_many_attempts'},429);
    const state=random(), browser=random(), verifier=random(), user=await this.session(request);
    const challenge=await crypto.subtle.digest('SHA-256',encoder.encode(verifier));
    const verifierChallenge=btoa(String.fromCharCode(...new Uint8Array(challenge))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    this.query('INSERT INTO oauth_states(state_hash,browser_hash,verifier,linked_account,expires_at) VALUES(?,?,?,?,?)',
      await digest(state),await digest(browser),verifier,user?.id||null,Date.now()+OAUTH_MS);
    const redirect=new URL('/pocket-id/callback/google',url.origin);
    const google=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    for(const [k,v] of Object.entries({
      client_id:this.env.GOOGLE_CLIENT_ID,redirect_uri:redirect.href,
      response_type:'code',scope:'openid email profile',
      state,code_challenge:verifierChallenge,code_challenge_method:'S256',
      prompt:'select_account'
    })) google.searchParams.set(k,v);
    return new Response(null,{status:302,headers:{location:google.href,'set-cookie':cookie(OAUTH_COOKIE,browser,600),'cache-control':'no-store'}});
  }
  async finishGoogle(request,url) {
    const state=url.searchParams.get('state')||'';
    const browser=getCookie(request,OAUTH_COOKIE);
    const goHome=(error,sessionCookie=null) => {
      const dest=new URL('/',url.origin);
      dest.searchParams.set('pocket-id',error?'error':'welcome');
      if(error) dest.searchParams.set('reason',error);
      const headers=new Headers({location:dest.href,'cache-control':'no-store'});
      headers.append('set-cookie',cookie(OAUTH_COOKIE,'',0));
      if(sessionCookie) headers.append('set-cookie',sessionCookie);
      return new Response(null,{status:302,headers});
    };
    if(!/^[a-f0-9]{64}$/.test(state)||!/^[a-f0-9]{64}$/.test(browser)) return goHome('invalid_oauth_state');
    const stateHash=await digest(state);
    const saved=this.one('SELECT * FROM oauth_states WHERE state_hash=? AND browser_hash=?',stateHash,await digest(browser));
    if(!saved||saved.expires_at<Date.now()) return goHome('expired_oauth_state');
    this.query('DELETE FROM oauth_states WHERE state_hash=?',stateHash); // single use, including failure
    if(url.searchParams.has('error')) return goHome('google_cancelled');
    const code=url.searchParams.get('code');
    if(!code||code.length>4096) return goHome('invalid_google_code');
    try {
      const redirect=new URL('/pocket-id/callback/google',url.origin);
      const tokenReply=await fetch('https://oauth2.googleapis.com/token',{
        method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({
          code,client_id:this.env.GOOGLE_CLIENT_ID,client_secret:this.env.GOOGLE_CLIENT_SECRET,
          redirect_uri:redirect.href,grant_type:'authorization_code',code_verifier:saved.verifier
        })
      });
      if(!tokenReply.ok) return goHome('google_exchange_failed');
      const tokens=await tokenReply.json();
      if(!tokens.access_token||tokens.token_type?.toLowerCase()!=='bearer') return goHome('google_exchange_failed');
      const infoReply=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{
        headers:{authorization:'Bearer '+tokens.access_token}
      });
      if(!infoReply.ok) return goHome('google_profile_failed');
      const google=await infoReply.json();
      if(!google.sub||google.email_verified!==true) return goHome('google_email_unverified');
      let account=this.one('SELECT * FROM accounts WHERE google_sub=?',google.sub);
      if(saved.linked_account) {
        const active=await this.session(request);
        if(!active||active.id!==saved.linked_account) return goHome('link_session_expired');
        if(account&&account.id!==active.id) return goHome('google_already_linked');
        if(!account) {
          try {
            this.query('UPDATE accounts SET google_sub=?,updated_at=? WHERE id=? AND google_sub IS NULL',
              google.sub,Date.now(),active.id);
          } catch(e) { if(codeError(e)) return goHome('google_already_linked'); throw e; }
        }
        account=this.one('SELECT * FROM accounts WHERE id=?',active.id);
      } else if(!account) {
        const id=crypto.randomUUID(), now=Date.now();
        try {
          this.query('INSERT INTO accounts(id,google_sub,avatar,created_at,updated_at) VALUES(?,?,?,?,?)',
            id,google.sub,'clay',now,now);
        } catch(e) { if(!codeError(e)) throw e; }
        account=this.one('SELECT * FROM accounts WHERE google_sub=?',google.sub);
      }
      if(!account) return goHome('google_account_error');
      return goHome(null,await this.issueSession(account.id));
    } catch(error) {
      console.error('pocket_id_google',String(error));
      return goHome('google_unavailable');
    }
  }
}
