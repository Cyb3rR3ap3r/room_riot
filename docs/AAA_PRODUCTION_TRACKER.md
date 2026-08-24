# Room Riot AAA production-readiness tracker

This is the execution backlog for taking Room Riot from a strong vertical slice to a polished,
production-ready party-game platform. It supersedes the open-ended polish notes in
`BUILD_PLAN.md`; completed historical remediation remains recorded in
`docs/REMEDIATION_TRACKING.md`.

The main product goal is a premium shared-screen experience with phone controls that never lose
player work, remain legible and responsive on real devices, and recover cleanly from ordinary
game-night failures.

## North-star quality bar

Room Riot is ready for a production release only when:

- no network update, reconnect, resize, or phase transition can erase an unsubmitted answer,
  vote, alibi, or drawing;
- the server owns and validates the room roster, per-game limits, scoring, deadlines, and phase
  transitions;
- host, player, and display flows are complete from room creation through rematch without forcing
  players to rejoin;
- the shared display is readable without scrolling or sub-minimum type at 1280x720, 1920x1080,
  and 3840x2160, including dense results and maximum-length names;
- phone controls keep the current action, countdown, and confirmation in the first practical
  viewport at 360x640 and above;
- every game has a distinct audiovisual identity within the shared neon-comic Room Riot system;
- curated content, accessibility, performance, security, recovery, and deployment gates pass in
  automation and on the target LAN.

## Tracker conventions

### Status

| Status        | Meaning                                                       |
| ------------- | ------------------------------------------------------------- |
| `Not started` | No implementation work has begun.                             |
| `Ready`       | Scope and dependencies are clear; work may start.             |
| `In progress` | Actively being implemented.                                   |
| `Blocked`     | Cannot proceed until a named decision or dependency is clear. |
| `In review`   | Implementation is complete and awaiting verification.         |
| `Done`        | Acceptance criteria and required verification have passed.    |

### Priority and effort

| Value | Meaning                                                                       |
| ----- | ----------------------------------------------------------------------------- |
| P0    | Release blocker: corrupts or loses game state, breaks the loop, or misroutes. |
| P1    | Required for a reliable, premium production release.                          |
| P2    | Important polish, maintainability, or operational improvement.                |
| P3    | Post-launch enhancement that should not block the first polished release.     |
| S     | Roughly 0.5–1 focused engineering day.                                        |
| M     | Roughly 2–4 focused engineering days.                                         |
| L     | Roughly 1–2 engineering weeks or a cross-cutting product slice.               |
| XL    | Multi-sprint initiative that should be split before implementation begins.    |

Estimates include focused automated tests but not lengthy physical-device or content playtests.

## Milestone plan

| Milestone | Outcome                                                        | Exit gate                                       | Status      |
| --------- | -------------------------------------------------------------- | ----------------------------------------------- | ----------- |
| M0        | Gameplay integrity and session safety                          | G0: no-loss gameplay gate                       | In progress |
| M1        | Maintainable client/server architecture                        | G1: architecture and contract gate              | In progress |
| M2        | AAA host, player, and shared-display experience                | G2: visual, interaction, and accessibility gate | Not started |
| M3        | Game-specific fairness, content, scoring, and presentation     | G3: complete vertical-slice gate                | In progress |
| M4        | Persistence, security, observability, and performance          | G4: production operations gate                  | In progress |
| M5        | Automated browser/device QA, deployment, and release readiness | G5: release-candidate gate                      | In progress |

## Recommended implementation order

1. Complete `AAA-001` through `AAA-008` before broad UI refactoring.
2. Establish the client shell and design system in `AAA-009` through `AAA-017`.
3. Build the premium host/player/display flows in `AAA-018` through `AAA-032`.
4. Correct game-specific fairness and content in `AAA-033` through `AAA-042`.
5. Add production infrastructure in `AAA-043` through `AAA-052`.
6. Enforce the release gates in `AAA-053` through `AAA-062`.

## Master backlog

| ID      | Milestone | Pri | Effort | Work item                                          | Depends on                | Status      |
| ------- | --------- | --- | ------ | -------------------------------------------------- | ------------------------- | ----------- |
| AAA-001 | M0        | P0  | M      | Preserve in-progress player input                  | —                         | Done        |
| AAA-002 | M0        | P0  | M      | Make URL/session room selection deterministic      | —                         | In review   |
| AAA-003 | M0        | P0  | L      | Define authoritative roster lifecycle              | Decision D-01             | Done        |
| AAA-004 | M0        | P0  | M      | Implement true leave, removal, and token revoke    | AAA-003                   | Done        |
| AAA-005 | M0        | P0  | M      | Enforce per-game player limits on the server       | AAA-003                   | Done        |
| AAA-006 | M0        | P0  | M      | Handle disconnects without deadline-only waits     | AAA-003, AAA-004          | Done        |
| AAA-007 | M0        | P1  | S      | Make join/action errors recoverable                | —                         | In review   |
| AAA-008 | M0        | P1  | M      | Add action idempotency and acknowledgement UX      | AAA-001                   | Done        |
| AAA-009 | M1        | P1  | XL     | Split the web monolith into route/game modules     | AAA-001                   | Done        |
| AAA-010 | M1        | P1  | L      | Introduce stable client stores and selectors       | AAA-009                   | Done        |
| AAA-011 | M1        | P1  | L      | Build incremental component rendering              | AAA-009, AAA-010          | In progress |
| AAA-012 | M1        | P1  | M      | Centralize a server game registry                  | AAA-005                   | Done        |
| AAA-013 | M1        | P1  | M      | Add runtime validation for server snapshots        | AAA-010                   | Done        |
| AAA-014 | M1        | P2  | M      | Extract and organize CSS                           | AAA-009                   | Done        |
| AAA-015 | M1        | P1  | L      | Establish the Room Riot design system              | AAA-014                   | Done        |
| AAA-016 | M1        | P2  | M      | Add reusable loading/error/empty states            | AAA-010, AAA-015          | Done        |
| AAA-017 | M1        | P2  | M      | Add component-level test harnesses                 | AAA-009, AAA-011          | Done        |
| AAA-018 | M2        | P1  | L      | Redesign the host launcher                         | AAA-015                   | Done        |
| AAA-019 | M2        | P1  | L      | Build the action-first phone controller            | AAA-011, AAA-015          | In progress |
| AAA-020 | M2        | P1  | L      | Build explicit TV density layouts                  | AAA-015                   | In progress |
| AAA-021 | M2        | P1  | M      | Make QR/join presentation phase-aware              | AAA-020, AAA-003          | In progress |
| AAA-022 | M2        | P1  | L      | Create premium phase transitions                   | AAA-020, AAA-024          | Not started |
| AAA-023 | M2        | P1  | L      | Redesign results, scoring, and winner moments      | AAA-020, AAA-037          | Not started |
| AAA-024 | M2        | P1  | M      | Add reduced-motion-safe motion tokens              | AAA-015                   | Not started |
| AAA-025 | M2        | P1  | L      | Replace prototype audio with a sound system        | Decision D-03, AAA-010    | Not started |
| AAA-026 | M2        | P1  | L      | Complete accessibility and focus behavior          | AAA-011, AAA-015          | Not started |
| AAA-027 | M2        | P1  | M      | Polish drawing controls and recovery               | AAA-001, AAA-019          | Not started |
| AAA-028 | M2        | P1  | M      | Add rematch/change-game/same-roster loop           | AAA-003, AAA-012          | Not started |
| AAA-029 | M2        | P2  | M      | Add host moderation and room controls              | AAA-003, AAA-004          | Not started |
| AAA-030 | M2        | P1  | M      | Optimize all raster assets                         | AAA-015                   | In progress |
| AAA-031 | M2        | P2  | M      | Introduce premium self-hosted typography           | Decision D-04, AAA-015    | Not started |
| AAA-032 | M2        | P2  | M      | Add haptics and tactile interaction feedback       | AAA-019                   | Not started |
| AAA-033 | M3        | P1  | S      | Shuffle Hot Take voting entries                    | —                         | Done        |
| AAA-034 | M3        | P1  | M      | Remove Suspect join-order bias                     | —                         | Done        |
| AAA-035 | M3        | P1  | S      | Correct Drawn Out progress accounting              | —                         | Done        |
| AAA-036 | M3        | P0  | M      | Bound Drawn Out accumulated drawing data           | AAA-005                   | In review   |
| AAA-037 | M3        | P1  | L      | Explain and rebalance scoring                      | Decision D-05             | Not started |
| AAA-038 | M3        | P1  | XL     | Author full curated content packs                  | Decision D-02             | Not started |
| AAA-039 | M3        | P1  | M      | Rename or replace local “AI remix”                 | Decision D-02             | Not started |
| AAA-040 | M3        | P1  | M      | Add content taxonomy and safety review             | AAA-038                   | Not started |
| AAA-041 | M3        | P2  | L      | Add deterministic balance simulations              | AAA-037                   | Not started |
| AAA-042 | M3        | P2  | M      | Add game-specific onboarding/tutorial beats        | AAA-018, AAA-019          | Not started |
| AAA-043 | M4        | P1  | XL     | Persist and restore active rooms                   | Decision D-06, AAA-012    | Not started |
| AAA-044 | M4        | P1  | M      | Harden room-code entropy and join locking          | AAA-003                   | Not started |
| AAA-045 | M4        | P1  | L      | Add layered connection/action rate limits          | AAA-044                   | Not started |
| AAA-046 | M4        | P1  | M      | Stabilize public error envelopes                   | AAA-013                   | Done        |
| AAA-047 | M4        | P1  | M      | Complete browser security headers                  | AAA-014                   | Done        |
| AAA-048 | M4        | P1  | L      | Add structured logs and operational metrics        | AAA-012                   | Not started |
| AAA-049 | M4        | P1  | L      | Define and meet performance budgets                | AAA-030                   | Not started |
| AAA-050 | M4        | P1  | M      | Add load and timer-drift testing                   | AAA-048                   | Not started |
| AAA-051 | M4        | P2  | M      | Add data migration, backup, and recovery drills    | AAA-043                   | Not started |
| AAA-052 | M4        | P2  | M      | Add health, readiness, and graceful-drain behavior | AAA-043, AAA-048          | Not started |
| AAA-053 | M5        | P0  | L      | Add multi-client browser E2E tests                 | AAA-001–AAA-008           | Not started |
| AAA-054 | M5        | P1  | L      | Add visual-regression coverage                     | AAA-018–AAA-031           | Not started |
| AAA-055 | M5        | P1  | M      | Add automated accessibility testing                | AAA-026                   | Not started |
| AAA-056 | M5        | P1  | M      | Add automated performance regression checks        | AAA-049                   | Not started |
| AAA-057 | M5        | P1  | M      | Run CI for pull requests                           | —                         | In review   |
| AAA-058 | M5        | P1  | L      | Harden image supply chain and releases             | AAA-057                   | Not started |
| AAA-059 | M5        | P1  | M      | Expand compiled deployment verification            | AAA-053                   | Not started |
| AAA-060 | M5        | P1  | M      | Update all product and operations documentation    | All implementation slices | Not started |
| AAA-061 | M5        | P1  | L      | Execute the physical LAN/device matrix             | AAA-053–AAA-060           | Not started |
| AAA-062 | M5        | P0  | M      | Complete release-candidate sign-off                | G0–G5                     | Not started |

