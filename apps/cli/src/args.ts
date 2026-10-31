import type { OutputMode } from "./output.js";

export interface ParsedCommandLine {
    /** e.g. ["repo", "list"], already stripped of flags. */
    pathList: string[];
    flagMap: Record<string, string | boolean>;
    mode: OutputMode;
    help: boolean;
}

/**
 * A deliberately small parser. The commands here take a fixed shape, a noun, a
 * verb and a few flags, so a dependency would buy very little and every added
 * dependency is one more thing a maintainer has to accept.
 *
 * "--" ends flag parsing, so a value that looks like a flag can still be passed.
 */
export function parseCommandLine(argvList: string[]): ParsedCommandLine {
    const pathList: string[] = [];
    const flagMap: Record<string, string | boolean> = {};
    let literal = false;

    for (let index = 0; index < argvList.length; index++) {
        const argument = argvList[index]!;
        if (literal) {
            pathList.push(argument);
            continue;
        }
        if (argument === "--") {
            literal = true;
            continue;
        }
        if (argument.startsWith("--")) {
            const body = argument.slice(2);
            const equals = body.indexOf("=");
            if (equals >= 0) {
                flagMap[body.slice(0, equals)] = body.slice(equals + 1);
                continue;
            }
            const next = argvList[index + 1];
            // A flag followed by something that is not another flag takes it as
            // a value. Otherwise it is a boolean switch.
            if (next !== undefined && !next.startsWith("-")) {
                flagMap[body] = next;
                index++;
            } else {
                flagMap[body] = true;
            }
            continue;
        }
        if (argument.startsWith("-") && argument.length > 1) {
            flagMap[argument.slice(1)] = true;
            continue;
        }
        pathList.push(argument);
    }

    const mode: OutputMode = flagMap.agent ? "agent" : flagMap.json ? "json" : "table";
    const help = Boolean(flagMap.help || flagMap.h || pathList[0] === "help");
    return { pathList, flagMap, mode, help };
}

export function flagString(flagMap: Record<string, string | boolean>, name: string): string | undefined {
    const value = flagMap[name];
    return typeof value === "string" ? value : undefined;
}

export function flagBoolean(flagMap: Record<string, string | boolean>, name: string): boolean {
    return flagMap[name] === true || flagMap[name] === "true";
}
