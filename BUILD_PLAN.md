# Room Riot Build Plan

## 1. Agreed product target

Room Riot is a locally hosted party-game platform for a single household or private LAN.

## Current implementation status

Milestones 0 through 4 are implemented, and the Milestone 5 stability/polish work is implemented in the repository. The codebase now has the TypeScript workspace foundation, shared validation contracts, immutable room-state models, room creation, host authorization, player reconnect tokens, Socket.IO synchronization, QR generation, browser host/player/display routes, complete Groupthink and Hot Take game loops, server-owned answer/vote deadlines, automated tests, a hardened Docker/Compose deployment path, reconnect/error recovery UI, live countdowns, phase transitions, sound hooks, responsive layouts, and 12-player/reconnect integration coverage. Physical TrueNAS installation and multi-device LAN validation are still pending.

Initial deployment target:

- TrueNAS SCALE ElectricEel
- Docker-based deployment through a TrueNAS Custom App / Compose configuration
- The shared display runs in a browser on another PC
- Players use mobile browsers; no mobile app is required
- Remote internet play is out of scope
- Android TV support is a later client target, not an MVP requirement

Initial playable release:

- Groupthink
- Hot Take

The platform should be tested with 12 concurrent players. The game engine should not hard-code this limit, so a later configuration can support 20 or more players if real-world testing remains reliable.

## 2. Product strategy

The original concept document contains a full platform vision, eight launch games, content packs, AI generation, achievements, statistics, and future TV/mobile clients. That is a good long-term direction but too broad for the first build.

The first objective is a reliable game-night loop:

1. Host opens the display in a browser.
2. Room Riot creates a room and shows a room code plus QR code.
3. Players join from their phones.
4. The host starts the game.
5. Phones collect private input while the display shows shared state.
6. The server advances rounds and calculates scores.
7. A final scoreboard ends the session.

Success means a household can start and finish several rounds without manually refreshing pages, coordinating state, or restarting the server.

## 3. MVP scope

### Include

- Room creation and four-to-six-character room codes
- QR-code joining
- Player names and simple avatar selection
- Lobby with connected-player status
- Host controls
- Display, player, and host browser views
- Realtime synchronization over Socket.IO
- Server-authoritative timers and scoring
- Reconnection using a player session token
- Groupthink
- Hot Take
- SQLite-backed content and configuration
- Docker image and TrueNAS deployment instructions
- Family, standard, and adult content-pack metadata, even if the initial content library is small

### Defer

- Remote play over the internet
- Accounts and cloud profiles
- AI-generated content
- Community content sharing
- Drawing and image-heavy games
- Audio and video games
- Achievements and long-term player statistics
- Android TV application packaging
- Chromecast, Apple TV, Steam, and streaming integrations
- Arbitrary third-party game code loading

## 4. Technical architecture

Use one deployable application initially. Keep the display and player interfaces as separate routes within one web frontend rather than deploying separate frontend services.

```text
Browser display /display ─┐
Browser host   /host      ├── HTTP + Socket.IO ── Room Riot server
Phone players  /play     ┘                           │
                                                     ├── In-memory active rooms
                                                     ├── Game engine
                                                     └── SQLite content/config
```

### Recommended stack

- Node.js + TypeScript
- Fastify or Express for HTTP
- Socket.IO for realtime communication and reconnection
- React + Vite for the web client
- SQLite for content, settings, and optional game-night history
- Zod for validating socket actions and content files
- Docker for local development and TrueNAS deployment
- Playwright for browser-level testing

### Server authority

Clients send intent, not state. Examples:

- `join_room`
- `submit_answer`
- `cast_vote`
- `host_start_game`
- `host_next_round`

The server validates the action, updates the room state, calculates scores, and broadcasts a sanitized state to each relevant client. Clients must never submit scores, select authoritative timers, or advance phases independently.

### Active-room model