## Detailed work items

### M0 — Gameplay integrity and session safety

#### AAA-001 — Preserve in-progress player input

**Outcome:** Public room updates and private-state updates never destroy an action that is still
being composed.

**Scope**

- Separate answer, vote, alibi, and drawing drafts from server snapshots.
- Stop replacing the complete player DOM for every `room:state` and `player:state` event.
- Preserve input value, selection, focus, scroll position, selected vote, canvas strokes, undo
  history, and validation feedback until the server accepts the action or the phase changes.
- Merge the public and private socket updates before rendering when they describe the same
  authoritative revision.

**Acceptance criteria**

- [x] A second player submitting cannot alter or erase the first player’s draft.
- [x] Reconnect within the same phase restores the local draft and current server state.
- [x] A genuine phase transition discards obsolete drafts with a clear confirmation state.
- [x] Tests cover text, targeted choice, vote, alibi, and drawing drafts.

**Verification:** multi-client browser E2E; focused client-state unit tests; iOS Safari background
and restore check.

#### AAA-002 — Make URL/session room selection deterministic

**Outcome:** The room shown in the UI, URL, socket binding, and saved session always agree.

**Scope**

- Treat an explicit room code in the URL as a new join intent.
- Store player and host sessions by room instead of one global slot.
- When URL and stored session conflict, offer explicit reconnect/join choices.
- Canonicalize the route and query after every successful join or reconnect.

**Acceptance criteria**

- [x] Opening room B while room A is saved never silently displays room A.
- [x] Refreshing after a manual room-code edit reconnects to the canonical room.
- [x] Two tabs may participate in different rooms without overwriting each other’s session.
- [x] Invalid or expired sessions retain the requested room and entered player name.

**Verification:** browser tests for QR entry, manual code entry, two tabs, stale tokens, and route
canonicalization.

#### AAA-003 — Define authoritative roster lifecycle

**Outcome:** Every game uses one explicit policy for lobby players, active-round participants,
late arrivals, spectators, reconnects, and removals.

**Default proposal:** Joining remains open during play, but a late player spectates the current
round and becomes active at the next-round boundary. The host may lock joining at any time.

**Acceptance criteria**

- [x] A frozen `roundPlayerIds` roster drives eligibility, progress, completion, and scoring.
- [x] Public snapshots distinguish lobby, active, queued, spectator, disconnected, and removed
      states where relevant.
- [x] All four games apply the same lifecycle policy.
- [x] Reconnect never creates a duplicate player.
- [x] Late join never changes the denominator or outcome of an in-progress round.

**Verification:** room-manager lifecycle matrix plus one browser test for each game.

#### AAA-004 — Implement true leave, removal, and token revoke

**Outcome:** “Leave Room” removes the player intentionally rather than only disconnecting them.

**Acceptance criteria**

- [x] Voluntary leave revokes the player token and frees room capacity.
- [x] Host removal revokes the token and prevents automatic rejoin.
- [x] Mid-round removal follows the roster policy without corrupting scoring.
- [x] Host “Close Room” removes the room and invalidates all tokens.
- [x] Disconnect remains distinct from leave and retains a reconnect grace period.

**Verification:** room-manager and socket tests for leave, reconnect, kick, close, and stale-token
rejection.

#### AAA-005 — Enforce per-game player limits on the server

**Outcome:** Client labels, contracts, room settings, and authoritative server validation agree.

**Acceptance criteria**

- [x] A shared server registry defines minimum, recommended, and maximum players per game/mode.
- [x] Room creation and start reject unsupported limits with a stable error.
- [x] Groupthink cannot start empty.
- [x] Drawn Out cannot exceed its verified drawing/layout capacity.
- [x] The host UI reads limits from shared metadata instead of duplicating constants.

**Verification:** negative tests for every min/max boundary and direct socket requests that bypass
the UI.

#### AAA-006 — Handle disconnects without deadline-only waits

**Outcome:** A permanently disconnected player cannot force every remaining round to consume its
full deadline.

**Acceptance criteria**

- [x] A configurable reconnect grace period is server-owned.
- [x] Host may skip or remove a disconnected participant.
- [x] Completion checks use the active round roster after policy-approved removal.
- [x] The display and host show reconnect/grace status without exposing private state.
- [x] Rejoining during grace restores the same identity and prior submission.

