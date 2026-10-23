import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {BoardEffects,FX_DURATION,getNewLockedCells} from '../board-effects.js';

test('only newly occupied accepted board cells are interpreted as locks',()=>{
    const before=[
        [0,0,1,0],
        [0,2,2,0],
        [0,0,0,0]
    ];
    const after=[
        [0,3,1,0],
        [0,2,2,0],
        [3,3,0,0]
    ];
    assert.deepEqual(getNewLockedCells(before,after),[
        {x:1,y:0,owner:3},{x:0,y:2,owner:3},{x:1,y:2,owner:3}
    ]);
    assert.deepEqual(getNewLockedCells(null,after),[]);
    assert.deepEqual(getNewLockedCells(before,null),[]);
});

test('impact and line clear effects are read-only snapshots, bounded and do not block input',()=>{
    const fx=new BoardEffects({colors:()=>['#f000aa','#11ccff']});
    fx.boardWidth=10;
    const calls=[];
    const context=new Proxy({}, {get:(_target,key)=>{
        if(key==='createLinearGradient')return()=>({addColorStop:()=>{}});
        if(key==='measureText')return()=>({width:18});
        if(['fillRect','clearRect','strokeRect','beginPath','moveTo','lineTo','stroke','ellipse','fillText','save','restore'].includes(key))
          return (...args)=>calls.push({key,args});
        return undefined;
    },set:()=>true});
    let frame=null;
    const originalRAF=globalThis.requestAnimationFrame;
    const originalCAF=globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame=callback=>(frame=callback,1);
    globalThis.cancelAnimationFrame=()=>{};
    try{
        const canvas={width:300,height:600,getContext:()=>context};
        fx.attach(canvas);
        const pieces=[{x:1,y:18,owner:1},{x:2,y:18,owner:1}];
        fx.landing(pieces,'#f000aa',{hard:true});
        const rows=[{y:19,cells:Array(10).fill(1)}];
        fx.clearRows(rows,{linesCleared:1,comboChain:3,totalScore:410});
        pieces[0].x=1000;
        rows[0].cells[0]=2;
        assert.equal(fx.events.length,2);
        assert.equal(fx.events[0].cells[0].x,1);
        assert.equal(fx.events[1].rows[0].cells[0],1);
        const start=Math.min(...fx.events.map(event=>event.start));
        frame(start+45);
        assert.ok(calls.some(call=>call.key==='fillRect'));
        assert.ok(calls.some(call=>call.key==='fillText'));
        for(let i=0;i<16;i++)fx.landing([{x:i,y:17}], '#88ccaa');
        assert.ok(fx.events.length<=8);
        fx.reset();
        assert.equal(fx.events.length,0);
        assert.equal(fx.running,false);
    }finally{
        globalThis.requestAnimationFrame=originalRAF;
        globalThis.cancelAnimationFrame=originalCAF;
    }
});

test('reduced motion suppresses canvas effects; audio and input remain independent',()=>{
    const fx=new BoardEffects({reducedMotion:true});
    fx.attach({width:300,height:600,getContext:()=>({clearRect(){}})});
    fx.landing([{x:1,y:2}],'#ffffff');
    fx.clearRows([{y:19,cells:[1,1]}],{linesCleared:1});
    assert.equal(fx.events.length,0);
    assert.ok(FX_DURATION.landing<=350);
    assert.ok(FX_DURATION.clear<=550);
});

test('visual and sound integration is confined to client, server rules remain unchanged',async()=>{
    const game=await fs.readFile(new URL('../game.js',import.meta.url),'utf8');
    const css=await fs.readFile(new URL('../styles.css',import.meta.url),'utf8');
    const sw=await fs.readFile(new URL('../sw.js',import.meta.url),'utf8');
    assert.match(game,/import \{BoardEffects,getNewLockedCells\} from '\.\/board-effects\.js'/);
    assert.match(game,/effectsCanvas\.id='game-effects-canvas'/);
    assert.match(game,/this\.boardEffects\.attach\(effectsCanvas\)/);
    assert.match(game,/this\.boardEffects\.landing\(cells,player\.color,\{hard\}\)/);
    assert.match(game,/this\.boardEffects\.clearRows\(rows,detail\|\|\{\}\)/);
    assert.match(game,/const freshClear=lineDelta>0/);
    assert.match(game,/lastClearDetail:detail\|\|null/);
    assert.match(game,/if\(!previousGameOver&&s\.isGameOver\)soundManager\.gameOver\(\)/);
    assert.match(game,/setEnabled\(enabled\)/);
    assert.match(game,/this\.master\.gain\.value=this\.enabled \? \.65 : 0/);
    assert.match(css,/#game-effects-canvas\{/);
    assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
    assert.match(sw,/board-effects\.js/);
});
