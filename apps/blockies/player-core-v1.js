// Blockies Player core v1: one class implements local and server-controlled pieces.
// Only the supplied adapters may produce UI/audio/network side effects. Do not mutate
// this version after it is pinned to a PocketNet snapshot.
import {collision as coreCollision, rotateWithKick, chooseSpawn, clearCompletedRows, lineScore} from './engine-core-v1.js';

export function createPlayerClass({
    gameState, getBoardWidth, BOARD_HEIGHT, BASE_LINE_SCORE, nextBaggedPiece,
    soundManager, checkAllPlayersGameOver, onAction = () => {}, signals = {}
}) {
    class Player {
    constructor(id, color, keys, spawnAnchor) {
        this.id = id;
        this.color = color;
        this.keys = keys;
        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.currentPiece = null;
        this.nextPiece = null;
        this.heldPiece = null;
        this.holdUsed = false;
        this.position = { x: 0, y: 0 };
        this.gameOver = false;
        this.dropCounter = 0;
        this.dropInterval = 1000;
        this.lastTime = 0;
        this.spawnAnchor = typeof spawnAnchor === 'number' ? spawnAnchor : getBoardWidth() / 2;
    }

    init() {
        this.nextPiece = this.randomPiece();
        this.spawnPiece();
    }

    randomPiece() {
        return nextBaggedPiece();
    }

    spawnPiece() {
        this.currentPiece = this.nextPiece;
        this.nextPiece = this.randomPiece();
        this.holdUsed = false;
        this.placeSpawn();
    }

    hold({ broadcast = true } = {}) {
        if (!this.currentPiece || this.gameOver || this.holdUsed) return false;
        const outgoing = this.currentPiece;
        if (this.heldPiece) {
            this.currentPiece = this.heldPiece;
        } else {
            this.currentPiece = this.nextPiece;
            this.nextPiece = this.randomPiece();
        }
        this.heldPiece = outgoing;
        this.holdUsed = true;
        this.placeSpawn();
        if (broadcast) onAction({ action: 'hold' });
        return true;
    }

    placeSpawn() {
        const found=chooseSpawn(this.currentPiece,this.spawnAnchor,getBoardWidth(),
            (piece,pos)=>this.checkCollision(piece,pos));
        const preferredX=Math.min(getBoardWidth()-this.currentPiece[0].length,
            Math.max(0,Math.round(this.spawnAnchor-this.currentPiece[0].length/2)));
        this.position=found||{x:preferredX,y:0};
        if(!found&&this.checkCollision().collides){
            this.gameOver=true;
            checkAllPlayersGameOver();
        }
        this.dropCounter=0;
    }

    checkCollision(piece=this.currentPiece,pos=this.position) {
        return coreCollision(piece,pos,gameState.board,gameState.players,this.id,getBoardWidth(),BOARD_HEIGHT);
    }

     move(dir, { broadcast = true } = {}) {
        this.position.x += dir;
        if (this.checkCollision().collides) {
            this.position.x -= dir;
        } else {
            soundManager.move();
            // Send online update if in online game
            if (broadcast) onAction({ action: 'move', direction: dir });
        }
    }

    rotate({ broadcast = true } = {}) {
        if(this.gameOver||!this.currentPiece)return false;
        const next=rotateWithKick(this.currentPiece,this.position,(piece,pos)=>this.checkCollision(piece,pos));
        if(!next)return false;
        this.currentPiece=next.piece;
        this.position=next.position;
        soundManager.rotate();
        if(broadcast) onAction({action:'rotate'});
        return true;
    }

     drop({ broadcast = true } = {}) {
        this.position.y++;
        const collision = this.checkCollision();
        if (collision.collides) {
            this.position.y--;
            if (collision.withLocked) {
                this.merge();
                soundManager.drop();
                this.clearLines();
                signals.impact?.();
                this.spawnPiece();
            }
        }
        this.dropCounter = 0;
        // Send online update if in online game
        if (broadcast) onAction({ action: 'drop' });
    }

    hardDrop({ broadcast = true } = {}) {
        let maxDrops = BOARD_HEIGHT; // Safety limit
        let landedOnLocked = false;

        while (maxDrops > 0) {
            this.position.y++;
            maxDrops--;

            const collision = this.checkCollision();
            if (!collision.collides) {
                continue;
            }

            if (collision.withLocked) {
                landedOnLocked = true;
            }

            this.position.y--;
            break;
        }

        if (landedOnLocked) {
            this.merge();
            soundManager.drop();
            this.clearLines();
            signals.impact?.();
            this.spawnPiece();
        }
        this.dropCounter = 0;
        // Send online update if in online game
        if (broadcast) onAction({ action: 'hardDrop' });
    }

    merge() {
        for (let y = 0; y < this.currentPiece.length; y++) {
            for (let x = 0; x < this.currentPiece[y].length; x++) {
                if (this.currentPiece[y][x]) {
                    const boardY = this.position.y + y;
                    const boardX = this.position.x + x;
                    if (boardY >= 0) {
                        gameState.board[boardY][boardX] = this.id + 1;
                    }
                }
            }
        }
    }

    clearLines() {
        const clearedRows=clearCompletedRows(gameState.board,getBoardWidth());
        const linesCleared=clearedRows.length;

         if (linesCleared === 0) {
            if (gameState.sharedStats.comboChain !== 0) {
                gameState.sharedStats.comboChain = 0;
                gameState.sharedStatsDirty = true;
            }
            gameState.sharedStats.lastClearDetail = null;
            return;
        }

        // Distinguish a line clear from ordinary touchdown, with reduced-motion safety.
        signals.impact?.(linesCleared);
        signals.lineClear?.(clearedRows);
        soundManager.lineClear(linesCleared);

        const comboStep=gameState.sharedStats.comboChain||0;
        const {gained,perLineScore,comboMultiplier,multiMultiplier,
            streakBonusPercent,multiBonusPercent}=lineScore(linesCleared,comboStep,BASE_LINE_SCORE);

         gameState.sharedStats.lines += linesCleared;
        gameState.sharedStats.score += gained;
        gameState.sharedStats.level = Math.floor(gameState.sharedStats.lines / 10) + 1;
        gameState.sharedStats.comboChain = comboStep + 1;
        gameState.sharedStats.lastClearDetail = {
            linesCleared,
            totalScore: gained,
            rows: clearedRows,
            perLineScore,
            basePerLine: BASE_LINE_SCORE,
            comboChain: gameState.sharedStats.comboChain,
            comboMultiplier,
            multiMultiplier,
            streakBonusPercent,
            multiBonusPercent
        };

        this.lines = gameState.sharedStats.lines;
        this.score = gameState.sharedStats.score;
        this.level = gameState.sharedStats.level;

        gameState.players.forEach(player => {
            player.dropInterval = Math.max(100, player.dropInterval * Math.pow(0.95, linesCleared));
            player.lines = gameState.sharedStats.lines;
            player.score = gameState.sharedStats.score;
            player.level = gameState.sharedStats.level;
        });

        gameState.sharedStatsDirty = true;
    }

    update(deltaTime) {
        if (this.gameOver) return;

        this.dropCounter += deltaTime;
        if (this.dropCounter > this.dropInterval) {
            this.drop();
        }
    }
}
    return Player;
}
