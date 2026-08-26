# Room Riot Milestone 5 QA Checklist

This checklist covers the physical and network tests that cannot be completed from the development workspace. The automated suite covers the 12-player Socket.IO flow and a player reconnect; this document covers real browsers, display devices, and LAN conditions.

## Test setup

- [ ] Deploy the tagged image to TrueNAS SCALE ElectricEel using `deploy/truenas/room-riot.compose.yaml`.
- [ ] Confirm `http://TRUENAS_IP:PORT/healthz` returns `{"status":"ok"}`.
- [ ] Open the host, display, and player pages from devices on the same private LAN.
- [ ] Record the TrueNAS address, browser/device versions, player count, and result for each run.
- [ ] Test once with sound enabled and once with sound disabled.
- [ ] Confirm `/readyz` is ready before a game and `/metrics` reports the expected room/player count.
- [ ] Replace the compiled container with the same `/data` dataset and confirm the active room restores.

## Browser matrix

### iOS Safari

- [ ] Join from Safari using the QR code and by entering the room code manually.
- [ ] Submit a Groupthink answer and confirm the player view changes to waiting without duplicate submissions.
- [ ] Background Safari during input, return before the deadline, and confirm the session reconnects.
- [ ] Reload Safari during input, rejoin with the stored player session, and confirm the player remains in the room.
- [ ] Confirm the countdown, connection notice, and answer controls remain usable in portrait and landscape.

### Android Chrome

- [ ] Join from Chrome using the QR code and by entering the room code manually.
- [ ] Submit Groupthink and Hot Take answers and confirm the correct waiting/voting state appears.
- [ ] Background Chrome during input, return before the deadline, and confirm the session reconnects.
- [ ] Reload Chrome during input and confirm the player can recover with the existing player session.
- [ ] Confirm the countdown, connection notice, and answer controls remain usable in portrait and landscape.

## Game and reconnect scenarios

- [ ] Start Groupthink with 12 players; confirm every player can submit once and results reveal after the final submission.
- [ ] Disconnect one player during input; confirm the display and host show that player as offline.
- [ ] Reconnect the same browser and confirm the player identity and submitted state are preserved.
- [ ] Disconnect/reconnect the host; confirm the host can continue the round with the host token.
- [ ] Disconnect/reconnect the display; confirm it resumes the current room state without changing game state.
- [ ] Let a Groupthink input deadline expire and confirm the room advances to results.
- [ ] Let a Hot Take input or voting deadline expire and confirm the room advances to the next expected phase.
- [ ] Confirm an already-submitted answer cannot be submitted twice after a reconnect or reload.
- [ ] Leave a room, then join a different room from the same browser tab; confirm the first room marks the player offline and no longer sends private updates.
- [ ] Reconnect the same player from a second browser; confirm the first socket is disconnected and cannot submit actions.
- [ ] Complete a winner screen rematch with the same roster and confirm scores reset only when selected.
- [ ] Lock and unlock joins from the host; confirm the display changes to “Joining locked.”
- [ ] Remove a player, skip an offline player, and confirm the display/player notices do not expose tokens.

## Slow and intermittent Wi-Fi

- [ ] With network throttling enabled, join a room and submit an answer near the deadline.
- [ ] Briefly disable Wi-Fi during input, restore it, and confirm the reconnect notice clears after recovery.
- [ ] Briefly disable Wi-Fi during Hot Take voting, restore it, and confirm the vote controls reflect the latest state.
- [ ] Confirm stale actions show an actionable error and do not corrupt the room state.
- [ ] Confirm the host and display remain authoritative when a player is temporarily offline.
- [ ] Submit an answer or vote just after the displayed deadline while network throttling is enabled; confirm the server rejects it.

## Display and accessibility polish

- [ ] Open `/display` in a TV-sized browser and verify prompts, answers, results, and the winner state are readable from viewing distance.
- [ ] Enable sound from the display and confirm phase changes produce a short cue; verify the game remains usable when sound is unavailable.
- [ ] Enable reduced motion in the browser/OS and confirm phase transitions do not animate.
- [ ] Confirm buttons are comfortable to tap on a phone and that answer text wraps without horizontal scrolling.
- [ ] Confirm the connection notice is announced by assistive technology and does not hide the primary game controls.
- [ ] Run the Suspect alibi/vote flow and Drawn Out drawing/guess flow at minimum and maximum supported players.

### Manual screen-reader pass

Run this pass with the browser's native screen reader on a real host/player pair. Confirm the
announcement is concise and that focus never strands the user behind a rebuilt panel:

- [ ] Join: room-code, name, avatar, validation errors, join success, and connection state are named.
- [ ] Submit: the prompt, character/status feedback, primary action, acknowledgement, and retry are
      announced without duplicating the whole page.
- [ ] Vote: each option has a unique accessible name, selected state, and a clear submit action.
- [ ] Error: malformed or stale actions announce the recovery message and preserve retryable input.
- [ ] Results: reveal, score changes, winner, rematch readiness, and the next action are announced.

### Drawing-mode accessibility alternative

Drawn Out is pointer-first by design: the drawing canvas requires a coarse or fine pointer and does
not claim that a screen reader can author freehand strokes. The canvas has a programmatic label,
visible stroke/brush state, undo/redo, clear confirmation, and a host-controlled drawing toggle.
For a player who cannot or should not draw, the host should disable drawing and choose Groupthink,
Hot Take, or Suspect instead; the room remains playable with text, choice, and vote controls. Do not
present a disabled drawing round as accessible unless the physical device supports the required
pointer input. The manual screen-reader pass still covers join, submit, vote, error, and results.

### Release-candidate browser and device matrix

Record the browser/OS, viewport, image or commit under test, and reviewer with each result:
The automated baseline is captured by `.github/workflows/browser-performance.yml` and archived as a
CI artifact; local reproduction uses `scripts/browser-performance.mjs` and
`scripts/browser-layout-matrix.mjs` against a freshly built server.

- [ ] Portrait 360×640 and 390×844: safe-area insets, keyboard resize, no clipped primary action.
- [ ] Phone landscape: orientation change preserves input, focus, and room state.
- [ ] 1280×720 and 1920×1080 display: every phase remains readable at viewing distance.
- [ ] 3840×2160 display: prompts, full rosters, ties, errors, reconnects, and winner state fit.
- [ ] 200% zoom and increased text size: primary controls remain visible and operable.
- [ ] Coarse pointer, palm/scroll conflict, pointer cancellation, and drawing recovery behave safely.
- [ ] QR scan and manual room entry are readable and fast on the target phones.
- [ ] Screenshot diffs for host, player, and display phases were reviewed intentionally.
- [ ] LCP, layout shift, long-task, interaction-latency, and frame-time evidence is attached.

### Deployment and release evidence

- [ ] Container replacement restores an unexpired room from the mounted dataset without source mounts.
- [ ] Production dependency and container scan reports are attached.
- [ ] SBOM, provenance, immutable tag/digest, multi-architecture, and rollback evidence are attached.
- [ ] Required CI checks and branch-protection settings are verified on `main`.
- [ ] Named G0–G5 release sign-offs are recorded in `docs/RELEASE_SIGNOFF.md`.

## Acceptance

Milestone 5 is ready to close when all applicable boxes above are checked on the target LAN, with no unrecoverable room-state loss, duplicate submissions, or layout-blocking browser issues. Record any failures here or in an issue before moving to the Android TV app milestone.
