from __future__ import annotations
from dataclasses import dataclass
from heapq import heappush, heappop
from math import exp
import random, statistics, json, itertools

DIRS=((1,0),(-1,0),(0,1),(0,-1),(1,-1),(-1,1))
AXES=(((1,0),(-1,0)),((0,1),(0,-1)),((1,-1),(-1,1)))

@dataclass(frozen=True)
class Config:
    name:str
    size:int=7
    shifts:int=2
    capture_max:int=2
    capture_single:bool=True
    swap_rule:bool=True
    turn_cap:int=110

@dataclass
class State:
    cfg:Config
    board:list[int]
    turn:int=1
    shifts_left:list[int]=None
    move_no:int=0
    captures:list[int]=None
    swapped:bool=False
    last_action:tuple|None=None
    def __post_init__(self):
        if self.shifts_left is None:self.shifts_left=[0,self.cfg.shifts,self.cfg.shifts]
        if self.captures is None:self.captures=[0,0,0]
    def clone(self):
        return State(self.cfg,self.board.copy(),self.turn,self.shifts_left.copy(),self.move_no,self.captures.copy(),self.swapped,self.last_action)

class Game:
    def __init__(self,cfg):
        self.cfg=cfg; self.n=cfg.size
    def idx(self,q,r): return r*self.n+q
    def qr(self,i): return (i%self.n,i//self.n)
    def inside(self,q,r): return 0<=q<self.n and 0<=r<self.n
    def neighbors(self,i):
        q,r=self.qr(i)
        for dq,dr in DIRS:
            nq,nr=q+dq,r+dr
            if self.inside(nq,nr): yield self.idx(nq,nr)
    def new(self): return State(self.cfg,[0]*(self.n*self.n))
    def legal(self,s):
        acts=[('p',i) for i,v in enumerate(s.board) if v==0]
        if s.move_no==1 and self.cfg.swap_rule and not s.swapped and s.turn==2:
            acts.append(('swap',))
        if s.shifts_left[s.turn]>0:
            for i,v in enumerate(s.board):
                if v!=s.turn: continue
                for j in self.neighbors(i):
                    if s.board[j]==0: acts.append(('s',i,j))
        return acts
    def apply(self,s,a):
        ns=s.clone(); p=s.turn; ns.last_action=a
        if a[0]=='swap':
            ns.board=[0 if v==0 else 3-v for v in ns.board]
            ns.shifts_left[1],ns.shifts_left[2]=ns.shifts_left[2],ns.shifts_left[1]
            ns.captures[1],ns.captures[2]=ns.captures[2],ns.captures[1]
            ns.swapped=True
        elif a[0]=='p': ns.board[a[1]]=p
        else:
            _,i,j=a; ns.board[i]=0; ns.board[j]=p; ns.shifts_left[p]-=1
        removed=self.capture(ns,p,a)
        ns.captures[p]+=removed
        ns.move_no+=1; ns.turn=3-p
        return ns
    def capture(self,s,p,a):
        if a[0]=='swap': return 0
        origin=a[1] if a[0]=='p' else a[2]
        q,r=self.qr(origin); opp=3-p; rem=set()
        for (d1,d2) in AXES:
            for dq,dr in (d1,d2):
                line=[]
                for step in range(1,self.cfg.capture_max+2):
                    nq,nr=q+dq*step,r+dr*step
                    if not self.inside(nq,nr): break
                    v=s.board[self.idx(nq,nr)]
                    if v==opp: line.append(self.idx(nq,nr)); continue
                    if v==p and line and len(line)<=self.cfg.capture_max and (self.cfg.capture_single or len(line)>1): rem.update(line)
                    break
        for i in rem:s.board[i]=0
        return len(rem)
    def win(self,s,p):
        starts=[]
        if p==1:
            starts=[self.idx(q,0) for q in range(self.n) if s.board[self.idx(q,0)]==p]
            target=lambda q,r:r==self.n-1
        else:
            starts=[self.idx(0,r) for r in range(self.n) if s.board[self.idx(0,r)]==p]
            target=lambda q,r:q==self.n-1
        seen=set(starts); stack=starts[:]
        while stack:
            i=stack.pop(); q,r=self.qr(i)
            if target(q,r): return True
            for j in self.neighbors(i):
                if s.board[j]==p and j not in seen:seen.add(j);stack.append(j)
        return False
    def path_cost(self,s,p):
        INF=999
        dist=[INF]*len(s.board); h=[]
        starts=(range(self.n) if p==1 else (self.idx(0,r) for r in range(self.n)))
        if p==1: starts=[self.idx(q,0) for q in range(self.n)]
        for i in starts:
            v=s.board[i]; c=0 if v==p else (1 if v==0 else 5)
            dist[i]=c; heappush(h,(c,i))
        while h:
            d,i=heappop(h)
            if d!=dist[i]: continue
            q,r=self.qr(i)
            if (p==1 and r==self.n-1) or (p==2 and q==self.n-1): return d
            for j in self.neighbors(i):
                v=s.board[j]; w=0 if v==p else (1 if v==0 else 5)
                nd=d+w
                if nd<dist[j]: dist[j]=nd; heappush(h,(nd,j))
        return INF
    def terminal(self,s):
        for p in (1,2):
            if self.win(s,p): return p
        if s.move_no>=s.cfg.turn_cap:
            c1,c2=self.path_cost(s,1),self.path_cost(s,2)
            if c1!=c2:return 1 if c1<c2 else 2
            if s.captures[1]!=s.captures[2]:return 1 if s.captures[1]>s.captures[2] else 2
            return 1 if sum(1 for v in s.board if v==1)>=sum(1 for v in s.board if v==2) else 2
        return 0

PERSONAS={
'rush':dict(own=5.2,opp=1.6,cap=.8,center=.35,shift=.10,noise=.38),
'guard':dict(own=2.8,opp=4.7,cap=.55,center=.25,shift=.08,noise=.42),
'hunter':dict(own=2.8,opp=2.3,cap=3.1,center=.18,shift=.16,noise=.48),
'weaver':dict(own=3.8,opp=3.4,cap=1.15,center=.55,shift=.05,noise=.30),
}

def choose(g,s,persona,rng):
    p=s.turn; w=PERSONAS[persona]; acts=g.legal(s)
    # Search a tactically relevant frontier instead of exhaustively scoring every
    # geometrically possible shuffle. Immediate path cells, contacts and centre
    # remain represented for all four personalities.
    if len(acts)>34:
        def pre(a):
            if a[0]=='swap': return 100
            idx=a[1] if a[0]=='p' else a[2]
            q,r=g.qr(idx); c=(g.n-1)/2
            contact=sum(1 for j in g.neighbors(idx) if s.board[j]!=0)
            own_contact=sum(1 for j in g.neighbors(idx) if s.board[j]==p)
            opp_contact=sum(1 for j in g.neighbors(idx) if s.board[j]==3-p)
            progress=(r if p==1 else q)+(g.n-1-(r if p==1 else q))*.08
            return contact*2.2+own_contact*1.2+opp_contact*1.5-0.18*(abs(q-c)+abs(r-c))+progress*.12-(1.4 if a[0]=='s' else 0)
        acts=sorted(acts,key=pre,reverse=True)[:34]
    scored=[]
    base_caps=s.captures[p]
    for a in acts:
        ns=g.apply(s,a)
        if g.win(ns,p): return a, 9999
        own=g.path_cost(ns,p); opp=g.path_cost(ns,3-p)
        qcenter=0
        if a[0] in ('p','s'):
            idx=a[1] if a[0]=='p' else a[2]; q,r=g.qr(idx)
            qcenter=-(abs(q-(g.n-1)/2)+abs(r-(g.n-1)/2))
        captured=ns.captures[p]-base_caps
        score=-w['own']*own+w['opp']*opp+w['cap']*captured+w['center']*qcenter
        if a[0]=='s': score-=w['shift']*(g.cfg.shifts-ns.shifts_left[p]+1)
        if a[0]=='swap': score=1.2 + rng.random()*.2
        score+=rng.gauss(0,w['noise'])
        scored.append((score,a))
    scored.sort(reverse=True,key=lambda x:x[0])
    k=min(4,len(scored)); weights=[exp((scored[i][0]-scored[0][0])/1.15) for i in range(k)]
    pick=rng.choices(range(k),weights=weights,k=1)[0]
    gap=scored[0][0]-scored[min(2,len(scored)-1)][0]
    return scored[pick][1],gap

def play(cfg,a,b,seed):
    rng=random.Random(seed); g=Game(cfg); s=g.new(); gaps=[]; shifts=0; captures=0; opening=[]; snapshots=[]
    while True:
        winner=g.terminal(s)
        if winner:
            pc40=snapshots[len(snapshots)*2//5] if snapshots else (0,0)
            return dict(winner=winner,turns=s.move_no,shifts=shifts,captures=captures,opening=tuple(opening),gaps=gaps,pc40=pc40)
        persona=a if s.turn==1 else b
        action,gap=choose(g,s,persona,rng); gaps.append(gap)
        if len(opening)<6:opening.append(action)
        before=s.captures[s.turn]
        s=g.apply(s,action)
        if action[0]=='s':shifts+=1
        captures+=s.captures[3-s.turn]-before
        snapshots.append((g.path_cost(s,1),g.path_cost(s,2)))

def audit(cfg,games_per_match=1):
    rows=[]; seed=hash(cfg.name)&0xffffffff
    pairs=list(itertools.product(PERSONAS,PERSONAS))
    for pi,(a,b) in enumerate(pairs):
        for k in range(games_per_match):rows.append((a,b,play(cfg,a,b,seed+pi*1000+k)))
    n=len(rows); first=sum(r[2]['winner']==1 for r in rows)/n
    turns=[r[2]['turns'] for r in rows]; caps=[r[2]['captures'] for r in rows]; shifts=[r[2]['shifts'] for r in rows]
    openings=len({r[2]['opening'] for r in rows})/n
    persona_wins={p:[0,0] for p in PERSONAS}
    comeback=0
    for a,b,res in rows:
        persona_wins[a][1]+=1; persona_wins[b][1]+=1
        if res['winner']==1:persona_wins[a][0]+=1
        else:persona_wins[b][0]+=1
        c1,c2=res['pc40']; behind=(c1>c2 and res['winner']==1) or (c2>c1 and res['winner']==2)
        comeback+=behind
    prs={p:w/t for p,(w,t) in persona_wins.items()}
    style_spread=statistics.pstdev(prs.values())
    avg_gap=statistics.mean(g for r in rows for g in r[2]['gaps'])
    bal=max(0,1-abs(first-.5)/.22)
    length=max(0,1-abs(statistics.mean(turns)-34)/28)
    cap_activity=min(1,statistics.mean(caps)/3.2) if cfg.capture_max else 0
    shift_activity=min(1,statistics.mean(shifts)/2.2) if cfg.shifts else 0
    style=max(0,1-style_spread/.18)
    comeback_rate=comeback/n
    close=max(0,min(1,1-avg_gap/3.2))
    score=100*(.23*bal+.14*length+.14*openings+.12*style+.10*cap_activity+.08*shift_activity+.10*comeback_rate+.09*close)
    return dict(name=cfg.name,size=cfg.size,shifts=cfg.shifts,capture_max=cfg.capture_max,capture_single=cfg.capture_single,swap=cfg.swap_rule,games=n,first_win=round(first,3),avg_turns=round(statistics.mean(turns),1),p90_turns=sorted(turns)[int(.9*n)-1],avg_caps=round(statistics.mean(caps),2),avg_shifts=round(statistics.mean(shifts),2),opening_diversity=round(openings,3),comeback=round(comeback_rate,3),style_rates={k:round(v,3) for k,v in prs.items()},style_spread=round(style_spread,3),decision_gap=round(avg_gap,2),score=round(score,1))

CONFIGS=[
Config('A-6-no-shift-single',6,0,1,True,False,80),
Config('B-6-2shift-single-swap',6,2,1,True,True,90),
Config('C-6-3shift-double-swap',6,3,2,True,True,100),
Config('D-7-no-capture-2shift',7,2,0,False,True,100),
Config('E-7-1shift-single',7,1,1,True,True,105),
Config('F-7-2shift-single',7,2,1,True,True,110),
Config('G-7-2shift-double',7,2,2,True,True,110),
Config('H-7-3shift-double',7,3,2,True,True,115),
Config('I-7-2shift-double-no-single',7,2,2,False,True,110),
Config('J-8-2shift-single',8,2,1,True,True,125),
Config('K-8-3shift-double',8,3,2,True,True,135),
Config('L-7-4shift-single-noswap',7,4,1,True,False,120),
]
if __name__=='__main__':
    out=[]
    for c in CONFIGS:
        r=audit(c); out.append(r); print(json.dumps(r,ensure_ascii=False))
    out.sort(key=lambda x:x['score'],reverse=True)
    print('\nRANKING')
    for r in out: print(f"{r['score']:5.1f} {r['name']} first={r['first_win']} turns={r['avg_turns']} caps={r['avg_caps']} shifts={r['avg_shifts']} styles={r['style_rates']}")
