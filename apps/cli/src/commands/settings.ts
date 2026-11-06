import { renderOne } from "../output.js";
import { type CommandContext, UsageError } from "./shared.js";

interface SettingsResponse {
    isAuthEnabled: boolean;
    isRegistrationEnabled: boolean;
    isMaintenanceMode: boolean;
}

const settableFieldList = ["isAuthEnabled", "isRegistrationEnabled", "isMaintenanceMode"] as const;

export async function runSettingsCommand(context: CommandContext): Promise<void> {
    const [verb, field, value] = context.argumentList;

    if (!verb || verb === "get") {
        context.write(renderOne(context.mode, await context.client.get<SettingsResponse>("/settings")));
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
        const updated = await context.client.put<SettingsResponse>("/settings", { [field]: value === "true" });
        context.write(renderOne(context.mode, updated));
        return;
    }

    throw new UsageError(`unknown command: settings ${verb}`);
}
