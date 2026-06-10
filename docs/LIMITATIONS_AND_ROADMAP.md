# HELIOS — Known Limitations & Future Roadmap

## Current State

**Version:** 1.0.0-RC (Release Candidate)  
**Status:** Portfolio-demo ready  
**Platform:** iOS only (Expo can support Android with minimal changes)  
**Deployment:** Ready for Render, Railway, Fly.io, or Docker-capable hosts  
**Maintenance:** Personal project, not actively maintained for production use

---

## Known Limitations

### Platform & Distribution

| Limitation | Impact | Why | Workaround |
|---|---|---|---|
| **iOS only** | No Android app | Mobile-first design, iOS Simulator for dev/demo | Backend and API layer are platform-agnostic; Android port would reuse entire backend |
| **No App Store release** | Can't install from App Store | Bundle ID placeholder, privacy policy not written | Follow [ios-release.md](ios-release.md) to submit; requires real Apple Developer account |
| **No live deployment** | Only runs locally or in demo | Infrastructure cost, no production database | See [deployment.md](deployment.md) for platform recommendations (Render/Railway free tier included) |

### Authentication & Sessions

| Limitation | Impact | Why | Workaround |
|---|---|---|---|
| **60-minute access tokens** | User re-login required after 1 hour | No refresh token implementation | See [post-v1-backlog.md](post-v1-backlog.md); adding refresh tokens is Phase 51 candidate |
| **No OAuth / Social Login** | Only email/password auth | Reduces scope; local dev doesn't require third-party credentials | Can be added in future phases (GitHub, Google, Apple Sign In) |

### Notifications

| Limitation | Impact | Why | Workaround |
|---|---|---|---|
| **Local notifications only** | Reminders don't fire when app is closed | Reduces backend complexity, no push infrastructure | Users can enable system notifications; remote push notifications are Phase 52 candidate |
| **No notification history** | Dismissed reminders not visible in app | Deliberate UX choice — reminders are ephemeral | Analytics show reminder creation dates; can add history view in v2 |

### Mobile App

| Limitation | Impact | Why | Workaround |
|---|---|---|---|
| **No deep linking** | Can't share AI conversations or specific goals | Routes not configured for deep links | Define deep link schema and test on simulator; Phase 50 candidate |
| **No offline mode** | App requires internet connection | No local sync logic | Most modern apps require internet for personalized AI features |
| **Bundle ID placeholder** | Can't submit to App Store | Template value `com.helios.app` is not unique | Change in `mobile/app.json` before EAS build; takes 2 minutes |
| **Splash screen undersized** | 228×213 image looks small on modern devices | Original design for smaller screens | Replace `mobile/assets/expo.icon/splash-icon.png` with 1024×1024+ PNG; 5-minute fix |
| **No iPad support** | iOS app runs only on iPhone | Mobile-first design, no iPad layout | UI is responsive; iPad layout would be Phase 53 candidate |

### Backend & API

| Limitation | Impact | Why | Workaround |
|---|---|---|---|
| **Mock AI provider default** | AI responses are hardcoded | Safety + no API keys required for demo | Set `AI_PROVIDER=openai` + `OPENAI_API_KEY` to enable real AI (see [deployment.md](deployment.md)) |
| **No rate limiting** | API can be hammered without consequence | Simplifies demo, local development doesn't need it | FastAPI has rate limiting middleware available; add in Phase 52 |
| **No request logging** | Can't audit API usage | Reduces verbosity for demo | Python logging middleware is straightforward; Phase 53 candidate |
| **No analytics pipeline** | Dashboard metrics computed per-request | No historical trending | Add time-series database (InfluxDB, TimescaleDB) in Phase 54 candidate |

### Data & Infrastructure

| Limitation | Impact | Why | Workaround |
|---|---|---|---|
| **No data export** | Users can't download their data | Privacy compliance not implemented | Add CSV/JSON export endpoint in Phase 51 candidate |
| **No backup strategy** | Data loss if database deleted | Docker volume is ephemeral in demo | Production PostgreSQL on Render/Railway includes automated backups |
| **No replication** | Single database instance | Simplifies local dev | Managed PostgreSQL services handle replication automatically |
| **No read replicas** | Analytics queries hit primary | Fine for <1000 users | Add read replicas on production managed service in Phase 55+ candidate |

### Development & Operations

