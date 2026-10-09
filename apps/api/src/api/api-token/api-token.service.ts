import { and, eq, gt, isNull, or } from "drizzle-orm";
import { apiTokenTable, userTable } from "@proval/db";
import { apiScopeValueList } from "@proval/types";
import type { ApiScope, ApiToken, ApiTokenCreateInput, ApiTokenResponse, UserResponse } from "@proval/types";
import db from "../../db/index.js";

const TOKEN_PREFIX = "prv_";
const PREFIX_DISPLAY_LENGTH = TOKEN_PREFIX.length + 6;

function createSecret(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return TOKEN_PREFIX + Buffer.from(bytes).toString("base64url");
}

export async function hashSecret(secret: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
    return Buffer.from(digest).toString("hex");
}

export function parseScopeList(raw: string): ApiScope[] {
    const known = new Set<string>(apiScopeValueList);
    return raw
        .split(",")
        .map((part) => part.trim())
        .filter((part) => known.has(part)) as ApiScope[];
}

export function isScopeListValid(scopeList: string[]): boolean {
    const known = new Set<string>(apiScopeValueList);
    return scopeList.length > 0 && scopeList.every((scope) => known.has(scope));
}

function toResponse(row: ApiToken): ApiTokenResponse {
    const { tokenHash: _tokenHash, ...rest } = row;
    return { ...rest, scopeList: parseScopeList(row.scopeList) };
}

export class ApiTokenService {
    async findAllForUser(userId: string): Promise<ApiTokenResponse[]> {
        const rowList = await db.select().from(apiTokenTable).where(eq(apiTokenTable.userId, userId));
        return rowList.map(toResponse);
    }

    async create(userId: string, input: ApiTokenCreateInput) {
        const secret = createSecret();
        const expiresAt =
            input.expiresInDay && input.expiresInDay > 0
                ? new Date(Date.now() + input.expiresInDay * 24 * 60 * 60 * 1000)
                : null;

        const inserted = await db
            .insert(apiTokenTable)
            .values({
                name: input.name,
                tokenHash: await hashSecret(secret),
                tokenPrefix: secret.slice(0, PREFIX_DISPLAY_LENGTH),
                scopeList: input.scopeList.join(","),
                userId,
                expiresAt,
            })
            .returning();

        const row = inserted[0];
        if (!row) {
            throw new Error("Failed to create api token");
        }

        return { token: toResponse(row), secret };
    }

    async remove(userId: string, id: number): Promise<boolean> {
        const removed = await db
            .delete(apiTokenTable)
            .where(and(eq(apiTokenTable.id, id), eq(apiTokenTable.userId, userId)))
            .returning();
        return removed.length > 0;
    }

    /**
     * Resolves a bearer secret to its owner and scope list.
     * Touches lastUsedAt so an unused token is visible in the dashboard.
     */
    async authenticate(secret: string): Promise<{ user: UserResponse; scopeList: ApiScope[] } | null> {
        if (!secret.startsWith(TOKEN_PREFIX)) {
            return null;
        }
        const now = new Date();
        const rowList = await db
            .select({ token: apiTokenTable, user: userTable })
            .from(apiTokenTable)
            .innerJoin(userTable, eq(userTable.id, apiTokenTable.userId))
            .where(
                and(
                    eq(apiTokenTable.tokenHash, await hashSecret(secret)),
                    or(isNull(apiTokenTable.expiresAt), gt(apiTokenTable.expiresAt, now)),
                ),
            )
            .limit(1);

        const row = rowList[0];
        if (!row) {
            return null;
        }

        await db.update(apiTokenTable).set({ lastUsedAt: now }).where(eq(apiTokenTable.id, row.token.id));

        const { passwordHash: _passwordHash, ...user } = row.user;
        return { user, scopeList: parseScopeList(row.token.scopeList) };
    }
}

export const apiTokenService = new ApiTokenService();
