# Room Riot scoring intent

This note records the current M3 scoring contract. The Phase 4 scoring slice changes result
explanations only; it does not change authoritative point values.

## Intent by game

| Game       | Award intent                                                                                                                    | Current point source                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Groupthink | Reward answers that create a shared thought; a solo answer earns no match award.                                                | 100 points per matching player in the answer group.                                         |
| Hot Take   | Reward the answer that the room selects, with every vote carrying equal weight.                                                 | 100 points per vote.                                                                        |
| Suspect    | Reward accurate accusations, with stronger rewards for double-target rounds; give survival/alibi points for the accused player. | 100 correct-vote, 150 double-vote, 100 survival, 50 alibi.                                  |
| Drawn Out  | Reward correct guesses, useful chain links, artist recognition, and fake-artist survival.                                       | 100 correct guess, 50 artist/chain-link, 100 resemblance, 100 fake vote, 150 fake survival. |

## Comeback and edge-case policy

- Scores are additive across rounds; no player is eliminated for falling behind.
- Ties remain valid ties. The winner display must show tied ranks rather than inventing a
  join-order or submission-time tiebreaker.
- A round with no submissions or no eligible votes awards zero for the missing contribution and
  still advances through the normal authoritative phase transition.
- A disconnected or deadline-completed action is scored only when the game rules produce a valid
  contribution; transport timing never creates bonus points.

## Compatibility boundary

The current Phase 4 slice preserves all server constants and serialized score fields. It adds
plain-language cause-and-total explanations to the shared-display result cards. Numeric scoring
changes require a separate migration note, seeded balance simulations, and focused game-package
tests before they can ship.
