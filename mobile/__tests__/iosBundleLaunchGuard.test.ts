import fs from "fs";
import path from "path";

const iosRoot = path.join(__dirname, "..", "ios");

function readNativeFile(relativePath: string): string {
  const filePath = path.join(iosRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing iOS native file required for device launch guard: ios/${relativePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

describe("iOS device launch guard", () => {
  test("keeps a non-null JS bundle URL fallback in AppDelegate", () => {
    const appDelegate = readNativeFile("HELIOS/AppDelegate.swift");

    expect(appDelegate).toContain("bridge.bundleURL ?? resolvedBundleURL()");
    expect(appDelegate).toContain("override func bundleURL() -> URL?");
    expect(appDelegate).toContain("private func resolvedBundleURL() -> URL?");
    expect(appDelegate).toContain("fallbackURLProvider");
    expect(appDelegate).toContain('Bundle.main.url(forResource: "main", withExtension: "jsbundle")');
  });

  test("does not skip JS bundling for physical iPhone debug builds", () => {
    const project = readNativeFile("HELIOS.xcodeproj/project.pbxproj");

    expect(project).toContain(
      'if [[ \\"$CONFIGURATION\\" = *Debug* && \\"$PLATFORM_NAME\\" != \\"iphoneos\\" ]]; then',
    );
    expect(project).not.toContain(
      'if [[ \\"$CONFIGURATION\\" = *Debug* ]]; then\\n  export SKIP_BUNDLING=1\\nfi',
    );
  });

  test("keeps local networking enabled for Metro on physical devices", () => {
    const infoPlist = readNativeFile("HELIOS/Info.plist");

    expect(infoPlist).toMatch(/<key>NSAllowsLocalNetworking<\/key>\s*<true\/>/);
  });
});