**Verification:** fake timers and multi-client disconnect/reconnect tests in every interactive
phase.

#### AAA-007 — Make join/action errors recoverable

**Acceptance criteria**

- [x] Invalid room, full room, expired token, deadline, and invalid-phase messages remain visible.
- [x] User-entered room, name, answer, and selected options survive recoverable failures.
- [x] Every submit control re-enables after error or acknowledgement timeout.
- [x] Error messages include the next useful action and are announced accessibly.

#### AAA-008 — Add action idempotency and acknowledgement UX

**Acceptance criteria**

- [x] Mutating requests carry a client action ID and duplicate delivery is safe.
- [x] Controls show pending, accepted, rejected, and retry states.
- [x] Acknowledgement timeout never causes duplicate scoring or submission.
- [x] Host double-clicks cannot advance two phases or two rounds.

### M1 — Maintainable architecture and design foundation

#### AAA-009 — Split the web monolith into route/game modules

**Target structure**

```text
apps/web/src/
  app/
  routes/host/
  routes/player/
  routes/display/
  games/groupthink/
  games/hot-take/
  games/suspect/
  games/drawn-out/
  components/
  state/
  drawing/
  audio/
  styles/
```

**Acceptance criteria**

- [x] Host, player, and display shells are independently testable.
- [x] Each game owns its phase-specific views without a central conditional chain.
- [x] Shared components contain no game-rule decisions.
- [x] Existing gameplay behavior is preserved by characterization tests.

#### AAA-010 — Introduce stable client stores and selectors

- [x] Connection, session, public snapshot, private state, local draft, and preferences are
      separate stores.
- [x] Selectors expose only the state needed by each component.
- [x] Socket events include or derive a monotonic room revision to reject stale updates.
- [x] Stored session data is versioned and safely migrated or discarded.

#### AAA-011 — Build incremental component rendering

- [x] Stable components retain DOM identity across unrelated room updates.
- [x] Focus is not lost when counters, roster status, or deadlines change.
- [x] Drawing canvas and audio context are not recreated by ordinary snapshots.
- [ ] Render profiling shows no full-page rebuild for a single-player submission.

#### AAA-012 — Centralize a server game registry

- [x] Registry owns IDs, packages, limits, modes, durations, routes, and capability metadata.
- [x] Room manager dispatch uses registry adapters instead of repeated game-ID branches.
- [x] HTTP routes, client catalog, deployment checks, and Docker integration are derived or
      validated against the registry.
- [x] Adding a game fails validation until every required adapter is registered.

#### AAA-013 — Add runtime validation for server snapshots

- [x] Shared Zod schemas cover public room state and each public/private game view.
- [x] Browser rejects malformed or incompatible snapshots without crashing.
- [x] Protocol includes a version and safe incompatibility message.
- [x] Privacy tests prove unrevealed answers and roles do not enter public schemas.

#### AAA-014 — Extract and organize CSS

- [x] Inline CSS moves to namespaced source files compiled into one fingerprinted bundle.
- [x] Shared tokens, components, routes, and game themes have clear ownership.
- [x] `unsafe-inline` can be removed from `style-src`.
- [x] No global selector unintentionally changes another game’s controller or display.

#### AAA-015 — Establish the Room Riot design system

Define and document:

- palette and contrast roles;
- spacing, radius, outline, elevation, and halftone tokens;
- display and controller typography scales;
- button, card, roster, prompt, countdown, progress, notice, modal, and score components;
- motion durations/easing and sound event names;
- safe-area, TV overscan, pointer, keyboard, and touch target rules.

**Acceptance criteria:** a component showcase covers default, hover, focus, active, disabled,
loading, success, warning, and error states in all four themes.

#### AAA-016 — Add reusable loading/error/empty states

- [x] Initial connect, reconnect, missing room, full room, server unavailable, stale session, and
      incompatible client have designed states.
- [x] No page displays an indefinite spinner without timeout or recovery action.
- [x] Host and player can copy diagnostic information without exposing bearer tokens.

#### AAA-017 — Add component-level test harnesses

- [x] Render every shared component and production game-phase view with fixture snapshots.
- [x] Test keyboard behavior, focus retention, draft preservation, and long content.
- [x] Fixture generator supports 0, 1, minimum, maximum, and dense/tied results states.

### M2 — AAA host, player, and display experience

#### AAA-018 — Redesign the host launcher

- [x] Desktop uses balanced space rather than a narrow column and empty canvas.
- [x] Mobile keeps game choice, essential settings, and Create Game within a short guided flow.
- [x] Advanced settings use progressive disclosure.
- [x] Selected game shows mechanics, duration, player range, content rating, and controller needs.
- [x] Primary CTA remains visible and includes validation guidance.

#### AAA-019 — Build the action-first phone controller

- [ ] Current action, deadline, and primary control appear in the first practical viewport.
- [ ] Decorative art collapses during action phases and expands for waiting/results.
- [ ] Inputs support draft recovery, character counts, clear confirmation, and retry.
- [ ] Waiting state shows exactly what was accepted and what happens next.
- [ ] Layout passes portrait, landscape, safe-area, large-text, and virtual-keyboard tests.

#### AAA-020 — Build explicit TV density layouts

- [ ] Replace unlimited whole-screen shrinking with regular, compact, and paged result layouts.
- [ ] Minimum body type is 24 px at 1080p-equivalent rendering; critical prompts are larger.
- [ ] 5% overscan-safe margins protect all essential state.
- [ ] Maximum players, longest names/prompts, ties, and empty results fit without page scroll.
- [ ] 720p, 1080p, and 4K screenshots pass visual review for every phase.

#### AAA-021 — Make QR/join presentation phase-aware

- [ ] Full join instructions and QR dominate only the lobby.
- [ ] During play, an optional compact join badge replaces the full panel.
- [ ] Join-lock state is visible and QR never advertises an unusable flow.
- [ ] Address wrapping/truncation never makes the manual URL ambiguous.

#### AAA-022 — Create premium phase transitions

- [ ] Each game has distinct intro, input, reveal, scoring, and winner choreography.
- [ ] State is legible before decoration begins.
- [ ] Animation does not block host control or delay server-authoritative transitions.
- [ ] Reduced-motion mode uses fades/state cuts without loss of information.
- [ ] Interrupted/reconnected clients settle directly into the current state.

#### AAA-023 — Redesign results, scoring, and winner moments

- [ ] Results visually explain the cause of every score change.
- [ ] Ties, zero-score rounds, no submissions, and no eligible votes receive authored treatments.
- [ ] Score changes animate from prior totals without changing authoritative values.
- [ ] Winner view supports ties, podium/leaderboard, rematch, and change-game actions.

#### AAA-024 — Add reduced-motion-safe motion tokens

- [ ] All animation uses documented tokens and can be disabled centrally.
- [ ] Continuous decorative motion pauses when the page is hidden.
- [ ] No flashing violates WCAG thresholds.
- [ ] Motion performance stays within frame-time budgets on target phones/TV browser.

#### AAA-025 — Replace prototype audio with a sound system

- [ ] Game-specific cues cover join, countdown, lock-in, reveal, score, and winner.
- [ ] Persistent mute and volume controls are available on host/display.
- [ ] Audio unlock failure has a clear visual state and the game remains fully usable.
- [ ] Cues are mixed, normalized, licensed/original, and lazy-loaded.
- [ ] Every audio-only cue has a visual equivalent.

#### AAA-026 — Complete accessibility and focus behavior

- [ ] Phase changes move focus only when helpful and announce one concise update.
- [ ] Voting uses semantic groups with a clear selected state.
- [ ] All interactive targets are keyboard operable and at least 44x44 CSS pixels.
- [ ] Text/background combinations pass WCAG AA; critical status does not rely on color alone.
- [ ] 200% zoom and increased text size do not hide primary controls.
- [ ] Automated checks have no serious/critical violations; manual screen-reader paths pass.

