import test from 'node:test';
import assert from 'node:assert/strict';
import { HEROES, HERO_BY_ID, TEAM_UPS, PRESETS } from '../data.js';
import { LOADOUTS, LOADOUTS_BY_HERO, LOADOUT_BY_ID } from '../loadouts.js';
import { heroRating, playerHeroFit, analyzeTeam, partyRolePlan, recommendHeroes, recommendLoadouts, optimizeLoadoutChoices, compareHeroCandidates, autoComplete, optimizeTeam, exportPayload, normalizeImported } from '../core.js';

test('roster, links and loadouts are coherent',()=>{
  assert.equal(HEROES.length,52);assert.equal(new Set(HEROES.map(h=>h.id)).size,52);assert.ok(TEAM_UPS.length>=40);
  for(const link of TEAM_UPS)for(const id of link.members)assert.ok(HERO_BY_ID[id],`${link.id}: ${id}`);
  for(const preset of PRESETS)for(const id of preset.heroes)assert.ok(HERO_BY_ID[id]);
  assert.equal(LOADOUTS.length,104);assert.equal(new Set(LOADOUTS.map(x=>x.id)).size,104);
  for(const hero of HEROES)assert.equal(LOADOUTS_BY_HERO[hero.id]?.length,2,hero.id);
  for(const option of LOADOUTS){assert.ok(HERO_BY_ID[option.hero]);assert.ok(HERO_BY_ID[option.partner]||option.partner==='the-hood');}
});

test('personal preferences affect rating',()=>{const hero=HERO_BY_ID['mister-fantastic'];assert.ok(heroRating(hero,{tiers:{[hero.id]:'S+'},scores:{[hero.id]:100},confidence:{[hero.id]:100},favorites:[hero.id]})>heroRating(hero,{}));});

test('player profiles affect hero fit and blocks',()=>{
  const player={id:'ilya',name:'Илья',primaryRole:'Duelist',backupRole:'Vanguard',style:'aggressive',heroSkill:{'mister-fantastic':94,'invisible-woman':35},blocked:['hela']};
  assert.ok(playerHeroFit(HERO_BY_ID['mister-fantastic'],player).score>playerHeroFit(HERO_BY_ID['invisible-woman'],player).score);
  assert.equal(playerHeroFit(HERO_BY_ID.hela,player).blocked,true);
});

test('party duo of two duelists remains feasible in a 6-player match',()=>{
  const team=['mister-fantastic','hela',null,null,null,null];const plan=partyRolePlan(team,2);assert.equal(plan.unfixable,0);assert.equal(plan.flexibility,100);assert.deepEqual(plan.requiredRoles,{Vanguard:2,Duelist:0,Strategist:2});
  const analysis=analyzeTeam(team,{}, {mode:'party',partySize:2});assert.ok(analysis.overall>55);assert.equal(analysis.randomSlots,4);
});

test('party role overload is detected only when strangers cannot repair it',()=>{
  const plan=partyRolePlan(['hela','hawkeye','cyclops','phoenix','mister-fantastic',null],5);assert.ok(plan.unfixable>=3);assert.equal(plan.feasible,false);
  const analysis=analyzeTeam(['hela','hawkeye','cyclops','phoenix','mister-fantastic',null],{}, {mode:'party',partySize:5});assert.ok(analysis.warnings.some(x=>x.includes('не хватает')));
});

test('full mode still detects Reed and Sue tactical core',()=>{const result=analyzeTeam(['mister-fantastic','invisible-woman',null,null,null,null],{}, {mode:'full'});assert.ok(result.links.some(x=>x.id==='reed-sue'));});

test('party recommendation values partner chemistry',()=>{
  const results=recommendHeroes(['mister-fantastic',null,null,null,null,null],{}, {mode:'party',partySize:2,limit:10,size:6});const sue=results.findIndex(x=>x.hero.id==='invisible-woman');assert.ok(sue>=0&&sue<5);assert.ok(results[sue].reasons.some(x=>x.includes('First Family')||x.includes('связка')));
});

test('assigned player changes recommendations and blocks excluded heroes',()=>{
  const player={id:'yasya',name:'Яся',primaryRole:'Strategist',backupRole:'Duelist',style:'supportive',heroSkill:{'invisible-woman':97},blocked:['hela']};
  const results=recommendHeroes(['mister-fantastic',null,null,null,null,null],{}, {mode:'party',partySize:2,limit:10,size:6,playerProfile:player});
  assert.equal(results.some(x=>x.hero.id==='hela'),false);assert.ok(results.findIndex(x=>x.hero.id==='invisible-woman')<3);
});

