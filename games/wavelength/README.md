# WaveLength

WaveLength is Room Riot's neon broadcast-calibration party game. It takes the broad social idea of interpreting a clue on a spectrum and rebuilds the interaction around simultaneous private tuning, confidence, group cohesion, and a three-way rival interception.

## Game brief

- **Players:** 2–32 in Open Channel; two auto-balanced teams in Signal Clash. The practical room limit remains the host's configured capacity.
- **Rounds:** 7 by default; hosts may choose 1–20.
- **Round length:** roughly 90–150 seconds, for a 15–25 minute standard game.
- **Content modes:** `family`, `standard`, and `after-dark`, each with 100 curated signal pairs across everyday life, culture, social energy, imagination, and situational judgment.
- **Core social action:** hear one clue, debate its meaning aloud, then privately tune a 0–100 receiver and choose how strongly to weight that read.
- **Private information:** only the Broadcaster sees the target signal. Receiver positions, confidence, and rival interceptions remain private until the scan reveal.
- **Shared display:** shows the two signal poles, clue, timer, anonymous participation telemetry, a deliberately fuzzy team-energy field, and then an animated target/consensus/individual-marker reveal.

The shipped name is **WaveLength** at the user's direction. The visual and mechanical treatment is original to Room Riot: a damaged interdimensional broadcast console, cyan/magenta teams, oscilloscopes, antenna bursts, and neon-comic signal effects.

## Modes

### Open Channel

Two or more players share a room score. A rotating Broadcaster sees the hidden signal and gives a clue. Everyone else tunes privately; the confidence-weighted median becomes the room lock. The room earns accuracy points plus a synchronization bonus. With two players, one broadcasts and one tunes before roles swap next round.

### Signal Clash

Players are auto-balanced into Cyan and Magenta. The active team's Broadcaster gives a clue and their teammates tune. The rival team then privately predicts whether the lock drifted **low**, is **locked**, or drifted **high**. A majority-correct interception earns rival team points. If the active team has only one player, the rival side temporarily acts as guest receivers and the interception phase is skipped, which keeps 1v1 and uneven small rooms playable without leaking the target.

## Round loop

1. The server selects a unique signal pair, random target, active team, and rotating Broadcaster.
2. **Broadcast:** the Broadcaster privately sees the target and submits one clue of at most 80 characters. Digits and direct use of either pole are rejected.
3. **Tune:** eligible receivers discuss aloud, then each privately locks a 0–100 position and confidence of 1–3. The server calculates a confidence-weighted median; disconnected or timed-out receivers are omitted.
4. **Intercept:** in Signal Clash, eligible rivals privately choose low, locked, or high. The majority prediction is resolved; ties produce no interception points.
5. **Scan reveal:** the target, consensus, individual positions, confidence, spread, accuracy, synchronization bonus, interception, and round points animate onto the display.
6. The host advances. The active side and Broadcaster rotate. After the final round, Open Channel receives a signal rating; Signal Clash names the higher team score, with a shared victory on a tie.

## Scoring and edge cases

- Consensus within 4 signal units earns **5 accuracy points**; within 10 earns **3**; within 18 earns **1**; otherwise **0**.
- A team with at least two submitted receivers earns a **1-point sync bonus** when its marker spread is 10 units or less.
- A correct, non-tied rival majority interception earns **2 team points**.
- The Broadcaster receives the team's accuracy and sync points as personal contribution points. Each receiver within 10 units earns 1 personal point; each correct interceptor earns 1.
- Missing tuning submissions are ignored. With no submissions, the consensus safely defaults to 50 and cannot earn a sync bonus.
- The clue, tuning, and interception deadlines are server-owned. Expiration advances safely and never reveals the target early.
- Joining players wait until the next round. Removed/disconnected players are omitted from pending submission requirements; snapshots preserve all public state and only reveal the target to the active Broadcaster.

## Content taxonomy

Each mode contains 20 curated pairs in five categories:

1. everyday sensations and routines;
2. objects, food, and places;
3. entertainment and creative judgment;
4. social energy and personality;
5. imagination and situations.

Pairs are original, short, broadly interpretable, and do not require external trivia. After Dark uses consensual adult social and flirtation themes without coercion, sensitive disclosure, or explicit content.

## Uniqueness matrix

| Game           | Core action                                     | Information flow                                                      | Social engine                                          | Scoring                                                        | Shared display                                                             |
| -------------- | ----------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Groupthink     | Write a matching answer                         | Simultaneous answers become clusters                                  | Consensus prediction                                   | Matching groups                                                | Prompt and answer clusters                                                 |
| Hot Take       | Write and vote on opinions                      | Anonymous submissions become public                                   | Persuasion and taste                                   | Votes received                                                 | Opinion wall and vote heat                                                 |
| Suspect        | Answer, defend, and accuse                      | Hidden identity evidence                                              | Bluffing and deduction                                 | Correct accusations or survival                                | Case-building reveal                                                       |
| Drawn Out      | Draw, describe, or visually bluff               | Private prompts and sequential art                                    | Visual guessing                                        | Recognition and participation                                  | Canvas and chain reveal                                                    |
| Blank Line     | Add one public stroke while reading roles       | Topic and one role stay private                                       | Live visual deduction                                  | Correct reads versus escape                                    | Persistent collaborative drawing                                           |
| **WaveLength** | **Privately place and weight a numeric signal** | **One hidden target; simultaneous private markers and interceptions** | **Semantic debate, confidence, and group calibration** | **Accuracy, tight clustering, and three-way rival prediction** | **Live fuzzy energy field followed by target, consensus, and marker scan** |

WaveLength differs from each catalog game in core input, numeric aggregation, confidence, team structure, scoring, and display behavior. It also differs from the referenced tabletop game by replacing a shared physical dial with simultaneous private weighted inputs, adding group-spread scoring, using a three-outcome rival read, supporting a dedicated cooperative mode, and revealing a full marker constellation.

## Research notes

Research performed 2026-08-31:

- <https://www.wavelength.zone/> established the broad appeal of discussing where a clue falls between two concepts and informed the accessible spectrum language.
- <https://www.sutherlandshire.nsw.gov.au/__data/assets/pdf_file/0032/77909/Wavelength-rulebook.pdf> documented the tabletop flow and highlighted which distinctive rules and vocabulary not to reproduce.
- <https://play.google.com/store/apps/details?id=com.PalmCourt.Wavelength> confirmed that a cooperative 2+ digital interpretation can work and that real-time group feedback is valuable.

All wording, signal pairs, scoring, roles, team presentation, aggregation, and visual assets in this implementation are original Room Riot work.
