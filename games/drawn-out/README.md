# Drawn Out

**Art was a mistake.**

Drawn Out is a 3–10 player drawing and guessing game designed for five rounds of roughly 60–120 seconds each. It supports `family`, `standard`, and `after-dark` content packs plus three host-selectable variants.

## Variants and phase loops

- **Classic:** one rotating artist privately receives a ridiculous prompt, submits a drawing, and everyone else guesses. A guess earns 100 points when it matches enough significant prompt words; the artist earns 50 points for every correct guess.
- **Telephone:** a rotated player chain alternates drawing and describing. Only the active player sees the previous link. The completed chain is revealed together; every contributor earns 50 points and the last player earns a 100-point resemblance bonus when the ending still overlaps the original phrase.
- **Fake Artist:** one player is secretly omitted from the shared prompt. Players add one turn of strokes to a shared drawing, then everyone votes. Correct detectives earn 100 points; the fake artist earns 150 points when fewer than half the room identifies them.

The server owns prompts, hidden roles, turn order, deadlines, scoring, and visibility. Drawings are bounded normalized vector strokes, which keeps reconnect snapshots deterministic and avoids accepting arbitrary image blobs. A missed deadline advances with an empty drawing or a short placeholder description so a disconnected player cannot stall the room. Tied Fake Artist votes do not identify a winner; scoring still uses each individual vote. The game requires three players and rotates active roles so small rooms remain playable.

## Content taxonomy

Each audience pack contains 25 authored scenario seeds across animals, everyday places, objects, jobs, social mishaps, and surreal situations. Four game-owned framings turn those seeds into 100 stable runtime prompts per mode. Curated mode uses a shuffled deterministic deck; the existing local AI-remix setting reshuffles and re-identifies the same bounded content family for offline play.

## Uniqueness matrix

| Game       | Core action                                                | Information flow                                     | Scoring                                                           | Shared display                                 |
| ---------- | ---------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------- |
| Groupthink | Write matching words                                       | Simultaneous answers become clusters                 | Consensus matches                                                 | Text clusters and reactor status               |
| Hot Take   | Write and vote on opinions                                 | Anonymous answers revealed together                  | Popular vote                                                      | Opinion cards and vote totals                  |
| Suspect    | Answer privately and accuse                                | Hidden yes/no match becomes deduction                | Correct accusation or survival                                    | Case clue, alibi, and jury results             |
| Drawn Out  | Draw vector strokes, describe, guess, or bluff through art | Private prompts/roles and sequential visual handoffs | Prompt recognition, chain participation, or hidden-role detection | Live canvas, chain reveal, and art-led results |

Drawn Out differs from every existing game through direct visual creation, a persistent vector canvas, role/turn rotation, and mode-specific information flow. Telephone and Fake Artist are implemented with Room Riot-specific timing, scoring, server snapshots, and vocabulary rather than copying a commercial game's text or presentation.

## Research decisions

No web research was needed. The user supplied the mechanic, and implementation decisions came from the repository's existing server-authoritative privacy, reconnect, display, and content-mode conventions.
