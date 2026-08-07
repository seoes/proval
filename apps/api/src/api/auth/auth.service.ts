import { eq, count, and, gt } from "drizzle-orm";
import { instanceSettingTable, sessionTable, userTable } from "@proval/db";
import type {
    AuthCredentialInput,
    AuthMeResponse,
    InstanceSettingResponse,
    InstanceSettingUpdateInput,
    UserResponse,
} from "@proval/types";
import db from "../../db/index.js";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE_NAME = "proval_session";

function toUserResponse(user: typeof userTable.$inferSelect): UserResponse {
    return {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    };
}

function createSessionToken(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Buffer.from(bytes).toString("base64url");
}

export class AuthService {
    async getOrCreateInstanceSetting() {
        const inserted = await db
            .insert(instanceSettingTable)
            .values({
                id: 1,
                authEnabled: false,
                registrationEnabled: false,
            })
            .onConflictDoNothing()
            .returning();

        if (inserted.length > 0) {
            return inserted[0];
        }

        const existing = await db.select().from(instanceSettingTable).where(eq(instanceSettingTable.id, 1)).limit(1);

        return existing[0];
    }

    async getUserCount(): Promise<number> {
        const result = await db.select({ value: count() }).from(userTable);
        return result[0]?.value ?? 0;
    }

    async isSetupRequired(): Promise<boolean> {
        return (await this.getUserCount()) === 0;
    }

    toInstanceSettingResponse(setting: typeof instanceSettingTable.$inferSelect): InstanceSettingResponse {
        return {
            isAuthEnabled: setting.authEnabled,
            isRegistrationEnabled: setting.registrationEnabled,
        };
    }

    async getMe(user: UserResponse | null): Promise<AuthMeResponse> {
        const setting = await this.getOrCreateInstanceSetting();
        const isSetupRequired = await this.isSetupRequired();
        return {
            user,
            isAuthEnabled: setting.authEnabled,
            isRegistrationEnabled: setting.registrationEnabled,
            isSetupRequired,
        };
    }

    async findUserBySessionToken(token: string): Promise<UserResponse | null> {
        const now = new Date();
        const rowList = await db
            .select({
                user: userTable,
                expiresAt: sessionTable.expiresAt,
            })
            .from(sessionTable)
            .innerJoin(userTable, eq(sessionTable.userId, userTable.id))
            .where(and(eq(sessionTable.token, token), gt(sessionTable.expiresAt, now)))
            .limit(1);

        if (rowList.length === 0) {
            return null;
        }
        return toUserResponse(rowList[0].user);
    }

