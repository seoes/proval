import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Repository } from "@proval/types";

const insertReturningMock = mock<() => Promise<Repository[]>>(() => Promise.resolve([]));
const insertValuesMock = mock((values: unknown) => ({
    returning: insertReturningMock,
}));
const insertMock = mock(() => ({
    values: insertValuesMock,
}));

let selectResultQueue: unknown[][] = [];

function createWhereChain(result: unknown[]) {
    return {
        limit: mock(() => Promise.resolve(result)),
        then(resolve: (value: unknown) => void) {
            resolve(result);
        },
    };
}

const selectMock = mock(() => ({
    from: mock(() => ({
        where: mock(() => createWhereChain(selectResultQueue.shift() ?? [])),
    })),
}));

const updateReturningMock = mock<() => Promise<Repository[]>>(() => Promise.resolve([]));
const updateSetMock = mock((_data: unknown) => ({
    where: mock(() => ({
        returning: updateReturningMock,
    })),
}));
const updateMock = mock(() => ({
    set: updateSetMock,
}));

const findByIdMock = mock(async () => ({
    id: 1,
    provider: "gitlab" as const,
    name: "GitLab Access",
    baseUrl: "https://gitlab.example.com",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
}));
const getAccessTokenMock = mock(async () => "glpat-personal");

const deleteWhereMock = mock(() => Promise.resolve());
const deleteMock = mock(() => ({
    where: deleteWhereMock,
}));

mock.module("../../db/index.js", () => ({
    default: {
        insert: insertMock,
        select: selectMock,
        update: updateMock,
        delete: deleteMock,
    },
}));

mock.module("../access/access.service.js", () => ({
    GitLabAccessService: class {
        findById = findByIdMock;
        getAccessToken = getAccessTokenMock;
    },
}));

const createProjectAccessTokenMock = mock(async () => ({
    token: "glpat-project-new",
    tokenId: 99,
}));

const removeProjectAccessTokenMock = mock(async () => undefined);

mock.module("../../git-provider/gitlab.js", () => ({
    GitLabProvider: class {
        static createProjectAccessToken = createProjectAccessTokenMock;
        static removeProjectAccessToken = removeProjectAccessTokenMock;
        static rotateProjectAccessToken = mock(async () => ({ token: "rotated", tokenId: 43 }));
    },
}));

const { RepositoryService } = await import("./repository.service.js");

function makeRepositoryRow(overrides: Partial<Repository> = {}): Repository {
    return {
        id: 1,
        path: "group/repo",
        description: null,
        provider: "gitlab",
        webhookSecret: "webhook-secret",
        language: "English",
        accessToken: "glpat-project",
        accessTokenId: 42,
        githubInstallationId: null,
        githubRepositoryId: null,
        gitProviderAccessId: 1,
        gitProviderRepositoryId: 100,
        reviewOnPullRequestOpen: true,
        inlineReview: true,
        replyToPullRequestComment: "all",
        deepResearchOnPullRequest: false,
        commentOnIssueOpen: true,
        replyToIssueComment: "all",
        modelProviderId: null,
        modelName: "test-model",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        ...overrides,
    };
}

