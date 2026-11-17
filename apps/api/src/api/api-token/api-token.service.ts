import { and, eq, gt, isNull, or } from "drizzle-orm";
import { apiTokenTable, userTable } from "@proval/db";
import { apiScopeValueList } from "@proval/types";
import type { ApiScope, ApiToken, ApiTokenCreateInput, ApiTokenResponse, UserResponse } from "@proval/types";
import db from "../../db/index.js";

const TOKEN_PREFIX = "prv_";
const PREFIX_DISPLAY_LENGTH = TOKEN_PREFIX.length + 6;
/** A hundred years. Far beyond any real use, and keeps Date arithmetic finite. */
const MAX_EXPIRES_IN_DAY = 36500;

export class ApiTokenService {
    async findAllForUser(userId: string): Promise<ApiTokenResponse[]> {
        const rowList = await db.select().from(apiTokenTable).where(eq(apiTokenTable.userId, userId));
        return rowList.map((row) => this.toResponse(row));
    }

    async create(userId: string, input: ApiTokenCreateInput) {
        const secret = this.createSecret();
        const expiresAt =
            input.expiresInDay && input.expiresInDay > 0
                ? new Date(Date.now() + input.expiresInDay * 24 * 60 * 60 * 1000)
                : null;

        const inserted = await db
            .insert(apiTokenTable)
            .values({
                name: input.name,
                tokenHash: await this.hashSecret(secret),
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

        return { token: this.toResponse(row), secret };
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
                    eq(apiTokenTable.tokenHash, await this.hashSecret(secret)),
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
        return { user, scopeList: this.parseScopeList(row.token.scopeList) };
    }

    async hashSecret(secret: string): Promise<string> {
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
        return Buffer.from(digest).toString("hex");
    }

    parseScopeList(raw: string): ApiScope[] {
        const known = new Set<string>(apiScopeValueList);
        return raw
            .split(",")
            .map((part) => part.trim())
            .filter((part) => known.has(part)) as ApiScope[];
    }

    isScopeListValid(scopeList: string[]): boolean {
        const known = new Set<string>(apiScopeValueList);
        return scopeList.length > 0 && scopeList.every((scope) => known.has(scope));
    }

    /**
     * Returns an error message when expiresInDay is unusable, or null when it is
     * fine. Null and undefined both mean "never expires" and are accepted.
     *
     * This exists because create reads a non positive or unparseable value as
     * no expiry, so without a check here a caller who asked for a 30 day token and
     * mistyped it receives a permanent credential with no indication of it. The
     * upper bound matters for a different reason: a large enough day count makes
     * the millisecond arithmetic overflow into an Invalid Date, which reaches the
     * insert as a null or a failure rather than a clean 400.
     */
    validateExpiresInDay(value: unknown): string | null {
        if (value === null || value === undefined) {
            return null;
        }
        if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > MAX_EXPIRES_IN_DAY) {
            return `expiresInDay must be a whole number between 1 and ${MAX_EXPIRES_IN_DAY}, or null for no expiry`;
        }
        return null;
    }

    private createSecret(): string {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        return TOKEN_PREFIX + Buffer.from(bytes).toString("base64url");
    }

    private toResponse(row: ApiToken): ApiTokenResponse {
        const { tokenHash: _tokenHash, ...rest } = row;
        return { ...rest, scopeList: this.parseScopeList(row.scopeList) };
    }
}

export const apiTokenService = new ApiTokenService();
