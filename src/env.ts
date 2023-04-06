import { z } from "zod";

const server = z.object({
    CERT_PATH: z.string(),
    KEY_PATH: z.string(),
    APP_URL: z.string().url(),
    DEV_URL: z.string().url(),
    SOCKET_PORT: z.string(),
    SOCKET_ADMIN: z.string(),
    SOCKET_SECRET: z.string(),
    SOCKET_KEY: z.string(),
});

const processEnv: Record<keyof z.infer<typeof server>, string | undefined> = {
    CERT_PATH: process.env.CERT_PATH,
    KEY_PATH: process.env.KEY_PATH,
    APP_URL: process.env.APP_URL,
    DEV_URL: process.env.DEV_URL,
    SOCKET_PORT: process.env.SOCKET_PORT,
    SOCKET_ADMIN: process.env.SOCKET_ADMIN,
    SOCKET_SECRET: process.env.SOCKET_SECRET,
    SOCKET_KEY: process.env.SOCKET_KEY,
};

type ServerOutput = z.infer<typeof server>
const env = process.env as ServerOutput;

if (!!process.env.SKIP_ENV_VALIDATION == false) {
    const parsed = (server.safeParse(processEnv));

    if (parsed.success === false) {
        console.error(
            "❌ Invalid environment variables:",
            parsed.error.flatten().fieldErrors,
        );
        throw new Error("Invalid environment variables");
    }
}

export { env };
