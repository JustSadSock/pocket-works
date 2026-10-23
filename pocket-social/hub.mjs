import {zamazkaAchievements,zamazkaAwardById,ownedAchievementItem} from '../shared/capabilities/zamazka-achievements.js';
import {canticaAchievements,canticaOwns} from '../shared/capabilities/cantica-achievements.js';
import {blockiesAchievements,blockiesAwardById,blockiesOwns} from '../shared/capabilities/blockies-achievements.js';
import {verifyCanticaProof,canticaEligible} from './cantica-proof.mjs';
// Pocket Social. Only trusted Worker headers identify users; room checks stay in PocketNet.
const HEAD={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:HEAD});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const backgrounds=new Set(['forest','clay','lilac','ocean','night','paper','gallery','chapel','block-grid']);
const frames=new Set(['clean','double','corners','stamp']);
const backgroundModes=new Set(['preset','drawing']);
const portraitFrames=new Set(['none','wood','gilt','worn-gilt','rose-window','tetromino']);
const maskotAnimals=new Set(['cat','black-cat','fox','rabbit','frog']);
const maskotHats=new Set(['none','crown','beret','flower','helmet','veil','bascinet','brush','stage-pin','seer-diadem','solar-circlet','stack-cap','block-crown','quiet-chaos']);
const maskotClothes=new Set(['tunic','vest','mantle','spacesuit','wedding','tabard','restorer','groom','stage-hanbok','illuminator']);
const maskotFaces=new Set(['none','glasses','stars','monocle']);
const maskotAccessories=new Set(['none','shoulder-dragon','spectral-quill','sun-crystal','mini-block','tiny-guardian']);
const maskotTitles=new Set(['','Первопроходец','Коллекционер','Хранитель хаоса','Подмастерье','Знаток подделок','Двойной агент','Авантюрист','Призрачная кисть','Всевидящий',...canticaAchievements.filter(a=>a.slot==='title').map(a=>a.item),...blockiesAchievements.filter(a=>a.slot==='title').map(a=>a.item)]);
const codeRewards=new Map([['ORBIT-7','astronaut'],['WHITE-ROSE','wedding'],['VIGIL-1347','knight'],['HERALD-1415','herald'],['GROOM-2026','groom'],['SEOUL-MOONLIGHT','seoul-artist'],['DRAGON-EMBER','dragon-keeper']]);
function validMaskot(value,unlocked){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  if(!maskotAnimals.has(value.animal)||!maskotHats.has(value.hat)||!maskotClothes.has(value.clothes)||!maskotFaces.has(value.face)||!maskotAccessories.has(value.accessory??'none'))return false;
  if((value.hat==='helmet'||value.clothes==='spacesuit')&&!unlocked.includes('astronaut'))return false;
  if((value.hat==='veil'||value.clothes==='wedding')&&!unlocked.includes('wedding'))return false;
  if(value.hat==='bascinet'&&!unlocked.includes('knight'))return false;
  if(value.clothes==='tabard'&&!unlocked.includes('herald'))return false;
  if(value.clothes==='groom'&&!unlocked.includes('groom'))return false;
  if((value.hat==='stage-pin'||value.clothes==='stage-hanbok')&&!unlocked.includes('seoul-artist'))return false;
  if(value.accessory==='shoulder-dragon'&&!unlocked.includes('dragon-keeper'))return false;
  if((value.hat==='quiet-chaos'||value.accessory==='tiny-guardian')&&!unlocked.includes('yasya-chaos'))return false;
  for(const category of ['hat','clothes','face','accessory']){
    if(zamazkaAchievements.some(a=>a.slot===category&&a.item===value[category])&&!ownedAchievementItem(value[category],unlocked))return false;
    if(canticaAchievements.some(a=>a.slot===category&&a.item===value[category])&&!canticaOwns(value[category],category,unlocked))return false;
    if(blockiesAchievements.some(a=>a.slot===category&&a.item===value[category])&&!blockiesOwns(value[category],category,unlocked))return false;
  }
  return true;
}
const goodArt=x=>typeof x==='string'&&(x===''||x.length<=24000&&/^data:image\/(?:png|webp);base64,[a-zA-Z0-9+/]+={0,2}$/.test(x));
const goodGame=x=>typeof x==='string'&&x.length<=50&&(!x||/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(x));
const cleanUser=x=>x&&uuid.test(x.id||'')&&typeof x.nickname==='string'&&x.nickname.length<=20
  ?{id:x.id,nickname:x.nickname,avatar:typeof x.avatar==='string'?x.avatar.slice(0,30):'clay'}:null;