#### AAA-027 — Polish drawing controls and recovery

- [ ] Canvas survives reconnects and unrelated snapshots.
- [ ] Undo/redo, clear confirmation, stroke budget, brush identity, and submission state are clear.
- [ ] Pointer cancellation, orientation changes, palm/scroll conflicts, and coarse pointers are
      tested.
- [ ] Existing shared drawing and new strokes are visually distinct where the mechanic needs it.
- [ ] The host can disable drawing games/modes for accessibility or device constraints.

#### AAA-028 — Add rematch/change-game/same-roster loop

- [ ] Winner screen supports rematch, adjust settings, change game, and close room.
- [ ] Players stay connected and explicitly confirm readiness for the next game.
- [ ] Scores reset or carry only through an explicit host choice.
- [ ] Private game state is cleared before the new lobby snapshot is sent.

#### AAA-029 — Add host moderation and room controls

- [ ] Host can lock joining, remove a player, skip a disconnected player, pause/resume, and end
      the room.
- [ ] Destructive actions require clear confirmation.
- [ ] Display/player views explain pauses and removals without leaking tokens or private answers.

#### AAA-030 — Optimize all raster assets

- [x] Opaque scenes ship as AVIF/WebP with PNG fallback only if necessary.
- [x] Transparent art is quantized or converted to lossless WebP after alpha verification.
- [ ] Multiple responsive sizes avoid decoding oversized art on phones.
- [ ] Non-selected catalog art is lazy-loaded.
- [ ] Initial host, player, and display transfers meet `AAA-049` budgets.

#### AAA-031 — Introduce premium self-hosted typography

- [ ] Licensed display and UI families reinforce the comic brand and remain readable at distance.
- [ ] Numeric glyphs support stable countdown/score widths.
- [ ] Fonts are subsetted, self-hosted, preloaded selectively, and have acceptable fallbacks.
- [ ] No text is baked into generated art.

#### AAA-032 — Add haptics and tactile interaction feedback

- [ ] Supported phones provide subtle feedback for selection, lock-in, error, and reveal.
- [ ] Haptics respect reduced-motion/system preference and can be disabled.
- [ ] Buttons have immediate pressed/loading feedback even under network latency.

### M3 — Game fairness, content, and presentation

#### AAA-033 — Shuffle Hot Take voting entries

- [x] Entry order is shuffled exactly once when voting opens and remains stable.
- [x] Order is independent of player join order and submission timing.
- [x] Voters never see their own entry; public results map correctly to owners/scores.

#### AAA-034 — Remove Suspect join-order bias

- [x] Suspect selection uses a seeded, testable fairness policy.
- [x] Selection history prevents the same eligible player from being repeatedly favored.
- [x] Double Trouble does not always choose the earliest two joiners.
- [x] Simulations demonstrate acceptable exposure distribution.

#### AAA-035 — Correct Drawn Out progress accounting

- [x] Telephone excludes the initial seed phrase from completed-player count.
- [x] Fake Artist reflects completed drawing turns.
- [x] Classic distinguishes drawing completion from guesses received.
- [x] Progress denominator uses the frozen round roster.

#### AAA-036 — Bound Drawn Out accumulated drawing data

- [x] Per-turn and total stroke/point budgets are mutually consistent.
- [x] Maximum supported players can all complete maximum valid turns.
- [ ] Older strokes may be simplified without visible corruption when nearing limits.
- [x] Oversized input returns a stable game error, never an internal Zod message.

#### AAA-037 — Explain and rebalance scoring

- [ ] Design notes document scoring intent, comeback potential, ties, and degenerate rounds.
- [ ] Result UI explains every award in plain language.
- [ ] Simulations flag runaway leaders and join-order advantages.
- [ ] Scoring changes include migration/compatibility notes and focused tests.

#### AAA-038 — Author full curated content packs

- [ ] Approximately 100 genuinely authored prompts exist per game and content mode.
- [ ] Packs follow a recorded taxonomy instead of reaching count through noun substitution.
- [ ] IDs and normalized text are unique within the required scope.
- [ ] Prompts pass content-mode, answerability, length, and safety review.
- [ ] Playtest feedback and retirement notes are tracked without collecting sensitive answers.

#### AAA-039 — Rename or replace local “AI remix”

- [ ] Deterministic/local generation is labeled “Remix deck” rather than AI.
- [ ] If remote generation is added, it is an explicitly configured provider with moderation,
      deduplication, length limits, timeout, audit metadata, and curated fallback.
- [ ] Offline behavior is truthful and tested.

#### AAA-040 — Add content taxonomy and safety review

- [ ] Each pack records categories, audience, expected answer shape, and risk tags.
- [ ] After-dark content remains consensual and excludes coercion, minors, hate, trauma pressure,
      doxxing, and unsafe disclosure.
- [ ] Player-targeted prompts have an opt-out/skip policy.
- [ ] Validator enforces schema, counts, normalized uniqueness, and permitted kinds.

#### AAA-041 — Add deterministic balance simulations

- [ ] Seeded simulations cover 2–maximum players, ties, disconnects, no input, and deadline paths.
- [ ] Reports track score spread, target exposure, voting eligibility, and round duration.
- [ ] Thresholds fail CI for known bias/regression classes.

#### AAA-042 — Add game-specific onboarding/tutorial beats

- [ ] Lobby explains the core action in one sentence and one visual example.
- [ ] First round introduces controls without extending all later rounds.
- [ ] Host/display/player instructions agree on phase and vocabulary.
- [ ] Tutorials are skippable and do not expose private information.

### M4 — Production operations, security, and performance

#### AAA-043 — Persist and restore active rooms

- [ ] SQLite stores room state, roster, tokens or safely derived token records, game session, and
      deadlines transactionally.
- [ ] Restart restores playable snapshots and reschedules deadlines using wall-clock truth.
- [ ] Corrupt/incompatible records fail closed with an actionable host state.
- [ ] Schema migrations, backups, and restoration are tested.
- [ ] Secrets/tokens are not written to logs.

#### AAA-044 — Harden room-code entropy and join locking

- [ ] Default room codes provide materially more entropy than four characters.
- [ ] Host can lock/unlock joins and the display reflects the state.
- [ ] Unknown-room responses do not create an efficient enumeration oracle.
- [ ] Existing QR/manual entry remains fast and readable.

#### AAA-045 — Add layered connection/action rate limits

- [ ] Limits cover room creation, failed joins, successful joins, display watches, reconnects, and
      action bursts.
- [ ] Limits use trusted proxy configuration and cannot be bypassed by reconnecting one socket.
- [ ] Legitimate 12-player reconnect storms pass.
- [ ] Rejection metrics and retry guidance are available.

#### AAA-046 — Stabilize public error envelopes

- [x] Expected failures map to documented codes and user-safe messages.
- [x] Unexpected exceptions receive a correlation ID and generic client message.
- [x] Internal paths, parser details, and stack information never reach clients.
- [x] Host and player UIs map codes to useful recovery actions.

#### AAA-047 — Complete browser security headers

- [x] Remove `unsafe-inline` from styles after `AAA-014`.
- [x] Add `frame-ancestors`, Permissions-Policy, and suitable cross-origin policies.
- [x] HSTS is enabled only for documented HTTPS deployments.
- [x] WebSocket, QR, reverse-proxy, and static-asset behavior pass after tightening CSP.

#### AAA-048 — Add structured logs and operational metrics

- [ ] Logs cover startup/shutdown, room lifecycle, phase transitions, recoverable errors, and
      persistence failures.
- [ ] Metrics cover active rooms/players, socket connections, reconnects, event latency, timer
      drift, rejected actions, and process health.
- [ ] Player-entered text and bearer tokens are never logged.
- [ ] A game-night diagnostic guide identifies the useful signals.

#### AAA-049 — Define and meet performance budgets

Initial proposed budgets, subject to measurement on target hardware:

