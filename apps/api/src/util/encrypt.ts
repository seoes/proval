import { logError } from "./log.js";
import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

let cachedKey: Buffer | undefined;

export const loadEncryptionKey = (): Buffer => {
    if (cachedKey) {
        return cachedKey;
    }

    const key = process.env.ENCRYPTION_KEY?.trim();

    if (!key) {
        const errorMessage = "ENCRYPTION_KEY is not set";
        logError(errorMessage);
        throw new Error(errorMessage);
    }

    const base64Key = Buffer.from(key, "base64");

    if (base64Key.byteLength !== KEY_LENGTH) {
        const errorMessage = `ENCRYPTION_KEY must be ${KEY_LENGTH} bytes long. (Use "openssl rand -base64 32" to generate)`;
        logError(errorMessage);
        throw new Error(errorMessage);
    }

    cachedKey = base64Key;
    return cachedKey;
};

export const encrypt = (plainText: string) => {
    const ENCRYPTION_KEY = loadEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(plainText), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString("base64");
};

export const decrypt = (cipherText: string) => {
    const ENCRYPTION_KEY = loadEncryptionKey();
    const data = Buffer.from(cipherText, "base64");

    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf-8");
};
