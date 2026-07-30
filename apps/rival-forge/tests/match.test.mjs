import test from 'node:test';
import assert from 'node:assert/strict';
import { HERO_BY_ID } from '../data.js';
import { exportPayload, normalizeImported } from '../state-codec.js';
import { classifyEnemyPlan, heroContextScore, buildLocalMeta, contextualRecommendations, evaluateMatchPlan, buildDecisionTree } from '../match-core.js';

const diveEnemy=['psylocke','spider-man','venom',null,null,null];
const context={mode:'competitive',mapId:'royal-palace',side:'defense',intent:'stable'};
const baseOptions={mode:'party',partySize:2,matchContext:context,enemyTeam:diveEnemy,matchHistory:[],players:[],playerAssignments:[null,null,null,null,null,null],loadoutChoices:{}};

test('enemy picks are classified into a readable match plan',()=>{
  const plan=classifyEnemyPlan(diveEnemy);
  assert.equal(plan.id,'dive');
  assert.ok(plan.confidence>0);
  assert.ok(plan.counters.includes('anti-dive'));
});

test('map, side and enemy plan change hero context value',()=>{
  const peni=heroContextScore(HERO_BY_ID['peni-parker'],baseOptions);
  const hela=heroContextScore(HERO_BY_ID.hela,baseOptions);
  assert.ok(peni.score>hela.score);
  assert.ok(peni.reasons.some(reason=>reason.includes('ответ на DIVE')||reason.includes('защита')));
});

test('local meta uses match history and sample-size shrinkage',()=>{
  const one=[{result:'win',comfort:5,team:['peni-parker',null,null,null,null,null],mapId:'royal-palace'}];
  const eight=Array.from({length:8},(_,index)=>({...one[0],id:`m${index}`}));
  const oneScore=heroContextScore(HERO_BY_ID['peni-parker'],{...baseOptions,matchHistory:one}).score;
  const eightScore=heroContextScore(HERO_BY_ID['peni-parker'],{...baseOptions,matchHistory:eight}).score;
  assert.ok(eightScore>oneScore);
  const meta=buildLocalMeta(eight);
  assert.equal(meta.games,8);
  assert.equal(meta.hero['peni-parker'].games,8);
  assert.equal(meta.winRate,1);
});

test('context-aware recommendations and match score remain finite',()=>{
  const recommendations=contextualRecommendations(['mister-fantastic',null,null,null,null,null],{}, {...baseOptions,limit:10});
  assert.ok(recommendations.length>0);
  assert.ok(recommendations.every(item=>Number.isFinite(item.score)&&Number.isFinite(item.context.score)));
  assert.ok(recommendations.some(item=>item.hero.id==='peni-parker'));
  const plan=evaluateMatchPlan(['mister-fantastic','invisible-woman',null,null,null,null],{},baseOptions);
  assert.ok(Number.isFinite(plan.overall));
  assert.ok(plan.context>=0&&plan.context<=100);
  assert.equal(plan.enemyPlan.id,'dive');
});

test('decision tree includes enemy response and matchmaking role budget',()=>{
  const state={plannerMode:'party',partySize:2,team:['mister-fantastic','invisible-woman',null,null,null,null],locks:[true,false,false,false,false,false],prefs:{tiers:{},scores:{},confidence:{},notes:{},favorites:[]},players:[],playerAssignments:[null,null,null,null,null,null],loadoutChoices:{},matchContext:context,enemyTeam:diveEnemy,matchHistory:[]};
  const branches=buildDecisionTree(state);
  assert.ok(branches.some(branch=>branch.tone==='enemy'));
  assert.ok(branches.some(branch=>branch.tone==='roles'));
  assert.ok(branches.length<=4);
});

test('schema 4 export keeps match context, enemies and history',()=>{
  const state={plannerMode:'party',partySize:2,team:['mister-fantastic','invisible-woman',null,null,null,null],locks:[true,true,false,false,false,false],loadoutChoices:{},prefs:{tiers:{},scores:{},confidence:{},notes:{},favorites:[]},players:[],playerAssignments:[null,null,null,null,null,null],variants:[],matchContext:context,enemyTeam:diveEnemy,matchHistory:[{id:'m1',playedAt:1,result:'win',...context,team:['mister-fantastic','invisible-woman',null,null,null,null],playerAssignments:[],loadoutChoices:{},enemyTeam:diveEnemy,comfort:4,missing:'',notes:'worked'}],savedTeams:[]};
  const payload=exportPayload(state);
  assert.equal(payload.schema,'rival-forge/4');
  const restored=normalizeImported(payload);
  assert.deepEqual(restored.matchContext,context);
  assert.deepEqual(restored.enemyTeam.slice(0,3),diveEnemy.slice(0,3));
  assert.equal(restored.matchHistory.length,1);
  assert.equal(restored.matchHistory[0].result,'win');
  assert.equal(restored.matchHistory[0].notes,'worked');
});
