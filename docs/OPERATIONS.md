# Room Riot game-night operations

## Useful signals

- `GET /healthz` answers whether the process and game engine are alive.
- `GET /readyz` answers whether the process can accept new rooms and realtime traffic.
- `GET /metrics` returns privacy-safe counters, event latency summaries, process memory, and active room/player counts.
- Structured logs use an `event` field. They intentionally omit player-entered text, room tokens, and request payloads.
- `pnpm check:balance` runs seeded 2/4/6/8/12-player fairness paths and fails on join-order or target-exposure regressions.
- `pnpm check:load` exercises 100 rooms with 12 players each, reconnect/action bursts, event latency, memory, CPU, and timer drift; use it before changing capacity limits.

## A safe game-night checklist

1. Check `/healthz`, then `/readyz`, before inviting players.
2. Check `/metrics` for active rooms, socket disconnects, snapshot updates, and memory growth.
3. Use the host recovery panel for a reconnect or stale-client report; never copy bearer tokens into a ticket.
4. A container replacement clears active rooms and player sessions; create a new room after the replacement.
5. During a planned stop, readiness turns unhealthy first; wait for the process to close before replacing it.

## Capacity guardrails

The recorded local baseline supports 100 active rooms and 1,200 players with event/action and reconnect
latency below one second and deadline drift below one second. Treat those as alert thresholds, not a
promise of unlimited capacity: investigate sustained `socket.event_latency_ms`, `timer.drift_ms`, memory,
or active-room growth before increasing limits.

## Restarts

The current local-lab deployment stores active-room state in memory. Restarts and container
replacements clear active rooms, room codes, player sessions, and in-progress games. Static game
content and the application image are unaffected.

## Common recoveries

- `room_not_found`: confirm the host has not closed the room and that the client is using the current six-character code.
- `room_limit` or rate-limit guidance: stop repeated retries, wait for the retry window, and check whether a proxy is forwarding a stable client address.
- `incompatible-version`: deploy the matching compiled client and server together, then reload stale browser tabs.
