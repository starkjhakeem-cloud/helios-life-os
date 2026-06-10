type ErrorMeta = Record<string, unknown>;

const isDevelopment = typeof __DEV__ !== "undefined" && __DEV__;

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
  const payload = {
    context: context ?? "Uncaught error",
    message,
    ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
  };

  if (isDevelopment) {
    console.error("[Helios Error]", payload, error);
  } else {
    console.warn("[Helios Error]", payload);
  }
}
