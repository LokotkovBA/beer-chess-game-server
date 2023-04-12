import * as fs from "fs";
import { Server } from "socket.io";
import * as dotenv from "dotenv";
import { createSecureServer } from "http2";
dotenv.config();
import { env } from "./env";
import gamesHandle from "./games";
import roomsHandle, { getUniqueName } from "./rooms";
import { instrument } from "@socket.io/admin-ui";
const httpsServer = createSecureServer({
    cert: fs.readFileSync(env.CERT_PATH),
    key: fs.readFileSync(env.KEY_PATH),
    allowHTTP1: true
});
export const io = new Server(httpsServer, {
    cors: {
        origin: env.APP_URLS.split(","),
        methods: ["GET", "POST"],
        credentials: true
    }
});
instrument(io, {
    auth: {
        type: "basic",
        username: "sego",
        password: env.SOCKET_ADMIN
    }
});
httpsServer.listen(env.SOCKET_PORT, () => console.log(`Listening on port ${env.SOCKET_PORT}`));

io.on("connect", (socket) => {
    socket.on("sub to invites", (message) => {
        const { uniqueName } = getUniqueName(message);
        console.log(`${uniqueName} subbed`);
        socket.join(uniqueName);
    });
    socket.on("unsub from invites", (message) => {
        const { uniqueName } = getUniqueName(message);
        console.log(`${uniqueName} unsubbed`);
        socket.leave(uniqueName);
    });
    gamesHandle(io, socket);
    roomsHandle(io, socket);

    socket.on("error", (message) => {
        console.error(message);
    });
});

