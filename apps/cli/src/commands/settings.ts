import type { InstanceSettingResponse, InstanceSettingUpdateInput } from "@proval/types";
import { renderOne } from "../output.js";
import { type CommandContext, UsageError } from "./shared.js";

const settableFieldList = [
    "isAuthEnabled",
    "isRegistrationEnabled",
    "isRerunInterruptedActivity",
    "isWaitForRunningActivityOnShutdown",
] as const;

export async function runSettingsCommand(context: CommandContext): Promise<void> {
    const [verb, field, value] = context.argumentList;

    if (!verb || verb === "get") {
        context.write(renderOne(context.mode, await context.client.get<InstanceSettingResponse>("/settings")));
        return;
    }

    if (verb === "set") {
        if (!field || value === undefined) {
            throw new UsageError(`proval settings set <${settableFieldList.join("|")}> <true|false>`);
        }
        if (!settableFieldList.includes(field as (typeof settableFieldList)[number])) {
            throw new UsageError(`cannot set ${field}. Settable: ${settableFieldList.join(", ")}`);
        }
        if (value !== "true" && value !== "false") {
            throw new UsageError(`expected true or false, got ${value}`);
        }
        const current = await context.client.get<InstanceSettingResponse>("/settings");
        const next: InstanceSettingUpdateInput = {
            isAuthEnabled: current.isAuthEnabled,
            isRegistrationEnabled: current.isRegistrationEnabled,
            isRerunInterruptedActivity: current.isRerunInterruptedActivity,
            isWaitForRunningActivityOnShutdown: current.isWaitForRunningActivityOnShutdown,
        };
        next[field as (typeof settableFieldList)[number]] = value === "true";
        const updated = await context.client.put<InstanceSettingResponse>("/settings", next);
        context.write(renderOne(context.mode, updated));
        return;
    }

    throw new UsageError(`unknown command: settings ${verb}`);
}
