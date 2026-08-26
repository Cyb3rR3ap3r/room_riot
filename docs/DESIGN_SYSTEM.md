# Room Riot Design System

Room Riot should feel like a premium game-show control room: loud enough for a television,
immediate enough for a phone, and consistent enough that players always know what to do next.
The source of truth for implemented CSS values is `apps/web/src/styles/tokens.css`; this document
defines how those tokens and components are intended to be used.

## Experience principles

1. **The next action wins.** The active prompt and primary action have the strongest hierarchy.
2. **Phones control; televisions perform.** Controllers favor one-column reachability. Displays
   favor overscan-safe scale, distance legibility, and room-wide progress.
3. **Every game has a voice, not a new grammar.** Accent, illustration, stage language, and sound
   change by game; layout, status, recovery, and interaction patterns remain familiar.
4. **State is visible and truthful.** Pending, accepted, disconnected, queued, removed, and error
   states use words as well as color or motion.

## Foundations

### Color roles

| Role           | Token                | Purpose                                       |
| -------------- | -------------------- | --------------------------------------------- |
| Canvas         | `--color-ink`        | Deep page background                          |
| Surface        | `--color-surface`    | Translucent cards and control panels          |
| Primary text   | `--color-text`       | High-contrast headings and body copy          |
| Secondary text | `--color-muted`      | Supporting copy; never the only action label  |
| Action         | `--color-accent`     | Primary controls and current progress         |
| Hot accent     | `--color-accent-hot` | Voting, urgency, and Hot Take identity        |
| Focus          | `--color-focus`      | Keyboard focus and critical highlights        |
| Success        | `--color-success`    | Accepted and complete states                  |
| Warning        | `--color-warning`    | Time pressure and recoverable risk            |
| Error          | `--color-error`      | Rejected, unavailable, and destructive states |

Game themes set `--game-accent`, `--game-accent-strong`, `--game-glow`, and `--game-surface`.
Components consume those roles and must not encode another game's selector.

### Space, shape, and elevation

- Spacing uses the 4 px-based `--space-1` through `--space-12` scale.
- Controller pages use safe-area tokens on every edge. TV layouts add `--space-tv-overscan`.
- Radii use `--radius-sm`, `--radius-md`, `--radius-lg`, and `--radius-pill` only.
- Focus uses `--outline-width`, `--outline-offset`, and `--color-focus`.
- Cards use `--elevation-1` or `--elevation-2`; accented actions use `--elevation-accent`.
- Halftone/grid atmosphere uses `--halftone-size` and `--halftone-opacity`, and must never reduce
  text contrast.

### Type

- Controller type uses `--type-controller-sm/md/lg`; prompts should remain readable at 320 px.
- Display type uses `--type-display-sm/md/lg`; essential status must remain legible at ten feet.
- Headings use `--leading-tight`; instructions and recovery copy use `--leading-body`.
- The UI uses self-hosted Atkinson Hyperlegible and Baloo 2 subsets with system fallbacks; numeric
  countdown and score glyphs use tabular widths.
- The responsive QA harness exercises a 200% root text scale, but browser zoom and physical large-text
  review remain release evidence under AAA-026 and AAA-061.

### Motion and sound

- `--motion-instant`: direct input feedback.
- `--motion-fast`: hover, press, focus, and small state changes.
- `--motion-phase`: entering a new gameplay phase.
- `--motion-progress`: score and progress interpolation.
- `--motion-celebration`: results and winner moments only.
- `--motion-pulse`, `--motion-breathe`, and `--motion-float`: continuous decorative cycles.
- `--ease-standard` is functional; `--ease-emphasized` is theatrical; `--ease-loop` is reserved for
  decoration.
- Reduced-motion mode removes nonessential travel and repetition. Meaning never depends on motion.
- Continuous decoration pauses whenever the document is hidden and resumes only when the page is
  visible.
- Canonical sound events are `action-accepted`, `countdown-warning`, `phase-change`, `results`,
  `winner`, `disconnect`, and `reconnect`. Audio remains opt-in and phase cues must have a visual
  equivalent.

## Component contract

Every interactive component has default, hover, focus, active, disabled, and loading states.
Status-bearing components additionally support success, warning, and error.

- **Button:** one primary action per panel; secondary for safe alternatives; danger for removal or
  closure. Minimum target is `--target-min` (44 CSS pixels).
- **Card:** groups one decision or one stage idea. Avoid nested cards unless the inner surface is a
  selectable option.
- **Roster:** avatar, name, score/status, and connection state. Queued and reconnecting players use
  text labels in addition to styling.
- **Prompt:** the highest information priority during active play; never truncated.
- **Countdown:** pairs exact time with warning state and does not continuously steal live-region
  focus.
- **Progress:** native semantic `<progress>` with a visible numeric label.
- **Notice:** persistent `aria-live` text for connection, success, retry, and errors.
- **Modal:** reserved for destructive confirmation or blocking incompatibility; focus returns to
  the invoking control.
- **Score:** player identity and numeric change; winner treatment may animate once.

## Surface rules

### Phone controller

- One action column, no horizontal scrolling, and primary controls within thumb reach.
- Preserve draft, focus, selection, canvas, and scroll across unrelated room updates.
- Inputs use at least 16 px text to avoid mobile zoom and all targets meet 44×44 CSS pixels.

### Host

- Separate game selection, room readiness, live control, and moderation into explicit regions.
- Disable starts with a visible minimum-player explanation.
- Destructive actions must be visually distinct from phase advancement.

### Television/display

- Respect overscan and keep join code, prompt, progress, and results readable at distance.
- Use density tiers instead of shrinking indefinitely. Essential text must wrap, not clip.
- Ambient art supports the stage but never competes with the prompt or room code.

## Review checklist

- Keyboard order follows visual order and focus remains visible.
- Text and controls meet WCAG AA contrast; status never relies on color alone.
- Long names, prompts, translations, maximum roster density, and 320 px width do not overflow.
- All four themes render every component state without cross-theme selector leakage.
- Reduced motion, muted audio, reconnect, error, empty, and loading paths remain fully usable.