Active rooms can remain in memory for the first release. SQLite should store content and configuration. If the server restarts, the current game may be lost in the MVP; this should be documented clearly. Persisting resumable sessions can be added after the core loop is stable.

## 5. Repository structure

```text
room_riot/
├── apps/
│   ├── server/
│   └── web/
├── packages/
│   ├── contracts/
│   ├── game-engine/
│   └── ui/
├── games/
│   ├── groupthink/
│   └── hot-take/
├── content/
│   ├── family/
│   ├── standard/
│   └── after-dark/
├── db/
├── docker/
├── Dockerfile
├── docker-compose.yml
└── BUILD_PLAN.md
```

The initial game modules should be internal TypeScript modules. They should have a stable contract so additional games can be added without changing room, networking, or lobby code.

## 6. Game-engine contract

Each game should provide:

- A manifest: name, description, player range, round count, and content modes
- Session initialization
- Display state generation
- Private player-state generation
- Valid action handling
- Phase transitions
- Scoring
- End-of-game results

The shared engine owns:

- Room lifecycle
- Player identity and reconnection
- Host authorization
- Timers
- Phase transitions
- Score storage
- Broadcasting and client visibility

The standard lifecycle is:

```text
LOBBY → INTRO → PROMPT → INPUT → RESULTS → SCORING → NEXT ROUND → WINNER
```

## 7. Game implementation order

### Groupthink

Implement first because it proves the most important platform behavior with relatively simple rules:

- Prompt selection
- Simultaneous text entry
- Submission status
- Answer normalization
- Grouping matching answers
- Popularity-based scoring
- Results presentation
- Round and final scoreboards

Normalization should initially trim whitespace, normalize casing, collapse repeated spaces, and remove harmless punctuation. More advanced aliases can be added later.

### Hot Take

Implemented in Milestone 3:

- Anonymous answer presentation with server-generated entry IDs
- One-vote-per-player validation that prevents voting for your own answer
- Open and player-targeted prompt support
- Vote scoring and cumulative final scoreboards
- Separate server-owned answer and voting deadlines

Both games should use the same prompt/content schema where practical, while keeping game-specific rules inside their modules.

## 8. Milestones and exit criteria

### Milestone 0 — Foundation

- Create the TypeScript workspace
- Add linting, formatting, type checking, and test commands
- Define shared socket messages and Zod schemas
- Define room, player, phase, and score models
- Create the first Docker build

Exit: a clean development build starts locally and the server passes health checks.

### Milestone 1 — Platform shell

- Create room
- Generate code and QR URL
- Join from phone
- Display lobby
- Show player connection state
- Add host token and basic host controls
- Add reconnect token

Exit: 12 browser clients can join and remain visible in the lobby.

### Milestone 2 — Groupthink

- Implement the full game lifecycle: input, results, scoring, next round, and winner
- Load family, standard, and after-dark prompt packs from validated JSON content
- Close input automatically after the server-owned 60-second deadline, with host reveal as a manual fallback
- Normalize answers and group matching responses on the server
- Award matching-group points and carry cumulative scores into the final scoreboard
- Add sanitized display state and private player state views
- Add browser controls for submitting answers, revealing results, scoring rounds, and starting over

Exit: a complete Groupthink game can be played from start to finish.

### Milestone 3 — Hot Take

- Add anonymous answers
- Add voting
- Add player-targeted prompt support
- Add vote scoring
- Add automatic answer and voting deadlines
- Add host controls for revealing answers, revealing votes, and advancing rounds

Exit: both games can run in the same room framework without game-specific networking code leaking into the platform layer.

### Milestone 4 — TrueNAS deployment

Implemented in the repository:

- Hardened production Docker image with non-root runtime, read-only root filesystem support, dropped capabilities, and health checks
- Persistent `/data` mount in Compose and the TrueNAS YAML template
- TrueNAS Custom App / Compose installation guide
- LAN smoke-test script for health, browser routes, and Socket.IO
- Backup, upgrade, rollback, ACL, and recovery instructions

