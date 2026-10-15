import { describe, expect, it, mock } from "bun:test";
import { USER_PROMPT_MAX_LENGTH } from "@proval/types";

let selectResultQueue: unknown[][] = [];

function createFromChain(result: unknown[]) {
    return {
        where: mock(() => ({
            limit: mock(() => Promise.resolve(result)),
        })),
        then(resolve: (value: unknown) => void) {
            resolve(result);
        },
    };
}

const insertMock = mock(() => ({
    values: mock(() => ({
        onConflictDoNothing: mock(() => ({
            returning: mock(() => Promise.resolve([])),
        })),
    })),
}));

const selectMock = mock(() => ({
    from: mock(() => createFromChain(selectResultQueue.shift() ?? [])),
}));

mock.module("../../db/index.js", () => ({
    default: {
        insert: insertMock,
        select: selectMock,
    },
}));

const { AuthService } = await import("./auth.service.js");
const authService = new AuthService();

const instanceSetting = {
    id: 1,
    authEnabled: false,
    registrationEnabled: false,
};

function restoreUserPromptMaxLengthEnv(previous: string | undefined) {
    if (previous === undefined) {
        delete process.env.PROVAL_USER_PROMPT_MAX_LENGTH;
    } else {
        process.env.PROVAL_USER_PROMPT_MAX_LENGTH = previous;
    }
}

describe("Get current user", () => {
    it("announces the default userPromptMaxLength", async () => {
        const previousMaxLength = process.env.PROVAL_USER_PROMPT_MAX_LENGTH;
        delete process.env.PROVAL_USER_PROMPT_MAX_LENGTH;
        try {
            selectResultQueue = [[instanceSetting], [{ value: 0 }]];
            const me = await authService.getMe(null);
            expect(me.userPromptMaxLength).toBe(USER_PROMPT_MAX_LENGTH);
        } finally {
            restoreUserPromptMaxLengthEnv(previousMaxLength);
        }
    });

    it("announces the userPromptMaxLength from PROVAL_USER_PROMPT_MAX_LENGTH", async () => {
        const previousMaxLength = process.env.PROVAL_USER_PROMPT_MAX_LENGTH;
        process.env.PROVAL_USER_PROMPT_MAX_LENGTH = "9000";
        try {
            selectResultQueue = [[instanceSetting], [{ value: 0 }]];
            const me = await authService.getMe(null);
            expect(me.userPromptMaxLength).toBe(9000);
        } finally {
            restoreUserPromptMaxLengthEnv(previousMaxLength);
        }
    });

    it("announces the default userPromptMaxLength when the env value is invalid", async () => {
        const previousMaxLength = process.env.PROVAL_USER_PROMPT_MAX_LENGTH;
        process.env.PROVAL_USER_PROMPT_MAX_LENGTH = "abc";
        try {
            selectResultQueue = [[instanceSetting], [{ value: 0 }]];
            const me = await authService.getMe(null);
            expect(me.userPromptMaxLength).toBe(USER_PROMPT_MAX_LENGTH);
        } finally {
            restoreUserPromptMaxLengthEnv(previousMaxLength);
        }
    });
});
