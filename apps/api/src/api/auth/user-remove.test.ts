import { beforeEach, describe, expect, it, mock } from "bun:test";

let selectResultQueue: unknown[][] = [];

function createWhereChain(result: unknown[]) {
    return {
        limit: mock(() => Promise.resolve(result)),
        then(resolve: (value: unknown) => void) {
            resolve(result);
        },
    };
}

const selectMock = mock(() => ({
    from: mock(() => ({
        where: mock(() => createWhereChain(selectResultQueue.shift() ?? [])),
        orderBy: mock(() => Promise.resolve(selectResultQueue.shift() ?? [])),
    })),
}));

const deleteWhereMock = mock(() => Promise.resolve());
const deleteMock = mock(() => ({
    where: deleteWhereMock,
}));

mock.module("../../db/index.js", () => ({
    default: {
        select: selectMock,
        delete: deleteMock,
    },
}));

const { authService } = await import("./auth.service.js");

const actorId = "actor-id";
const targetId = "target-id";

function makeUserRow(overrides: { id?: string; role?: "admin" | "user" } = {}) {
    return {
        id: overrides.id ?? targetId,
        email: "user@example.com",
        passwordHash: "hash",
        role: overrides.role ?? "user",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
}

describe("AuthService.removeUser", () => {
    beforeEach(() => {
        selectResultQueue = [];
        selectMock.mockClear();
        deleteMock.mockClear();
        deleteWhereMock.mockClear();
    });

    it("rejects deleting the signed-in user", async () => {
        await expect(authService.removeUser(actorId, actorId)).rejects.toThrow("Cannot delete the signed-in user");
        expect(deleteMock).not.toHaveBeenCalled();
    });

    it("rejects deleting the last admin", async () => {
        selectResultQueue.push([makeUserRow({ role: "admin" })]);
        selectResultQueue.push([{ value: 1 }]);
        await expect(authService.removeUser(targetId, actorId)).rejects.toThrow("Cannot delete the last admin");
        expect(deleteMock).not.toHaveBeenCalled();
    });

    it("rejects when target user is not found", async () => {
        selectResultQueue.push([]);
        await expect(authService.removeUser(targetId, actorId)).rejects.toThrow("User not found");
        expect(deleteMock).not.toHaveBeenCalled();
    });

    it("deletes a regular user", async () => {
        selectResultQueue.push([makeUserRow({ role: "user" })]);
        await authService.removeUser(targetId, actorId);
        expect(deleteMock).toHaveBeenCalled();
        expect(deleteWhereMock).toHaveBeenCalled();
    });

    it("deletes another admin when more than one admin exists", async () => {
        selectResultQueue.push([makeUserRow({ role: "admin" })]);
        selectResultQueue.push([{ value: 2 }]);
        await authService.removeUser(targetId, actorId);
        expect(deleteMock).toHaveBeenCalled();
        expect(deleteWhereMock).toHaveBeenCalled();
    });
});
