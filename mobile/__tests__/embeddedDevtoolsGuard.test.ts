import path from "path";

const metroConfigPath = path.join(__dirname, "..", "metro.config.js");

function loadMetroConfig(enableEmbeddedDevtools = false) {
  const previousExpoFlag = process.env.EXPO_PUBLIC_ENABLE_EMBEDDED_DEVTOOLS;
  const previousHeliosFlag = process.env.HELIOS_ENABLE_EMBEDDED_DEVTOOLS;

  process.env.EXPO_PUBLIC_ENABLE_EMBEDDED_DEVTOOLS = enableEmbeddedDevtools ? "true" : "";
  process.env.HELIOS_ENABLE_EMBEDDED_DEVTOOLS = "";
  jest.resetModules();
  delete require.cache[require.resolve(metroConfigPath)];

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const config = require(metroConfigPath);

  if (previousExpoFlag === undefined) {
    delete process.env.EXPO_PUBLIC_ENABLE_EMBEDDED_DEVTOOLS;
  } else {
    process.env.EXPO_PUBLIC_ENABLE_EMBEDDED_DEVTOOLS = previousExpoFlag;
  }

  if (previousHeliosFlag === undefined) {
    delete process.env.HELIOS_ENABLE_EMBEDDED_DEVTOOLS;
  } else {
    process.env.HELIOS_ENABLE_EMBEDDED_DEVTOOLS = previousHeliosFlag;
  }

  return config;
}

function resolveFrom(originModulePath: string, moduleName: string, platform: string) {
  const config = loadMetroConfig();
  return config.resolver.resolveRequest(
    {
      originModulePath,
      resolveRequest: jest.fn(() => ({
        type: "sourceFile",
        filePath: "/resolved/original.js",
      })),
    },
    moduleName,
    platform,
  );
}

describe("embedded native devtools guard", () => {
  test("redirects Expo async message sockets away from embedded native bundles", () => {
    const projectRoot = path.join(__dirname, "..");
    const noOpModule = path.join(projectRoot, "src/devtools/embeddedDevtoolsNoop.js");

    expect(
      resolveFrom(
        path.join(projectRoot, "node_modules/expo/src/Expo.fx.tsx"),
        "./async-require/messageSocket",
        "ios",
      ),
    ).toEqual({
      type: "sourceFile",
      filePath: noOpModule,
    });

    expect(
      resolveFrom(
        path.join(projectRoot, "node_modules/expo/src/async-require/setup.ts"),
        "./messageSocket",
        "ios",
      ),
    ).toEqual({
      type: "sourceFile",
      filePath: noOpModule,
    });
  });

  test("redirects RN React DevTools startup away from embedded native bundles", () => {
    const projectRoot = path.join(__dirname, "..");
    const noOpModule = path.join(projectRoot, "src/devtools/embeddedDevtoolsNoop.js");

    expect(
      resolveFrom(
        path.join(
          projectRoot,
          "node_modules/react-native/src/private/setup/setUpDefaultReactNativeEnvironment.js",
        ),
        "../../../Libraries/Core/setUpReactDevTools",
        "ios",
      ),
    ).toEqual({
      type: "sourceFile",
      filePath: noOpModule,
    });
  });

  test("redirects LogBox dev-server endpoints away from embedded native bundles", () => {
    const projectRoot = path.join(__dirname, "..");
    const fallbackModule = path.join(projectRoot, "src/devtools/embeddedLogBoxDevServerEndpoints.js");

    expect(
      resolveFrom(
        path.join(projectRoot, "node_modules/@expo/log-box/src/ContextDevServer.tsx"),
        "./utils/devServerEndpoints",
        "ios",
      ),
    ).toEqual({
      type: "sourceFile",
      filePath: fallbackModule,
    });

    expect(
      resolveFrom(
        path.join(projectRoot, "node_modules/@expo/log-box/src/Data/LogBoxLog.ts"),
        "../utils/devServerEndpoints",
        "ios",
      ),
    ).toEqual({
      type: "sourceFile",
      filePath: fallbackModule,
    });
  });

  test("leaves web and explicit embedded devtools opt-in untouched", () => {
    const projectRoot = path.join(__dirname, "..");

    expect(
      resolveFrom(
        path.join(projectRoot, "node_modules/expo/src/Expo.fx.tsx"),
        "./async-require/messageSocket",
        "web",
      ),
    ).toEqual({
      type: "sourceFile",
      filePath: "/resolved/original.js",
    });

    const config = loadMetroConfig(true);
    const fallbackResolver = jest.fn(() => ({
      type: "sourceFile",
      filePath: "/resolved/original.js",
    }));

    expect(
      config.resolver.resolveRequest(
        {
          originModulePath: path.join(projectRoot, "node_modules/expo/src/Expo.fx.tsx"),
          resolveRequest: fallbackResolver,
        },
        "./async-require/messageSocket",
        "ios",
      ),
    ).toEqual({
      type: "sourceFile",
      filePath: "/resolved/original.js",
    });
  });
});
