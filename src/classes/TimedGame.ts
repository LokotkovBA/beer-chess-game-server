import { Game, MoveDescriptor, Position } from "kokopu";
import { Server } from "socket.io";

type PositionStatus = "PLAYABLE" | "STALEMATE" | "CHECK" | "CHECKMATE" | "DEAD" | "ERROR";
type GameStatus = "INITIALIZING" | "FM" | "STARTED" | "TIE" | "BLACKWON" | "WHITEWON";

export default class TimedGame extends Game {
    private startStampWhite = 0; //number of milliseconds elapsed since the epoch
    private startStampBlack = 0; //number of milliseconds elapsed since the epoch
    private timeLimitWhite: number; //number of milliseconds
    private timeLimitBlack: number; //number of milliseconds
    private timer: ReturnType<typeof setTimeout> | undefined;
    private increment: number;
    private gameId: string;
    private socketServer: Server;
    private moveCount = 0;
    private lastMoveFrom = "";
    private lastMoveTo = "";

    private _gameStatus: GameStatus = "INITIALIZING";
    get gameStatus() {
        return this._gameStatus;
    }
    private set gameStatus(value: GameStatus) {
        this._gameStatus = value;
    }

    private _positionStatus: PositionStatus = "PLAYABLE";
    get positionStatus() {
        return this._positionStatus;
    }
    private set positionStatus(value: PositionStatus) {
        this._positionStatus = value;
    }

    constructor(gameId: string, timeLimit: number, increment: number, socketServer: Server) {
        super();
        this.timeLimitWhite = timeLimit * 60 * 1000;
        this.timeLimitBlack = this.timeLimitWhite;
        this.increment = increment * 1000;
        this.gameId = gameId;
        this.socketServer = socketServer;
    }

    gameStart() {
        this.startStampWhite = Date.now();
        this.timer = this.startTimer(this.timeLimitWhite);
        return "STARTED" as const;
    }

    gameMessage() {
        const position = this.mainVariation().finalPosition();
        return {
            lastMoveFrom: this.lastMoveFrom,
            lastMoveTo: this.lastMoveTo,
            gameStatus: this.gameStatus,
            positionStatus: this.positionStatus,
            legalMoves: position.moves().map((move, index) => {
                let outputMove = position.uci(move);
                if (move.isPromotion()) {
                    outputMove += "/Promotion";
                }

                return `${outputMove}/${index}`;
            }),
            turn: position.turn(),
            moveCount: this.moveCount,
            position: position.fen(),
            ...this.remainingTime(position)
        };
    }

    move(move: string) {
        const currentVariation = this.mainVariation();
        const curNode = currentVariation.nodes().slice(-1)[0];
        let curPosition: Position;
        let curMove: MoveDescriptor;
        if (curNode) {
            curPosition = curNode.position();
            curMove = curPosition.moves()[parseInt(move)];
            curNode.play(curPosition.notation(curMove));
        } else {
            curPosition = currentVariation.finalPosition();
            curMove = curPosition.moves()[parseInt(move)];
            currentVariation.play(curPosition.notation(curMove));
        }
        this.moveCount++;
        if (this.gameStatus === "INITIALIZING" || this.gameStatus === "FM") {
            this.gameStatus = this.moveCount > 1 ? this.gameStart() : "FM";
        } else {
            this.incrementTimeLimit(currentVariation.finalPosition());
        }
        this.lastMoveFrom = curMove.from();
        this.lastMoveTo = curMove.to();
        this.checkPosition();
        return this.gameMessage();
    }

    private incrementTimeLimit(curPosition: Position) {
        const curTurn = curPosition.turn();
        const curStamp = Date.now();
        let curLimit: number;
        if (curTurn !== "w") {
            this.timeLimitWhite += this.increment - (curStamp - this.startStampWhite);
            this.startStampBlack = curStamp;
            curLimit = this.timeLimitBlack;
        } else {
            this.timeLimitBlack += this.increment - (curStamp - this.startStampBlack);
            this.startStampWhite = curStamp;
            curLimit = this.timeLimitWhite;
        }
        clearTimeout(this.timer);
        this.timer = this.startTimer(curLimit);
    }

    private remainingTime(curPosition: Position) { // in ms
        const curTurn = curPosition.turn();
        const curStamp = Date.now();
        let remainingWhiteTime = this.timeLimitWhite;
        let remainingBlackTime = this.timeLimitBlack;
        if (this.gameStatus === "STARTED") {
            remainingWhiteTime = curTurn === "w" ? this.timeLimitWhite - (curStamp - this.startStampWhite) : this.timeLimitWhite;
            remainingBlackTime = curTurn === "b" ? this.timeLimitBlack - (curStamp - this.startStampBlack) : this.timeLimitBlack;
        }
        return { remainingWhiteTime, remainingBlackTime };
    }

    private checkPosition() {
        const position = this.mainVariation().finalPosition();
        const turn = this.mainVariation().finalPosition().turn();
        switch (position.isLegal()) {
            case position.isCheckmate():
                this.gameStatus = turn === "w" ? "BLACKWON" : "WHITEWON";
                this.positionStatus = "CHECKMATE";
                break;
            case position.isStalemate():
                this.gameStatus = "TIE";
                this.positionStatus = "STALEMATE";
                break;
            case position.isDead():
                this.gameStatus = "TIE";
                this.positionStatus = "DEAD";
                break;
            case position.isCheck():
                this.positionStatus = "CHECK";
                break;
            case false:
                this.positionStatus = "ERROR";
                break;
            default:
                this.positionStatus = "PLAYABLE";
                break;
        }
    }

    private startTimer(curLimit: number) {
        return setTimeout(this.winOnTime.bind(this), curLimit);
    }

    private winOnTime() {
        if (this.increment > -1) {
            const turn = this.mainVariation().finalPosition().turn();
            if (turn === "w") {
                this.gameStatus = "BLACKWON";
                this.timeLimitWhite = 0;
            } else {
                this.gameStatus = "WHITEWON";
                this.timeLimitBlack = 0;
            }
            this.socketServer.to(this.gameId).emit(`${this.gameId} success`, this.gameMessage());
        }
    }
}