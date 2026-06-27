import { apiClient } from "../src/services/apiClient";
import * as errorReporter from "../src/services/errorReporter";

afterEach(() => {
  jest.resetAllMocks();
});

describe("apiClient error handling", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    jest.spyOn(errorReporter, "reportError").mockImplementation(() => undefined);
  });

  test("returns a generic ApiError when the error body cannot be parsed", async () => {
    const mockedFetch = global.fetch as jest.Mock;
    mockedFetch.mockResolvedValue({
      ok: false,
      status: 500,
      url: "http://localhost/api/test",
      json: jest.fn().mockRejectedValue(new Error("invalid json")),
    });

    await expect(apiClient.get("/test")).rejects.toMatchObject({
      message: "HTTP 500",
      status: 500,
    });

    expect(errorReporter.reportError).toHaveBeenCalledWith(
      expect.any(Error),
      "Failed to parse API error response",
      expect.objectContaining({ status: 500, endpoint: "http://localhost/api/test" }),
    );
  });

  test("reports timeout errors when fetch rejects with AbortError", async () => {
    const mockedFetch = global.fetch as jest.Mock;
    mockedFetch.mockRejectedValue({ name: "AbortError" });

    await expect(apiClient.get("/test")).rejects.toMatchObject({
      message: expect.stringContaining("Backend unavailable.\nCurrent API:"),
      status: 0,
    });

    expect(errorReporter.reportError).toHaveBeenCalledWith(
      expect.any(Error),
      "Network request failed",
      expect.objectContaining({
        currentApi: expect.any(String),
        originalErrorName: "AbortError",
      }),
    );
  });
});
