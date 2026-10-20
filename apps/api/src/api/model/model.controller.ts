import type { Context, Handler } from "hono";
import { ModelProviderService } from "./model.service.js";
import type { ModelProviderResponse, SecretInput } from "@proval/types";
import { getCookie, setCookie } from "hono/cookie";
import { XaiOAuthError, xaiOAuthService } from "./xai-oauth.service.js";
import { ZodError } from "zod";
import { SESSION_COOKIE_NAME } from "../auth/auth.service.js";

function inputError(c: Context, error: unknown) {
    return c.json(
        {
            error:
                error instanceof ZodError
                    ? error.issues[0]?.message
                    : error instanceof Error
                      ? error.message
                      : "Request failed",
        },
        error instanceof XaiOAuthError ? error.status : 400,
    );
}

function oauthOwner(c: Context, create = false): string {
    c.header("Cache-Control", "no-store");
    if (c.req.header("X-Proval-OAuth") !== "1") {
        throw new XaiOAuthError("OAuth requests must originate from the Proval dashboard", 403);
    }
    let browser = getCookie(c, "proval_oauth_browser");
    if (!browser && create) {
        browser = crypto.randomUUID();
        setCookie(c, "proval_oauth_browser", browser, {
            path: "/api/model-provider",
            httpOnly: true,
            sameSite: "Strict",
            secure: process.env.COOKIE_SECURE === "true",
            maxAge: 86400,
        });
    }
    if (!browser) throw new XaiOAuthError("Authorization attempt not found. Start again", 404);
    const session = c.get("user") ? getCookie(c, SESSION_COOKIE_NAME) : "anonymous";
    return JSON.stringify([browser, session]);
}

export const startXaiOAuth: Handler = async (c) => {
    try {
        const owner = oauthOwner(c, true);
        return c.json(await xaiOAuthService.start(owner, await c.req.json()), 201);
    } catch (error) {
        return inputError(c, error);
    }
};

export const getXaiOAuth: Handler = (c) => {
    try {
        return c.json(xaiOAuthService.get(oauthOwner(c), c.req.param("attemptId") ?? ""));
    } catch (error) {
        return inputError(c, error);
    }
};

export const cancelXaiOAuth: Handler = (c) => {
    try {
        return c.json(xaiOAuthService.cancel(oauthOwner(c), c.req.param("attemptId") ?? ""));
    } catch (error) {
        return inputError(c, error);
    }
};

export const verifySavedModelProvider: Handler = async (c) => {
    try {
        const body = await c.req.json();
        await new ModelProviderService().verifySaved(Number(c.req.param("id")), body.modelName);
        return c.json({ success: true, message: "Connection successful" });
    } catch (error) {
        return c.json({ success: false, message: error instanceof Error ? error.message : "Connection failed" }, 400);
    }
};

export const findAllModelProvider: Handler = async (c) => {
    const service = new ModelProviderService();
    const list = await service.findAll();
    const response: ModelProviderResponse[] = list.map((item) => service.toResponse(item));
    return c.json(response, 200);
};

export const findModelProviderById: Handler = async (c) => {
    const service = new ModelProviderService();
    const id = c.req.param("id");
    if (!id) {
        return c.json({ error: "Model provider ID is required" }, 400);
    }
    const modelProvider = await service.findById(parseInt(id));
    return c.json(service.toResponse(modelProvider), 200);
};

export const listModelProviderModels: Handler = async (c) => {
    const service = new ModelProviderService();
    const id = c.req.param("id");
    if (!id) {
        return c.json({ error: "Model provider ID is required" }, 400);
    }
    try {
        const result = await service.listModels(parseInt(id));
        return c.json(result, 200);
    } catch (error) {
        return c.json(
            { error: error instanceof Error ? error.message : "Failed to list models" },
            error instanceof Error && error.message === "Model provider not found" ? 404 : 500,
        );
    }
};

export const createModelProvider: Handler = async (c) => {
    const service = new ModelProviderService();
    const body = await c.req.json();
    try {
        const modelProvider = await service.create(body);
        return c.json(service.toResponse(modelProvider), 201);
    } catch (error) {
        return inputError(c, error);
    }
};

export const updateModelProvider: Handler = async (c) => {
    const service = new ModelProviderService();
    const id = c.req.param("id");
    if (!id) {
        return c.json({ error: "Model provider ID is required" }, 400);
    }
    const body = await c.req.json();
    try {
        const modelProvider = await service.update(parseInt(id), body);
        return c.json(service.toResponse(modelProvider), 200);
    } catch (error) {
        return inputError(c, error);
    }
};

export const removeModelProvider: Handler = async (c) => {
    const service = new ModelProviderService();
    const id = c.req.param("id");
    if (!id) {
        return c.json({ error: "Model provider ID is required" }, 400);
    }
    try {
        await service.remove(parseInt(id));
        return c.json({ message: "Model provider deleted" }, 200);
    } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : "Failed to delete" }, 400);
    }
};

export const updateModelProviderApiKey: Handler = async (c) => {
    const service = new ModelProviderService();
    const id = c.req.param("id");
    if (!id) {
        return c.json({ error: "Model provider ID is required" }, 400);
    }
    const { value: apiKey } = await c.req.json<SecretInput>();
    if (!apiKey) {
        return c.json({ error: "API key is required" }, 400);
    }
    try {
        await service.updateApiKey(parseInt(id), apiKey);
        return c.json({ message: "API key updated" }, 200);
    } catch (error) {
        return inputError(c, error);
    }
};

export const verifyModelProviderConfig: Handler = async (c: Context) => {
    const service = new ModelProviderService();
    const body = await c.req.json();

    const { provider, baseUrl, modelName, apiKey, timeoutSecond = 600 } = body;
    if (!baseUrl) {
        return c.json({ error: "Base URL is required for verification" }, 400);
    }
    if (!apiKey) {
        return c.json({ error: "API key is required for verification" }, 400);
    }
    if (!modelName) {
        return c.json({ error: "Model name is required for verification" }, 400);
    }
    if (provider !== "anthropic" && provider !== "openai" && provider !== "openai_responses") {
        return c.json({ error: "Invalid provider" }, 400);
    }

    try {
        await service.verifyConfig({ provider, baseUrl, modelName, apiKey, timeoutSecond });
        return c.json({ success: true, message: "Connection successful" }, 200);
    } catch (error) {
        if (error instanceof ZodError) return inputError(c, error);
        const message = error instanceof Error ? error.message : "Connection failed";
        return c.json({ success: false, message }, 401);
    }
};
