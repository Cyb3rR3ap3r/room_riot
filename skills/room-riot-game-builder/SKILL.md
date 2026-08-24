---
name: room-riot-game-builder
description: Build and integrate a new Room Riot party game end to end, including a differentiated game loop, server/client contracts, curated content packs, original visual assets, prompt/content validation, research, tests, and deployment checks. Use when adding a new game, expanding a game concept into this repository, or asking Codex to create the mechanics, art, prompts, UI, and production wiring for a Room Riot game.
---

# Room Riot Game Builder

Build a complete game that feels native to Room Riot. Keep its mechanic distinct from the existing catalog while making its art unmistakably part of Room Riot's shared neon-comic family. Treat a game as a vertical slice: concept, rules, content, art, server state, host/player/display flows, tests, and deployment must agree before calling it complete.

## Start with repository discovery

Read [references/architecture.md](references/architecture.md) before editing. Inspect the current game catalog, contracts, room manager, socket protocol, web renderer, CSS, assets, package scripts, and tests. Search for all existing game IDs before choosing a new one.

Use the repository's existing conventions unless the new mechanic genuinely requires a new abstraction. Preserve the behavior of Groupthink and Hot Take. Do not copy an existing game and change only its theme.

## Work from the production tracker

When `docs/AAA_PRODUCTION_TRACKER.md` exists, treat it as the delivery ledger for production-readiness work as well as new-game integration:

1. Select the highest-priority dependency-ready item and confirm its acceptance criteria before editing.
2. Keep game rules, timing, authorization, and player limits authoritative on the server; clients may predict or preserve presentation state but must reconcile to snapshots.
3. Add the narrowest useful automated regression coverage and record the exact verification command or manual evidence.
4. Update dependencies, status, and the completion record in the tracker. Mark an item `Done` only when every acceptance criterion passes; use `In progress` or `In review` when visual, browser, device, load, or external verification remains.
5. Re-run affected quality gates after shared contracts, room lifecycle, rendering, build, or deployment wiring changes.

Do not trade away reconnect safety, snapshot privacy, input preservation, accessibility, motion preferences, or reduced-device performance for visual polish. Treat those properties as part of the AAA experience.

## 1. Define and research the concept

Write a short game brief before coding and save it in the new game's `README.md` (or the repository's established game design/build-plan location if that convention has changed):

- player count, target round count, expected round duration, and audience/content modes;
- the player decision or social action that makes the game fun;
- the complete phase loop, including lobby, input, reveal/voting, scoring, next round, and winner behavior;
- how answers/actions are hidden or revealed and what the shared display shows;
- scoring, tie handling, disconnect/deadline behavior, and the minimum viable player count;
- what is mechanically different from every existing Room Riot game.

Create a small uniqueness matrix in that same design note, comparing the proposed loop, player action, information flow, scoring, and display experience with every existing game. If the concept is similar to a known commercial game, change the mechanic and vocabulary until the comparison is clearly differentiated; do not reproduce proprietary rules or copy text.

Use web search when current references, comparable game research, safety guidance, or factual topic material would improve the brief. Prefer primary or authoritative sources, record source URLs and the date/decision they informed in the same design note, and paraphrase rather than copying source text. Do not browse merely to decorate a concept.

## 2. Design content before implementation

Read [references/game-design-and-research.md](references/game-design-and-research.md). Build a content taxonomy before writing prompts. Every supported content mode (`family`, `standard`, `after-dark`) should have approximately 100 curated prompts unless the user explicitly chooses a different target.

For each pack:

- give every prompt a stable, unique ID;
- make prompt text unique within the pack and varied in syntax, subject, and expected answer shape;
- keep prompts answerable in the round time and appropriate to the selected mode;
- avoid near-duplicates, trivia requiring an external lookup, protected/copyrighted text, unsafe personal targeting, and prompts that force players to disclose sensitive information;
- preserve any game-specific prompt kind/schema (for example, open versus player-targeted prompts);
- add tests for count, ID uniqueness, text uniqueness, schema validity, and content-mode coverage.

Prefer readable JSON content packs for curated prompts. If a deterministic expansion layer is used to reach the target count, keep it game-owned, content-mode-aware, stable, and covered by the same uniqueness validator. Do not call a template remix an LLM integration.

Run the bundled validator while authoring content, then require full integration before completion:

```powershell
python skills/room-riot-game-builder/scripts/validate_game.py --repo-root . --game-id <game-id>
python skills/room-riot-game-builder/scripts/validate_game.py --repo-root . --game-id <game-id> --require-integration
```

## 3. Create branded original art

Read [references/art-direction.md](references/art-direction.md) before generating assets. Use the shared Room Riot visual language: glossy pop-comic stickers, heavy black ink, white keylines, saturated neon color, halftone texture, and playful burst motifs. Give each game its own symbols and palette emphasis, but do not invent an unrelated art style.

