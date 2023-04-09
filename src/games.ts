import TimedGame, { MoveCallback } from "./classes/TimedGame";
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
const initialGameMessage = z.object({
    playerWhite: z.string(),
    playerBlack: z.string(),
    gameTitle: z.string(),
    timeRule: z.string(),
    secretName: z.string()
});
const restartGameMessage = z.object({
    checkString: z.string(),
    encCheckString: z.string(),
    timeRule: z.string(),
    history: z.string(),
    timeLeftWhite: z.number(),
    timeLeftBlack: z.number()
});

const authChecks = new Set<string>();
export default function gamesHandle(io: Server, socket: Socket) {
    socket.on("start game", (message) => {
        try {
            const { gameId } = getGameId(message);
            const { gameTitle, playerBlack, playerWhite, timeRule, secretName: encSocketName } = initialGameMessage.parse(message);
            if (games.has(gameId)) {
                return socket.emit("error", { message: "game already exists" });
            }
            const secretName = decrypt(encSocketName);
            if (secretName !== playerBlack && secretName !== playerWhite) return socket.emit("error", { message: "not player" });

            const [timeLimit, timeIncrement] = parseTimeRule(timeRule);
            const newGame = new TimedGame(gameId, timeLimit, timeIncrement, io);
            newGame.game.site("beer-chess.ru");
            newGame.game.date(new Date());
            newGame.game.playerName("w", playerWhite);
            // newGame.game.playerElo("w", eloWhite); //todo
            newGame.game.playerName("b", playerBlack);
            // newGame.game.playerElo("b", eloBlack);
            newGame.game.event(gameTitle);
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

    socket.on("restore game", (message) => {
        try {
            const { gameId } = getGameId(message);
            const {
                timeLeftBlack,
                timeLeftWhite,
                history,
                timeRule,
                checkString,
                encCheckString
            } = restartGameMessage.parse(message);
            if (games.has(gameId)) {
                return socket.emit("error", { message: "game already exists" });
            }
            if (authChecks.has(checkString)) return socket.emit("error", { message: "unauthorized" });
            const decCheckString = decrypt(encCheckString);
            if (decCheckString !== checkString) return socket.emit("error", { message: "unauthorized" });
            authChecks.add(checkString);
            const [timeLimit, timeIncrement] = parseTimeRule(timeRule);
            const newGame = new TimedGame(gameId, timeLimit, timeIncrement, io, history, timeLeftWhite, timeLeftBlack);
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

    socket.on("move", (message, callback: MoveCallback) => {
        const { gameId } = getGameId(message);
        const { move, secretName: encSecretName } = z.object({ move: z.string(), secretName: z.string() }).parse(message);
        const currentGame = games.get(gameId);
        if (!currentGame) return socket.emit("error", { message: "game not found" });
        const socketName = decrypt(encSecretName);
        if (socketName !== currentGame.game.playerName(currentGame.turn)) return socket.emit("error", { message: "it's not your tourn" });

        if (currentGame.gameStatus === "FM" || currentGame.gameStatus === "STARTED" || currentGame.gameStatus === "INITIALIZING") {
            currentGame.move(move);
            io.to(gameId).emit(`${gameId} success`, currentGame.gameMessage(callback));
        }
        else {
            io.to(gameId).emit(`${gameId} game ended`);
        }
    });
}
