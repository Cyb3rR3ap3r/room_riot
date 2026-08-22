# Room Riot

Locally hosted party games for a shared screen and everyone’s phone.

## Current status

Milestones 0 through 4 are implemented, and the Milestone 5 stability/polish work is in the repository. The remaining validation is physical: install on the TrueNAS SCALE server and run the multi-device LAN checklist. The platform includes playable Groupthink and Hot Take loops with server-side scoring, automatic deadlines, anonymous voting, targeted prompts, QR joining, reconnect notices, reconnectable host/player sessions, responsive display/player layouts, and shared host/player/display browser flows.

See [BUILD_PLAN.md](./BUILD_PLAN.md) for the implementation roadmap.
See [deploy/truenas/README.md](./deploy/truenas/README.md) for TrueNAS SCALE installation, upgrades, backups, and LAN verification.
See [docs/QA_CHECKLIST.md](./docs/QA_CHECKLIST.md) for the Milestone 5 device and network test matrix.

Pushing to `main` runs the GitHub Actions validation/build workflow, publishes the TrueNAS-ready image to GitHub Container Registry, and uploads a deployment bundle with the immutable commit tag.

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
