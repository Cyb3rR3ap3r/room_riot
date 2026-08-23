# Room Riot remediation tracking

This is the implementation checklist for the repository audit. Items are intentionally
small enough to verify with a focused test or a documented operational check.

| ID      | Priority | Finding / action                                                                                                 | Evidence                                                                                    | Status |
| ------- | -------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------ |
| SEC-01  | P0       | Make Socket.IO acknowledgements optional at runtime so missing callbacks cannot crash the process.               | Socket integration test emits an event without an ack.                                      | Done   |
| SEC-02  | P0       | Parse HTTP paths without trusting a malformed `Host` header; keep QR origins validated.                          | HTTP test sends an invalid host header and verifies a response.                             | Done   |
| SEC-03  | P1       | Restrict browser Socket.IO handshakes to same-origin requests while allowing native clients without an `Origin`. | Socket server `allowRequest` policy.                                                        | Done   |
| SES-01  | P1       | Add explicit leave/unbind handling and clean old room/channel bindings when a socket changes rooms.              | Room-manager and socket tests cover room switching and leave.                               | Done   |
| SES-02  | P1       | Revoke superseded player socket bindings and use the manager binding for action authorization.                   | Socket test proves the old socket is disconnected and manager bindings drive private state. | Done   |
| GAME-01 | P1       | Enforce input/voting deadlines synchronously when actions arrive.                                                | Late-answer and late-vote checks in the manager/game paths.                                 | Done   |
| GAME-02 | P2       | Validate game IDs against the supported registry and only start from the lobby.                                  | Room-manager negative tests.                                                                | Done   |
| GAME-03 | P2       | Correct prompt cycling after the prompt deck is exhausted and randomize deck order.                              | Groupthink and Hot Take sequence tests.                                                     | Done   |
| GAME-04 | P2       | Skip Hot Take voting when fewer than two answers exist.                                                          | Hot Take deadline test resolves directly to results.                                        | Done   |
| OPS-01  | P1       | Add room TTL/limits and creation throttling hooks so abandoned rooms cannot grow forever.                        | Room-manager cleanup/limit test and per-socket creation limiter.                            | Done   |
| OPS-02  | P1       | Close Socket.IO during graceful shutdown.                                                                        | `stopServer()` closes realtime transport before HTTP.                                       | Done   |
| OPS-03  | P2       | Add security headers, static caching, and avoid synchronous file reads per request.                              | HTTP header/cache test and async file reads.                                                | Done   |
| UX-01   | P2       | Surface reconnect failures in the active page and allow clearing a stale session.                                | Active notice handling plus Leave Room event.                                               | Done   |
| QA-01   | P2       | Add negative protocol, lifecycle, deadline, and malformed-request coverage.                                      | Automated suite expanded to 34 passing tests plus prompt/content validation.                | Done   |
| QA-02   | P2       | Add browser smoke coverage guidance for leave, reload, reconnect, and accessibility.                             | Updated QA checklist.                                                                       | Done   |
| DEP-01  | P2       | Reduce production image dependencies and document the intentional in-memory session model.                       | Production dependency prune and deployment docs.                                            | Done   |
| ARCH-01 | P3       | Centralize response envelopes and remove the unused client action schema.                                        | Shared contract response types.                                                             | Done   |

The current release intentionally keeps active rooms in memory. Persistence is tracked as
a future product slice rather than silently implied by the `/data` mount.