| Limitation | Impact | Why | Workaround |
|---|---|---|---|
| **No CI/CD pipeline** | Tests must run locally | Demo doesn't require automated deployment | GitHub Actions workflow would take 30 minutes to add |
| **No error tracking** | Exceptions logged to console only | Demo doesn't need Sentry | Add Sentry integration in Phase 52 candidate; backend telemetry ready |
| **No APM / Monitoring** | Can't see backend performance metrics | Local development has low latency | Use New Relic or Datadog on production (both have free tiers) |
| **No environment-specific builds** | Mobile app has same behavior everywhere | Expo build system handles this correctly | Configure separate profiles per environment in Phase 51 candidate |

---

## Post-V1 Roadmap

### Phase 50 (Immediate — ~2 weeks)
- [ ] Fix FastAPI deprecation warnings: migrate from `@app.on_event()` to lifespan handlers
- [ ] Add deep linking for conversations and goals
- [ ] Document privacy policy template for App Store submission
- [ ] Add missing app icon (replace placeholder)

### Phase 51 (~1 week)
- [ ] Refresh token flow: 7-day refresh tokens, 15-minute access tokens
- [ ] User data export: CSV/JSON download
- [ ] Backend error logging: structured logging with log levels
- [ ] Mobile environment configuration: separate dev/staging/prod builds

### Phase 52 (~2 weeks)
- [ ] Remote push notifications: Firebase Cloud Messaging (FCM) or APNs
- [ ] Error tracking: Sentry integration for both backend and mobile
- [ ] Rate limiting: Add token bucket algorithm for API endpoints
- [ ] Request logging: Audit trail for user actions

### Phase 53 (~2 weeks)
- [ ] Android port: React Native development on Android Emulator
- [ ] iPad layout: Responsive UI for tablet screens
- [ ] Notification history: Archive of past reminders
- [ ] Settings: Theme customization beyond light/dark

### Phase 54 (~3 weeks)
- [ ] Time-series analytics: Historical trends (goals completed over time, task velocity)
- [ ] Recommendations engine: AI suggests next actions based on patterns
- [ ] Bulk operations: Batch create/update/delete for power users
- [ ] Offline sync: Core functionality available without internet

### Phase 55+ (Backlog)
- [ ] Social features: Share goals with team members
- [ ] Mobile web: React app sharing the same backend API
- [ ] Advanced AI: Custom training on user data, multi-conversation reasoning
- [ ] Marketplace: Community action templates, goal library
- [ ] Organizations: Team goals, shared reminders, role-based access control

---

## Why These Exist

### Philosophy
HELIOS prioritizes **working functionality over exhaustive features**. Each limitation is deliberate, documented, and listed with a clear workaround. This allows the project to ship V1 quickly while remaining honest about what's not included.

### Trade-offs Made
- **60-minute tokens instead of refresh tokens:** Simpler implementation; users re-login infrequently
- **Local notifications instead of remote:** No backend notification infrastructure; users enable system notifications
- **Mock AI provider default:** No API keys required to run locally; production uses OpenAI
- **No analytics pipeline:** Simplifies database; dashboard metrics computed per-request
- **No OAuth:** Email/password is simpler to demo; OAuth is one environment variable away

### What This Means for Users
Users can run HELIOS locally, use all features, and see a production-grade codebase. Limitations are clearly listed. None of them block the core use case (goal tracking + AI planning). Most can be added in future phases without major refactoring.

---

## How to Contribute

If you want to extend HELIOS:

1. **Choose a limitation from the roadmap** — pick Phase 50–52 to stay close to the current codebase
2. **Understand the current architecture** — read [PORTFOLIO.md](../PORTFOLIO.md) and [docs/architecture-overview.md](architecture-overview.md)
3. **Implement without breaking tests** — backend tests must remain at 8/8 passing
4. **Document the change** — update [deployment.md](deployment.md) if infrastructure changed
5. **Test locally** — Docker Compose for backend, Expo for mobile
6. **Submit as a phase** — keep the incremental delivery philosophy

---

## For Portfolio Review

**Is HELIOS feature-complete?**  
No. It deliberately ships core features well rather than attempting everything. Read the limitations — they are honest and listed.

**Are the limitations blockers?**  
No. Every limitation has a documented workaround. The project works as designed for its intended purpose (portfolio demonstration).

**What's the intended deployment model?**  
Local development with Docker Compose. Production deployment is documented but not required for portfolio review. The app is designed for both scenarios.

**Will this project stay maintained?**  
HELIOS is a portfolio project. It ships a stable V1.0 and is available for reference. Future phases can be added, but the current codebase is complete and tested.