describe("Create GitLab Repository", () => {
    const repositoryService = new RepositoryService();

    beforeEach(() => {
        insertMock.mockClear();
        insertValuesMock.mockClear();
        insertReturningMock.mockClear();
        updateMock.mockClear();
        updateSetMock.mockClear();
        updateReturningMock.mockClear();
        deleteMock.mockClear();
        deleteWhereMock.mockClear();
        findByIdMock.mockClear();
        getAccessTokenMock.mockClear();
        createProjectAccessTokenMock.mockClear();
        removeProjectAccessTokenMock.mockClear();

        insertReturningMock.mockImplementation(() =>
            Promise.resolve([
                makeRepositoryRow({
                    accessToken: null,
                    accessTokenId: null,
                }),
            ]),
        );
        updateReturningMock.mockImplementation(() =>
            Promise.resolve([
                makeRepositoryRow({
                    accessToken: "glpat-project-new",
                    accessTokenId: 99,
                }),
            ]),
        );
    });

    describe("Valid inputs", () => {
        it("should insert repository first, then create project access token and persist token + tokenId", async () => {
            const result = await repositoryService.create({
                path: "group/repo",
                provider: "gitlab",
                webhookSecret: "webhook-secret",
                gitProviderAccessId: 1,
                gitProviderRepositoryId: 100,
                language: "English",
                modelName: "test-model",
            });

            expect(insertValuesMock).toHaveBeenCalledTimes(1);
            expect(insertValuesMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    accessToken: null,
                    accessTokenId: null,
                    gitProviderAccessId: 1,
                    gitProviderRepositoryId: 100,
                }),
            );

            expect(createProjectAccessTokenMock).toHaveBeenCalledTimes(1);
            expect(createProjectAccessTokenMock).toHaveBeenCalledWith(
                "https://gitlab.example.com",
                "glpat-personal",
                100,
            );

            expect(updateSetMock).toHaveBeenCalledTimes(1);
            expect(updateSetMock).toHaveBeenCalledWith({
                accessToken: "glpat-project-new",
                accessTokenId: 99,
            });
            expect(deleteMock).not.toHaveBeenCalled();

            expect(result).toEqual(
                expect.objectContaining({
                    id: 1,
                    path: "group/repo",
                    provider: "gitlab",
                    gitProviderRepositoryId: 100,
                    lastUsedAt: null,
                }),
            );
            expect(result).not.toHaveProperty("accessToken");
            expect(result).not.toHaveProperty("accessTokenId");
            expect(result).not.toHaveProperty("webhookSecret");
        });
    });
});

describe("Update GitLab Repository", () => {
    const repositoryService = new RepositoryService();

    beforeEach(() => {
        selectMock.mockClear();
        updateMock.mockClear();
        updateSetMock.mockClear();
        updateReturningMock.mockClear();
        findByIdMock.mockClear();
        getAccessTokenMock.mockClear();
        createProjectAccessTokenMock.mockClear();
        removeProjectAccessTokenMock.mockClear();

        selectResultQueue = [
            [
                {
                    gitProviderRepositoryId: 100,
                    accessToken: "glpat-project-old",
                    accessTokenId: 42,
                },
            ],
            [{ lastUsedAt: null }],
        ];

        updateReturningMock.mockImplementation(() =>
            Promise.resolve([
                makeRepositoryRow({
                    gitProviderRepositoryId: 200,
                    accessToken: "glpat-project-new",
                    accessTokenId: 99,
                    path: "group/new-repo",
                    language: "Korean",
                }),
            ]),
        );
    });

    describe("Valid inputs", () => {
        it("should create new project access token, update repository, then revoke the old token", async () => {
            await repositoryService.update(1, {
                provider: "gitlab",
                gitProviderAccessId: 1,
                gitProviderRepositoryId: 200,
                path: "group/new-repo",
                language: "Korean",
            });

            expect(createProjectAccessTokenMock.mock.invocationCallOrder[0]).toBeLessThan(
                updateSetMock.mock.invocationCallOrder[0],
            );
            expect(updateSetMock.mock.invocationCallOrder[0]).toBeLessThan(
                removeProjectAccessTokenMock.mock.invocationCallOrder[0],
            );

            expect(createProjectAccessTokenMock).toHaveBeenCalledWith(
                "https://gitlab.example.com",
                "glpat-personal",
                200,
            );

            expect(updateSetMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    accessToken: "glpat-project-new",
                    accessTokenId: 99,
                    gitProviderRepositoryId: 200,
                    path: "group/new-repo",
                    language: "Korean",
                }),
            );

            expect(removeProjectAccessTokenMock).toHaveBeenCalledWith(
                "https://gitlab.example.com",
                "glpat-personal",
                100,
                42,
            );
        });
    });
});
