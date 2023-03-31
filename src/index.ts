import * as fs from "fs";
import { Server } from "socket.io";
import * as dotenv from "dotenv";
import { createServer } from "https";
dotenv.config({ path: "../.env" });
import { env } from "./env";
import gamesHandle from "./games";
import roomsHandle, { getUniqueName } from "./rooms";
const certOptions = {
    cert: fs.readFileSync(env.CERT_PATH),
    key: fs.readFileSync(env.KEY_PATH)
};
const httpsServer = createServer(certOptions);
export const io = new Server(httpsServer, {
    cors: {
        origin: env.APP_URL,
        methods: ["GET", "POST"],
        credentials: true
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
});



