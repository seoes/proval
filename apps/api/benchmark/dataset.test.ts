import { describe, expect, test } from "bun:test";
import { validateManifest, MANIFEST_SCHEMA_VERSION, type Manifest, type ManifestCase } from "./dataset.js";

function entry(partial: Partial<ManifestCase> = {}): ManifestCase {
    return {
        caseId: "proj__1",
        project: "proj",
        sourceUrl: "https://github.com/owner/repo/pull/1",
        repoUrl: "https://github.com/owner/repo.git",
        prNumber: 1,
        title: "t",
        body: "",
        baseSha: "a".repeat(40),
        startSha: "b".repeat(40),
        headSha: "c".repeat(40),
        addedLineCount: 1,
        deletedLineCount: 1,
        changedFileCount: 1,
        binaryFileCount: 0,
        diffHash: "d".repeat(64),
        ...partial,
    };
}

function manifest(caseList: ManifestCase[]): Manifest {
    return {
        schemaVersion: MANIFEST_SCHEMA_VERSION,
        datasetCommit: "e".repeat(40),
        importedAt: new Date().toISOString(),
        caseList,
        unavailableList: [],
    };
}

describe("validateManifest", () => {
    test("accepts a valid manifest", () => {
        expect(() => validateManifest(manifest([entry()]))).not.toThrow();
    });

    test("rejects duplicate entries", () => {
        expect(() => validateManifest(manifest([entry(), entry()]))).toThrow("duplicate caseId");
        expect(() =>
            validateManifest(
                manifest([entry({ caseId: "proj__2", prNumber: 2 }), entry({ caseId: "proj__2", prNumber: 2 })]),
            ),
        ).toThrow("duplicate caseId");
    });

    test("rejects missing commit identifiers", () => {
        expect(() => validateManifest(manifest([entry({ headSha: "" })]))).toThrow("headSha");
        expect(() => validateManifest(manifest([entry({ startSha: "not-a-sha" })]))).toThrow("startSha");
        expect(() => validateManifest(manifest([entry({ diffHash: "" })]))).toThrow("diffHash");
    });

    test("rejects an unsupported schema version", () => {
        const bad = { ...manifest([entry()]), schemaVersion: 999 };
        expect(() => validateManifest(bad)).toThrow("schemaVersion");
    });
});