    async createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
        const token = createSessionToken();
        const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
        await db.insert(sessionTable).values({
            token,
            userId,
            expiresAt,
        });
        return { token, expiresAt };
    }

    async deleteSession(token: string): Promise<void> {
        await db.delete(sessionTable).where(eq(sessionTable.token, token));
    }

    private async createUser(input: AuthCredentialInput, role: "admin" | "user") {
        const email = input.email.trim().toLowerCase();
        if (!email || !input.password) {
            throw new Error("Email and password are required");
        }
        if (input.password.length < 8) {
            throw new Error("Password must be at least 8 characters");
        }

        const passwordHash = await Bun.password.hash(input.password, {
            algorithm: "argon2id",
        });
        const id = Bun.randomUUIDv7();

        try {
            const inserted = await db
                .insert(userTable)
                .values({
                    id,
                    email,
                    passwordHash,
                    role,
                })
                .returning();
            return inserted[0];
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes("UNIQUE") || msg.includes("unique")) {
                throw new Error("Email already registered");
            }
            throw e;
        }
    }

    async createInitialAdmin(
        input: AuthCredentialInput,
    ): Promise<{ user: UserResponse; token: string; expiresAt: Date }> {
        const email = input.email.trim().toLowerCase();
        if (!email || !input.password) {
            throw new Error("Email and password are required");
        }
        if (input.password.length < 8) {
            throw new Error("Password must be at least 8 characters");
        }

        const passwordHash = await Bun.password.hash(input.password, {
            algorithm: "argon2id",
        });
        const id = Bun.randomUUIDv7();
        const token = createSessionToken();
        const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

        await this.getOrCreateInstanceSetting();

        try {
            return db.transaction(
                (tx) => {
                    const userCount = tx.select({ value: count() }).from(userTable).get()?.value ?? 0;
                    if (userCount > 0) {
                        throw new Error("Setup already completed");
                    }

                    const user = tx
                        .insert(userTable)
                        .values({
                            id,
                            email,
                            passwordHash,
                            role: "admin",
                        })
                        .returning()
                        .get();

                    tx.update(instanceSettingTable)
                        .set({
                            authEnabled: true,
                            registrationEnabled: false,
                        })
                        .where(eq(instanceSettingTable.id, 1))
                        .run();

                    tx.insert(sessionTable)
                        .values({
                            token,
                            userId: id,
                            expiresAt,
                        })
                        .run();

                    return {
                        user: toUserResponse(user),
                        token,
                        expiresAt,
                    };
                },
                { behavior: "immediate" },
            );
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes("UNIQUE") || msg.includes("unique")) {
                throw new Error("Email already registered");
            }
            throw e;
        }
    }

    async registerUser(input: AuthCredentialInput): Promise<{ user: UserResponse; token: string; expiresAt: Date }> {
        const setting = await this.getOrCreateInstanceSetting();
        const isSetupRequired = await this.isSetupRequired();
        if (isSetupRequired) {
            throw new Error("Initial setup required");
        }
        if (!setting.authEnabled) {
            throw new Error("Registration requires authentication to be enabled");
        }
        if (!setting.registrationEnabled) {
            throw new Error("Registration is disabled");
        }

        const user = await this.createUser(input, "user");
        const session = await this.createSession(user.id);
        return {
            user: toUserResponse(user),
            token: session.token,
            expiresAt: session.expiresAt,
        };
    }

    async login(input: AuthCredentialInput): Promise<{ user: UserResponse; token: string; expiresAt: Date }> {
        const email = input.email.trim().toLowerCase();
        if (!email || !input.password) {
            throw new Error("Email and password are required");
        }

        const userList = await db.select().from(userTable).where(eq(userTable.email, email)).limit(1);
        if (userList.length === 0) {
            throw new Error("Invalid email or password");
        }
        const user = userList[0];
        const isValid = await Bun.password.verify(input.password, user.passwordHash);
        if (!isValid) {
            throw new Error("Invalid email or password");
        }

        const session = await this.createSession(user.id);
        return {
            user: toUserResponse(user),
            token: session.token,
            expiresAt: session.expiresAt,
        };
    }

    async updateInstanceSetting(input: InstanceSettingUpdateInput): Promise<InstanceSettingResponse> {
        const current = await this.getOrCreateInstanceSetting();
        if (typeof input.isAuthEnabled !== "boolean" && typeof input.isRegistrationEnabled !== "boolean") {
            return this.toInstanceSettingResponse(current);
        }

        const nextAuth = typeof input.isAuthEnabled === "boolean" ? input.isAuthEnabled : current.authEnabled;
        let nextRegistration =
            typeof input.isRegistrationEnabled === "boolean"
                ? input.isRegistrationEnabled
                : current.registrationEnabled;

        if (typeof input.isAuthEnabled === "boolean" && !input.isAuthEnabled) {
            nextRegistration = false;
        } else if (nextRegistration && !nextAuth) {
            throw new Error("Registration cannot be enabled while authentication is disabled");
        }

        if (nextAuth === current.authEnabled && nextRegistration === current.registrationEnabled) {
            return this.toInstanceSettingResponse(current);
        }

        const updated = await db
            .update(instanceSettingTable)
            .set({
                authEnabled: nextAuth,
                registrationEnabled: nextRegistration,
            })
            .where(eq(instanceSettingTable.id, 1))
            .returning();
        return this.toInstanceSettingResponse(updated[0]);
    }
}

export const authService = new AuthService();