Still requires the physical TrueNAS installation:

- Pull the tagged image on TrueNAS
- Mount the real dataset and validate UID/GID 1000 permissions
- Verify LAN access from the display PC and phones
- Complete the 12-player Groupthink and Hot Take playtest

Exit: the game can be installed and played on the actual TrueNAS server without a development machine.

### Milestone 5 — Stability and polish

Implemented in the repository:

- Connection status notices and automatic reconnect handling for host, player, and display sessions
- Live server-deadline countdowns that continue updating between room snapshots
- Display phase transitions, optional sound cues, reduced-motion support, safe-area spacing, and touch-friendly controls
- Responsive TV/display and phone layouts, including portrait/landscape-friendly answer forms
- Socket integration coverage for 12 concurrent players, a reconnecting player identity, answer submission, results, and the winner state
- A manual browser/device/network test matrix in `docs/QA_CHECKLIST.md`
- A timing-stable Hot Take deadline test that awaits phase notifications instead of relying on fixed sleeps

Still requires physical validation:

- Test iOS Safari and Android Chrome on the target LAN
- Test reloads, backgrounding, reconnects, and intermittent Wi-Fi on real devices
- Test a 12-phone game from the display PC/TV browser
- Confirm sound, reduced motion, readability, and touch targets on the intended hardware

Exit: a complete household game night can run without operator intervention.

## 9. Testing requirements

### Automated

- Unit tests for room lifecycle and scoring
- Unit tests for answer normalization
- Game-module contract tests
- Socket integration tests with multiple simulated players
- Validation tests for malformed or unauthorized actions
- Playwright tests for display and phone flows

### Manual on the LAN

- QR scan from normal TV distance
- At least 12 phones connected simultaneously
- One player reloads during input
- One player backgrounds their browser
- A phone disconnects and reconnects
- Host refreshes the display
- Server restarts between games
- Content packs are changed or restored from backup

See [docs/QA_CHECKLIST.md](./docs/QA_CHECKLIST.md) for the Milestone 5 execution checklist and acceptance criteria.

## 10. Security and privacy baseline

This is a private-LAN application, but it should still:

- Generate unguessable host/player session tokens
- Prevent players from using host actions
- Validate every socket message
- Limit answer length and submission frequency
- Escape rendered player content
- Avoid exposing one player’s private state to another
- Store no data outside the local server unless a future feature explicitly requires it
- Avoid privileged containers and mount only the required data directory

## 11. TrueNAS deployment notes

Target a Docker image plus Compose YAML suitable for TrueNAS SCALE ElectricEel Custom Apps. Store the database and user-created content in a dedicated dataset mounted into `/data`.

The application should display both:

```text
http://roomriot.local
http://<truenas-ip>:3000
```

The IP-based URL is the reliable fallback. Local DNS or mDNS can be documented as an optional convenience, not a requirement.

The display route should be designed as a TV-friendly responsive web view from the beginning. Later Android TV support can reuse that route through a dedicated Android wrapper or TV-optimized client without changing the game protocol.

## 12. Definition of done for the first release

The first release is complete when:

- The server runs as a TrueNAS SCALE application
- A host can start a room from another PC browser
- Players can join by QR code from phones
- At least 12 players can join a room
- Groupthink and Hot Take both run end-to-end
- Scores are calculated only by the server
- A player can reconnect without duplicating their identity
- The application works without internet access
- The database and custom content can be backed up
- Automated tests cover the room engine and game rules

## 13. Immediate next coding step

Install the tagged image on the physical TrueNAS SCALE ElectricEel server using `deploy/truenas/room-riot.compose.yaml`, run `node scripts/verify-deployment.mjs http://TRUENAS_IP:PORT`, and complete [docs/QA_CHECKLIST.md](./docs/QA_CHECKLIST.md). Once that physical validation passes, the next coding milestone can focus on the Android TV client or the next game module.