| Surface    | Initial transfer | Largest Contentful Paint   | Interaction feedback   | Runtime target           |
| ---------- | ---------------- | -------------------------- | ---------------------- | ------------------------ |
| Phone join | <= 1.5 MB        | <= 2.5 s on slow LAN/Wi-Fi | <= 100 ms local        | No long tasks > 100 ms   |
| Phone game | <= 2.5 MB total  | <= 2.5 s                   | <= 100 ms local        | 55–60 fps drawing/motion |
| Host       | <= 3 MB initial  | <= 2.5 s                   | <= 150 ms local        | No full-page rerender    |
| TV display | <= 4 MB initial  | <= 3 s                     | Phase update <= 250 ms | 55–60 fps motion         |

- [ ] Budgets are measured from a cold cache and enforced in CI.
- [ ] Fonts/images are lazy-loaded or preloaded based on actual route need.
- [ ] Display fitting avoids repeated all-descendant layout measurement.

#### AAA-050 — Add load and timer-drift testing

- [ ] Simulate the supported room count and maximum players per room.
- [ ] Measure event latency, memory, CPU, and deadline drift under reconnect/action bursts.
- [ ] Confirm cleanup and persistence do not block Socket.IO event handling.
- [ ] Define capacity limits and operational alerts from results.

#### AAA-051 — Add data migration, backup, and recovery drills

- [ ] Versioned migrations run automatically and can be rehearsed against a backup copy.
- [ ] Document backup frequency, retention, restore, and rollback.
- [ ] A container replacement restores expected rooms/settings without source mounts.

#### AAA-052 — Add health, readiness, and graceful-drain behavior

- [ ] Liveness checks process health; readiness checks content, persistence, and realtime startup.
- [ ] Shutdown stops new rooms/actions, drains acknowledgements, persists state, then closes.
- [ ] Forced shutdown and partial startup failures are tested.

### M5 — Quality automation and release readiness

#### AAA-053 — Add multi-client browser E2E tests

Required scenarios:

- simultaneous typing while other players submit;
- QR join with conflicting saved session;
- leave, kick, reconnect grace, and late join;
- host reconnect and superseded player socket;
- complete happy path for every game/mode;
- deadline, empty, tie, invalid, and maximum-player cases;
- drawing orientation/pointer cancellation and recovery;
- rematch, change game, and close room.

#### AAA-054 — Add visual-regression coverage

- [ ] Capture host, player, and display phases for every game.
- [ ] Cover 360x640, 390x844, phone landscape, 1280x720, 1920x1080, and 3840x2160.
- [ ] Include maximum names, longest prompts, full rosters, ties, errors, and reconnect states.
- [ ] Review diffs intentionally when art/design changes.

#### AAA-055 — Add automated accessibility testing

- [ ] Run axe or equivalent against every route/phase fixture.
- [ ] Add keyboard-only flow tests and focus assertions.
- [ ] Manual screen-reader checklist covers join, submit, vote, error, and results.
- [ ] Document drawing-mode limitations and alternatives.

#### AAA-056 — Add automated performance regression checks

- [ ] CI records transfer size, LCP, layout shift, long tasks, and critical interaction latency.
- [ ] Asset-size and decoded-dimension checks fail oversize additions.
- [ ] Drawing and display animation have frame-time regression scenarios.

#### AAA-057 — Run CI for pull requests

- [x] Pull requests run install, typecheck, tests, lint, format, build, content validation, and
      compiled route verification.
- [ ] Required checks block merge to `main`.
- [ ] Expensive browser/image jobs use appropriate caching and changed-path filters without
      silently skipping required integration coverage.

#### AAA-058 — Harden image supply chain and releases

- [ ] Production dependency and container vulnerability scans run with documented policy.
- [ ] Build produces SBOM and provenance attestations.
- [ ] GitHub Actions are pinned according to the project’s supply-chain policy.
- [ ] Releases use immutable semantic tags plus commit SHA; rollback is rehearsed.
- [ ] Multi-architecture needs are explicitly decided and tested.

#### AAA-059 — Expand compiled deployment verification

- [ ] Smoke test creates a room, joins players, starts a game, performs actions, and reconnects.
- [ ] Verify security/cache headers, all assets, Socket.IO, QR origin, readiness, and graceful stop.
- [ ] Run against compiled server and built container, not only TypeScript development output.

#### AAA-060 — Update all product and operations documentation

- [ ] README accurately lists all games, modes, requirements, and limitations.
- [ ] QA checklist covers Suspect and Drawn Out plus rematch/moderation/persistence.
- [ ] Deployment guide matches readiness, persistence, backup, HTTPS/proxy, and observability.
- [ ] Architecture decision records capture roster, persistence, audio, content, and platform
      decisions.

#### AAA-061 — Execute the physical LAN/device matrix

Minimum matrix:

- current and previous major iOS Safari;
- current Android Chrome across a low/mid/high-range device;
- desktop Chrome, Edge, Firefox, and Safari where available;
- target TV browser/Android TV at 720p, 1080p, and 4K;
- 1, minimum, recommended, and maximum supported player counts;
- stable, slow, intermittent, and reconnect-storm network conditions;
- sound enabled/disabled, reduced motion, large text, and keyboard/screen-reader passes.

#### AAA-062 — Complete release-candidate sign-off

- [ ] G0 through G5 pass on the exact release commit and container image.
- [ ] No open P0/P1 defects; accepted P2/P3 items have documented rationale.
- [ ] Dependency/container audit is current and reviewed.
- [ ] Backup, restore, rollback, and monitoring checks have named evidence.
- [ ] A complete multi-device game night succeeds without lost input, stuck rooms, clipped TV
      layouts, or unrecoverable reconnects.

## Release gates

### G0 — No-loss gameplay gate

- `AAA-001` through `AAA-008` are Done.
- Multi-client tests prove drafts survive unrelated updates and reconnects.
- Every supported player count and roster transition is server-valid.

### G1 — Architecture and contract gate

- `AAA-009` through `AAA-017` are Done.
- Client features no full-page rerender for routine snapshots.
- Protocol/runtime schema incompatibilities fail safely.

### G2 — AAA experience gate

- `AAA-018` through `AAA-032` are Done or explicitly waived with evidence.
- Visual regression, accessibility, and performance budgets pass.
- Design review approves all host/player/display phases for every game.

### G3 — Complete vertical-slice gate

- `AAA-033` through `AAA-042` are Done.
- Content validator passes without low-source-count or cross-mode-duplicate warnings.
- Fairness simulations and scoring explanations are approved.

### G4 — Production operations gate

- `AAA-043` through `AAA-052` are Done.
- Restart recovery, rate limits, security headers, load limits, and diagnostics are verified.
- Backup/restore and graceful-drain drills have recorded evidence.

### G5 — Release-candidate gate

- `AAA-053` through `AAA-062` are Done.
- Exact production image passes automated and physical-device checks.
- Release notes list known limitations and rollback instructions.

## Decision log

These decisions do not block starting `AAA-001`, `AAA-002`, `AAA-005`, or `AAA-007`.

| ID   | Decision needed                                                | Recommended default                                                    | Needed before |
| ---- | -------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------- |
| D-01 | Late-join behavior during an active round                      | Spectate current round; activate at next-round boundary                | AAA-003       |
| D-02 | Content strategy and whether remote model generation is wanted | 100 curated prompts/mode; call local generation “Remix deck”           | AAA-038       |
| D-03 | Audio production scope                                         | Original SFX/stingers first; music beds after interaction polish       | AAA-025       |
| D-04 | Font licensing/budget                                          | Self-host one display variable font and one compact UI family          | AAA-031       |
| D-05 | Score reset/carry and balance philosophy                       | Reset per game; prioritize comeback potential and legible explanations | AAA-037       |
| D-06 | Persistence boundary                                           | SQLite active-room recovery plus settings; no account system initially | AAA-043       |
| D-07 | First production platform target                               | LAN web app on TrueNAS, 720p/1080p/4K display, iOS/Android controllers | G2/G4         |

