import { describe, expect, test } from "bun:test";
import { configDirectory, maskToken, resolveCredentials } from "./config.js";

describe("resolveCredentials", () => {
    test("prefers the environment, so a container needs no config file", () => {
        const result = resolveCredentials(
            { PROVAL_API_URL: "https://proval.example", PROVAL_API_TOKEN: "env-token" },
            { url: "https://stored.example", token: "stored-token" },
        );
        expect(result.source).toBe("environment");
        expect(result.credentials).toEqual({ url: "https://proval.example", token: "env-token" });
    });

    test("ignores a half set environment rather than mixing the two sources", () => {
        // A URL from the environment with a token from the file would point a
        // write at one instance using another instance's credential.
        const onlyUrl = resolveCredentials(
            { PROVAL_API_URL: "https://proval.example" },
            { url: "https://stored.example", token: "stored-token" },
        );
        expect(onlyUrl.source).toBe("file");
        expect(onlyUrl.credentials?.url).toBe("https://stored.example");

        const onlyToken = resolveCredentials(
            { PROVAL_API_TOKEN: "env-token" },
            { url: "https://stored.example", token: "stored-token" },
        );
        expect(onlyToken.source).toBe("file");
        expect(onlyToken.credentials?.token).toBe("stored-token");
    });

    test("falls back to the file when the environment is empty", () => {
        const result = resolveCredentials({}, { url: "https://stored.example/", token: "stored-token" });
        expect(result.source).toBe("file");
        expect(result.credentials?.url).toBe("https://stored.example");
    });

    test("reports none when neither source is complete", () => {
        expect(resolveCredentials({}, null).source).toBe("none");
        expect(resolveCredentials({}, { url: "https://x.example" }).credentials).toBeNull();
        expect(resolveCredentials({ PROVAL_API_URL: "  " }, null).credentials).toBeNull();
    });

    test("strips trailing slashes so url joining cannot double them", () => {
        const result = resolveCredentials({ PROVAL_API_URL: "https://x.example///", PROVAL_API_TOKEN: "t" }, null);
        expect(result.credentials?.url).toBe("https://x.example");
    });
});

describe("configDirectory", () => {
    test("honours XDG_CONFIG_HOME when it is set", () => {
        expect(configDirectory({ XDG_CONFIG_HOME: "/tmp/xdg" })).toBe("/tmp/xdg/proval");
    });

    test("falls back to a dotfile under the home directory", () => {
        expect(configDirectory({})).toContain(".config/proval");
    });
});

describe("maskToken", () => {
    test("shows enough to recognise a token and never enough to use it", () => {
        const masked = maskToken("pvl_abcdefghijklmnop");
        expect(masked).toContain("pvl_ab");
        expect(masked).toContain("mnop");
        expect(masked).not.toContain("efghij");
    });

    test("hides a short token completely rather than mostly revealing it", () => {
        expect(maskToken("abcd")).toBe("****");
    });
});
