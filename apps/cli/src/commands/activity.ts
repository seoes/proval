import { formatValue, render, renderOne, type Column } from "../output.js";
import { flagBoolean, flagString, type CommandContext, UsageError } from "./shared.js";

interface ActivityRow {
    id: number;
    repositoryPath: string;
    type: string;
    status: string;
    targetIid: number;
    inputToken: number | null;
    outputToken: number | null;
    createdAt: string | number;
    completedAt: string | number | null;
}

interface Pagination<T> {
    itemList: T[];
    page: number;
    limit: number;
    total: number;
}

const columnList: Column<ActivityRow>[] = [
    { header: "id", value: (r) => String(r.id), numeric: true },
    { header: "repository", value: (r) => r.repositoryPath },
    { header: "target", value: (r) => String(r.targetIid), numeric: true },
    { header: "type", value: (r) => r.type },
    { header: "status", value: (r) => r.status },
    { header: "input", value: (r) => formatTokenCount(r.inputToken), numeric: true },
];

function formatTokenCount(value: number | null): string {
    if (value === null || value === undefined) return "";
    if (value < 1000) return String(value);
    return `${(value / 1000).toFixed(1)}k`;
}

export async function runActivityCommand(context: CommandContext): Promise<void> {
    const [verb, reference] = context.argumentList;

    if (!verb || verb === "list") {
        // The list endpoint answers Pagination<T>, whose items are under
        // itemList rather than data. Reading "data" returns nothing and looks
        // exactly like an empty result, which is a confusing way to be wrong.
        const page = await context.client.get<Pagination<ActivityRow>>("/activity", {
            status: flagString(context.flagMap, "status"),
            limit: flagString(context.flagMap, "limit") ?? 20,
        });
        context.write(render(context.mode, page.itemList, columnList));
        return;
    }

    if (!reference) {
        throw new UsageError(`proval activity ${verb} needs an activity id`);
    }
    const id = Number.parseInt(reference, 10);
    if (!Number.isInteger(id)) {
        throw new UsageError(`expected an activity id, got ${reference}`);
    }

    if (verb === "show") {
        context.write(renderOne(context.mode, await context.client.get<ActivityRow>(`/activity/${id}`)));
        return;
    }

    if (verb === "log") {
        const log = await context.client.get<unknown>(`/activity/${id}/log`);
        context.write(JSON.stringify(log, null, context.mode === "agent" ? 0 : 2));
        return;
    }

    if (verb === "cancel") {
        const activity = await context.client.get<ActivityRow>(`/activity/${id}`);
        // Cancelling throws away tokens that have already been paid for, and
        // the amount is rarely small, so say it and require the confirmation.
        if (activity.status === "started" && !flagBoolean(context.flagMap, "yes")) {
            throw new UsageError(
                `activity ${id} is still running and has spent ${formatValue(activity.inputToken)} input token. ` +
                    "Cancelling discards that work. Pass --yes to confirm.",
            );
        }
        await context.client.post(`/activity/${id}/cancel`);
        context.write(renderOne(context.mode, { id, status: "canceled" }));
        return;
    }

    if (verb === "retry") {
        await context.client.post(`/activity/${id}/retry`);
        context.write(renderOne(context.mode, { id, status: "retried" }));
        return;
    }

    throw new UsageError(`unknown command: activity ${verb}`);
}