Record decisions here using: date, decision, rationale, approver, and affected work-item IDs.

## Per-item completion template

Use this when moving an item to `In review` or `Done`:

```markdown
### AAA-NNN completion record

- Owner:
- Pull request/commit:
- Behavior changed:
- Automated verification:
- Manual/device verification:
- Screenshots or recordings:
- Performance/accessibility impact:
- Known limitations or follow-ups:
- Date accepted:
```

### AAA-001 completion record

- Owner: Codex / client M0 implementation stream
- Pull request/commit: Working tree; not committed
- Behavior changed: Per-tab, per-room action drafts survive unrelated snapshots and reconnects;
  stable action identity avoids rebuilding active controls. Switching rooms in the same tab now
  reloads the selected room's draft instead of carrying the previous room's in-memory draft.
- Automated verification: 35 web tests cover action-key invalidation and round-trip/isolation for
  text, target, vote, alibi, drawing strokes, and undo state; full `pnpm check` and build passed.
- Manual/device verification: Groupthink draft survived a real reload/reconnect at 390×844 after
  fixing pre-snapshot invalidation; multi-client and iOS background/restore coverage remain.
- Performance/accessibility impact: Routine snapshot updates coalesce and preserve focus/scroll.
- Known limitations or follow-ups: Cross-browser background/restore remains in AAA-053.
- Date accepted: 2026-08-24

### AAA-002 completion record

- Owner: Codex / client M0 implementation stream
- Pull request/commit: Working tree; not committed
- Behavior changed: Host/player sessions are room-keyed with legacy migration; explicit URL intent
  wins and successful connections canonicalize the route.
- Automated verification: web typecheck, production build, ESLint, and Prettier passed.
- Manual/device verification: Explicit room B correctly overrode saved room A and retained the
  saved player name; remaining QR, stale-token, edited-URL, and two-room-tab matrix is pending.
- Performance/accessibility impact: No material runtime cost.
- Known limitations or follow-ups: Browser automation remains under AAA-053. Opening the same
  saved player in a second tab force-disconnects the first while its message incorrectly promises
  automatic reconnect; resolve with the lifecycle/client-store work.
- Date accepted: Pending review

### AAA-003 completion record

- Owner: Codex / roster lifecycle implementation stream
- Pull request/commit: Working tree; not committed
- Behavior changed: A frozen active-round roster now queues late joins until the next round across
  all four games without changing progress, scoring, or private eligibility.
- Automated verification: server typecheck; 5 HTTP tests; 20 room-manager tests; focused lint and
  formatting.
- Manual/device verification: Pending host/player/display lifecycle browser test.
- Performance/accessibility impact: Small bounded roster arrays are included in snapshots.
- Known limitations or follow-ups: Client spectator/grace presentation is refined further in
  AAA-006/AAA-019.
- Date accepted: 2026-08-24

### AAA-004 completion record

- Owner: Codex / true-leave implementation stream
- Pull request/commit: Working tree; not committed
- Behavior changed: Voluntary leave and host kick revoke tokens and free capacity; Close Room
  deletes the room and invalidates every session. Mid-round removals remain as frozen-roster
  tombstones, are excluded from completion/scoring, and purge at the round boundary.
- Automated verification: all workspace typechecks; 35/35 server tests including leave, stale
  token, kick, close, and mid-round removal; full ESLint and Prettier passed.
- Manual/device verification: Functional controls are present; browser moderation/removal flow is
  pending AAA-053 coverage.
- Performance/accessibility impact: Bounded tombstones last only through the current round; player
  removal and room closure use explicit client notices.
- Known limitations or follow-ups: Configurable disconnect grace and host skip behavior remain in
  AAA-006; moderation styling is intentionally basic pending AAA-029.
- Date accepted: 2026-08-24

### AAA-005 completion record

- Owner: Codex / server-limits implementation stream
- Pull request/commit: Working tree; not committed
- Behavior changed: Shared per-game/mode limits drive room defaults, authoritative create/start
  validation, and host launch/action gating, including empty Groupthink rejection and a ten-player
  Drawn Out cap.
- Automated verification: server boundary/socket coverage plus client catalog/presentation
  invariants for every game and all three Drawn Out modes passed.
- Manual/device verification: Live Groupthink host gating matched the one-player contract; the
  maximum-density Drawn Out layout remains part of AAA-053/AAA-061.
- Performance/accessibility impact: Constant-time metadata lookup only.
- Known limitations or follow-ups: Maximum-density visual validation remains tracked separately.
- Date accepted: 2026-08-24

### AAA-006 completion record

- Owner: Codex / disconnect-grace implementation stream
- Pull request/commit: Working tree; not committed
- Behavior changed: Disconnects receive a configurable server-owned grace period (15 seconds by
  default); reconnect preserves identity/private submission, while expiry revokes the token and
  reconciles completion across all four games. Host skip, visible countdowns, and truthful
  session-replaced notices are wired through server and client.
- Automated verification: full workspace typecheck/build; 38/38 server tests including four-game
  deterministic expiry and live socket replacement; full ESLint and Prettier passed.
- Manual/device verification: Grace countdown and skip controls still need multi-device browser
  observation under AAA-053.
- Performance/accessibility impact: Per-player timers are cleared on reconnect/removal/room close;
  roster text exposes status without private state.
- Known limitations or follow-ups: During a tombstoned Drawn Out round, its public `totalPlayers`
  retains the embedded round order even though completion uses the approved active roster.
- Date accepted: 2026-08-24

### AAA-007 completion record

- Owner: Codex / client M0 implementation stream
- Pull request/commit: Working tree; not committed
- Behavior changed: Errors persist with recovery guidance, drafts remain intact, and controls
  re-enable on error or an eight-second acknowledgement timeout.
- Automated verification: web typecheck, production build, ESLint, and Prettier passed.
- Manual/device verification: Invalid-room browser test retained room/name, kept the error visible,
  and re-enabled Join; screen-reader and network-failure passes remain.
- Performance/accessibility impact: Persistent notices use the existing accessible live region.
- Known limitations or follow-ups: Retry deduplication is tracked in AAA-008.
- Date accepted: Pending review

### AAA-008 completion record

- Owner: Codex / action-idempotency implementation stream
- Pull request/commit: Working tree; not committed
- Behavior changed: Every mutating socket request carries a UUID; server receipts prevent repeated
  mutations for the same actor/event/action key. Bootstrap create/join receipts now survive socket
  replacement, rebind the original identity, and reject altered payloads.
- Automated verification: live socket coverage includes duplicate host start, player submit,
  next-round delivery, lost create/join acknowledgement followed by socket replacement,
  altered-payload conflicts, actor isolation, deterministic capacity pressure, and TTL release.
- Manual/device verification: Pending network-throttled browser observation; server semantics are
  covered automatically.
- Performance/accessibility impact: Actor-partitioned bounded receipts fail closed before mutation;
  controls expose visible Sending/retry feedback.
- Known limitations or follow-ups: Cross-process receipts need shared storage before horizontal
  scaling; the current single-process deployment is protected.
- Date accepted: 2026-08-24

### AAA-009 / AAA-010 / AAA-017 foundation progress record

- Owner: Codex / client architecture implementation stream
- Pull request/commit: Working tree; not committed
- Behavior changed: Catalog, routes, per-game presentation, route-shell view models,
  sessions/drafts, pending bootstrap operations, action identity, and observable state domains now
  live in focused modules. Exact create/join payload retries preserve their UUID in per-tab storage
  and room-local revisions prevent delayed public or private updates from moving the UI backward.
  Typed registry adapters now dispatch each public-stage and player-controller renderer without a
  central game-specific conditional chain.