async function bodyJson(req){
  if(Number(req.headers.get('content-length')||0)>35000)return null;
  const raw=await req.text();
  if(new TextEncoder().encode(raw).length>35000)return null;
  try{return JSON.parse(raw)}catch{return null}
}
export class PocketSocial {
  constructor(ctx,env){
    this.env=env;
    this.sql=ctx.storage.sql;
    this.rates=new Map();
    this.sql.exec("CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,nickname TEXT NOT NULL,avatar TEXT NOT NULL,background TEXT NOT NULL DEFAULT 'forest',frame TEXT NOT NULL DEFAULT 'clean',artwork TEXT NOT NULL DEFAULT '',favorite_game TEXT NOT NULL DEFAULT '',discoverable INTEGER NOT NULL DEFAULT 1,presence_visible INTEGER NOT NULL DEFAULT 1,allow_invites INTEGER NOT NULL DEFAULT 1,seen_at INTEGER NOT NULL DEFAULT 0,game_id TEXT NOT NULL DEFAULT '',updated_at INTEGER NOT NULL DEFAULT 0)");
    // Non-destructive migration: existing hand-drawn avatars remain available as card backgrounds.
    const columns=this.sql.exec('PRAGMA table_info(profiles)').toArray().map(x=>x.name);
    for(const [name,spec] of [['maskot','TEXT NOT NULL DEFAULT \'\''],['unlocked','TEXT NOT NULL DEFAULT \'[]\''],['title','TEXT NOT NULL DEFAULT \'\''],['background_mode',"TEXT NOT NULL DEFAULT 'preset'"],['portrait_frame',"TEXT NOT NULL DEFAULT 'wood'"]]){
      if(!columns.includes(name))this.sql.exec('ALTER TABLE profiles ADD COLUMN '+name+' '+spec);
    }
    this.sql.exec("CREATE TABLE IF NOT EXISTS friends(a TEXT NOT NULL,b TEXT NOT NULL,status TEXT NOT NULL,pending_by TEXT,updated_at INTEGER NOT NULL,PRIMARY KEY(a,b))");
    this.sql.exec("CREATE INDEX IF NOT EXISTS friends_by_b ON friends(b,status)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS blocks(blocker TEXT NOT NULL,blocked TEXT NOT NULL,PRIMARY KEY(blocker,blocked))");
    this.sql.exec("CREATE TABLE IF NOT EXISTS invites(id TEXT PRIMARY KEY,from_id TEXT NOT NULL,to_id TEXT NOT NULL,game_id TEXT NOT NULL,room_id TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL)");
    this.sql.exec("CREATE INDEX IF NOT EXISTS invites_receiver ON invites(to_id,status,created_at)");
    // One persistent company per account: up to three chosen friends plus its owner.
    this.sql.exec("CREATE TABLE IF NOT EXISTS social_party(owner_id TEXT NOT NULL,friend_id TEXT NOT NULL,added_at INTEGER NOT NULL,PRIMARY KEY(owner_id,friend_id))");
    this.sql.exec("CREATE TABLE IF NOT EXISTS achievements(account_id TEXT NOT NULL,achievement_id TEXT NOT NULL,game_id TEXT NOT NULL,room_id TEXT NOT NULL,match_id TEXT NOT NULL,earned_at INTEGER NOT NULL,PRIMARY KEY(account_id,achievement_id))");
    this.sql.exec("CREATE INDEX IF NOT EXISTS achievements_by_account ON achievements(account_id,earned_at)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS cantica_completions(account_id TEXT NOT NULL,level INTEGER NOT NULL,best_moves INTEGER NOT NULL,completed_at INTEGER NOT NULL,PRIMARY KEY(account_id,level))");
    this.sql.exec("CREATE INDEX IF NOT EXISTS cantica_by_account ON cantica_completions(account_id,completed_at)");
  }
  rows(sql,...args){return this.sql.exec(sql,...args).toArray()}
  one(sql,...args){return this.rows(sql,...args)[0]||null}
  pair(a,b){return a<b?[a,b]:[b,a]}
  blocked(a,b){return !!this.one('SELECT 1 FROM blocks WHERE (blocker=? AND blocked=?) OR (blocker=? AND blocked=?)',a,b,b,a)}
  relation(a,b){const [x,y]=this.pair(a,b);return this.one('SELECT * FROM friends WHERE a=? AND b=?',x,y)}
  isFriend(a,b){return this.relation(a,b)?.status==='accepted'&&!this.blocked(a,b)}
  seed(value){
    const u=cleanUser(value);if(!u)return null;
    this.sql.exec('INSERT INTO profiles(id,nickname,avatar) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET nickname=excluded.nickname,avatar=excluded.avatar WHERE profiles.nickname<>excluded.nickname OR profiles.avatar<>excluded.avatar',u.id,u.nickname,u.avatar);
    return u;
  }
  card(id,viewer){
    const p=this.one('SELECT * FROM profiles WHERE id=?',id);if(!p)return null;
    const own=id===viewer,blocked=this.blocked(viewer,id),r=own?null:this.relation(viewer,id);
    const visible=!!p.presence_visible&&!blocked&&p.seen_at>Date.now()-95000;
    let maskot=null,unlocked=[];
    try{maskot=p.maskot?JSON.parse(p.maskot):null}catch{}
    try{unlocked=JSON.parse(p.unlocked||'[]');if(!Array.isArray(unlocked))unlocked=[]}catch{}
    const earned=this.rows('SELECT achievement_id,earned_at FROM achievements WHERE account_id=? ORDER BY earned_at DESC',id);
    unlocked=[...unlocked,...earned.map(x=>x.achievement_id)];
    return {id:p.id,nickname:p.nickname,avatar:p.avatar,background:p.background,frame:p.frame,
      artwork:p.artwork,backgroundMode:backgroundModes.has(p.background_mode)?p.background_mode:'preset',
      portraitFrame:portraitFrames.has(p.portrait_frame)?p.portrait_frame:'wood',maskot:validMaskot(maskot,unlocked)?maskot:null,
      ...(own?{unlocked,achievements:earned.map(x=>({id:x.achievement_id,earnedAt:x.earned_at}))}:{}),title:p.title||'',favoriteGame:p.favorite_game,discoverable:!!p.discoverable,
      presenceVisible:!!p.presence_visible,allowInvites:!!p.allow_invites,
      online:visible,gameId:visible?p.game_id:'',
      friendship:own?'self':blocked?'blocked':r?.status==='accepted'?'friends':
        r?.status==='pending'?(r.pending_by===viewer?'outgoing':'incoming'):'none',
      blockedByMe:!!this.one('SELECT 1 FROM blocks WHERE blocker=? AND blocked=?',viewer,id),owned:own};
  }
  rate(id,action,max,period){
    const now=Date.now(),key=id+':'+action,prev=this.rates.get(key);
    const next=!prev||now-prev.start>period?{start:now,count:1}:{start:prev.start,count:prev.count+1};
    this.rates.set(key,next);
    if(this.rates.size>2500)for(const [k,v] of this.rates)if(now-v.start>3600000)this.rates.delete(k);
    return next.count<=max;
  }
  connections(id){
    const relations=this.rows('SELECT * FROM friends WHERE a=? OR b=? ORDER BY updated_at DESC LIMIT 240',id,id);
    const friends=[],incoming=[],outgoing=[];
    for(const r of relations){
      const other=r.a===id?r.b:r.a,card=this.card(other,id);
      if(!card)continue;
      if(r.status==='accepted')friends.push(card);
      else if(r.pending_by===id)outgoing.push(card);
      else incoming.push(card);
    }
    return {friends,incoming,outgoing};
  }
  blockedUsers(id){
    return this.rows('SELECT blocked FROM blocks WHERE blocker=? ORDER BY blocked LIMIT 100',id)
      .map(r=>this.card(r.blocked,id)).filter(Boolean);
  }
  invitations(id){
    const rows=this.rows('SELECT * FROM invites WHERE (to_id=? OR from_id=?) AND expires_at>? ORDER BY created_at DESC LIMIT 50',id,id,Date.now());
    return rows.map(r=>({id:r.id,fromId:r.from_id,toId:r.to_id,
      fromName:this.one('SELECT nickname FROM profiles WHERE id=?',r.from_id)?.nickname||'Игрок',
      toName:this.one('SELECT nickname FROM profiles WHERE id=?',r.to_id)?.nickname||'Игрок',
      roomId:r.room_id,gameId:r.game_id,status:r.status,createdAt:r.created_at,expiresAt:r.expires_at,incoming:r.to_id===id}));
  }
  partyMembers(id){
    return this.rows('SELECT friend_id AS id FROM social_party WHERE owner_id=? ORDER BY added_at ASC LIMIT 3',id)
      .map(p=>p.id).filter(other=>this.isFriend(id,other));
  }
  async activeRooms(ids){
    if(!this.env?.POCKETNET||!ids.length)return {};
    try{
      const hub=this.env.POCKETNET.get(this.env.POCKETNET.idFromName('pocket-works-global-v1'));
      const result=await hub.fetch(new Request('https://internal.invalid/pocketnet/social-rooms',{
        method:'POST',headers:{'content-type':'application/json','x-pw-internal':'1'},
        body:JSON.stringify({accountIds:[...new Set(ids)].slice(0,240)})
      }));
      return result.ok?(await result.json()).rooms||{}:{};
    }catch(error){console.error('pocket_social_room_discovery',String(error));return {}}
  }
  async friendSnapshot(id){
    const relations=this.connections(id);
    // Private rooms are exposed ONLY to verified friends with visible presence.
    const visible=relations.friends.filter(p=>p.presenceVisible&&!this.blocked(id,p.id));
    const active=await this.activeRooms(visible.map(p=>p.id));
    relations.friends=relations.friends.map(p=>({...p,activity:active[p.id]||null}));
    return relations;
  }
  // Cheap active-menu revision: no portraits, drawings, or achievement inventories.
  async socialRevision(id){
    const now=Date.now(),limit=now-95000;
    const owner=this.one('SELECT nickname,avatar,updated_at FROM profiles WHERE id=?',id);
    const peers=this.rows(
      'SELECT f.a,f.b,f.status,f.pending_by,f.updated_at,p.id AS peer_id,p.nickname,p.avatar,'+
      'p.updated_at AS profile_updated,p.seen_at,p.game_id,p.presence_visible '+
      'FROM friends f JOIN profiles p ON p.id=CASE WHEN f.a=? THEN f.b ELSE f.a END '+
      'WHERE f.a=? OR f.b=? ORDER BY f.updated_at DESC LIMIT 240',id,id,id);
    const friends=peers.map(p=>[
      p.peer_id,p.status,p.pending_by,p.updated_at,p.profile_updated,p.nickname,p.avatar,
      !!p.presence_visible&&p.seen_at>limit?(p.game_id||'online'):'offline'
    ]);
    const invitations=this.rows(
      'SELECT id,from_id,to_id,game_id,room_id,status,expires_at FROM invites '+
      'WHERE (to_id=? OR from_id=?) AND expires_at>? ORDER BY created_at DESC LIMIT 50',id,id,now);
    const blocked=this.rows('SELECT blocked FROM blocks WHERE blocker=? ORDER BY blocked LIMIT 100',id);
    const awards=this.one('SELECT COUNT(*) AS count,MAX(earned_at) AS latest FROM achievements WHERE account_id=?',id);
    const friendIds=peers.filter(p=>p.status==='accepted'&&p.presence_visible&&
      !this.blocked(id,p.peer_id)).map(p=>p.peer_id);
    const roomStatuses=await this.activeRooms(friendIds);
    const company=this.partyMembers(id);
    const snapshot=JSON.stringify([owner,friends,invitations,blocked,awards,roomStatuses,company]);
    let h=2166136261;
    for(let i=0;i<snapshot.length;i++){h^=snapshot.charCodeAt(i);h=Math.imul(h,16777619)}
    return {revision:(h>>>0).toString(36)+':'+snapshot.length};
  }
  async fetch(request){
    const url=new URL(request.url),path=url.pathname;
    // DO-to-DO only: the edge removes all client x-pw-* headers before forwarding.
    if(path==='/pocket-social/award'){
      if(request.method!=='POST'||request.headers.get('x-pw-internal')!=='1')return reply({error:'forbidden'},403);
      const body=await bodyJson(request);
      if(!body||!uuid.test(body.accountId||'')||!uuid.test(body.roomId||'')||
         !uuid.test(body.matchId||'')||
         !((body.gameId==='zamazka'&&zamazkaAwardById.has(body.achievementId))||
           (body.gameId==='blockies'&&blockiesAwardById.has(body.achievementId)))||typeof body.nickname!=='string'||!body.nickname||
         body.nickname.length>20)return reply({error:'invalid_award'},400);
      const current=this.one('SELECT id FROM profiles WHERE id=?',body.accountId);
      if(!current)this.seed({id:body.accountId,nickname:body.nickname,avatar:body.avatar||'clay'});
      const existing=this.one('SELECT 1 FROM achievements WHERE account_id=? AND achievement_id=?',body.accountId,body.achievementId);
      if(!existing)this.sql.exec('INSERT INTO achievements(account_id,achievement_id,game_id,room_id,match_id,earned_at) VALUES(?,?,?,?,?,?)',
        body.accountId,body.achievementId,body.gameId,body.roomId,body.matchId,Date.now());
      return reply({ok:true,already:!!existing});
    }
    const publicPortraitRead=path==='/pocket-social/user'&&request.method==='GET'&&request.headers.get('x-pw-public-portrait')==='1';
    const id=request.headers.get('x-pw-account-id');
    if((!id||!uuid.test(id))&&!publicPortraitRead)return reply({error:'sign_in_required'},401);
    const name=request.headers.get('x-pw-account-name'),avatar=request.headers.get('x-pw-account-avatar');
    if(!publicPortraitRead&&(!name||name.length>20))return reply({error:'identity_unavailable'},503);
    if(!['GET','POST'].includes(request.method))return reply({error:'method_not_allowed'},405);
    if(request.method==='POST'&&(request.headers.get('origin')!==url.origin||request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json'))
      return reply({error:'origin_denied'},403);
    if(!publicPortraitRead)this.seed({id,nickname:name,avatar});
    if(!this.lastCleanup||Date.now()-this.lastCleanup>3600000){
      this.sql.exec('DELETE FROM invites WHERE expires_at<?',Date.now()-7*86400000);
      this.lastCleanup=Date.now();
    }
    try{
      if(path==='/pocket-social/cantica/progress'&&request.method==='GET'){
        const total=this.one('SELECT COUNT(*) AS n FROM cantica_completions WHERE account_id=?',id)?.n||0;
        const best=this.rows('SELECT level,best_moves AS moves FROM cantica_completions WHERE account_id=? ORDER BY level LIMIT 500',id);
        const earned=this.rows("SELECT achievement_id AS id,earned_at AS earnedAt FROM achievements WHERE account_id=? AND game_id='cantica-glass' ORDER BY earned_at",id);
        return reply({completed:total,best,achievements:earned,accountId:id});
      }
      if(path==='/pocket-social/achievements'&&request.method==='GET')
        return reply({achievements:this.rows('SELECT achievement_id AS id,earned_at AS earnedAt FROM achievements WHERE account_id=? ORDER BY earned_at DESC',id)});
      if(path==='/pocket-social/sync'&&request.method==='GET')
        return reply(await this.socialRevision(id));
      if(path==='/pocket-social/me'&&request.method==='GET')
        return reply({profile:this.card(id,id),...await this.friendSnapshot(id),
          party:this.partyMembers(id),invites:this.invitations(id),blocked:this.blockedUsers(id)});
      if(path==='/pocket-social/user'&&request.method==='GET'){
        const other=url.searchParams.get('id')||'';
        if(!uuid.test(other))return reply({error:'invalid_account'},400);
        let u=null;try{u=JSON.parse(request.headers.get('x-pw-target-user')||'null')}catch{}
        if(u?.id===other)this.seed(u);
        const card=this.card(other,publicPortraitRead?'':id);
        if(!card)return reply({error:'user_not_found'},404);
        // Read-only, deliberately minimal card: no social graph, presence or private settings.
        if(publicPortraitRead)return reply({profile:{id:card.id,nickname:card.nickname,
          avatar:card.avatar,artwork:card.artwork,maskot:card.maskot,title:card.title}});
        if(card.friendship==='friends'&&card.presenceVisible){
          const active=await this.activeRooms([other]);
          card.activity=active[other]||null;
        }
        return reply({profile:card.friendship==='blocked'?{...card,artwork:'',gameId:'',online:false}:card});
      }
      if(path==='/pocket-social/search'&&request.method==='GET'){
        if(!this.rate(id,'search',40,60000))return reply({error:'rate_limited'},429);
        let directory=[];try{directory=JSON.parse(request.headers.get('x-pw-directory')||'[]')}catch{}
        const users=[];
        for(const raw of (Array.isArray(directory)?directory:[]).slice(0,12)){
          const other=this.seed(raw);
          if(!other||other.id===id||this.blocked(id,other.id))continue;
          const card=this.card(other.id,id);if(card?.discoverable)users.push(card);
        }
        return reply({users});
      }
      if(path==='/pocket-social/friends'&&request.method==='GET')
        return reply({...await this.friendSnapshot(id),party:this.partyMembers(id),invites:this.invitations(id),blocked:this.blockedUsers(id)});
      if(path==='/pocket-social/inspect-invite'&&request.method==='GET'){
        const invite=this.one("SELECT * FROM invites WHERE id=? AND to_id=? AND status='pending' AND expires_at>?",url.searchParams.get('id')||'',id,Date.now());
        if(!invite||!this.isFriend(id,invite.from_id))return reply({error:'invite_expired'},404);
        return reply({invite:{id:invite.id,roomId:invite.room_id,gameId:invite.game_id}});
      }
      if(request.method!=='POST')return reply({error:'not_found'},404);
      const body=await bodyJson(request);
      if(!body||typeof body!=='object')return reply({error:'invalid_request'},400);
      if(path==='/pocket-social/cantica/complete'){
        if(!this.rate(id,'cantica-proof',120,60000))return reply({error:'rate_limited'},429);
        const verified=verifyCanticaProof(body);
        if(!verified)return reply({error:'invalid_proof'},400);
        const existing=this.one('SELECT best_moves FROM cantica_completions WHERE account_id=? AND level=?',id,verified.level);
        if(existing){
          if(verified.moves<existing.best_moves)
            this.sql.exec('UPDATE cantica_completions SET best_moves=? WHERE account_id=? AND level=?',verified.moves,id,verified.level);
        }else{
          this.sql.exec('INSERT INTO cantica_completions(account_id,level,best_moves,completed_at) VALUES(?,?,?,?)',
            id,verified.level,verified.moves,Date.now());
        }
        const completed=this.one('SELECT COUNT(*) AS n FROM cantica_completions WHERE account_id=?',id)?.n||0;
        const awarded=[];
        for(const achievementId of canticaEligible(verified,completed)){
          const owned=this.one('SELECT 1 FROM achievements WHERE account_id=? AND achievement_id=?',id,achievementId);
          if(owned)continue;
          this.sql.exec('INSERT OR IGNORE INTO achievements(account_id,achievement_id,game_id,room_id,match_id,earned_at) VALUES(?,?,?,?,?,?)',
            id,achievementId,'cantica-glass','solo-verified','level-'+verified.level,Date.now());
          awarded.push(achievementId);
        }
        return reply({ok:true,completed,already:!!existing,awarded,level:verified.level,bestMoves:Math.min(existing?.best_moves??Infinity,verified.moves)});
      }
      if(path==='/pocket-social/join-friend'){
        const other=body.id;
        if(!uuid.test(other||'')||!this.isFriend(id,other))return reply({error:'friends_only'},403);
        if(!this.one('SELECT presence_visible FROM profiles WHERE id=?',other)?.presence_visible)
          return reply({error:'room_unavailable'},409);
        const room=(await this.activeRooms([other]))[other];
        if(!room?.joinable||!uuid.test(room.roomId)||!goodGame(room.gameId))
          return reply({error:'room_unavailable'},409);
        return reply({ok:true,url:'/apps/'+room.gameId+'/?room='+encodeURIComponent(room.roomId)});
      }
      if(path==='/pocket-social/party'){
        if(!['add','remove'].includes(body.action)||!uuid.test(body.id||'')||body.id===id)
          return reply({error:'invalid_request'},400);
        if(body.action==='add'){
          if(!this.isFriend(id,body.id))return reply({error:'friends_only'},403);
          const current=this.partyMembers(id);
          if(!current.includes(body.id)&&current.length>=3)return reply({error:'party_full'},409);
          this.sql.exec('INSERT OR IGNORE INTO social_party(owner_id,friend_id,added_at) VALUES(?,?,?)',id,body.id,Date.now());
        }else this.sql.exec('DELETE FROM social_party WHERE owner_id=? AND friend_id=?',id,body.id);
        return reply({ok:true,party:this.partyMembers(id)});
      }
      if(path==='/pocket-social/invite-party'){
        if(!goodGame(body.gameId)||!uuid.test(body.roomId||'')||
           request.headers.get('x-pw-validated-room')!==body.roomId)
          return reply({error:'invalid_room'},400);
        if(!this.rate(id,'invite-party',5,60000))return reply({error:'rate_limited'},429);
        let sent=0,skipped=0;
        for(const other of this.partyMembers(id)){
          if(!this.one('SELECT allow_invites FROM profiles WHERE id=?',other)?.allow_invites){skipped++;continue}
          const existing=this.one("SELECT id FROM invites WHERE from_id=? AND to_id=? AND room_id=? AND status='pending' AND expires_at>?",id,other,body.roomId,Date.now());
          if(existing){skipped++;continue}
          const now=Date.now();
          this.sql.exec("INSERT INTO invites(id,from_id,to_id,game_id,room_id,status,created_at,expires_at) VALUES(?,?,?,?,?,'pending',?,?)",
            crypto.randomUUID(),id,other,body.gameId,body.roomId,now,now+30*60000);
          sent++;
        }
        return reply({ok:true,sent,skipped});
      }
      if(path==='/pocket-social/redeem'){
        if(!this.rate(id,'cosmetic-code',10,3600000))return reply({error:'rate_limited'},429);
        if(typeof body.code!=='string'||body.code.length>60)return reply({error:'invalid_code'},400);
        // Private reward: both the recipient UUID and deployment secret must match.
        // No shared code or account identifier is shipped to the public client.
        const yasyaId=String(this.env.YASYA_POCKET_ID||'').trim().toLowerCase();
        const yasyaCode=String(this.env.YASYA_MASCOT_CODE||'').trim();
        const requested=body.code.trim();
        const personalReward=uuid.test(yasyaId)&&id.toLowerCase()===yasyaId&&
          yasyaCode.length>=24&&requested===yasyaCode?'yasya-chaos':null;
        const reward=personalReward||codeRewards.get(requested.toUpperCase());
        if(!reward)return reply({error:'invalid_code'},400);
        let unlocked=[];try{unlocked=JSON.parse(this.one('SELECT unlocked FROM profiles WHERE id=?',id)?.unlocked||'[]')}catch{}
        if(!Array.isArray(unlocked))unlocked=[];
        const already=unlocked.includes(reward);
        if(!already){
          unlocked.push(reward);
          this.sql.exec('UPDATE profiles SET unlocked=?,updated_at=? WHERE id=?',JSON.stringify(unlocked),Date.now(),id);
        }
        return reply({ok:true,reward,already,profile:this.card(id,id)});
      }
      if(path==='/pocket-social/profile'){
        const {background,frame,artwork,favoriteGame,discoverable,presenceVisible,allowInvites}=body;
        if(!backgrounds.has(background)||!frames.has(frame)||!goodArt(artwork)||!goodGame(favoriteGame)||
          [discoverable,presenceVisible,allowInvites].some(v=>typeof v!=='boolean'))
          return reply({error:'invalid_profile'},400);
        let unlocked=[];try{unlocked=JSON.parse(this.one('SELECT unlocked FROM profiles WHERE id=?',id)?.unlocked||'[]')}catch{}
        if(!Array.isArray(unlocked))unlocked=[];
        unlocked=[...unlocked,...this.rows('SELECT achievement_id FROM achievements WHERE account_id=?',id).map(x=>x.achievement_id)];
        let maskot=body.maskot===undefined?null:body.maskot;
        // Older clients do not know the accessory slot. Preserve equipped shoulder cosmetics.
        if(maskot&&maskot.accessory===undefined){
          let oldMaskot=null;
          try{oldMaskot=JSON.parse(this.one('SELECT maskot FROM profiles WHERE id=?',id)?.maskot||'null')}catch{}
          if(oldMaskot?.accessory&&oldMaskot.accessory!=='none')
            maskot={...maskot,accessory:oldMaskot.accessory};
        }
        if(maskot!==null&&!validMaskot(maskot,unlocked))return reply({error:'invalid_profile'},400);
        // Keep previously earned title strings after their achievement's new wearable reward.
        const retiredTitles={'Призрачная кисть':'zamazka.ghost-brush','Всевидящий':'zamazka.eagle-eye'};
        if(body.title!==undefined&&(!maskotTitles.has(body.title)||
           (zamazkaAchievements.some(a=>a.slot==='title'&&a.item===body.title)&&!ownedAchievementItem(body.title,unlocked))||
           (retiredTitles[body.title]&&!unlocked.includes(retiredTitles[body.title]))||
           (canticaAchievements.some(a=>a.slot==='title'&&a.item===body.title)&&!canticaOwns(body.title,'title',unlocked))||
           (blockiesAchievements.some(a=>a.slot==='title'&&a.item===body.title)&&!blockiesOwns(body.title,'title',unlocked))))return reply({error:'invalid_profile'},400);
        if(background==='gallery'&&!ownedAchievementItem('gallery',unlocked))return reply({error:'invalid_profile'},400);
        if(background==='chapel'&&!canticaOwns('chapel','background',unlocked))return reply({error:'invalid_profile'},400);
        if(background==='block-grid'&&!blockiesOwns('block-grid','background',unlocked))return reply({error:'invalid_profile'},400);
        if(body.portraitFrame==='worn-gilt'&&!ownedAchievementItem('worn-gilt',unlocked))return reply({error:'invalid_profile'},400);
        if(body.portraitFrame==='rose-window'&&!canticaOwns('rose-window','portraitFrame',unlocked))return reply({error:'invalid_profile'},400);
        if(body.portraitFrame==='tetromino'&&!blockiesOwns('tetromino','portraitFrame',unlocked))return reply({error:'invalid_profile'},400);
        if(body.backgroundMode!==undefined&&!backgroundModes.has(body.backgroundMode))return reply({error:'invalid_profile'},400);
        if(body.portraitFrame!==undefined&&!portraitFrames.has(body.portraitFrame))return reply({error:'invalid_profile'},400);
        // Older clients keep the new cosmetics untouched. New clients store only validated IDs.
        if(maskot){
          this.sql.exec('UPDATE profiles SET background=?,frame=?,artwork=?,favorite_game=?,discoverable=?,presence_visible=?,allow_invites=?,maskot=?,title=?,updated_at=? WHERE id=?',
            background,frame,artwork,favoriteGame,Number(discoverable),Number(presenceVisible),Number(allowInvites),JSON.stringify(maskot),body.title||'',Date.now(),id);
        }else{
          this.sql.exec('UPDATE profiles SET background=?,frame=?,artwork=?,favorite_game=?,discoverable=?,presence_visible=?,allow_invites=?,updated_at=? WHERE id=?',
            background,frame,artwork,favoriteGame,Number(discoverable),Number(presenceVisible),Number(allowInvites),Date.now(),id);
        }
        if(body.backgroundMode!==undefined||body.portraitFrame!==undefined){
          const existing=this.one('SELECT background_mode,portrait_frame FROM profiles WHERE id=?',id);
          this.sql.exec('UPDATE profiles SET background_mode=?,portrait_frame=? WHERE id=?',
            body.backgroundMode??existing.background_mode,body.portraitFrame??existing.portrait_frame,id);
        }
        return reply({ok:true,profile:this.card(id,id)});
      }
      if(path==='/pocket-social/presence'){
        if(!this.rate(id,'presence',15,60000))return reply({error:'rate_limited'},429);
        const gameId=body.gameId||'';
        if(!goodGame(gameId))return reply({error:'invalid_game'},400);
        this.sql.exec('UPDATE profiles SET seen_at=?,game_id=? WHERE id=?',Date.now(),gameId,id);
        return reply({ok:true});
      }
      if(path==='/pocket-social/friend-request'){
        const other=body.id;
        if(!uuid.test(other||'')||id===other)return reply({error:'invalid_account'},400);
        if(this.blocked(id,other))return reply({error:'blocked'},403);
        if(!this.one('SELECT 1 FROM profiles WHERE id=?',other))return reply({error:'user_not_found'},404);
        if(!this.rate(id,'friend_request',15,60000))return reply({error:'rate_limited'},429);
        const old=this.relation(id,other);
        if(old?.status==='accepted')return reply({error:'already_friends'},409);
        const [a,b]=this.pair(id,other);
        if(old?.status==='pending'){
          if(old.pending_by===id)return reply({error:'already_requested'},409);
          this.sql.exec("UPDATE friends SET status='accepted',pending_by=NULL,updated_at=? WHERE a=? AND b=?",Date.now(),a,b);
          return reply({ok:true,status:'accepted'});
        }
        this.sql.exec("INSERT INTO friends(a,b,status,pending_by,updated_at) VALUES(?,?,'pending',?,?)",a,b,id,Date.now());
        return reply({ok:true,status:'pending'},201);
      }
      if(path==='/pocket-social/friend-action'){
        const other=body.id,action=body.action;
        if(!uuid.test(other||'')||id===other)return reply({error:'invalid_account'},400);
        if(!['accept','decline','cancel','remove','block','unblock'].includes(action))
          return reply({error:'invalid_action'},400);
        if(action==='block'){
          this.sql.exec('INSERT OR IGNORE INTO blocks(blocker,blocked) VALUES(?,?)',id,other);
          const [a,b]=this.pair(id,other);
          this.sql.exec('DELETE FROM friends WHERE a=? AND b=?',a,b);
          this.sql.exec('DELETE FROM social_party WHERE (owner_id=? AND friend_id=?) OR (owner_id=? AND friend_id=?)',id,other,other,id);
          this.sql.exec("UPDATE invites SET status='cancelled' WHERE status='pending' AND ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?))",id,other,other,id);
          return reply({ok:true});
        }
        if(action==='unblock'){
          this.sql.exec('DELETE FROM blocks WHERE blocker=? AND blocked=?',id,other);
          return reply({ok:true});
        }
        const r=this.relation(id,other);
        if(!r)return reply({error:'not_connected'},404);
        const [a,b]=this.pair(id,other);
        if(action==='accept'){
          if(r.status!=='pending'||r.pending_by===id)return reply({error:'invalid_action'},409);
          this.sql.exec("UPDATE friends SET status='accepted',pending_by=NULL,updated_at=? WHERE a=? AND b=?",Date.now(),a,b);
        }else{
          if(action==='cancel'&&(r.status!=='pending'||r.pending_by!==id)||
            action==='decline'&&(r.status!=='pending'||r.pending_by===id)||
            action==='remove'&&r.status!=='accepted')return reply({error:'invalid_action'},409);
          this.sql.exec('DELETE FROM friends WHERE a=? AND b=?',a,b);
          this.sql.exec('DELETE FROM social_party WHERE (owner_id=? AND friend_id=?) OR (owner_id=? AND friend_id=?)',id,other,other,id);
          if(action==='remove')this.sql.exec("UPDATE invites SET status='cancelled' WHERE status='pending' AND ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?))",id,other,other,id);
        }
        return reply({ok:true});
      }
      if(path==='/pocket-social/invite'){
        const {toId,gameId,roomId}=body;
        if(!uuid.test(toId||'')||toId===id||!goodGame(gameId)||!uuid.test(roomId||'')||
          request.headers.get('x-pw-validated-room')!==roomId)return reply({error:'invalid_room'},400);
        if(!this.isFriend(id,toId))return reply({error:'friends_only'},403);
        if(!this.one('SELECT allow_invites FROM profiles WHERE id=?',toId)?.allow_invites)
          return reply({error:'invites_disabled'},403);
        if(!this.rate(id,'invite',16,60000))return reply({error:'rate_limited'},429);
        const recent=this.one("SELECT id FROM invites WHERE from_id=? AND to_id=? AND room_id=? AND status='pending' AND expires_at>?",id,toId,roomId,Date.now());
        if(recent)return reply({ok:true,inviteId:recent.id,reused:true});
        const inviteId=crypto.randomUUID(),now=Date.now();
        this.sql.exec("INSERT INTO invites(id,from_id,to_id,game_id,room_id,status,created_at,expires_at) VALUES(?,?,?,?,?,'pending',?,?)",
          inviteId,id,toId,gameId,roomId,now,now+30*60000);
        return reply({ok:true,inviteId},201);
      }
      if(path==='/pocket-social/invite-action'){
        const action=body.action,inviteId=body.id;
        if(!uuid.test(inviteId||'')||!['accept','decline','cancel'].includes(action))
          return reply({error:'invalid_request'},400);
        const invite=this.one('SELECT * FROM invites WHERE id=?',inviteId);
        if(!invite||invite.status!=='pending'||invite.expires_at<=Date.now())
          return reply({error:'invite_expired'},404);
        if(action==='cancel'&&invite.from_id!==id||action!=='cancel'&&invite.to_id!==id)
          return reply({error:'not_allowed'},403);
        if(action==='accept'&&(request.headers.get('x-pw-validated-invite')!==inviteId||!this.isFriend(id,invite.from_id)))
          return reply({error:'room_unavailable'},409);
        this.sql.exec('UPDATE invites SET status=? WHERE id=?',action==='accept'?'accepted':action==='cancel'?'cancelled':'declined',inviteId);
        return reply({ok:true,url:action==='accept'?'/apps/'+invite.game_id+'/?room='+encodeURIComponent(invite.room_id):null});
      }
      return reply({error:'not_found'},404);
    }catch(error){console.error('pocket_social_error',String(error));return reply({error:'internal_error'},500)}
  }
}
