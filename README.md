# Room Riot

Locally hosted party games for a shared screen and everyone’s phone.

## Current status

Room Riot is a playable pre-production build, not a signed-off production release. Groupthink, Hot
Take, Suspect, and Drawn Out have complete server-owned round loops, QR joining, reconnectable
sessions, responsive host/player/display routes, automated tests, and compiled deployment checks.
Gameplay-integrity and fairness hardening is underway; client architecture, premium UI passes,
accessibility, persistence, observability, performance budgets, browser automation, physical-device
coverage, and release sign-off remain tracked work.

See [BUILD_PLAN.md](./BUILD_PLAN.md) for the implementation roadmap.
See [docs/AAA_PRODUCTION_TRACKER.md](./docs/AAA_PRODUCTION_TRACKER.md) for the prioritized UI,
gameplay, and production-readiness backlog.
See [deploy/truenas/README.md](./deploy/truenas/README.md) for TrueNAS SCALE installation, upgrades, backups, and LAN verification.
See [docs/QA_CHECKLIST.md](./docs/QA_CHECKLIST.md) for the Milestone 5 device and network test matrix.

Pull requests to `main` run the validation/build workflow without publishing. After a validated push
to `main`, GitHub Actions publishes the TrueNAS-ready image to GitHub Container Registry and uploads
a deployment bundle with the immutable commit tag.

## Development

Requirements:

- Node.js 22+
- pnpm 11

Install dependencies and run the verification suite:

```bash
pnpm install
pnpm check
pnpm build
```

Start the server in development mode:

```bash
pnpm dev:server
```

The health endpoint is available at `http://localhost:3000/healthz`. Open `/host` to create a room, `/display?room=CODE` on the shared screen, and `/play?room=CODE` on player phones.

Groupthink uses a 60-second server-owned answer deadline. Hot Take uses a 60-second answer deadline followed by a 45-second voting deadline. The host can reveal either stage early, then score the round and advance until the final scoreboard.

When creating a room, the host can choose the family-friendly, standard, or after-dark content mode, plus the curated prompt deck or AI remix deck. Each curated game/content pack contains 100 prompts and is shuffled per game; AI remix creates a fresh, larger local deck for that room, so both sources work without an internet connection or an API key. The shared display uses the available viewport height and scales dense answer/result states to keep the full experience visible on a TV.
