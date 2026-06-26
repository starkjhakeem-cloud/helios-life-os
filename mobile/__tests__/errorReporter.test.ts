describe("errorReporter", () => {
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
    (global as any).__DEV__ = false;
  });

  test("logs handled network failures without triggering LogBox in development", () => {
    (global as any).__DEV__ = true;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { reportError } = require("../src/services/errorReporter") as typeof import("../src/services/errorReporter");

    reportError(new Error("Request timed out. Check your connection."), "Network request failed", {
      originalErrorName: "AbortError",
    });

    expect(logSpy).toHaveBeenCalledWith(
      "[Helios Error]",
      expect.objectContaining({
        context: "Network request failed",
        message: "Request timed out. Check your connection.",
      }),
    );
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("keeps uncaught UI failures on console.error", () => {
    (global as any).__DEV__ = true;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { reportError } = require("../src/services/errorReporter") as typeof import("../src/services/errorReporter");
    const error = new Error("boom");

    reportError(error, "Uncaught UI error", { componentStack: "in Screen" });

    expect(errorSpy).toHaveBeenCalledWith(
      "[Helios Error]",
      expect.objectContaining({
        context: "Uncaught UI error",
        message: "boom",
      }),
      error,
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
