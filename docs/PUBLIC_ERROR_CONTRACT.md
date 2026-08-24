# Public error contract

Room Riot treats Socket.IO acknowledgement errors as a versioned public interface. Clients may
branch on `error.code` and show `error.message`. They must not infer server implementation details
from the message.

## Realtime acknowledgement envelope

Expected request failures use this shape:

```json
{
  "ok": false,
  "error": { "code": "ROOM_NOT_FOUND", "message": "Room ABCD does not exist." }
}
```

The supported expected codes are:

| Code                   | Meaning and message policy                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `ROOM_NOT_FOUND`       | The requested room is unavailable. The message may include the submitted room code.           |
| `ROOM_FULL`            | The room has reached its configured capacity.                                                 |
| `ROOM_LIMIT`           | The server or connection has reached a room-creation limit.                                   |
| `PLAYER_LIMIT`         | The selected game's supported player count would be exceeded.                                 |
| `UNAUTHORIZED`         | A host/player token, socket binding, or expired session cannot authorize the action.          |
| `INVALID_STATE`        | The action is understood but is unavailable in the room's current game state.                 |
| `INVALID_REQUEST`      | Protocol validation failed. The message is always `The request payload is invalid.`           |
| `IDEMPOTENCY_CONFLICT` | An action ID was reused for a different request. Its established retry guidance is preserved. |
| `IDEMPOTENCY_CAPACITY` | The safe-retry receipt capacity is exhausted. Its established retry guidance is preserved.    |

Expected domain messages are concise, player-safe explanations and may vary within a code to tell
the player what can be corrected. Codes are the stable programmatic contract. Parser issue arrays,
field paths, submitted tokens, source paths, and stack traces are never public messages.

Unexpected failures use only this envelope:

```json
{
  "ok": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "The request could not be completed.",
    "correlationId": "018f47a8-62d7-7e3b-8e53-93f818f52237"
  }
}
```

The server logs the same correlation ID alongside the original exception. Operators can search
server logs for that ID; clients should show it only as a support reference. Never return the
logged exception, parser details, stack, filesystem path, database error, or secret to a client.

## HTTP errors

Normal HTTP errors use stable lowercase identifiers such as `invalid_request_target`, `not_found`,
`room_not_found`, and `qr_generation_failed`. Unexpected HTTP failures use the same generic message
and a correlation ID while retaining their established route-specific identifier. HSTS and other
response-security behavior is documented in the deployment guide.

## Change policy

- Adding or removing a code, changing the fixed `INVALID_REQUEST` or `INTERNAL_ERROR` message, or
  changing the envelope requires contract tests and a protocol compatibility review.
- Do not reuse a code for a different recovery action.
- Preserve idempotency error codes and messages so cached retries remain understandable.
- Tests must parse public envelopes with the shared strict schema and assert that deliberately
  sensitive exception text is absent from serialized responses.
