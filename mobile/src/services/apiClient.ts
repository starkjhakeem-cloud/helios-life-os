import { API_CONFIG } from "../config/api";
import { reportError } from "./errorReporter";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseApiError(response: Response): Promise<ApiError> {
  try {
    const data = await response.json() as { detail?: unknown };
    let message: string;
    if (typeof data.detail === "string") {
      message = data.detail;
    } else if (Array.isArray(data.detail) && data.detail.length > 0) {
      const first = data.detail[0] as { msg?: string };
      message = first.msg ?? `HTTP ${response.status}`;
    } else {
      message = `HTTP ${response.status}`;
    }
    return new ApiError(message, response.status);
  } catch (err) {
    reportError(err, "Failed to parse API error response", {
      status: response.status,
      endpoint: response.url,
    });
    return new ApiError(`HTTP ${response.status}`, response.status);
  }
}

function networkError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const name = (err as { name?: string }).name;
  const result =
    name === "AbortError"
      ? new ApiError("Request timed out. Check your connection.", 0)
      : new ApiError("Network error. Check your connection.", 0);

  reportError(result, "Network request failed", {
    originalErrorName: name,
  });
  return result;
}

function buildHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function get<T>(endpoint: string, token?: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT_MS);

  try {
    const response = await fetch(`${API_CONFIG.BASE_URL}${endpoint}`, {
      method: "GET",
      headers: buildHeaders(token),
      signal: controller.signal,
    });
    if (!response.ok) throw await parseApiError(response);
    return response.json() as Promise<T>;
  } catch (err) {
    throw networkError(err);
  } finally {
    clearTimeout(timer);
  }
}

async function post<T>(endpoint: string, body: unknown, token?: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT_MS);

  try {
    const response = await fetch(`${API_CONFIG.BASE_URL}${endpoint}`, {
      method: "POST",
      headers: buildHeaders(token),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw await parseApiError(response);
    return response.json() as Promise<T>;
  } catch (err) {
    throw networkError(err);
  } finally {
    clearTimeout(timer);
  }
}

async function patch<T>(endpoint: string, body: unknown, token?: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT_MS);

  try {
    const response = await fetch(`${API_CONFIG.BASE_URL}${endpoint}`, {
      method: "PATCH",
      headers: buildHeaders(token),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw await parseApiError(response);
    return response.json() as Promise<T>;
  } catch (err) {
    throw networkError(err);
  } finally {
    clearTimeout(timer);
  }
}

async function del(endpoint: string, token?: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT_MS);

  try {
    const response = await fetch(`${API_CONFIG.BASE_URL}${endpoint}`, {
      method: "DELETE",
      headers: buildHeaders(token),
      signal: controller.signal,
    });
    if (!response.ok) throw await parseApiError(response);
  } catch (err) {
    throw networkError(err);
  } finally {
    clearTimeout(timer);
  }
}

export const apiClient = { get, post, patch, del };
