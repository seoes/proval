import { gitProviderAccessTable, repositoryTable } from "@proval/db";
import db from "../../db";
import { count, eq } from "drizzle-orm";

export class GitLabAccessService {
    private readonly query = {
        id: gitProviderAccessTable.id,
        provider: gitProviderAccessTable.provider,
        name: gitProviderAccessTable.name,
        baseUrl: gitProviderAccessTable.baseUrl,
        createdAt: gitProviderAccessTable.createdAt,
        updatedAt: gitProviderAccessTable.updatedAt,
    };

    public async findAll() {
        const accessList = await db.select(this.query).from(gitProviderAccessTable);
        return accessList;
    }

    public async findById(id: number) {
        const accessList = await db
            .select(this.query)
            .from(gitProviderAccessTable)
            .where(eq(gitProviderAccessTable.id, id));
        if (accessList.length === 0) {
            throw new Error("Access configuration not found");
        }
        return accessList[0];
    }

    public async findByProvider(provider: "gitlab" | "forgejo") {
        const accessList = await db
            .select(this.query)
            .from(gitProviderAccessTable)
            .where(eq(gitProviderAccessTable.provider, provider));
        return accessList;
    }

    public async getAccessToken(id: number) {
        const access = await db
            .select({ accessToken: gitProviderAccessTable.accessToken })
            .from(gitProviderAccessTable)
            .where(eq(gitProviderAccessTable.id, id));
        if (access.length === 0) {
            throw new Error("Access configuration not found");
        }
        if (!access[0].accessToken) {
            throw new Error("Access token not found");
        }
        return access[0].accessToken;
    }

    public async create(provider: "gitlab" | "forgejo", name: string, baseUrl: string, accessToken: string) {
        const newAccess = await db
            .insert(gitProviderAccessTable)
            .values({
                provider,
                name,
                baseUrl,
                accessToken,
            })
            .returning(this.query);
        return newAccess[0];
    }

    public async updateById(id: number, name: string, baseUrl: string, accessToken?: string) {
        const patch = {
            name,
            baseUrl,
            ...(accessToken !== undefined && accessToken.trim() !== "" ? { accessToken: accessToken.trim() } : {}),
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
            .set({ accessToken })
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

        return new Set(
            rows.map((row) => row.gitProviderRepositoryId).filter((id): id is number => id != null),
        );
    }

    public async testGitLab(baseUrl: string, accessToken: string) {
        // new URL(baseUrl) 파싱 검증, https: 프로토콜 확인, trailing slash 정규화.
        const url = new URL(baseUrl);
        if (url.protocol !== "https:" && url.protocol !== "http:") {
            throw new Error("Invalid base URL");
        }
        if (url.pathname.endsWith("/")) {
            url.pathname = url.pathname.slice(0, -1);
        }
        const response = await fetch(`${url.toString()}/api/v4/user`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        if (response.status === 401) {
            return { success: false, message: "Unauthorized" };
        }
        return { success: true, message: "Authorized" };
    }

    public async testForgejo(baseUrl: string, accessToken: string) {
        const url = new URL(baseUrl);
        if (url.protocol !== "https:" && url.protocol !== "http:") {
            throw new Error("Invalid base URL");
        }
        if (url.pathname.endsWith("/")) {
            url.pathname = url.pathname.slice(0, -1);
        }
        const response = await fetch(`${url.toString()}/api/v1/user`, {
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
