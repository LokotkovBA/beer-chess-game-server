import { Game, MoveDescriptor, Node, Position, pgnWrite } from "kokopu";
import { Server, Socket } from "socket.io";
import { z } from "zod";

const games = new Map<string, Game>();

type GameStatus = "PLAYING" | "STALEMATE" | "CHECK" | "CHECKMATE" | "DEAD" | "ERROR"

function checkGame(position: Position): GameStatus {
    switch (position.isLegal()) {
        case position.isCheckmate():
            return "CHECKMATE";
        case position.isStalemate():
            return "STALEMATE";
        case position.isDead():
            return "DEAD";
        case position.isCheck():
            return "CHECK";
        case false:
            return "ERROR";
        default:
            return "PLAYING";
    }
}

function gameMessage(position: Position) {
    return {
        gameStatus: checkGame(position),
        legalMoves: position.moves().map((move, index) => {
            let outputMove = position.uci(move);
            if (move.isPromotion()) {
                outputMove += "/Promotion";
            }

            return `${outputMove}/${index}`;
        }),
        turn: position.turn(),
        position: position.fen()
    };
}

export function getGameId(message: string) {
    return z.object({ gameId: z.string() }).parse(message);
}

export default function gamesHandle(io: Server, socket: Socket) {
    socket.on("start game", (message) => {
        const { gameId } = getGameId(message);
        const { gameTitle, playerBlack, playerWhite } = z.object({ playerWhite: z.string(), playerBlack: z.string(), gameTitle: z.string() }).parse(message);
        if (games.has(gameId)) return socket.emit("error");
        const newGame = new Game();
        newGame.playerName("w", playerWhite);
        // newGame.playerElo("w", eloWhite); //todo
        newGame.playerName("b", playerBlack);
        // newGame.playerElo("b", eloBlack);
        newGame.event(gameTitle);
        games.set(gameId, newGame);
        socket.join(gameId);
        socket.emit(`${gameId} success`, gameMessage(newGame.mainVariation().initialPosition()));
    });

    socket.on("join game", (message) => {
        try {
            const { gameId } = getGameId(message);
            socket.join(gameId);
            const currentGame = games.get(gameId);
            if (!currentGame) {
                return socket.emit("error", "game not found");
            }
            socket.emit(`${gameId} success`, gameMessage(currentGame.mainVariation().finalPosition()));
        } catch (error) {
            console.error(error);
            socket.emit("error", { error });
        }
    });

    socket.on("leave game", (message) => {
        const { gameId } = getGameId(message);
        socket.leave(gameId);
    });

    socket.on("move", (message) => {
        const { gameId } = getGameId(message);
        const { move } = z.object({ move: z.string() }).parse(message);
        const currentGame = games.get(gameId);

        if (currentGame) {
            const curNode = currentGame.mainVariation().nodes().slice(-1)[0];
            let newNode: Node;
            let curPosition: Position;
            let curMove: MoveDescriptor;
            if (curNode) {
                curPosition = curNode.position();
                curMove = curPosition.moves()[parseInt(move)];
                newNode = curNode.play(curPosition.notation(curMove));
            } else {
                curPosition = currentGame.mainVariation().finalPosition();
                curMove = curPosition.moves()[parseInt(move)];
                newNode = currentGame.mainVariation().play(curPosition.notation(curMove));
            }
            io.to(gameId).emit(`${gameId} success`, gameMessage(newNode.position()));
        }
    });

    socket.on("history", (message) => {
        const { gameId } = getGameId(message);

        const currentGame = games.get(gameId);
        if (currentGame) {
            socket.emit("history", { gameId: gameId, history: pgnWrite(currentGame, { withPlyCount: true }) });
        } else {
            socket.emit("error", "game not found");
        }
    });
}