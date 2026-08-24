# Room Riot architecture reference

Use this as a map, then verify details against the current source before editing. The app is a pnpm TypeScript monorepo with shared contracts, one package per game, a server-authoritative room manager, and a single web client with host, player, display, results, and winner views.

## Repository map

| Concern                  | Location                                                                                  | What to inspect                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Shared protocol and IDs  | `packages/contracts/src/index.ts`                                                         | game IDs, room settings, request/response schemas, public versus private state       |
| Game rules and content   | `games/<game-id>/src/`                                                                    | constants, state transitions, prompt loaders, scoring, views, tests                  |
| Curated content          | `games/<game-id>/content/`                                                                | mode-specific JSON packs and prompt schema                                           |
| Room lifecycle           | `apps/server/src/room-manager.ts`                                                         | create/start/action/resolve/next-round/end, deadlines, snapshots, reconnects         |
| Socket transport         | `apps/server/src/socket.ts`                                                               | authenticated room actions, acknowledgements, error envelopes                        |
| HTTP/bootstrap           | `apps/server/src/http.ts`                                                                 | static serving, health/startup, generated asset imports                              |
| Web protocol types       | `apps/web/src/protocol.ts`                                                                | client game unions, socket request/response types, private/public views              |
| Web application          | `apps/web/src/main.ts`                                                                    | catalog, host controls, player controller, display, results, winner routes           |
| Global display styling   | `apps/web/index.html`                                                                     | inline CSS, viewport rules, responsive layout, game-specific classes                 |
| Visual assets            | `apps/web/assets/`                                                                        | logos, backgrounds, icons, naming and import conventions                             |
| Build/deploy             | root `package.json`, `pnpm-workspace.yaml`, `Dockerfile`, `scripts/verify-deployment.mjs` | package scripts, build order, production dependency handling, route and asset checks |
| TypeScript project graph | `tsconfig.json`, `apps/server/tsconfig.json`, `apps/web/tsconfig.json`                    | project references that must include the new game package                            |

## Integration sequence

1. Add a new game ID to the contract schema and any shared game-union types.
2. Create `games/<game-id>/package.json`, `src/index.ts`, tests, and mode-aware content packs. Follow the existing ESM/TypeScript package style.
3. Register the game in the room manager. Trace an existing game from room creation through start, each action, deadline/resolve, next round, snapshot, and winner so every phase is covered.
4. Extend socket request schemas only for genuinely new actions. Update `apps/web/src/protocol.ts` game unions and reuse authorization, membership, rate/deadline, and error handling already used by the server.
5. Register a complete catalog entry and render every state needed by host, player, display, results, and winner experiences. Avoid leaking private answers in public snapshots.
6. Add page paths and QR join-path handling in `apps/server/src/http.ts`; add the same host/display/player routes and every new asset to `scripts/verify-deployment.mjs`.
7. Add display-first CSS and exact asset paths. Keep the shared display viewport-safe and readable from a distance.
8. Add the game to root and app TypeScript project references and any package dependency/build wiring, then add focused tests. Search all references to an existing game ID to find registrations that are easy to miss.

## Conventions to preserve

- The server owns state transitions, scoring, deadlines, and eligibility. The browser is an untrusted renderer/action client.
- Room snapshots should be serializable and complete enough for reconnect; player-private data must be separated from display/public data.
- Existing prompt packs are JSON objects with a `prompts` array. Groupthink prompts normally contain `id` and `text`; Hot Take may also contain a `kind` such as `open` or `player-targeted`. Inspect the target game rather than assuming a schema.
- Content modes are `family`, `standard`, and `after-dark`; prompt source can be `default` or `ai` where supported. A new game must explicitly route these settings instead of silently hard-coding one mode.
- Prefer stable IDs and deterministic selection/shuffling so a round can be reproduced for debugging without repeating the same opening prompt every game.
- Keep game-specific styles namespaced. A shared-display layout must tolerate long text, dense scores, small player counts, and 16:9 TV viewports without accidental page scrolling.

## Verification commands

Use the scripts exposed by the current root `package.json`; names can change, so inspect them first. Typical checks are:

```powershell
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
pnpm build
pnpm verify:deployment
```

Run the new package's focused tests and the bundled content validator before the full suite. If Docker, a browser, or an external AI service is unavailable, report exactly which check could not be run.
