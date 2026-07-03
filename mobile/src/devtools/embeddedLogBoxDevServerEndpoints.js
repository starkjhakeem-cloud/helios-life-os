const fallbackDevServerUrl = process.env.EXPO_DEV_SERVER_ORIGIN || 'http://localhost:8081/';

export function getBaseUrl() {
  return fallbackDevServerUrl;
}

export function openFileInEditor() {
  // No editor endpoint exists for embedded bundles.
}

export async function fetchProjectMetadataAsync() {
  return {
    projectRoot: undefined,
    serverRoot: undefined,
    sdkVersion: undefined,
  };
}

export function formatProjectFilePath(projectRoot = '', file = null) {
  if (file == null) {
    return '<unknown>';
  }

  const normalizedFile = String(file).replace(/\\/g, '/').replace(/\?.*$/, '');
  const normalizedRoot = String(projectRoot).replace(/\\/g, '/');

  if (!normalizedRoot || !normalizedFile.startsWith(normalizedRoot)) {
    return normalizedFile;
  }

  return normalizedFile.slice(normalizedRoot.length).replace(/^\/+/, '');
}

export function getFormattedStackTrace(stack, projectRoot = '') {
  return stack.map((frame) => `  at ${frame.methodName ?? '<unknown>'} (${getStackFormattedLocation(projectRoot, frame)})`).join('\n');
}

export function isStackFileAnonymous(frame) {
  return !frame.file || frame.file === '<unknown>' || frame.file === '<anonymous>';
}

export function getStackFormattedLocation(projectRoot = '', frame = {}) {
  let location = formatProjectFilePath(projectRoot, frame.file);
  const lineNumber = frame.lineNumber;
  const column = frame.column != null ? Number.parseInt(String(frame.column), 10) : null;

  if (lineNumber != null && lineNumber >= 0) {
    location += `:${lineNumber}`;
    if (column != null && !Number.isNaN(column) && column >= 0) {
      location += `:${column + 1}`;
    }
  }

  return location;
}

export function invalidateCachedStack() {
  // No symbolication cache is used when no dev server is available.
}

export async function symbolicateStackAndCacheAsync(stack) {
  return { stack };
}
