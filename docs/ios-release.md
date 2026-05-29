# HELIOS — iOS / TestFlight Release Guide

This document covers everything needed to go from the current codebase to a TestFlight build. No submission is required to follow this guide — it is a preparation reference.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Step 1 — Set Your Bundle Identifier](#step-1--set-your-bundle-identifier)
- [Step 2 — Install EAS CLI](#step-2--install-eas-cli)
- [Step 3 — Log In to Expo](#step-3--log-in-to-expo)
- [Step 4 — Link the Project to EAS](#step-4--link-the-project-to-eas)
- [Step 5 — Configure Apple Credentials](#step-5--configure-apple-credentials)
- [Step 6 — Set the Production API URL](#step-6--set-the-production-api-url)
- [Step 7 — Build for TestFlight](#step-7--build-for-testflight)
- [Step 8 — Submit to TestFlight](#step-8--submit-to-testflight)
- [Step 9 — Add Internal Testers](#step-9--add-internal-testers)
- [Environment Checklist](#environment-checklist)
- [iOS Release Checklist](#ios-release-checklist)
- [Known Limitations and TODOs](#known-limitations-and-todos)

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Apple Developer account** | $99/year — [developer.apple.com](https://developer.apple.com) |
| **Mac with Xcode 16+** | Required only for local builds; EAS cloud builds don't need it |
| **Node.js 20+** | Already required for local development |
| **Deployed backend** | The production API must be live before distributing to testers. See [deployment.md](deployment.md). |

---

## Step 1 — Set Your Bundle Identifier

The bundle identifier in `mobile/app.json` is currently set to the placeholder `com.helios.app`. **You must change this to a unique identifier registered to your Apple Developer account.**

Bundle identifier format: `com.{your-reversed-domain}.{app-name}`

Examples:
- `com.yourname.helios`
- `io.helios.app`
- `com.jhakeemstark.helios`

**To update:**

1. In `mobile/app.json`, change:
   ```json
   "ios": {
     "bundleIdentifier": "com.helios.app"
   }
   ```
   to your actual bundle ID.

2. Register the bundle identifier in [App Store Connect](https://appstoreconnect.apple.com):
   - Go to **Certificates, Identifiers & Profiles → Identifiers**
   - Click **+** and create a new App ID
   - Enter your bundle identifier

> The bundle identifier must be globally unique across the entire App Store. Once registered, it cannot be changed.

---

## Step 2 — Install EAS CLI

EAS (Expo Application Services) handles cloud builds and App Store submissions.

```bash
npm install -g eas-cli

# Verify installation
eas --version
```

EAS Build is a paid Expo service. The free tier allows a limited number of builds per month. Check [expo.dev/pricing](https://expo.dev/pricing) for current limits.

---

## Step 3 — Log In to Expo

```bash
eas login
```

Create a free account at [expo.dev](https://expo.dev) if you don't have one.

---

## Step 4 — Link the Project to EAS

From the `mobile/` directory:

```bash
eas build:configure
```

This command:
1. Creates or links an EAS project in your Expo account
2. Writes a `projectId` into `app.json` (a UUID assigned by EAS)
3. Updates `eas.json` with any recommended settings

After running this command, commit the updated `app.json` (which will now include an `extra.eas.projectId` field).

---

## Step 5 — Configure Apple Credentials

EAS can manage your Apple signing certificates and provisioning profiles automatically:

```bash
eas credentials
```

Select **iOS** → **Distribution certificate** and **Provisioning profile**. EAS will:
1. Generate or import a distribution certificate in your Apple Developer account
2. Create an App ID (if you haven't done so manually)
3. Create a provisioning profile linked to your certificate

You will be prompted for your Apple ID and password (or an App Store Connect API key for CI/CD environments). These credentials are stored securely in EAS and never committed to the repository.

---

## Step 6 — Set the Production API URL

The app reads the backend URL from `EXPO_PUBLIC_API_URL` at build time. This is already configured in `eas.json` for the `preview` and `production` profiles:

```json
"env": {
  "EXPO_PUBLIC_API_URL": "https://api.helios.app"
}
```

**Replace `https://api.helios.app`** with your actual deployed backend URL before building. See [deployment.md](deployment.md) for backend deployment options.

You can also override this per-build from the command line:

```bash
EXPO_PUBLIC_API_URL=https://your-actual-api.com eas build --platform ios --profile preview
```

---

## Step 7 — Build for TestFlight

From the `mobile/` directory:

### Internal testing (TestFlight — limited testers)

The `preview` profile creates an internal distribution build suitable for TestFlight:

```bash
npm run build:ios:preview
# equivalent to: eas build --platform ios --profile preview
```

EAS queues the build on its servers and emails you when it's ready. Build time is typically 10–20 minutes.

### Public TestFlight / App Store

The `production` profile creates the final App Store binary. `autoIncrement: true` automatically bumps the `buildNumber` on each EAS build:

```bash
npm run build:ios:prod
# equivalent to: eas build --platform ios --profile production
```

---

## Step 8 — Submit to TestFlight

Once the build completes, submit it directly from EAS:

```bash
npm run submit:ios
# equivalent to: eas submit --platform ios --profile production
```

EAS will prompt for:
- Apple ID
- App-specific password (or App Store Connect API key)
- App Store Connect App ID

Alternatively, download the `.ipa` from [expo.dev](https://expo.dev) and upload it manually using **Transporter** (macOS app) or **Xcode → Organizer**.

**Before the build appears in TestFlight:**
- Apple runs an automated review (usually minutes for TestFlight internal, days for external)
- Set up a compliance export status in App Store Connect (required by Apple for apps with encryption — HTTPS counts)

---

## Step 9 — Add Internal Testers

1. Log in to [App Store Connect](https://appstoreconnect.apple.com)
2. Select your app → **TestFlight** → **Internal Testing**
3. Click **+** next to the build
4. Add testers by email (they must accept an invitation from TestFlight)

Internal TestFlight testers (up to 100) do not require a full Apple review. External testers (up to 10,000) require Beta App Review.

---

## Environment Checklist

Complete this before triggering a TestFlight build:

### Backend
- [ ] Backend deployed and accessible over HTTPS
- [ ] `JWT_SECRET_KEY` is a strong random value (not the placeholder)
- [ ] `DEBUG=false` in production environment
- [ ] `/api/v1/health` returns `200 OK` at the production URL

### Mobile configuration
- [ ] `bundleIdentifier` in `mobile/app.json` is a real, registered App ID (not `com.helios.app`)
- [ ] `version` in `mobile/app.json` reflects the release (e.g. `"1.0.0"`)
- [ ] `buildNumber` in `mobile/app.json` is incremented (or using `autoIncrement`)
- [ ] `EXPO_PUBLIC_API_URL` in `eas.json` points to the live backend URL
- [ ] EAS project linked (`eas build:configure` has been run)
- [ ] Apple credentials provisioned (`eas credentials` has been run)

### App Store Connect
- [ ] App created in App Store Connect with matching bundle identifier
- [ ] Privacy Policy URL set (required for App Store)
- [ ] Age rating configured
- [ ] Export compliance answered (select "Yes" for HTTPS — standard encryption)

---

## iOS Release Checklist

Before submitting for App Store review (not TestFlight):

- [ ] Screenshots uploaded (6.9" iPhone, 6.5" iPhone at minimum)
- [ ] App description written and proofread
- [ ] Keywords set
- [ ] Support URL set
- [ ] No placeholder text or lorem ipsum anywhere in the app
- [ ] All API calls work with the production backend
- [ ] Notification permission prompt tested (must show on first run)
- [ ] Login, signup, and logout flows tested end-to-end
- [ ] Background behavior tested (app returns to correct state after suspend)
- [ ] Tested on real device (not just Simulator)

---

## Known Limitations and TODOs

| Item | Status | Notes |
|---|---|---|
| Bundle identifier | **TODO** | Replace `com.helios.app` with your registered App ID |
| Splash screen image | **TODO** | `splash-icon.png` is 228×213 — replace with a square PNG (≥ 1024×1024 recommended) for best results on all screen sizes |
| Privacy Policy | **TODO** | Required by Apple for any app with user accounts |
| App Store screenshots | **TODO** | Required for App Store listing (not TestFlight) |
| Push notifications (remote) | Not implemented | Current notifications are local only (scheduled on-device) |
| Refresh tokens | Not implemented | Access tokens expire in 60 minutes — users must re-login |
| App icon background | Current | The icon has a transparent background; Apple requires no transparency for App Store icons. Verify with `expo doctor`. |
| iPad support | Disabled | `supportsTablet: false` — the UI is phone-only |
| Deep linking | Basic | `scheme: "helios"` is configured but no deep link routes are defined |
| EAS project ID | **TODO** | Run `eas build:configure` to link the project and add the `projectId` to `app.json` |

---

## Quick Reference Commands

```bash
# One-time setup
npm install -g eas-cli
eas login
cd mobile
eas build:configure

# Manage Apple credentials
eas credentials

# Local development (no credentials needed)
npm run ios           # Open in Simulator
npm run start         # Expo DevTools

# Cloud builds
npm run build:ios:dev      # Development client (Simulator)
npm run build:ios:preview  # TestFlight internal distribution
npm run build:ios:prod     # App Store production binary

# Submit to TestFlight / App Store
npm run submit:ios
```
