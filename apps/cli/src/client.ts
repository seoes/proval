import type { Credentials } from "./config.js";

export type QueryValue = string | number | boolean | undefined | null;

/** Thrown for anything the user can act on: a bad token, a missing scope, a 404. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Joins a base and a path without doubling or dropping the slash, and drops
 * query parameters that were not set so callers can pass optional filters
 * straight through.
 */
export function buildUrl(
  baseUrl: string,
  path: string,
  query: Record<string, QueryValue> = {},
): string {
  const base = baseUrl.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${base}/api${suffix}`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * Turns a failed response into a message worth reading. The API answers with
 * {"error": "..."} almost everywhere, but not always, so the status carries the
 * meaning when the body does not.
 */
export function describeFailure(status: number, body: unknown): ApiError {
  const fromBody =
    body &&
    typeof body === "object" &&
    typeof (body as { error?: unknown }).error === "string"
      ? (body as { error: string }).error
      : null;
  if (status === 401) {
    return new ApiError(
      status,
      fromBody ?? "Not authenticated",
      "Run 'proval auth login', or check PROVAL_API_TOKEN.",
    );
  }
  if (status === 403) {
    return new ApiError(
      status,
      fromBody ?? "Forbidden",
      "This commonly means the token lacks the scope for this route; token management and admin-only routes also answer 403. The dashboard shows each token's scopes under Settings.",
    );
  }
  if (status === 404) {
    return new ApiError(status, fromBody ?? "Not found");
  }
  return new ApiError(
    status,
    fromBody ?? `Request failed with status ${status}`,
  );
}

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
}

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export class ApiClient {
  constructor(
    private readonly credentials: Credentials,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async request<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = buildUrl(this.credentials.url, path, options.query);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.credentials.token}`,
      Accept: "application/json",
    };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch (cause) {
      // A connection failure is the single most common first run problem,
      // and the raw message ("fetch failed") says nothing useful.
      throw new ApiError(
        0,
        `Cannot reach ${this.credentials.url}`,
        cause instanceof Error ? cause.message : undefined,
      );
    }

    const text = await response.text();
    const parsed: unknown = text.length > 0 ? safeParse(text) : null;
    if (!response.ok) {
      throw describeFailure(response.status, parsed);
    }
    return parsed as T;
  }

  get<T>(path: string, query?: Record<string, QueryValue>) {
    return this.request<T>("GET", path, { query });
  }
  post<T>(path: string, body?: unknown) {
    return this.request<T>("POST", path, { body });
  }
  put<T>(path: string, body: unknown) {
    return this.request<T>("PUT", path, { body });
  }
  delete<T>(path: string) {
    return this.request<T>("DELETE", path);
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 200) };
  }
}
