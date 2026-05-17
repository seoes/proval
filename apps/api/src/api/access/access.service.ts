import { gitProviderAccessTable, repositoryTable } from "@code-review/db";
import db from "../../db";
import { count, eq } from "drizzle-orm";

export class GitLabAccessService {
    private readonly query = {
        id: gitProviderAccessTable.id,
        provider: gitProviderAccessTable.provider,
        name: gitProviderAccessTable.name,
        baseUrl: gitProviderAccessTable.baseUrl,
        botUsername: gitProviderAccessTable.botUsername,
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

    public async create(
        provider: "gitlab" | "forgejo",
        name: string,
        baseUrl: string,
        accessToken: string,
        botUsername?: string,
    ) {
        const newAccess = await db
            .insert(gitProviderAccessTable)
            .values({
                provider,
                name,
                baseUrl,
                accessToken,
                botUsername,
            })
            .returning({ id: gitProviderAccessTable.id });
        return newAccess[0].id;
    }

    public async updateById(id: number, name: string, baseUrl: string, botUsername?: string, accessToken?: string) {
        const patch = {
            name,
            baseUrl,
            botUsername: botUsername ?? null,
            ...(accessToken !== undefined && accessToken.trim() !== "" ? { accessToken: accessToken.trim() } : {}),
        };
        const updatedAccess = await db
            .update(gitProviderAccessTable)
            .set(patch)
            .where(eq(gitProviderAccessTable.id, id))
            .returning({ id: gitProviderAccessTable.id });
        return updatedAccess[0].id;
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

    public async testGitLab(baseUrl: string, accessToken: string) {
        const response = await fetch(`${baseUrl}/api/v4/user`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        if (response.status === 401) {
            return { success: false, message: "Invalid access token" };
        }
        return { success: true, message: "Access token is valid" };
    }
}
