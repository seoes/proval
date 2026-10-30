import { describe, expect, it } from "bun:test";
import type { ActivityService } from "../api/activity/activity.service.js";
import {
    isPullRequestPushWhileClosed,
    isPullRequestReopenAction,
    skipPullRequestReviewBeforeQueue,
} from "./pull-request-review-guard.js";

function mockActivityService(overrides: {
    lastHeadSha?: string | null;
    hasCompleted?: boolean;
    hasQueuedOrStarted?: boolean;
}): ActivityService {
    return {
        findLastReviewedHeadSha: async () => overrides.lastHeadSha ?? null,
        hasCompletedPullRequestReview: async () => overrides.hasCompleted ?? false,
        hasQueuedOrStartedPullRequestReview: async () => overrides.hasQueuedOrStarted ?? false,
    } as unknown as ActivityService;
}

describe("skipPullRequestReviewBeforeQueue", () => {
    it("skips reopen when head was already reviewed", async () => {
        const message = await skipPullRequestReviewBeforeQueue(
            mockActivityService({ lastHeadSha: "abc" }),
            {
                repositoryId: 1,
                targetIid: 2,
                headSha: "abc",
                reviewMode: "on_every_push",
                isReopen: true,
            },
        );
        expect(message).toBe("Skipped: head already reviewed");
    });

    it("queues reopen with a new head even when on_first_push already reviewed another head", async () => {
        const message = await skipPullRequestReviewBeforeQueue(
            mockActivityService({ lastHeadSha: "old", hasCompleted: true }),
            {
                repositoryId: 1,
                targetIid: 2,
                headSha: "new",
                reviewMode: "on_first_push",
                isReopen: true,
            },
        );
        expect(message).toBeNull();
    });

    it("applies on_first_push gate for non reopen events", async () => {
        const message = await skipPullRequestReviewBeforeQueue(
            mockActivityService({ hasCompleted: true }),
            {
                repositoryId: 1,
                targetIid: 2,
                headSha: "new",
                reviewMode: "on_first_push",
                isReopen: false,
            },
        );
        expect(message).toBe("Skipped: already reviewed (on_first_push)");
    });
});

describe("isPullRequestReopenAction", () => {
    it("detects GitLab reopen", () => {
        expect(isPullRequestReopenAction("reopen", "gitlab")).toBe(true);
        expect(isPullRequestReopenAction("reopened", "gitlab")).toBe(false);
    });

    it("detects GitHub and Forgejo reopen", () => {
        expect(isPullRequestReopenAction("reopened", "github")).toBe(true);
        expect(isPullRequestReopenAction("reopened", "forgejo")).toBe(true);
        expect(isPullRequestReopenAction("reopen", "github")).toBe(false);
    });
});

describe("isPullRequestPushWhileClosed", () => {
    it("skips synchronize on a closed GitHub pull request", () => {
        expect(
            isPullRequestPushWhileClosed({
                provider: "github",
                action: "synchronize",
                pullRequestState: "closed",
            }),
        ).toBe(true);
    });

    it("allows reopen on a closed pull request", () => {
        expect(
            isPullRequestPushWhileClosed({
                provider: "github",
                action: "reopened",
                pullRequestState: "open",
            }),
        ).toBe(false);
    });

    it("skips GitLab update while merge request is closed", () => {
        expect(
            isPullRequestPushWhileClosed({
                provider: "gitlab",
                action: "update",
                pullRequestState: "closed",
            }),
        ).toBe(true);
    });

    it("ignores push actions when pull request is open", () => {
        expect(
            isPullRequestPushWhileClosed({
                provider: "forgejo",
                action: "synchronized",
                pullRequestState: "open",
            }),
        ).toBe(false);
    });
});