- Automated verification: 91 web tests cover schema-valid public/private fixtures over every game
  status and five population densities, direct production public-stage and player-controller
  renderers, retained-component composition, keyboard submit, focus/selection identity, draft
  invalidation, and long-content coverage. The production browser artifact remains a
  dependency-aware, import-free esbuild bundle.
- Manual/device verification: Live DOM behavior is covered for current host/player/display flows;
  production game-phase renderers still need direct fixture adapters before AAA-017 is Done.
- Performance/accessibility impact: Selector subscriptions avoid notifications for unrelated
  selected state; current page rendering behavior is intentionally preserved.
- Known limitations or follow-ups: `main.ts` still owns phase DOM, socket/form orchestration, and
  drawing lifecycle. AAA-011 still needs render profiling for a single-player submission.
- Date accepted: AAA-009 and AAA-017 accepted; AAA-011 remains in progress

### AAA-012 completion record

- Owner: Codex / server registry implementation stream
- Pull request/commit: Working tree; not committed
- Behavior changed: One typed registry now owns every supported game's package, limits, modes,
  durations, routes, capabilities, prompt loading, lifecycle actions, deadlines, and public/private
  projections. HTTP exposes the same manifest at `/api/games` and page routing is derived from it.
- Automated verification: server typecheck; 42/42 registry, HTTP, room-manager, and socket tests;
  Drawn Out 8/8; focused ESLint and Prettier.
- Manual/device verification: Compiled live-manifest and route verification remains part of the
  final combined gate.
- Performance/accessibility impact: Constant-time adapter lookup replaces cross-game conditional
  dispatch; no presentation behavior changes.
- Known limitations or follow-ups: Compatibility entry points and removed-player reconciliation
  retain typed per-game guards; shared lifecycle dispatch is registry-driven.
- Date accepted: 2026-08-24

### AAA-013 completion record

- Owner: Codex / protocol hardening implementation stream
- Pull request/commit: Working tree; not committed
- Behavior changed: Protocol v1 snapshots and room-correlated private envelopes are validated by
  the same strict Zod schemas in contracts, server projections, socket publication, and the bundled
  browser before state reaches client stores. Incompatible builds show a safe refresh message.
- Automated verification: 4 contracts privacy/schema tests, 3 browser parser tests, real projection
  parsing for all four games, 45/45 server tests, and the full workspace gate passed.
- Manual/device verification: A live host/player/display Groupthink round ran under strict CSP with
  no browser warnings or errors; malformed payload behavior is deterministic unit coverage.
- Performance/accessibility impact: Validation is linear in the small bounded snapshot payload and
  prevents invalid private/public state from entering render paths.
- Known limitations or follow-ups: Introduce a rolling-version deployment policy before protocol v2.
- Date accepted: 2026-08-24

### AAA-014 completion record

- Owner: Codex / CSS architecture implementation stream
- Pull request/commit: Working tree; not committed
- Behavior changed: The 48 KB inline stylesheet is split into ordered token, shell, theme,
  component, route, controller, display, game, and motion sources; builds emit one SHA-256-named CSS
  asset with immutable caching. All JS inline-style mutations were replaced with semantic classes.
- Automated verification: HTTP and deployment checks require one hashed external stylesheet, CSS
  MIME/cache headers, no inline style block, no inline style mutation, and no `unsafe-inline` CSP.
- Manual/device verification: Live launcher, lobby, input, and result views rendered without CSP or
  console errors. The visual pass also fixed duplicated launcher labels and hidden-mode leakage.
- Performance/accessibility impact: Browser caching is content-addressed; native `hidden` semantics
  now reliably override component display rules.
- Known limitations or follow-ups: Device-specific density validation continues under AAA-053 and
  AAA-061 rather than the CSS extraction item.
- Date accepted: 2026-08-24

### AAA-015 completion record

- Owner: Codex / design-system implementation stream
- Pull request/commit: Working tree; not committed
- Behavior changed: Semantic palette, space, safe-area, TV overscan, radius, outline, elevation,
  halftone, typography, target-size, motion, and easing tokens now govern the shared foundation.
  The design contract also defines component, surface, reduced-motion, and sound-event behavior.
- Automated verification: The production build emits the showcase through the same fingerprinted
  CSS/CSP path; HTTP/deployment tests cover the route and all workspace gates pass.
- Manual/device verification: `/showcase` rendered 24 themed state controls across all four games,
  stage essentials, notices, roster, prompt, progress, and score states with zero console errors.
- Screenshots or recordings: Captured in the 2026-08-24 browser validation run.
- Performance/accessibility impact: Shared 44 px target minimum, safe-area/overscan tokens,
  visible focus, semantic progress, and reduced-motion behavior are documented and implemented.
- Known limitations or follow-ups: Brand font licensing remains AAA-031; physical-device contrast
  and distance validation remain AAA-061.
- Date accepted: 2026-08-24

### AAA-011 progress record

- Owner: Codex / retained-component implementation stream
- Pull request/commit: Working tree; not committed
- Behavior changed: Route-owned page headers, connection notices, player-ID-keyed roster rows, and
  host/display topbar, room-pass, and stage slots retain DOM identity and update changed subtrees in
  place. Player submission acknowledgements now retain the active page shell, controller, roster,
  and leave control; only the game-owned controller content is replaced when the authoritative
  action changes.
- Automated verification: Dependency-free fake-DOM identity suites plus 91 web tests and the web
  production bundle passed.
- Manual/device verification: Live room testing showed roster, stage, prompt, progress, and result
  synchronization with no browser errors; draft reload recovery remained intact.
- Performance/accessibility impact: Ordinary same-action updates preserve forms, focus, canvas,
  audio, and roster nodes; connection live regions no longer reset with page content.
- Known limitations or follow-ups: Action-transition controller content and canvas remain ephemeral;
  render profiling is still required to close the final AAA-011 acceptance criterion.
- Date accepted: In progress

### AAA-016 completion record

- Owner: Codex / recovery-state implementation stream
- Pull request/commit: Working tree; not committed
- Behavior changed: A typed recovery-state model now covers initial connection, reconnecting,
  missing/full rooms, unavailable servers, stale sessions, incompatible clients, and action
  timeouts with bounded retries and explicit recovery actions. Diagnostic copy is allowlisted and
  cannot include bearer tokens or arbitrary server text.
- Automated verification: Four focused recovery-state tests plus 45/45 web tests, typecheck,
  production bundle, ESLint, and Prettier passed.
- Manual/device verification: Live player and display missing-room recovery panels rendered with
  working recovery actions, preserved join input, applied production CSS, and no console errors.
- Performance/accessibility impact: Retry and timeout helpers are bounded; actions have stable typed
  labels suitable for keyboard-accessible controls and live regions.
- Known limitations or follow-ups: Multi-browser and screen-reader coverage remains under AAA-061.
- Date accepted: 2026-08-24

### AAA-018 completion record

- Owner: Codex / host-launcher UI implementation stream
- Pull request/commit: Working tree; not committed
- Behavior changed: The host launcher now fills the available desktop canvas with a balanced
  two-column selection/settings flow and a full-width selected-game briefing. Mobile uses a compact
  horizontal snap picker, essential settings, progressive advanced settings, and a visible guided
  Create Game action. Typed catalog metadata supplies mechanics, duration, player range, content
  rating, controller needs, rounds, and pace for every game.
- Automated verification: Catalog invariants, 45/45 web tests, web typecheck, production bundle,
  and the combined workspace gate pass.
- Manual/device verification: Live browser review passed at the default desktop viewport and
  390×844 mobile viewport; selection, Drawn Out mode disclosure, advanced settings, and CTA guidance
  were exercised with no console warnings or errors.
- Performance/accessibility impact: Native buttons, pressed state, labelled selects, native
  details/summary disclosure, 44 px targets, safe-area placement, and scroll snapping are retained.
- Known limitations or follow-ups: Physical Safari/Android and large-text coverage remains in
  AAA-061; screenshot baselines remain in AAA-054.
