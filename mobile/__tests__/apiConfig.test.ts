function loadApiConfig({
  apiUrl,
}: {
  apiUrl?: string;
}) {
  jest.resetModules();
  if (apiUrl === undefined) {
    delete process.env.EXPO_PUBLIC_API_URL;
  } else {
    process.env.EXPO_PUBLIC_API_URL = apiUrl;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("../src/config/api") as typeof import("../src/config/api");
}

afterEach(() => {
  delete process.env.EXPO_PUBLIC_API_URL;
});

describe("API_CONFIG URL resolution", () => {
  test("uses EXPO_PUBLIC_API_URL in every environment", () => {
    const { API_CONFIG } = loadApiConfig({
      apiUrl: "http://192.168.1.110:8000",
    });

    expect(API_CONFIG.BASE_URL).toBe("http://192.168.1.110:8000");
    expect(API_CONFIG.CONFIGURATION_ERROR).toBeNull();
  });

  test("requires EXPO_PUBLIC_API_URL when it is missing", () => {
    const { API_CONFIG } = loadApiConfig({});

    expect(API_CONFIG.BASE_URL).toBe("");
    expect(API_CONFIG.CONFIGURATION_ERROR).toBe("EXPO_PUBLIC_API_URL is not configured.");
  });

  test("exposes the real-time awareness endpoint", () => {
    const { API_ENDPOINTS } = loadApiConfig({
      apiUrl: "http://127.0.0.1:8000",
    });

    expect(API_ENDPOINTS.awareness.current).toBe("/api/v1/awareness/current");
  });
});
