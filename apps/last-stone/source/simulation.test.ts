import { describe,it,expect } from 'vitest';
import { newGame,build,remove,repair,startWave,tick,loadGame,saveGame,MAX_HP } from './simulation';

describe('castle campaign',()=>{
  it('spends materials, salvages damaged masonry, and preserves a valid save',()=>{
    const s=newGame();
    expect(build(s,'wall',4,3)).toBeNull();
    expect(s.stone).toBe(117);
    s.pieces[0].hp=40;
    const before=s.stone;
    expect(repair(s,4,3)).toBeNull();
    expect(s.pieces[0].hp).toBe(MAX_HP.wall);
    expect(s.stone).toBeLessThan(before);
    expect(remove(s,4,3)).toBeNull();
    expect(s.pieces).toHaveLength(0);
    expect(loadGame(saveGame(s)).stone).toBe(s.stone);
    expect(loadGame('{"version":1,"pieces":[{"kind":"unknown"}]}').pieces).toHaveLength(0);
  });
  it('resolves a full siege into defeat without any defenses',()=>{
    const s=newGame();startWave(s);
    for(let i=0;i<9000&&s.phase==='siege';i++)tick(s,1/30);
    expect(s.phase).toBe('lost');
    expect(s.keep).toBe(0);
  });
  it('rejects inaccessible or duplicate construction',()=>{
    const s=newGame();
    expect(build(s,'archer',4,4)).toMatch(/нужна стена/);
    expect(build(s,'wall',5,5)).toMatch(/донжон/);
    expect(build(s,'wall',4,3)).toBeNull();
    expect(build(s,'wall',4,3)).toMatch(/занято/);
    expect(build(s,'archer',4,2)).toBeNull();
  });
});
