import { gitProviderAccessTable, repositoryTable } from "@proval/db";
import type { Access, AccessInsert, AccessProvider, AccessResponse } from "@proval/types";
import db from "../../db";
import { count, eq } from "drizzle-orm";
import { decrypt, encrypt } from "../../util/encrypt.js";

export class GitLabAccessService {
    private readonly query = {
        id: gitProviderAccessTable.id,
        provider: gitProviderAccessTable.provider,
        name: gitProviderAccessTable.name,
        baseUrl: gitProviderAccessTable.baseUrl,
        createdAt: gitProviderAccessTable.createdAt,
        updatedAt: gitProviderAccessTable.updatedAt,
    };

    public toResponse(access: Access): AccessResponse {
        const { accessToken: _accessToken, ...rest } = access;
        return rest;
    }

    public async findAll(): Promise<AccessResponse[]> {
        const accessList = await db.select(this.query).from(gitProviderAccessTable);
        return accessList;
    }

    public async findById(id: number): Promise<AccessResponse> {
        const accessList = await db
            .select(this.query)
            .from(gitProviderAccessTable)
            .where(eq(gitProviderAccessTable.id, id));
        if (accessList.length === 0) {
            throw new Error("Access configuration not found");
        }
        return accessList[0];
    }

    public async findByProvider(provider: AccessProvider): Promise<AccessResponse[]> {
        const accessList = await db
            .select(this.query)
            .from(gitProviderAccessTable)
            .where(eq(gitProviderAccessTable.provider, provider));
        return accessList;
    }

    public async getAccessToken(id: number) {
        const [{ accessToken }] = await db
            .select({ accessToken: gitProviderAccessTable.accessToken })
            .from(gitProviderAccessTable)
            .where(eq(gitProviderAccessTable.id, id));
        if (!accessToken) {
            throw new Error("Access configuration not found");
        }

        return decrypt(accessToken);
    }

    public async create(
        provider: AccessInsert["provider"],
        name: string,
        baseUrl: string,
        accessToken: string,
    ): Promise<AccessResponse> {
        const newAccess = await db
            .insert(gitProviderAccessTable)
            .values({
                provider,
                name,
                baseUrl,
                accessToken: encrypt(accessToken),
            })
            .returning(this.query);
        return newAccess[0];
    }

    public async updateById(id: number, name: string, baseUrl: string, accessToken?: string): Promise<AccessResponse> {
        const patch = {
            name,
            baseUrl,
            ...(accessToken !== undefined && accessToken.trim() !== ""
                ? { accessToken: encrypt(accessToken.trim()) }
                : {}),
        };
        const updatedAccess = await db
            .update(gitProviderAccessTable)
            .set(patch)
            .where(eq(gitProviderAccessTable.id, id))
            .returning(this.query);
        if (updatedAccess.length === 0) {
            throw new Error("Access configuration not found");
        }
        return updatedAccess[0];
    }

    public async deleteById(id: number) {
        const countResult = await db
            .select({ count: count() })
            .from(repositoryTable)
            .where(eq(repositoryTable.gitProviderAccessId, id));
        if (countResult[0].count > 0) {
            throw new Error(
                `There are ${countResult[0].count} repositories using this access configuration. Please remove them first.`,
            );
        }
        const deletedAccess = await db
            .delete(gitProviderAccessTable)
            .where(eq(gitProviderAccessTable.id, id))
            .returning({ id: gitProviderAccessTable.id });
        if (deletedAccess.length === 0) {
            throw new Error("Access configuration not found");
        }
        return deletedAccess[0].id;
    }

    public async updateAccessTokenById(id: number, accessToken: string) {
        const updatedAccess = await db
            .update(gitProviderAccessTable)
            .set({ accessToken: encrypt(accessToken) })
            .where(eq(gitProviderAccessTable.id, id))
            .returning({ id: gitProviderAccessTable.id });
        if (updatedAccess.length === 0) {
            throw new Error("Access configuration not found");
        }
        return updatedAccess[0].id;
    }

    public async getConnectedGitProviderRepositoryIds(accessId: number): Promise<Set<number>> {
        const rows = await db
            .select({ gitProviderRepositoryId: repositoryTable.gitProviderRepositoryId })
            .from(repositoryTable)
            .where(eq(repositoryTable.gitProviderAccessId, accessId));

        return new Set(rows.map((row) => row.gitProviderRepositoryId).filter((id): id is number => id != null));
    }

    public async testGitLab(baseUrl: string, accessToken: string) {
        const url = new URL("/api/v4/user", baseUrl);
        if (url.protocol !== "https:" && url.protocol !== "http:") {
            throw new Error("Invalid base URL");
        }
        const response = await fetch(url.toString(), {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            keepalive: false,
        });
        if (response.status === 401) {
            return { success: false, message: "Unauthorized" };
        }
        return { success: true, message: "Authorized" };
    }

    public async testForgejo(baseUrl: string, accessToken: string) {
        const url = new URL("/api/v1/user", baseUrl);
        if (url.protocol !== "https:" && url.protocol !== "http:") {
            throw new Error("Invalid base URL");
        }
        const response = await fetch(url.toString(), {
            headers: {
                Authorization: `token ${accessToken}`,
            },
        });
        if (response.status === 401) {
            return { success: false, message: "Unauthorized" };
        }
        return { success: true, message: "Authorized" };
    }
}
