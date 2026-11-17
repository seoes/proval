import type { RepositoryResponse } from "@proval/types";
import { formatValue, render, renderOne, type Column } from "../output.js";
import { flagString, type CommandContext, UsageError } from "./shared.js";

const columnList: Column<RepositoryResponse>[] = [
    { header: "id", value: (r) => String(r.id), numeric: true },
    { header: "path", value: (r) => r.path },
    { header: "review", value: (r) => formatValue(r.prReviewEnabled) },
    { header: "mode", value: (r) => r.prReviewOnPush },
    { header: "prompt", value: (r) => (r.userPrompt ? "custom" : "default") },
];

/**
 * Only ever sends the fields being changed. Sending a whole repository back
 * makes the server mint a new git provider access token and revoke the old
 * one, because provider, gitProviderRepositoryId and gitProviderAccessId are
 * all present. That is why this never does a read, modify, write round trip.
 */
const settableFieldMap: Record<string, (raw: string) => unknown> = {
    prEnabled: parseBoolean,
    prReviewEnabled: parseBoolean,
    prInlineReview: parseBoolean,
    prIgnoreDraft: parseBoolean,
    prReplyEnabled: parseBoolean,
    prMentionOnly: parseBoolean,
    issueEnabled: parseBoolean,
    issueCommentOnOpenEnabled: parseBoolean,
    issueReplyEnabled: parseBoolean,
    issueMentionOnly: parseBoolean,
    prReviewOnPush: parseReviewMode,
    prMinAccessLevel: parseWholeNumber,
    issueMinAccessLevel: parseWholeNumber,
    modelName: (raw) => raw,
    language: (raw) => raw,
    userPrompt: (raw) => raw,
};

function parseBoolean(raw: string): boolean {
    if (raw === "true" || raw === "yes" || raw === "on") return true;
    if (raw === "false" || raw === "no" || raw === "off") return false;
    throw new UsageError(`expected true or false, got ${raw}`);
}

function parseReviewMode(raw: string): string {
    if (raw !== "on_first_push" && raw !== "on_every_push") {
        throw new UsageError("prReviewOnPush must be on_first_push or on_every_push");
    }
    return raw;
}

function parseWholeNumber(raw: string): number {
    const value = Number.parseInt(raw, 10);
    if (!Number.isInteger(value) || String(value) !== raw) {
        throw new UsageError(`expected a whole number, got ${raw}`);
    }
    return value;
}

/** Accepts either Proval's numeric id or the repository path, which is what a person remembers. */
export async function resolveRepository(
    context: CommandContext,
    reference: string,
): Promise<RepositoryResponse> {
    const list = await context.client.get<RepositoryResponse[]>("/repository");
    const byId = /^\d+$/.test(reference) ? list.find((row) => row.id === Number(reference)) : undefined;
    const match = byId ?? list.find((row) => row.path === reference);
    if (!match) {
        throw new UsageError(`no repository matches ${reference}`);
    }
    return match;
}

export async function runRepoCommand(context: CommandContext): Promise<void> {
    const [verb, reference, field, value] = context.argumentList;

    if (!verb || verb === "list") {
        const filter = flagString(context.flagMap, "match");
        let list = await context.client.get<RepositoryResponse[]>("/repository");
        if (filter) list = list.filter((row) => row.path.includes(filter));
        list.sort((a, b) => a.path.localeCompare(b.path));
        context.write(render(context.mode, list, columnList));
        return;
    }

    if (!reference) {
        throw new UsageError(`proval repo ${verb} needs a repository id or path`);
    }
    const repository = await resolveRepository(context, reference);

    if (verb === "show") {
        context.write(renderOne(context.mode, repository));
        return;
    }

    if (verb === "enable" || verb === "disable") {
        const updated = await context.client.put<RepositoryResponse>(`/repository/${repository.id}`, {
            prReviewEnabled: verb === "enable",
        });
        context.write(
            renderOne(context.mode, {
                id: updated.id,
                path: updated.path,
                prReviewEnabled: updated.prReviewEnabled,
            }),
        );
        return;
    }

    if (verb === "set") {
        if (!field || value === undefined) {
            throw new UsageError("proval repo set <repo> <field> <value>");
        }
        const parse = settableFieldMap[field];
        if (!parse) {
            throw new UsageError(`cannot set ${field}. Settable: ${Object.keys(settableFieldMap).sort().join(", ")}`);
        }
        const updated = await context.client.put<RepositoryResponse>(`/repository/${repository.id}`, {
            [field]: parse(value),
        });
        context.write(
            renderOne(context.mode, {
                id: updated.id,
                path: updated.path,
                [field]: (updated as Record<string, unknown>)[field],
            }),
        );
        return;
    }

    throw new UsageError(`unknown command: repo ${verb}`);
}
