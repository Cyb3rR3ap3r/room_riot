# Room Riot architecture decisions

## Roster lifecycle

The server owns the roster. A round freezes its active player IDs; late joins queue for the next
round, disconnects receive a bounded reclaim window, and leave/kick revokes the player token.

## Persistence

SQLite stores active-room snapshots, hashed session records, game slots, roster membership, and
deadline timestamps. The server restores only compatible, unexpired records and reports corrupt
records through readiness/metrics instead of making them playable.

## Audio

Audio is enhancement-only. Host/display controls persist mute and volume locally, cues are generated
from game-specific presentation data by the browser oscillator API, and an unavailable or blocked
AudioContext never blocks play. Cues are original procedural SFX rather than fetched media, are mixed
through one master gain, and are polyphony-compensated below a shared peak before the user volume is
applied. The AudioContext and gain graph are created only after the user enables sound.

## Typography

The web client self-hosts Latin subsets of Atkinson Hyperlegible for UI text and Baloo 2 for display
headings. Both packages are OFL-1.1 licensed; the build copies only the required WOFF2 files and the
license records into the public font asset directory. `font-display: swap`, explicit system fallbacks,
selective preloads, and tabular numeric features keep the controller readable while countdowns and
scores retain stable widths. The source and built assets are checked by `pnpm check:fonts`.

## Content

Curated packs are local JSON sources with a separate taxonomy/risk manifest and validator. The local
deterministic generator is called “Remix deck”; it is not a remote AI provider and works offline.

## Platform

The compiled Node server and browser bundle are the deployment boundary. TrueNAS uses a persistent
`/data` mount for SQLite, readiness for orchestration, and immutable image tags for rollback.
