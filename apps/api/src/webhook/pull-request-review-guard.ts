import type { PrReviewOnPush, Repository } from "@proval/types";
import type { ActivityService } from "../api/activity/activity.service.js";

export function isPullRequestReopenAction(action: string, provider: Repository["provider"]): boolean {
    if (provider === "gitlab") {
        return action === "reopen";
    }
    return action === "reopened";
}

function isPullRequestStateClosed(state: string): boolean {
    const normalized = state.trim().toLowerCase();
    return normalized === "closed" || normalized === "merged";
}

export function isPullRequestPushWhileClosed(input: {
    provider: Repository["provider"];
    action: string;
    pullRequestState: string | undefined;
}): boolean {
    const { provider, action, pullRequestState } = input;
    if (!pullRequestState || !isPullRequestStateClosed(pullRequestState)) {
        return false;
    }
    if (isPullRequestReopenAction(action, provider)) {
        return false;
    }
    if (provider === "gitlab") {
        return action === "update";
    }
    return action === "synchronize" || action === "synchronized";
}

export async function skipPullRequestReviewBeforeQueue(
    activityService: ActivityService,
    input: {
        repositoryId: number;
        targetIid: number;
        headSha: string;
        reviewMode: PrReviewOnPush;
        isReopen: boolean;
    },
): Promise<string | null> {
    const { repositoryId, targetIid, headSha, reviewMode, isReopen } = input;

    const lastHeadSha = await activityService.findLastReviewedHeadSha(repositoryId, targetIid);
    if (lastHeadSha && lastHeadSha === headSha) {
        return "Skipped: head already reviewed";
    }

    if (isReopen) {
        return null;
    }

    if (reviewMode === "on_first_push") {
        if (
            (await activityService.hasCompletedPullRequestReview(repositoryId, targetIid)) ||
            (await activityService.hasQueuedOrStartedPullRequestReview(repositoryId, targetIid))
        ) {
            return "Skipped: already reviewed (on_first_push)";
        }
    }

    return null;
}
