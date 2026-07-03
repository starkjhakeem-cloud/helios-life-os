const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const upstreamResolveRequest = config.resolver?.resolveRequest;

const nativeDevtoolsEnabled =
  process.env.EXPO_PUBLIC_ENABLE_EMBEDDED_DEVTOOLS === 'true' ||
  process.env.HELIOS_ENABLE_EMBEDDED_DEVTOOLS === 'true';

const devtoolsNoopModule = path.resolve(__dirname, 'src/devtools/embeddedDevtoolsNoop.js');
const logBoxDevServerFallbackModule = path.resolve(
  __dirname,
  'src/devtools/embeddedLogBoxDevServerEndpoints.js',
);

function isNativeEmbeddedPlatform(platform) {
  return platform === 'ios' || platform === 'android';
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function shouldDisableNativeEmbeddedDevtools(context, moduleName, platform) {
  if (!isNativeEmbeddedPlatform(platform) || nativeDevtoolsEnabled) {
    return false;
  }

  const originModulePath = normalizePath(context.originModulePath || '');

  const isExpoAsyncMessageSocket =
    originModulePath.endsWith('/node_modules/expo/src/Expo.fx.tsx') &&
    moduleName === './async-require/messageSocket';

  const isExpoAsyncRequireSetupSocket =
    originModulePath.endsWith('/node_modules/expo/src/async-require/setup.ts') &&
    moduleName === './messageSocket';

  const isReactNativeDevtoolsSetup =
    originModulePath.endsWith('/node_modules/react-native/src/private/setup/setUpDefaultReactNativeEnvironment.js') &&
    moduleName === '../../../Libraries/Core/setUpReactDevTools';

  return isExpoAsyncMessageSocket || isExpoAsyncRequireSetupSocket || isReactNativeDevtoolsSetup;
}

function shouldUseNativeEmbeddedLogBoxFallback(context, moduleName, platform) {
  if (!isNativeEmbeddedPlatform(platform) || nativeDevtoolsEnabled) {
    return false;
  }

  const originModulePath = normalizePath(context.originModulePath || '');
  const isExpoLogBoxSource = originModulePath.includes('/node_modules/@expo/log-box/src/');
  const isDevServerEndpointImport =
    moduleName === './utils/devServerEndpoints' || moduleName === '../utils/devServerEndpoints';

  return isExpoLogBoxSource && isDevServerEndpointImport;
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (shouldDisableNativeEmbeddedDevtools(context, moduleName, platform)) {
    return {
      type: 'sourceFile',
      filePath: devtoolsNoopModule,
    };
  }

  if (shouldUseNativeEmbeddedLogBoxFallback(context, moduleName, platform)) {
    return {
      type: 'sourceFile',
      filePath: logBoxDevServerFallbackModule,
    };
  }

  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
