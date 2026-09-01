# Blank Line

Blank Line is Room Riot's live, turn-by-turn drawing deduction game. Everyone helps build one
shared picture, but one player—the Blank—never sees the topic. Every committed stroke appears on
the shared display before the marker passes to the next player, giving the room time to plan,
second-guess suspicious choices, and talk through who may be drawing blind.

## Game brief

- **Players:** 3–10; 5–8 recommended.
- **Rounds:** 5 by default.
- **Round length:** roughly 2–4 minutes, depending on player count and discussion.
- **Content modes:** `family`, `standard`, and `after-dark`, each with 100 curated visual topics.
- **Core social action:** add one useful-but-not-too-obvious stroke, then read everyone else's marks
  for confidence, hesitation, imitation, or sabotage.
- **Private information:** the informed players see the exact topic on their phones. The Blank sees
  only their role and must infer the topic from the public canvas and conversation.
- **Shared display:** never reveals the topic during play. It shows the cumulative drawing, current
  artist, next artists, circuit progress, remaining time, and the most recently committed stroke.

## Round loop

1. The server chooses a topic, one Blank, and a randomized turn order. Roles and the topic are sent
   only to player phones.
2. The room completes two drawing circuits. On each turn, the active player can commit exactly one
   continuous stroke. The display updates immediately, highlights the newest stroke, and advances
   the visible turn order.
3. After the final stroke, the room gets a timed discussion-and-ballot phase. Players talk openly,
   then privately vote for one other player.
4. Results reveal the topic, the Blank, the authored stroke timeline, and the vote totals.
5. The order rotates, a new Blank and topic are chosen, and the next round begins. After the final
   round, the highest cumulative score wins.

## Scoring and edge cases

- Each informed player who votes for the Blank earns **2 points**.
- The Blank earns **3 points** unless they are the sole highest-voted player. A tied accusation is
  treated as an escape, rewarding a clear room consensus rather than a coin flip.
- Players cannot vote for themselves, submit outside their turn, add more than one stroke, submit
  an empty stroke, or vote twice.
- A drawing turn expires after 25 seconds. A missed turn records no stroke and advances the marker.
- Voting expires after 45 seconds; missing ballots simply do not count.
- If a player disconnects, the host can use the shared skip-disconnected control and drawing
  deadlines continue to prevent a stalled room. Reconnects receive the complete current canvas,
  order, and their private role/topic.
- New rounds require at least three active players. Joining players wait for the next round.

## Content taxonomy

Each content mode contains 20 topics in each of five drawing-friendly categories:

| Category  | Purpose                                              |
| --------- | ---------------------------------------------------- |
| Creatures | Recognizable silhouettes and expressive anatomy      |
| Objects   | Everyday forms with several valid component strokes  |
| Places    | Shared scenes that reward spatial planning           |
| Actions   | Motion and interaction without trivia knowledge      |
| Wildcards | Absurd visual combinations that keep deduction noisy |

Family topics stay concrete and all-ages. Standard topics add social life, work, travel, and surreal
adult situations. After-dark topics use consensual nightlife, dating, flirtation, and chaotic
adulting without explicit sex, coercion, humiliation, or sensitive personal disclosure.

## Uniqueness matrix

| Game                   | Core action                                       | Information flow                                                     | Social engine                             | Scoring                                                | Display experience                                                                |
| ---------------------- | ------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Groupthink             | Write an answer                                   | Simultaneous private answers                                         | Consensus                                 | Matching answers                                       | Prompt, progress, clustered reveal                                                |
| Hot Take               | Answer and vote                                   | Private submissions, then public choices                             | Opinion and persuasion                    | Votes received                                         | Prompt, answer wall, vote reveal                                                  |
| Suspect                | Answer, write an alibi, accuse                    | Hidden personal evidence                                             | Deduction through text                    | Correct accusations and survival                       | Case prompt, sealed-ballot status, reveal                                         |
| Drawn Out: Classic     | Create one complete drawing                       | One artist knows a private choice                                    | Visual guessing                           | Correct prompt guesses                                 | Finished drawing and guesses                                                      |
| Drawn Out: Telephone   | Alternate full drawings and descriptions          | Each player sees one prior link                                      | Transformation                            | Completed chain participation                          | One private link at a time, full chain reveal                                     |
| Drawn Out: Fake Artist | Add a multi-stroke turn in one pass               | One player lacks the prompt                                          | Visual bluffing                           | Fake survival or identification                        | Shared canvas with coarse turn progress                                           |
| **Blank Line**         | **Commit exactly one stroke across two circuits** | **Topic stays private; every authored stroke is public immediately** | **Live planning, mimicry, and deduction** | **Correct individual reads versus a consensus escape** | **Persistent live canvas, latest-stroke pulse, visible order, circuit telemetry** |

Blank Line differs from the closest existing mode in more than presentation: each player receives
two atomic turns instead of one multi-stroke drawing submission; the public display exposes a
persistent, ordered stroke history and upcoming artists; the second circuit lets the Blank adapt;
and the timed room discussion plus consensus-sensitive scoring creates a distinct deduction arc.

## Research notes

- [Oink Games: A Fake Artist Goes to New York](https://oinkgames.com/en/games/analog/a-fake-artist-goes-to-new-york/),
  reviewed 2026-08-31. The official overview confirms the central tension: informed players must
  demonstrate knowledge without making the topic obvious to an uninformed artist. It also describes
  a game-master role, two total lines, a vote, and a last-chance topic guess. Blank Line preserves
  only the broad hidden-information drawing tension; it removes the game master and escape guess,
  uses server-authored private roles, two live digital circuits, visible turn telemetry, and its own
  scoring vocabulary and flow.
