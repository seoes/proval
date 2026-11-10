import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type {
    GitPagedPullRequestResponse,
    GitPagedRepositoryResponse,
    GitPullRequestDiffResponse,
    GitPullRequestItem,
    GitRepositoryDetail,
} from "@proval/types";

const currentDir = dirname(fileURLToPath(import.meta.url));
const accessItemSource = readFileSync(resolve(currentDir, "AccessItem.svelte"), "utf-8");
const providerPageSource = readFileSync(resolve(currentDir, "[id]/+page.svelte"), "utf-8");

type DeferredResponse = {
    url: string;
    signal: AbortSignal | undefined;
    resolve: (response: Response) => void;
    reject: (error: unknown) => void;
};

function createJsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

function createProviderPageHarness(initialAccessId = 1) {
    const scriptMatch = providerPageSource.match(/<script lang="ts">([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch, "Expected <script lang=\"ts\"> block in [id]/+page.svelte");

    let scriptBody = scriptMatch[1]
        .replace(/^\s*import\s+[\s\S]*?from\s+["'][^"']+["'];\s*$/gm, "")
        .replace(/const\s+\{\s*data\s*\}\s*:\s*PageProps\s*=\s*\$props\(\);/, "")
        .replace(
            /const\s+access\s*=\s*\$derived\(data\.access\);/,
            "let access = { id: initialAccessId, provider: 'gitea', name: 'Gitea', baseUrl: 'https://gitea.example.com' };",
        )
        .replace(/const\s+overview\s*=\s*\$derived<[^>]+>\(data\.overview\);/, "const overview = null;");

    scriptBody += `
        return {
            getState: () => ({
                selectedScope,
                searchQuery,
                repoList,
                repoTotal,
                repoPage,
                isLoadingRepos,
                repoError,
                selectedRepo,
                prList,
                prTotal,
                prPage,
                prState,
                isLoadingPrs,
                prError,
                selectedPr,
                prDetail,
                isLoadingPrDetail,
                prDetailError,
            }),
            loadRepositories,
            loadPullRequests,
            openPullRequest,
            backToPullRequests,
            backToRepositories,
            handleScopeChange,
            openRepository,
            handlePrStateChange,
            cleanup: () => effectCleanups.forEach((fn) => fn()),
        };
    `;

    const transpiled = ts.transpileModule(scriptBody, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
        },
    }).outputText;

    const pendingQueue: DeferredResponse[] = [];
    const effectCleanups: Array<() => void> = [];

    const fetchApi = (url: string, options: RequestInit = {}) =>
        new Promise<Response>((resolvePromise, rejectPromise) => {
            pendingQueue.push({
                url,
                signal: options.signal ?? undefined,
                resolve: resolvePromise,
                reject: rejectPromise,
            });
        });

    let effectFn: (() => void | (() => void)) | null = null;
    let lastObservedScope: string | undefined;

    const runEffectIfScopeChanged = (currentScope: string) => {
        if (effectFn && currentScope !== lastObservedScope) {
            while (effectCleanups.length > 0) {
                const cleanup = effectCleanups.pop();
                cleanup?.();
            }
            lastObservedScope = currentScope;
            const cleanup = effectFn();
            if (typeof cleanup === "function") {
                effectCleanups.push(cleanup);
            }
        }
    };

    const stateRune = <T>(initial: T): T => initial;
    const derivedRune = Object.assign(<T>(value: T): T => value, {
        by: <T>(fn: () => T): T => fn(),
    });

    const factory = new Function(
        "initialAccessId",
        "fetchApi",
        "untrack",
        "$state",
        "$derived",
        "$effect",
        transpiled,
    ) as (
        id: number,
        fetchFn: typeof fetchApi,
        untrackFn: <T>(fn: () => T) => T,
        stateFn: typeof stateRune,
        derivedFn: typeof derivedRune,
        effectRegistrar: (fn: () => void | (() => void)) => void,
    ) => {
        getState: () => {
            selectedScope: string;
            searchQuery: string;
            repoList: GitRepositoryDetail[];
            repoTotal: number;
            repoPage: number;
            isLoadingRepos: boolean;
            repoError: string | null;
            selectedRepo: GitRepositoryDetail | null;
            prList: GitPullRequestItem[];
            prTotal: number;
            prPage: number;
            prState: "all" | "open" | "closed" | "merged";
            isLoadingPrs: boolean;
            prError: string | null;
            selectedPr: GitPullRequestItem | null;
            prDetail: GitPullRequestDiffResponse | null;
            isLoadingPrDetail: boolean;
            prDetailError: string | null;
        };
        loadRepositories: (scope: string, page: number) => Promise<void>;
        loadPullRequests: (
            repo: GitRepositoryDetail,
            state: "all" | "open" | "closed" | "merged",
            page: number,
        ) => Promise<void>;
        openPullRequest: (pr: GitPullRequestItem) => Promise<void>;
        backToPullRequests: () => void;
        backToRepositories: () => void;
        handleScopeChange: (scope: string) => void;
        openRepository: (repo: GitRepositoryDetail) => void;
        handlePrStateChange: (state: "all" | "open" | "closed" | "merged") => void;
        cleanup: () => void;
    };

    const instance = factory(
        initialAccessId,
        fetchApi,
        (fn) => fn(),
        stateRune,
        derivedRune,
        (fn) => {
            effectFn = fn;
        },
    );

    // Run initial $effect on mount
    runEffectIfScopeChanged(instance.getState().selectedScope);

    const originalHandleScopeChange = instance.handleScopeChange;
    instance.handleScopeChange = (scope: string) => {
        originalHandleScopeChange(scope);
        runEffectIfScopeChanged(instance.getState().selectedScope);
    };

    return {
        ...instance,
        pendingQueue,
    };
}