test('team analysis includes concrete player assignments',()=>{
  const players=[{id:'ilya',name:'Илья',primaryRole:'Duelist',backupRole:'Vanguard',style:'aggressive',heroSkill:{'mister-fantastic':94},blocked:[]},{id:'yasya',name:'Яся',primaryRole:'Strategist',backupRole:'Duelist',style:'supportive',heroSkill:{'invisible-woman':96},blocked:[]}];
  const result=analyzeTeam(['mister-fantastic','invisible-woman',null,null,null,null],{}, {mode:'party',partySize:2,players,playerAssignments:['ilya','yasya',null,null,null,null]});
  assert.equal(result.playerFit.assigned,2);assert.ok(result.playerFit.score>80);
});

test('loadout recommendation and group optimizer prefer active enhanced options',()=>{
  const [reed]=recommendLoadouts(['mister-fantastic','the-thing'],{}).filter(x=>x.heroId==='mister-fantastic');assert.equal(reed.recommended.id,'clobberin-research');assert.equal(reed.recommended.partnerPresent,true);
  const [sue]=recommendLoadouts(['invisible-woman','mister-fantastic'],{}).filter(x=>x.heroId==='invisible-woman');assert.equal(sue.recommended.id,'first-family');
  const choices=optimizeLoadoutChoices(['mister-fantastic','invisible-woman'],{});assert.equal(choices['invisible-woman'],'first-family');
});

test('candidate comparison respects assigned player skill',()=>{
  const player={id:'ilya',name:'Илья',primaryRole:'Duelist',backupRole:'Vanguard',style:'aggressive',heroSkill:{'mister-fantastic':98,'hela':50},blocked:[]};
  const result=compareHeroCandidates('mister-fantastic','hela',[null,null,null,null,null,null],{}, {mode:'party',partySize:2,playerProfile:player});assert.equal(result.winner.hero.id,'mister-fantastic');
});

test('party autocomplete fills only controlled party slots and uses assignments',()=>{
  const players=[{id:'yasya',name:'Яся',primaryRole:'Strategist',backupRole:'Duelist',style:'supportive',heroSkill:{'invisible-woman':100},blocked:[]}];
  const team=autoComplete(['mister-fantastic',null,null,null,null,null],[true,false,false,false,false,false],{}, {mode:'party',partySize:2,players,playerAssignments:[null,'yasya',null,null,null,null]});assert.equal(team.slice(0,2).filter(Boolean).length,2);assert.ok(team.slice(2).every(x=>x===null));assert.equal(new Set(team.filter(Boolean)).size,2);assert.equal(team[1],'invisible-woman');
});

test('full optimizer preserves locked anchors and fills six',()=>{const result=optimizeTeam(['rogue','gambit','iron-fist',null,null,null],[true,true,false,false,false,false],{}, {mode:'full'});assert.equal(result[0],'rogue');assert.equal(result[1],'gambit');assert.equal(result.filter(Boolean).length,6);assert.equal(new Set(result).size,6);});

test('export/import keeps profiles, assignments, variants and valid loadouts',()=>{
 const players=[{id:'ilya',name:'Илья',color:'#9d65ff',primaryRole:'Duelist',backupRole:'Vanguard',style:'aggressive',heroSkill:{rogue:82},blocked:[]}];
 const payload=exportPayload({plannerMode:'party',partySize:3,team:['rogue','missing','gambit',null,null,null],locks:[true,true,false,false,false,false],loadoutChoices:{rogue:'mr-mrs-x',gambit:'garbage'},prefs:{tiers:{rogue:'S+'}},players,playerAssignments:['ilya',null,null,null,null,null],variants:[{id:'v1',name:'Основной',team:['rogue',null,'gambit',null,null,null],playerAssignments:['ilya'],loadoutChoices:{rogue:'mr-mrs-x'},score:88}],savedTeams:[]});
 const restored=normalizeImported(payload);assert.equal(restored.plannerMode,'party');assert.equal(restored.partySize,3);assert.deepEqual(restored.team.slice(0,3),['rogue',null,'gambit']);assert.equal(restored.loadoutChoices.rogue,'mr-mrs-x');assert.equal(restored.loadoutChoices.gambit,undefined);assert.ok(LOADOUT_BY_ID[restored.loadoutChoices.rogue]);assert.equal(restored.players[0].name,'Илья');assert.equal(restored.playerAssignments[0],'ilya');assert.equal(restored.variants[0].name,'Основной');
});
