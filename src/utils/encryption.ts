import crypto from "crypto";
import { env } from "../env";

const resizedIV = Buffer.allocUnsafe(16);
const iv = crypto.createHash("sha256").update(env.SOCKET_SECRET).digest();
iv.copy(resizedIV);

export function decrypt(msg: string) {
    const key = crypto.createHash("sha256").update(env.SOCKET_KEY).digest();
    const decipher = crypto.createDecipheriv("aes256", key, resizedIV);

    let decrypted = decipher.update(msg, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
}
