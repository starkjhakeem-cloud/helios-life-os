/**
 * apiClient — authenticated HTTP client with transparent token refresh.
 *
 * On a 401 response the client:
 *   1. Calls the registered tokenProvider (which calls POST /auth/refresh).
 *   2. If refresh succeeds, retries the original request once with the new token.
 *   3. If refresh fails (or no provider is registered), throws SessionExpiredError.
 *
 * Concurrent refresh serialisation: if multiple in-flight requests all receive a
 * 401 simultaneously, only ONE refresh call is made.  All waiting requests then
 * retry with the single new token that comes back.
 *
 * postRaw() bypasses the retry logic and is used exclusively for the refresh
 * endpoint itself (you never want to refresh while refreshing).
 */

import { API_CONFIG } from "../config/api";
import { reportError } from "./errorReporter";

// ── Error types ───────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Thrown when the refresh token is expired or missing and the user must log in. */
export class SessionExpiredError extends ApiError {
  constructor() {
    super("Your session has expired. Please sign in again.", 401);
    this.name = "SessionExpiredError";
  }
}

// ── Token provider ────────────────────────────────────────────────────────────

/**
 * Registered by useAuthStore after hydration.
 * Returns the new access token on success, or null when refresh fails
 * (the provider is responsible for clearing auth state on failure).
 */
let _tokenProvider: (() => Promise<string | null>) | null = null;

/** Single in-flight refresh promise — shared across all concurrent 401 retries. */
let _refreshPromise: Promise<string | null> | null = null;

export function setTokenProvider(fn: () => Promise<string | null>): void {
  _tokenProvider = fn;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function parseApiError(response: Response): Promise<ApiError> {
  try {
    const data = (await response.json()) as { detail?: unknown };
    let message: string;
    if (typeof data.detail === "string") {
      message = data.detail;
    } else if (Array.isArray(data.detail) && data.detail.length > 0) {
      const first = data.detail[0] as { msg?: string };
      message = first.msg ?? `HTTP ${response.status}`;
    } else if (
      data.detail !== null &&
      typeof data.detail === "object" &&
      "message" in (data.detail as object)
    ) {
      // Backend integration errors: { error, code, message, provider, service_type }
      message = (data.detail as { message: string }).message;
    } else {
      message = `HTTP ${response.status}`;
    }
    return new ApiError(message, response.status);
  } catch {
    const result = new ApiError(`HTTP ${response.status}`, response.status);
    reportError(result, "Failed to parse API error response", {
      status: response.status,
      endpoint: response.url,
    });
    return result;
  }
}

function wrapNetworkError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const name = (err as { name?: string }).name;
  const result =
    name === "AbortError"
      ? new ApiError("Request timed out. Check your connection.", 0)
      : new ApiError("Network unavailable. Check your connection.", 0);
  reportError(result, "Network request failed", { originalErrorName: name });
  return result;
}

function buildHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function makeFetch(
  method: string,
  endpoint: string,
  token: string | undefined,
  body?: unknown,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT_MS);
  try {
    return await fetch(`${API_CONFIG.BASE_URL}${endpoint}`, {
      method,
      headers: buildHeaders(token),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Attempt a token refresh — serialised so concurrent callers share one call.
 * Returns the new access token, or null on failure.
 */
async function attemptRefresh(): Promise<string | null> {
  if (!_tokenProvider) return null;
  if (!_refreshPromise) {
    _refreshPromise = _tokenProvider().finally(() => {
      _refreshPromise = null;
    });
  }
  return _refreshPromise;
}

// ── Core request executor (with 401 retry) ────────────────────────────────────

async function executeRequest<T>(
  method: string,
  endpoint: string,
  token: string | undefined,
  body?: unknown,
): Promise<T> {
  let response = await makeFetch(method, endpoint, token, body);

  // Only intercept 401 when the request was authenticated (token was sent).
  // An unauthenticated 401 means wrong credentials on a public endpoint (e.g.
  // /auth/login, /auth/signup) — NOT an expired session. Calling refreshSession()
  // here would immediately set sessionExpired: true and show the "Session Expired"
  // dialog even while the user is actively trying to log in.
  if (response.status === 401 && token !== undefined) {
    const newToken = await attemptRefresh();
    if (!newToken) {
      throw new SessionExpiredError();
    }
    // Retry once with the refreshed token.
    response = await makeFetch(method, endpoint, newToken, body);
  }

  if (!response.ok) {
    throw await parseApiError(response);
  }

  // 204 No Content — return undefined cast to T (callers of del() expect void)
  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return undefined as unknown as T;
  }

  return response.json() as Promise<T>;
}

// ── Public API ────────────────────────────────────────────────────────────────

async function get<T>(endpoint: string, token?: string): Promise<T> {
  try {
    return await executeRequest<T>("GET", endpoint, token);
  } catch (err) {
    throw wrapNetworkError(err);
  }
}

async function post<T>(endpoint: string, body: unknown, token?: string): Promise<T> {
  try {
    return await executeRequest<T>("POST", endpoint, token, body);
  } catch (err) {
    throw wrapNetworkError(err);
  }
}

async function patch<T>(endpoint: string, body: unknown, token?: string): Promise<T> {
  try {
    return await executeRequest<T>("PATCH", endpoint, token, body);
  } catch (err) {
    throw wrapNetworkError(err);
  }
}

async function put<T>(endpoint: string, body: unknown, token?: string): Promise<T> {
  try {
    return await executeRequest<T>("PUT", endpoint, token, body);
  } catch (err) {
    throw wrapNetworkError(err);
  }
}

async function del(endpoint: string, token?: string): Promise<void> {
  try {
    await executeRequest<void>("DELETE", endpoint, token);
  } catch (err) {
    throw wrapNetworkError(err);
  }
}

/**
 * postRaw — sends a POST without the 401 retry interceptor.
 * Used only for the /auth/refresh endpoint itself to avoid recursive refresh loops.
 */
async function postRaw<T>(endpoint: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT_MS);
  try {
    const response = await fetch(`${API_CONFIG.BASE_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw await parseApiError(response);
    return response.json() as Promise<T>;
  } catch (err) {
    throw wrapNetworkError(err);
  } finally {
    clearTimeout(timer);
  }
}

export const apiClient = { get, post, patch, put, del, postRaw };
