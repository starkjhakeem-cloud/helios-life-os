type ErrorMeta = Record<string, unknown>;

const isDevelopment = typeof __DEV__ !== "undefined" && __DEV__;
const ERROR_CONTEXT_PREFIXES = ["Uncaught"];

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
}

export function reportError(error: unknown, context?: string, meta?: ErrorMeta): void {
  const message = formatErrorMessage(error);
  const shouldUseErrorLog =
    !context || ERROR_CONTEXT_PREFIXES.some((prefix) => context.startsWith(prefix));
  const payload = {
    context: context ?? "Uncaught error",
    message,
    ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
  };

  if (isDevelopment && shouldUseErrorLog) {
    console.error("[Helios Error]", payload, error);
  } else if (isDevelopment) {
    console.log("[Helios Error]", payload);
  } else {
    console.warn("[Helios Error]", payload);
  }
}
