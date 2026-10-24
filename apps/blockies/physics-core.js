// Authoritative pure movement rules. This file is the ONLY editable copy.
// scripts/sync-blockies-physics.mjs embeds it into the standalone PocketNet module.
// No DOM, timers, mutable global game state, or network effects are allowed here.
export const SHAPES = {
    I: [[1, 1, 1, 1]],
    O: [[1, 1], [1, 1]],
    T: [[0, 1, 0], [1, 1, 1]],
    S: [[0, 1, 1], [1, 1, 0]],
    Z: [[1, 1, 0], [0, 1, 1]],
    J: [[1, 0, 0], [1, 1, 1]],
    L: [[0, 0, 1], [1, 1, 1]]
};
export const PIECE_TYPES = Object.keys(SHAPES);
export const LOCK_DELAY_MS = 450;
export const MAX_LOCK_RESETS = 8;
export const SAFE_LANE_ROWS = 5;
export const KICK_OFFSETS = [[0,0],[-1,0],[1,0],[-2,0],[2,0],[-3,0],[3,0],[0,-1],[-1,-1],[1,-1]];

export function rotatedClockwise(piece) {
    return piece[0].map((_,i)=>piece.map(row=>row[i]).reverse());
}

export function inferShapeType(piece) {
    if (!Array.isArray(piece)) return null;
    for (const type of PIECE_TYPES) {
        let shape=SHAPES[type];
        for (let i=0;i<4;i++) {
            if (JSON.stringify(shape)===JSON.stringify(piece)) return type;
            shape=rotatedClockwise(shape);
        }
    }
    return null;
}

export function otherPieceOccupies(x,y,players,ownerId) {
    return players.some(player=>{
        if(player.id===ownerId||player.gameOver||player.offline||!player.currentPiece)return false;
        for(let py=0;py<player.currentPiece.length;py++)
            for(let px=0;px<player.currentPiece[py].length;px++)
                if(player.currentPiece[py][px]&&player.position.x+px===x&&player.position.y+py===y)
                    return true;
        return false;
    });
}

export function checkPieceCollision(piece,pos,board,players,ownerId) {
    const result={collides:false,withLocked:false,withActive:false};
    if(!piece||!board?.length)return {collides:true,withLocked:true,withActive:false};
    const width=board[0].length,height=board.length;
    for(let y=0;y<piece.length;y++)
        for(let x=0;x<piece[y].length;x++){
            if(!piece[y][x])continue;
            const xx=pos.x+x,yy=pos.y+y;
            if(xx<0||xx>=width||yy>=height){
                return {collides:true,withLocked:true,withActive:result.withActive};
            }
            if(yy<0)continue;
            if(board[yy][xx]){
                return {collides:true,withLocked:true,withActive:result.withActive};
            }
            if(otherPieceOccupies(xx,yy,players,ownerId)){
                result.collides=true;
                result.withActive=true;
            }
        }
    return result;
}

export function findRotationPlacement(piece,pos,board,players,ownerId) {
    const rotated=rotatedClockwise(piece);
    for(const [dx,dy] of KICK_OFFSETS){
        const target={x:pos.x+dx,y:pos.y+dy};
        if(!checkPieceCollision(rotated,target,board,players,ownerId).collides)
            return {currentPiece:rotated,position:target};
    }
    return null;
}

export function isLaneClear(laneX,board,players,ownerId,numPlayers) {
    if(numPlayers<=1)return true;
    for(let y=0;y<SAFE_LANE_ROWS;y++)
        for(let x=laneX;x<laneX+4;x++)
            if(board[y]?.[x]||otherPieceOccupies(x,y,players,ownerId))return false;
    return true;
}

/** Pull one tetromino from a 7-bag without mutating the supplied bag. */
export function drawSevenBag(bag,random) {
    const remaining=bag.length?bag.slice():PIECE_TYPES.slice();
    if(!bag.length){
        for(let i=remaining.length-1;i>0;i--){
            const j=Math.floor(random()*(i+1));
            [remaining[i],remaining[j]]=[remaining[j],remaining[i]];
        }
    }
    return {type:remaining.pop(),bag:remaining};
}

/** Hold never consumes the next piece when exchanging with an occupied slot. */
export function planHold(seat){
    if(seat.gameOver||!seat.currentPiece||seat.holdUsed)return null;
    const outgoing=seat.currentType||inferShapeType(seat.currentPiece);
    if(!outgoing)return null;
    return {outgoing,incoming:seat.holdType||null,consumeNext:!seat.holdType};
}

export function adjustLock(counter,resets) {
    return counter>0&&resets<MAX_LOCK_RESETS
        ?{lockCounter:0,lockResets:resets+1}
        :{lockCounter:counter,lockResets:resets};
}

export function advanceLock(counter,elapsed,isOnLockedSurface) {
    return isOnLockedSurface?counter+elapsed:0;
}

/** Same score contract for local co-op and server-authoritative co-op. */
export function scoreLineClear(stats,linesCleared) {
    if(linesCleared===0)return {
        score:stats.score,lines:stats.lines,level:stats.level,
        comboChain:0,lastClearDetail:null
    };
    const comboStep=stats.comboChain||0;
    const comboMultiplier=1+0.1*comboStep;
    const multiMultiplier=1+0.2*(linesCleared-1);
    const perLineScore=Math.round(100*comboMultiplier*multiMultiplier);
    const gained=perLineScore*linesCleared;
    const lines=stats.lines+linesCleared;
    const comboChain=comboStep+1;
    return {
        score:stats.score+gained,
        lines,
        level:Math.floor(lines/10)+1,
        comboChain,
        lastClearDetail:{
            linesCleared,totalScore:gained,perLineScore,basePerLine:100,
            comboChain,comboMultiplier,multiMultiplier,
            streakBonusPercent:Math.round((comboMultiplier-1)*100),
            multiBonusPercent:Math.round((multiMultiplier-1)*100)
        }
    };
}

export function intervalAfterClear(interval,linesCleared) {
    return Math.max(100,interval*Math.pow(0.95,linesCleared));
}
