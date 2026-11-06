import { ApiError } from "../client.js";
import { renderOne } from "../output.js";
import { resolveRepository } from "./repo.js";
import { flagBoolean, type CommandContext, UsageError } from "./shared.js";

interface TriggerResponse {
    activityId?: number;
    message?: string;
}

/**
 * Starts a review of one merge request.
 *
 * This calls a dedicated endpoint rather than posting a synthetic webhook. A
 * webhook would need the repository's webhook secret, which is a credential
 * that can impersonate the git host for that repository, and handing that to a
 * client would make the token scopes meaningless.
 *
 * --force additionally asks the server to ignore a review that has already
 * completed for this merge request. Without the endpoint's own force, the only
 * way through was to switch the repository to on_every_push, trigger, and
 * switch back, which leaves the repository in the expensive mode if it fails
 * in the middle.
 */
export async function runReviewCommand(context: CommandContext): Promise<void> {
    const [verb, reference, iidText] = context.argumentList;

    if (verb !== "trigger") {
        throw new UsageError("proval review trigger <repository> <iid> [--force]");
    }
    if (!reference || !iidText) {
        throw new UsageError("proval review trigger <repository> <iid> [--force]");
    }
    const iid = Number.parseInt(iidText, 10);
    if (!Number.isInteger(iid) || iid <= 0) {
        throw new UsageError(`expected a merge request number, got ${iidText}`);
    }

    const repository = await resolveRepository(context, reference);
    let response: TriggerResponse;
    try {
        response = await context.client.post<TriggerResponse>(`/repository/${repository.id}/review`, {
            iid,
            force: flagBoolean(context.flagMap, "force"),
        });
    } catch (error) {
        // The endpoint is the one piece of this client that is not yet in the
        // API. Say that plainly rather than reporting a bare 404, which reads
        // as "no such repository" and sends the reader looking in the wrong
        // place entirely.
        if (error instanceof ApiError && error.status === 404) {
            throw new UsageError(
                `This instance has no review trigger endpoint, so 'review trigger' cannot run against it yet. ` +
                    "It arrives with POST /api/repository/:id/review, the endpoint proposed in issue #67.",
            );
        }
        throw error;
    }

    context.write(
        renderOne(context.mode, {
            repository: repository.path,
            iid,
            activityId: response.activityId ?? null,
            message: response.message ?? "Review started",
        }),
    );
}
