# Suspect

**Everybody looks guilty.**

Suspect is a 4–12 player social-deduction game. A scenario appears on the shared screen; players privately say whether it applies to them. The server keeps those answers hidden, selects a suspect (or a secret pair), and opens an accusation vote. Players score for finding the suspect, spotting a false accusation, and surviving a room that guessed wrong.

## Round loop

1. **Private answer** — everyone chooses Yes or No. `Most Likely` rounds skip this step and open with a vote.
2. **Reveal** — the room sees the scenario and that an accusation is forming, but not answer ownership. `Alibi` names the accused player and gives them a short defense window.
3. **Accusation** — players choose one suspect, two suspects in `Double Trouble`, or `No match` for a false accusation.
4. **Results** — the server reveals the selected suspect(s), alibi, vote counts, and round points.

## Special rounds

- **Alibi**: one matching player is selected privately, can submit a 280-character defense, and then faces the vote.
- **Double Trouble**: two matching players are selected; voters must identify the exact pair.
- **False Accusation**: no suspect is selected; `No match` is the correct call even if a player privately answered Yes.
- **Most Likely**: players vote directly on who best fits the scenario; plurality is the round's answer.

## Scoring

- Correct single-suspect or false-accusation vote: **100 points**.
- Correct Double Trouble pair: **150 points**.
- A selected suspect who fools everyone: **100 points**; an alibi that survives adds **50**.
- A Most Likely plurality vote gives matching voters and the selected player **100 points**.

The server is authoritative. It never sends private Yes/No answers to the display or another player, and it validates deadlines, player membership, vote shape, and alibi ownership.

## Uniqueness matrix

| Dimension        | Suspect                                                            | Groupthink                               | Hot Take                                         |
| ---------------- | ------------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------------ |
| Core action      | Private Yes/No self-disclosure, then accuse a person/pair          | Free-form answer and match with the room | Anonymous free-form answer, then vote on answers |
| Social engine    | Hidden identity inference and bluffing                             | Consensus prediction                     | Opinion quality and anonymous voting             |
| Information flow | Server hides answer ownership and selects a target before the vote | Answers are grouped at reveal            | Answers are shown anonymously before voting      |
| Scoring          | Correct accusations, false calls, and surviving suspects           | Matching answer groups                   | Votes received by anonymous answers              |
| Round shape      | Input → optional alibi → accusation → reveal                       | Input → grouped results                  | Input → anonymous answer wall → vote → reveal    |
| Display role     | Builds a case while protecting identities, then names suspects     | Shows answer clusters                    | Shows anonymous takes and vote heat              |

Suspect is therefore a deduction game, not a reskinned consensus or opinion game. Its prompts are original, mode-aware content and its art uses an investigation-board visual language distinct from the existing lab and stage themes.

Content lives in `content/*.json`; rules, privacy, deadlines, voting, and scoring live in `src/index.ts`.