const sampleRepoPersonal: GitRepositoryDetail = {
    id: 1,
    name: "personal-repo",
    fullName: "alice/personal-repo",
    owner: "alice",
    description: "Personal repository",
    url: "https://gitea.example.com/alice/personal-repo",
    isPrivate: false,
    defaultBranch: "main",
    canAccess: true,
    alreadyConnected: false,
};

const sampleRepoOrgA: GitRepositoryDetail = {
    id: 2,
    name: "orga-repo",
    fullName: "org-a/orga-repo",
    owner: "org-a",
    description: "Org A repository",
    url: "https://gitea.example.com/org-a/orga-repo",
    isPrivate: true,
    defaultBranch: "main",
    canAccess: true,
    alreadyConnected: false,
};

const sampleRepoOrgB: GitRepositoryDetail = {
    id: 3,
    name: "orgb-repo",
    fullName: "org-b/orgb-repo",
    owner: "org-b",
    description: "Org B repository",
    url: "https://gitea.example.com/org-b/orgb-repo",
    isPrivate: true,
    defaultBranch: "develop",
    canAccess: true,
    alreadyConnected: false,
};

const samplePr1: GitPullRequestItem = {
    id: 101,
    number: 1,
    title: "First PR",
    body: "Body 1",
    author: "alice",
    sourceBranch: "feat-1",
    targetBranch: "main",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T01:00:00.000Z",
    state: "open",
    url: "https://gitea.example.com/alice/personal-repo/pulls/1",
};

const samplePr2: GitPullRequestItem = {
    id: 102,
    number: 2,
    title: "Second PR",
    body: "Body 2",
    author: "bob",
    sourceBranch: "feat-2",
    targetBranch: "main",
    createdAt: "2026-11-02T00:00:00.000Z",
    updatedAt: "2026-11-02T01:00:00.000Z",
    state: "open",
    url: "https://gitea.example.com/alice/personal-repo/pulls/2",
};

function makePrDiffResponse(pr: GitPullRequestItem): GitPullRequestDiffResponse {
    return {
        pullRequest: {
            id: pr.id,
            number: pr.number,
            title: pr.title,
            body: pr.body,
            state: pr.state,
            author: pr.author,
            authorAvatarUrl: null,
            owner: "alice",
            repo: "personal-repo",
            sourceBranch: pr.sourceBranch,
            targetBranch: pr.targetBranch,
            headSha: `head-${pr.number}`,
            baseSha: `base-${pr.number}`,
            createdAt: pr.createdAt,
            updatedAt: pr.updatedAt,
            closedAt: null,
            mergedAt: null,
            isMerged: false,
            url: pr.url,
            additions: 10,
            deletions: 2,
            changedFileCount: 1,
        },
        fileList: [
            {
                filename: `src/pr-${pr.number}.ts`,
                previousFilename: null,
                status: "modified",
                additions: 10,
                deletions: 2,
                changes: 12,
                patch: "@@ -1,2 +1,10 @@\n+change",
                isBinary: false,
            },
        ],
        totalFileCount: 1,
        isTruncated: false,
    };
}

