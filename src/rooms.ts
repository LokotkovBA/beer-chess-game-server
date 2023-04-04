import { Server, Socket } from "socket.io";
import { z } from "zod";
import { getGameId } from "./games";
const rooms = new Set<string>();

function getRoomId(message: string) {
    return z.object({ roomId: z.string() }).parse(message);
}

export function getUniqueName(message: string) {
    return z.object({ uniqueName: z.string() }).parse(message);
}

function getName(message: string) {
    return z.object({ name: z.string() }).parse(message);
}

export default function roomsHandle(io: Server, socket: Socket) {
    socket.on("join room", (message) => {
        const { roomId } = getRoomId(message);
        if (!rooms.has(roomId)) {
            rooms.add(roomId);
        }
        socket.join(roomId);
    });

    socket.on("leave room", (message) => {
        const { roomId } = getRoomId(message);
        if (!rooms.has(roomId)) return socket.emit("error", "room not found");
        socket.leave(roomId);
    });

    socket.on("send invite", (message) => {
        const { roomId } = getRoomId(message);
        if (!rooms.has(roomId)) return socket.emit("error", "room not found");

        const { uniqueName } = getUniqueName(message); //name of invitee
        const { name } = getName(message); //display name of room creator
        io.to(uniqueName).emit("invite", { roomId, from: name });
    });

    socket.on("room ready status", (message) => {
        const { roomId } = getRoomId(message);
        if (!rooms.has(roomId)) return socket.emit("error", "room not found");

        const { uniqueName } = getUniqueName(message); //creator unique name
        const { name } = getName(message); //invitee display name
        io.to(uniqueName).emit("room ready", { roomId, from: name }); //if from is empty string then cancel ready
    });

    socket.on("room game start", (message) => {
        const { roomId } = getRoomId(message);
        if (!rooms.has(roomId)) return socket.emit("error", "room not found");

        const { gameId } = getGameId(message);
        io.to(roomId).emit("game starting", { gameId, roomId });
    });
}