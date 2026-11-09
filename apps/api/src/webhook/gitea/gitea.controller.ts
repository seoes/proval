import type { Context } from "hono";
import { GiteaProvider } from "../../git-provider/gitea.js";
import type { Access, ModelProvider, Repository } from "@proval/types";
import { log, logError } from "../../util/log.js";
import { isAllowedTargetBranch } from "../../util/allowed-target-branch.js";
import { resolveGiteaWebhookEvent, skipIfInsufficientAccess } from "../../util/webhook-controller.js";
import { ActivityService } from "../../api/activity/activity.service.js";
import { activityQueue } from "../../api/activity/activity.queue.js";
import {
    isPullRequestPushWhileClosed,
    isPullRequestReopenAction,
    skipPullRequestReviewBeforeQueue,
} from "../pull-request-review-guard.js";

export interface GiteaPullRequestPayload {
    action: string;
    number: number;
    pull_request: {
        number: number;
        title: string;
        body: string | null;
        state: string;
        merged: boolean;
        draft?: boolean;
        base?: { ref?: string };
        head?: { sha?: string };
        user?: { login?: string; username?: string };
    };
    repository: {
        id: number;
        full_name: string;
        owner: { login?: string; username?: string };
        name: string;
    };
}

export const handleGiteaWebhook = async (c: Context) => {
    const event = resolveGiteaWebhookEvent(c);

    const repository = c.get("repository") as Repository;
    const modelProvider = c.get("modelProvider") as ModelProvider;
    const access = c.get("access") as Access;

    const payload = c.get("giteaPayload") as GiteaPullRequestPayload;
    try {
        if (event === "pull_request" || event === "pull_request_sync") {
            return await handleGiteaPullRequestWebhook(
                payload,
                repository,
                modelProvider,
                access,
            );
        }

        log(`Skipped: event '${event}' is not supported (${repository.path})`, "Gitea");
        return c.json({ message: `Skipped: event '${event}' is not supported` }, 200);
    } catch (error) {
        logError("Gitea webhook handler failed", error, "Gitea");
        return c.json({ error: "Internal server error" }, 500);
    }
};

const handleGiteaPullRequestWebhook = async (
    payload: GiteaPullRequestPayload,
    repository: Repository,
    modelProvider: ModelProvider,
    access: Access,
) => {
    const action = payload.action;
    const pr = payload.pull_request;
    const prInfo = `[#${pr.number}]: ${pr.title}`;

    if (!repository.prEnabled || !repository.prReviewEnabled) {
        log(`Skipped: review is off - ${prInfo}`, "Gitea");
        return new Response(JSON.stringify({ message: "Skipped: review is off" }), { status: 200 });
    }

    const reviewMode = repository.prReviewOnPush;

    const allowedAction =
        action === "opened" ||
        action === "reopened" ||
        action === "synchronized" ||
        action === "synchronize" ||
        action === "ready_for_review";
    if (!allowedAction) {
        log(`Skipped: action '${action}' - ${prInfo}`, "Gitea");
        return new Response(JSON.stringify({ message: `Skipped: action '${action}'` }), {
            status: 200,
        });
    }

    if (repository.prIgnoreDraft && pr.draft === true && action !== "ready_for_review") {
        log(`Skipped: draft pull request - ${prInfo}`, "Gitea");
        return new Response(JSON.stringify({ message: "Skipped: draft pull request" }), { status: 200 });
    }

    const targetBranch = pr.base?.ref ?? "";
    if (!isAllowedTargetBranch(repository.prAllowedTargetBranchList, targetBranch)) {
        const message = `Skipped: target branch '${targetBranch}' is not allowed`;
        log(`${message} - ${prInfo}`, "Gitea");
        return new Response(JSON.stringify({ message }), { status: 200 });
    }

    const token = access.accessToken;
    if (!token) {
        return new Response(JSON.stringify({ error: "Repository has no access token" }), {
            status: 500,
        });
    }

    const [owner, repo] = payload.repository.full_name.split("/");
    const giteaProvider = new GiteaProvider(
        access.baseUrl,
        token,
        owner,
        repo,
        repository.gitProviderRepositoryId ?? undefined,
    );
    const authorLogin = pr.user?.login ?? pr.user?.username;
    const accessSkip = await skipIfInsufficientAccess(
        giteaProvider,
        authorLogin ? { login: authorLogin } : null,
        repository.prMinAccessLevel,
        "Skipped: missing author",
        "Gitea",
    );
    if (accessSkip) return accessSkip;

    const isReopen = isPullRequestReopenAction(action, "gitea");
    if (
        isPullRequestPushWhileClosed({
            provider: "gitea",
            action,
            pullRequestState: pr.state,
        })
    ) {
        log(`Skipped: pull request is closed - ${prInfo}`, "Gitea");
        return new Response(JSON.stringify({ message: "Skipped: pull request is closed" }), { status: 200 });
    }

    const activityService = new ActivityService();
    const prNumber = pr.number;

    let headSha = pr.head?.sha ?? "";
    if (!headSha) {
        const version = await giteaProvider.fetchPullRequestVersion(prNumber);
        headSha = version.headSha;
    }

    const skipMessage = await skipPullRequestReviewBeforeQueue(activityService, {
        repositoryId: repository.id,
        targetIid: prNumber,
        headSha,
        reviewMode,
        isReopen,
    });
    if (skipMessage) {
        log(`${skipMessage} - ${prInfo}`, "Gitea");
        return new Response(JSON.stringify({ message: skipMessage }), { status: 200 });
    }

    if ((await giteaProvider.fetchPullRequestChangedFileCount(prNumber)) === 0) {
        log(`Skipped: no changed files - ${prInfo}`, "Gitea");
        return new Response(JSON.stringify({ message: "Skipped: no changed files" }), { status: 200 });
    }

    await activityQueue.push({
        repositoryId: repository.id,
        modelProviderId: modelProvider.id,
        modelName: repository.modelName,
        type: "pr_review",
        targetIid: prNumber,
        headSha,
    });
    activityQueue.drain();

    log(`PR review queued - ${prInfo}`, "Gitea");
    return new Response(JSON.stringify({ message: "Review queued" }), { status: 202 });
};

