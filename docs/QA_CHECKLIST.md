# Room Riot Milestone 5 QA Checklist

This checklist covers the physical and network tests that cannot be completed from the development workspace. The automated suite covers the 12-player Socket.IO flow and a player reconnect; this document covers real browsers, display devices, and LAN conditions.

## Test setup

- [ ] Deploy the tagged image to TrueNAS SCALE ElectricEel using `deploy/truenas/room-riot.compose.yaml`.
- [ ] Confirm `http://TRUENAS_IP:PORT/healthz` returns `{"status":"ok"}`.
- [ ] Open the host, display, and player pages from devices on the same private LAN.
- [ ] Record the TrueNAS address, browser/device versions, player count, and result for each run.
- [ ] Test once with sound enabled and once with sound disabled.

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

## Slow and intermittent Wi-Fi

- [ ] With network throttling enabled, join a room and submit an answer near the deadline.
- [ ] Briefly disable Wi-Fi during input, restore it, and confirm the reconnect notice clears after recovery.
- [ ] Briefly disable Wi-Fi during Hot Take voting, restore it, and confirm the vote controls reflect the latest state.
- [ ] Confirm stale actions show an actionable error and do not corrupt the room state.
- [ ] Confirm the host and display remain authoritative when a player is temporarily offline.

## Display and accessibility polish

- [ ] Open `/display` in a TV-sized browser and verify prompts, answers, results, and the winner state are readable from viewing distance.
- [ ] Enable sound from the display and confirm phase changes produce a short cue; verify the game remains usable when sound is unavailable.
- [ ] Enable reduced motion in the browser/OS and confirm phase transitions do not animate.
- [ ] Confirm buttons are comfortable to tap on a phone and that answer text wraps without horizontal scrolling.
- [ ] Confirm the connection notice is announced by assistive technology and does not hide the primary game controls.

## Acceptance

Milestone 5 is ready to close when all applicable boxes above are checked on the target LAN, with no unrecoverable room-state loss, duplicate submissions, or layout-blocking browser issues. Record any failures here or in an issue before moving to the Android TV app milestone.
