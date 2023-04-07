import { pgnWrite } from "kokopu";
import TimedGame from "./classes/TimedGame";
import { Server, Socket } from "socket.io";
import { z } from "zod";
import { decrypt } from "./utils/encryption";

const games = new Map<string, TimedGame>();

export function getGameId(message: string) {
    return z.object({ gameId: z.string() }).parse(message);
}

function checkTuple(input: string[]): input is [string, string] {
    return input.length === 2;
}

function parseTimeRule(input: string) {
    const tuple = input.split("/");
    if (!checkTuple(tuple)) throw new Error("Can't parse time rule!");

    const [timeLimit, increment] = tuple.map(elem => (parseInt(elem)));
    return [timeLimit, increment] as const;
}

const startGameMessage = z.object({
    playerWhite: z.string(),
    playerBlack: z.string(),
    gameTitle: z.string(),
    timeRule: z.string(),
    secretName: z.string()
});
export default function gamesHandle(io: Server, socket: Socket) {
    socket.on("start game", (message) => {
        try {
            const { gameId } = getGameId(message);
            const { gameTitle, playerBlack, playerWhite, timeRule, secretName: encSocketName } = startGameMessage.parse(message);
            if (games.has(gameId)) {
                return socket.emit("error", { message: "game already exists" });
            }
            const secretName = decrypt(encSocketName);
            if (secretName !== playerBlack && secretName !== playerWhite) return socket.emit("error", { message: "not player" });

            const [timeLimit, timeIncrement] = parseTimeRule(timeRule);
            const newGame = new TimedGame(gameId, timeLimit, timeIncrement, io);
            newGame.playerName("w", playerWhite);
            // newGame.playerElo("w", eloWhite); //todo
            newGame.playerName("b", playerBlack);
            // newGame.playerElo("b", eloBlack);
            newGame.event(gameTitle);
            games.set(gameId, newGame);
            socket.join(gameId);
            io.to(gameId).emit(`${gameId} success`, newGame.gameMessage());
        } catch (error) {
            if (error instanceof z.ZodError) {
                socket.emit("error", error);
            } else {
                socket.emit("error", { message: "unknown error" });
            }
        }
    });

    socket.on("join game", (message) => {
        try {
            const { gameId } = getGameId(message);
            socket.join(gameId);
            const currentGame = games.get(gameId);
            if (!currentGame) {
                return socket.emit("game not found", { gameId });
            }
            socket.emit(`${gameId} success`, currentGame.gameMessage());
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
        const { move, secretName: encSecretName } = z.object({ move: z.string(), secretName: z.string() }).parse(message);
        const currentGame = games.get(gameId);
        if (!currentGame) return socket.emit("error", { message: "game not found" });
        const socketName = decrypt(encSecretName);
        if (socketName !== currentGame.playerName(currentGame.turn)) return socket.emit("error", { message: "it's not your tourn" });

        if (currentGame.gameStatus === "FM" || currentGame.gameStatus === "STARTED" || currentGame.gameStatus === "INITIALIZING") {
            currentGame.move(move);
            io.to(gameId).emit(`${gameId} success`, currentGame.gameMessage());
        }
        else {
            io.to(gameId).emit(`${gameId} game ended`);
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