- Date accepted: 2026-08-24

### AAA-046 completion record

- Owner: Codex / public-error-contract implementation stream
- Pull request/commit: Working tree; not committed
- Behavior changed: Shared contracts expose a finite, strict public error envelope. Parser failures
  return generic INVALID_REQUEST copy, unexpected exceptions return INTERNAL_ERROR with a UUID
  correlation ID, and server logs retain the original error under that ID. Idempotent retries replay
  the same safe envelope; QR failures use the same correlation discipline.
- Automated verification: Contracts 5/5 and server 47/47 tests cover schema validation, path/stack/
  secret non-disclosure, logged correlation matching, and retry stability; combined workspace gate
  passes.
- Manual/device verification: Host, player, and display map every public code through the typed
  recovery-state layer; player/display missing-room behavior was exercised in the live browser.
- Performance/accessibility impact: Fixed messages provide stable localization and accessible-notice
  inputs without exposing implementation detail.
- Known limitations or follow-ups: Operational dashboards for correlation IDs remain AAA-048.
- Date accepted: 2026-08-24

### AAA-047 completion record

- Owner: Codex / HTTP security implementation stream
- Pull request/commit: Working tree; not committed
- Behavior changed: Strict CSP now includes framing, base URI, object, and form restrictions;
  Permissions-Policy, COOP, CORP, X-Frame-Options, no-referrer, and nosniff headers protect every
  response. HSTS requires both explicit enablement and an HTTPS public origin.
- Automated verification: 46/46 server tests cover strict headers, HTTP/HTTPS HSTS behavior,
  Socket.IO, QR, assets, and showcase; compiled deployment verification checks live headers.
- Manual/device verification: Host/player/display and showcase routes ran with zero CSP console
  violations.
- Performance/accessibility impact: Negligible header bytes; no cross-origin game dependency was
  introduced.
- Known limitations or follow-ups: Production operators must terminate HTTPS correctly and opt in
  to HSTS only after validating the domain.
- Date accepted: 2026-08-24

### AAA-030 progress record

- Owner: Codex / raster optimization implementation stream
- Pull request/commit: Working tree; not committed
- Behavior changed: Lossless PNG masters now produce manifest-driven WebP assets; foreground art is
  bounded to 512/768/1024 px according to rendered use, while decorative backgrounds retain source
  dimensions. Production catalog, CSS, server MIME handling, HTTP tests, and deployment verification
  reference WebP only. The build excludes PNG masters from `dist`.
- Automated verification: The production copy step rejects invalid/duplicate/missing manifest data,
  any individual asset over 350 KiB, or an aggregate over 3 MiB. Current production raster payload
  is 2.68 MiB across fourteen files, down from 32.68 MiB of source masters; fingerprinted CSS remains
  present after asset copying.
- Manual/device verification: Representative transparent icon/stage edges and a full-screen
  background were visually inspected after conversion with no visible alpha or compression defects.
- Performance/accessibility impact: Smaller decode dimensions and roughly 92% fewer transferred
  raster bytes materially reduce phone memory and cold-load pressure; essential copy remains HTML.
- Known limitations or follow-ups: Add responsive `srcset` variants, complete non-selected lazy
  loading, and measure cold route transfers under AAA-049 before marking Done.
- Date accepted: In progress

### AAA-033 completion record

- Owner: Codex / game-fairness implementation stream
- Pull request/commit: Working tree; not committed
- Behavior changed: Hot Take creates one anonymous ballot ordering when voting opens and preserves
  it through snapshots and results, independent of answer insertion order.
- Automated verification: Hot Take package tests passed, 7/7; focused lint and formatting passed.
- Manual/device verification: Not required for server ordering semantics.
- Performance/accessibility impact: Negligible small-list hashing/sort once per round.
- Known limitations or follow-ups: None for this item.
- Date accepted: 2026-08-24

### AAA-034 completion record

- Owner: Codex / game-fairness implementation stream
- Pull request/commit: Working tree; not committed
- Behavior changed: Suspect selection is seeded, least-exposed-first, join-order-independent, and
  retains exposure history across rounds.
- Automated verification: Suspect package tests passed, 9/9, including seeded order and four-round
  equal-exposure simulation; focused lint and formatting passed.
- Manual/device verification: Not required for server fairness semantics.
- Performance/accessibility impact: Negligible sort over at most twelve players.
- Known limitations or follow-ups: Broader balance simulations remain in AAA-041.
- Date accepted: 2026-08-24

### AAA-035 completion record

- Owner: Codex / game-fairness implementation stream
- Pull request/commit: Working tree; not committed
- Behavior changed: Drawn Out reports completed turns, guesses, and votes separately; Telephone
  excludes the seed and denominators use the frozen player order.
- Automated verification: Drawn Out package tests passed, 8/8; focused lint and formatting passed.
- Manual/device verification: Pending final UI-copy review under the display redesign.
- Performance/accessibility impact: Constant-time/small-map progress calculations.
- Known limitations or follow-ups: Presentation polish remains in AAA-020/AAA-027.
- Date accepted: 2026-08-24

### AAA-036 completion record

- Owner: Codex / game-fairness implementation stream
- Pull request/commit: Working tree; not committed
- Behavior changed: Drawn Out enforces compatible player, per-turn stroke, per-stroke point, total
  stroke, and total point budgets with stable errors.
- Automated verification: Maximum-size ten-player Fake Artist test and stable-error tests pass as
  part of the 8/8 Drawn Out suite.
- Manual/device verification: Pending maximum-payload visual and low-end-phone performance pass.
- Performance/accessibility impact: Bounds worst-case canvas memory and validation work.
- Known limitations or follow-ups: Near-limit stroke simplification is not implemented.
- Date accepted: Pending review

### AAA-057 completion record

- Owner: Codex
- Pull request/commit: Working tree; not committed
- Behavior changed: Pull requests to `main` now run the full validation/build/deployment route
  workflow without publishing images; redundant runs cancel and all game integrations validate.
- Automated verification: Workflow and skill Markdown/YAML pass Prettier; local full workflow
  commands are rerun at each integration wave.
- Manual/device verification: GitHub-hosted pull-request execution pending.
- Performance/accessibility impact: No product runtime impact.
- Known limitations or follow-ups: Repository branch protection must make the validation job a
  required check; changed-path policies await separate expensive browser/image jobs.
- Date accepted: Pending review

## Current verification snapshot

- `pnpm check` passed on 2026-08-24: all workspace typechecks, 100 tests, ESLint, and repository-wide
  Prettier.
- `pnpm build` passed for all eight workspace projects.
- All four `validate_game.py --require-integration` runs passed with the existing authored-pack
  count and Hot Take cross-mode reuse warnings.
- The compiled server passed its live registry manifest plus every route, browser entrypoint,
  protocol, and static-asset check on isolated port 32791.
- Browser smoke coverage passed for room creation, join, start, reload draft recovery, explicit-room
  override, recoverable invalid-room error, 390×844 action layout, and 1280×720 display fit; tested
  browser consoles had no warnings/errors.
- Browser QA found and fixed one pre-snapshot draft invalidation bug. Same-room tab supersession is
  now explicit through `session:replaced`; multi-client observation remains in AAA-053.

## Baseline recorded before implementation

- Root typecheck, 55 automated tests, lint, formatting, and build passed on 2026-08-24.
- Compiled deployment route/asset verification passed on 2026-08-24.
- All four game validators passed, with low authored-source-count warnings and Hot Take
  cross-mode reuse warnings.
- Browser audit confirmed the 16:9 display fits at 1280x720, but found input-loss risk,
  saved-session room mismatch, long mobile onboarding, and excessive static-art weight.
- Raster assets total roughly 28 MB; many individual files are 1.6–2.5 MB.
- Docker build and external dependency advisory audit were not part of the recorded baseline.