describe("AccessItem Browse button visibility", () => {
    test("renders Browse button only when item.provider is gitea or forgejo and preserves other actions", () => {
        assert.match(
            accessItemSource,
            /\{#if\s+item\.provider\s*===\s*"gitea"\s*\|\|\s*item\.provider\s*===\s*"forgejo"\}\s*<Button\s+text\s+size="sm"\s+href="\/provider\/\{item\.id\}">Browse<\/Button>\s*\{\/if\}/,
        );
        assert.match(accessItemSource, /Test Connection/);
        assert.match(accessItemSource, /Update Access Token/);
        assert.match(accessItemSource, /aria-label="Connection settings"/);
        assert.match(accessItemSource, /aria-label="Delete connection"/);
    });
});

describe("Provider browser page concurrency and request lifecycle", () => {
    test("loads repositories once on initialization and once per scope change without duplicate requests", async () => {
        const harness = createProviderPageHarness(7);

        // Initial mount triggers exactly 1 request
        assert.equal(harness.pendingQueue.length, 1);
        assert.equal(harness.pendingQueue[0]?.url, "/access/7/repository-paged?page=1&limit=15");
        assert.equal(harness.getState().isLoadingRepos, true);

        const initialPayload: GitPagedRepositoryResponse = {
            repositoryList: [sampleRepoPersonal],
            total: 1,
            page: 1,
            limit: 15,
        };
        harness.pendingQueue.shift()!.resolve(createJsonResponse(initialPayload));
        await new Promise((r) => setTimeout(r, 0));

        assert.equal(harness.getState().isLoadingRepos, false);
        assert.deepEqual(harness.getState().repoList, [sampleRepoPersonal]);

        // Switching scope to org-a triggers exactly 1 request (no duplicate call from handleScopeChange + $effect)
        harness.handleScopeChange("org-a");
        assert.equal(harness.pendingQueue.length, 1);
        assert.equal(harness.pendingQueue[0]?.url, "/access/7/repository-paged?page=1&limit=15&org=org-a");
        assert.equal(harness.getState().selectedScope, "org-a");
        assert.equal(harness.getState().isLoadingRepos, true);

        const orgAPayload: GitPagedRepositoryResponse = {
            repositoryList: [sampleRepoOrgA],
            total: 1,
            page: 1,
            limit: 15,
        };
        harness.pendingQueue.shift()!.resolve(createJsonResponse(orgAPayload));
        await new Promise((r) => setTimeout(r, 0));

        assert.equal(harness.getState().isLoadingRepos, false);
        assert.deepEqual(harness.getState().repoList, [sampleRepoOrgA]);
    });

    test("ignores stale repository responses and preserves loading state during rapid scope switching", async () => {
        const harness = createProviderPageHarness(7);

        // Resolve initial personal load
        harness.pendingQueue.shift()!.resolve(
            createJsonResponse({
                repositoryList: [sampleRepoPersonal],
                total: 1,
                page: 1,
                limit: 15,
            } satisfies GitPagedRepositoryResponse),
        );
        await new Promise((r) => setTimeout(r, 0));

        // Rapidly switch from personal -> org-a -> org-b
        harness.handleScopeChange("org-a");
        assert.equal(harness.pendingQueue.length, 1);
        const orgARequest = harness.pendingQueue.shift()!;
        assert.equal(orgARequest.signal?.aborted, false);

        harness.handleScopeChange("org-b");
        assert.equal(orgARequest.signal?.aborted, true);
        assert.equal(harness.pendingQueue.length, 1);
        const orgBRequest = harness.pendingQueue.shift()!;
        assert.equal(orgBRequest.signal?.aborted, false);

        // Stale org-a response arrives first while org-b is still in flight
        orgARequest.resolve(
            createJsonResponse({
                repositoryList: [sampleRepoOrgA],
                total: 1,
                page: 1,
                limit: 15,
            } satisfies GitPagedRepositoryResponse),
        );
        await new Promise((r) => setTimeout(r, 0));

        // Must NOT apply org-a data and must NOT clear isLoadingRepos while org-b is active
        assert.equal(harness.getState().selectedScope, "org-b");
        assert.equal(harness.getState().isLoadingRepos, true);
        assert.deepEqual(harness.getState().repoList, [sampleRepoPersonal]);

        // Now org-b finishes
        orgBRequest.resolve(
            createJsonResponse({
                repositoryList: [sampleRepoOrgB],
                total: 1,
                page: 1,
                limit: 15,
            } satisfies GitPagedRepositoryResponse),
        );
        await new Promise((r) => setTimeout(r, 0));

        assert.equal(harness.getState().isLoadingRepos, false);
        assert.deepEqual(harness.getState().repoList, [sampleRepoOrgB]);
    });

    test("aborts and ignores in-flight PR detail when going back to PR list or opening another PR", async () => {
        const harness = createProviderPageHarness(7);

        // Finish initial repo load
        harness.pendingQueue.shift()!.resolve(
            createJsonResponse({
                repositoryList: [sampleRepoPersonal],
                total: 1,
                page: 1,
                limit: 15,
            } satisfies GitPagedRepositoryResponse),
        );
        await new Promise((r) => setTimeout(r, 0));

        // Open repository and resolve PR list
        harness.openRepository(sampleRepoPersonal);
        assert.equal(harness.pendingQueue.length, 1);
        harness.pendingQueue.shift()!.resolve(
            createJsonResponse({
                pullRequestList: [samplePr1, samplePr2],
                total: 2,
                page: 1,
                limit: 15,
            } satisfies GitPagedPullRequestResponse),
        );
        await new Promise((r) => setTimeout(r, 0));
        assert.equal(harness.getState().prList.length, 2);

        // Flow A: Open PR #1 and immediately go back to PR list before PR #1 finishes
        const openPr1Promise = harness.openPullRequest(samplePr1);
        assert.equal(harness.getState().isLoadingPrDetail, true);
        assert.equal(harness.pendingQueue.length, 1);
        const pr1RequestA = harness.pendingQueue.shift()!;

        harness.backToPullRequests();
        assert.equal(pr1RequestA.signal?.aborted, true);
        assert.equal(harness.getState().selectedPr, null);
        assert.equal(harness.getState().isLoadingPrDetail, false);

        // Late resolution of PR #1 must be ignored
        pr1RequestA.resolve(createJsonResponse(makePrDiffResponse(samplePr1)));
        await openPr1Promise;
        assert.equal(harness.getState().prDetail, null);
        assert.equal(harness.getState().isLoadingPrDetail, false);

        // Flow B: Open PR #1, and while PR #1 is still loading, open PR #2
        const pendingPr1 = harness.openPullRequest(samplePr1);
        const pr1RequestB = harness.pendingQueue.shift()!;
        const pendingPr2 = harness.openPullRequest(samplePr2);
        const pr2RequestB = harness.pendingQueue.shift()!;

        assert.equal(pr1RequestB.signal?.aborted, true);
        assert.equal(pr2RequestB.signal?.aborted, false);
        assert.equal(harness.getState().selectedPr?.number, 2);
        assert.equal(harness.getState().isLoadingPrDetail, true);

        // Stale PR #1 response resolves while PR #2 is still loading
        pr1RequestB.resolve(createJsonResponse(makePrDiffResponse(samplePr1)));
        await pendingPr1;

        // Must NOT overwrite prDetail with PR #1 and must NOT end isLoadingPrDetail early
        assert.equal(harness.getState().prDetail, null);
        assert.equal(harness.getState().isLoadingPrDetail, true);

        // Now PR #2 resolves
        const expectedPr2Diff = makePrDiffResponse(samplePr2);
        pr2RequestB.resolve(createJsonResponse(expectedPr2Diff));
        await pendingPr2;

        assert.equal(harness.getState().isLoadingPrDetail, false);
        assert.equal(harness.getState().prDetail?.pullRequest.number, 2);
        assert.equal(harness.getState().prDetail?.fileList[0]?.filename, "src/pr-2.ts");
    });

    test("preserves pagination and ignores stale page responses for repositories and pull requests", async () => {
        const harness = createProviderPageHarness(7);

        // Resolve page 1 of repositories
        harness.pendingQueue.shift()!.resolve(
            createJsonResponse({
                repositoryList: [sampleRepoPersonal],
                total: 30,
                page: 1,
                limit: 15,
            } satisfies GitPagedRepositoryResponse),
        );
        await new Promise((r) => setTimeout(r, 0));

        // Navigate to page 2, then quickly to page 3
        const page2Promise = harness.loadRepositories("personal", 2);
        const page2Req = harness.pendingQueue.shift()!;
        const page3Promise = harness.loadRepositories("personal", 3);
        const page3Req = harness.pendingQueue.shift()!;

        assert.equal(page2Req.signal?.aborted, true);
        assert.equal(page3Req.signal?.aborted, false);

        // Page 2 resolves first (stale)
        page2Req.resolve(
            createJsonResponse({
                repositoryList: [sampleRepoOrgA],
                total: 30,
                page: 2,
                limit: 15,
            } satisfies GitPagedRepositoryResponse),
        );
        await page2Promise;
        assert.equal(harness.getState().isLoadingRepos, true);
        assert.equal(harness.getState().repoPage, 1);

        // Page 3 resolves
        page3Req.resolve(
            createJsonResponse({
                repositoryList: [sampleRepoOrgB],
                total: 30,
                page: 3,
                limit: 15,
            } satisfies GitPagedRepositoryResponse),
        );
        await page3Promise;
        assert.equal(harness.getState().isLoadingRepos, false);
        assert.equal(harness.getState().repoPage, 3);
        assert.deepEqual(harness.getState().repoList, [sampleRepoOrgB]);
    });
});