Invoke the image-generation tool for each distinct raster asset, using the approved Groupthink, Hot Take, and Suspect v2 assets as visual references. At minimum, create a square transparent icon/logo, a transparent stage/hero sticker, and an opaque 16:9 background with a quiet central UI-safe area. Inspect every result before integrating it. Programmatically verify the alpha channel and corner pixels for assets that must be transparent; a rendered checkerboard or dark rectangle is not transparency.

Save assets under `apps/web/assets/` with versioned names while iterating. Wire exact paths into the catalog, CSS, asset-copy build, HTTP/static handling, deployment verifier, and accessible labels. Preserve the previous approved files until the user accepts the replacement. Keep dimensions and file sizes proportionate to their render size.

## 4. Integrate the vertical slice

Implement in this order:

1. Add the game ID and shared request/state schema in `packages/contracts`.
2. Add the game package under `games/<game-id>/` with constants, prompt loading, session state, public/player views, state transitions, validation, scoring, deadlines, and tests.
3. Register a complete adapter and operational metadata entry in
   `apps/server/src/game-registry.ts`; keep shared RoomManager lifecycle dispatch registry-driven.
4. Add socket events and acknowledgements in `apps/server/src/socket.ts` only when the game needs actions beyond the existing host/player actions. Reuse shared error envelopes and authorization checks.
5. Update `apps/web/src/protocol.ts` unions and add the game catalog, host controls, player controller, display stage, results, and winner rendering in `apps/web/src/main.ts`.
6. Derive page paths and QR join-path handling from the server registry; keep
   `scripts/verify-deployment.mjs` driven by the live `/api/games` manifest and add every new asset
   to its static checks.
7. Add game-specific visual styling in `apps/web/index.html`, keeping the display viewport-safe and readable on a TV.
8. Add the game to root and app TypeScript project references, app dependencies, workspace lockfile, package/build wiring, the design note/uniqueness matrix, assets, and QA coverage.
9. Update both Docker stages: copy the new workspace manifest before install, then copy the built package manifest, production `node_modules`, `dist`, and runtime content into the final image.

Keep authoritative rules on the server. Treat client input as untrusted, enforce deadlines server-side, validate player membership and phase transitions, and ensure reconnects receive a complete current snapshot.

## 5. Validate the finished game

Inspect the current root scripts, then run the content validator with `--require-integration`, TypeScript build, unit tests, lint, repository-wide formatting, asset copy/build, and compiled deployment route checks. In this repository the root formatting check is `pnpm format`, not `pnpm format:check`; it includes Markdown and YAML under `skills/`. Add focused tests for:

- the happy-path round loop through winner;
- invalid phase, player, target, vote, and deadline actions;
- duplicate/empty/oversized input;
- ties and degenerate rounds (including no submissions or no eligible votes);
- prompt uniqueness and every content mode;
- reconnect and snapshot privacy;
- display rendering at a 16:9 TV viewport with dense results;
- production startup and health check.

Use a temporary local server and browser smoke test when UI or display layout changes. Confirm the document has no unexpected scrollbars, content fits without clipped text, and the host's content/prompt-source settings reach the room snapshot. Exercise the compiled production server, not only a TypeScript development entry point. If validating Docker, retain workspace production links with the repository's recursive production-install pattern; do not replace it with a non-recursive workspace prune. Do not claim a deployment check passed if Docker or a required external service was unavailable; report that limitation.

## Completion checklist

Before finishing, confirm:

- [ ] The game is mechanically distinct and the uniqueness matrix is recorded.
- [ ] The art follows the shared Room Riot neon-comic system while using game-specific motifs.
- [ ] Icon and stage assets have real verified alpha; the background is opaque and UI-safe.
- [ ] Contracts, server state, sockets, client routes, host/player/display UI, and CSS are integrated.
- [ ] App dependencies, project references, lockfile, Docker manifest/runtime copies, and deployment verifier include the game.
- [ ] Each content mode yields approximately 100 validated runtime prompts backed by curated, mode-aware content.
- [ ] Prompt IDs/text are unique and prompt kinds are valid.
- [ ] Deadlines, scoring, privacy, reconnect, ties, and degenerate rounds are tested.
- [ ] Typecheck, tests, lint, format, build, and deployment checks have been run.
- [ ] The design note contains the uniqueness matrix and any research URLs/decisions.
- [ ] Any web research is cited and any unavailable validation is disclosed.

## Bundled resources

- [references/architecture.md](references/architecture.md) — current repository integration points and file conventions.
- [references/game-design-and-research.md](references/game-design-and-research.md) — uniqueness rubric, research practice, and content standards.
- [references/art-direction.md](references/art-direction.md) — approved Room Riot art system, asset specifications, ImageGen prompts, and visual QA.
- [scripts/validate_game.py](scripts/validate_game.py) — deterministic game/content pack validator.
