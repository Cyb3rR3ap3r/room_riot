# Game design, research, content, and art

## Uniqueness rubric

Record a compact matrix before implementation. Compare the proposed game with every current Room Riot game on:

| Dimension        | Questions                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| Core action      | What does a player physically choose, write, rank, bluff, draw, or target?                           |
| Social engine    | Is the tension from consensus, prediction, deception, speed, negotiation, or asymmetric information? |
| Information flow | What is private, simultaneous, revealed, voted on, or inferred?                                      |
| Scoring          | What earns points, when are ties resolved, and why can a losing player recover?                      |
| Round shape      | How do setup, input, reveal, resolution, and next-round cadence differ?                              |
| Display role     | What must the shared screen communicate, and what does it deliberately hide?                         |

Aim for at least three meaningful differences from each existing game, not merely a new theme or prompt set. Reject concepts whose fun depends on reproducing a recognizable commercial game's distinctive rules or wording.

## Research practice

Search only when research changes a design decision: comparable mechanics, current safety guidance, factual topic material, or accessibility/display constraints. Prefer primary sources, standards, and authoritative organizations. Record the URL, date, and the decision it informed in the change notes. Paraphrase; do not paste source passages, branded copy, or copyrighted prompt lists into the repository. Treat web findings as inputs to judgment, not proof that a concept is safe or unique.

## Prompt taxonomy

Plan the pack before writing it. A practical starting point is five categories with about 20 prompts each per content mode, adjusted for the game's mechanic (for example: everyday life, people/social, objects/places, imagination, and situational choices). Every mode should reach roughly 100 curated prompts.

- `family`: inclusive, low-stakes, easy to answer with mixed ages; no sexual, graphic, humiliating, or targeted content.
- `standard`: playful adult-friendly material that remains broadly safe for a group setting.
- `after-dark`: consensual adult humor or flirtation without coercion, hate, doxxing, sexual content involving minors, or pressure to disclose trauma or private information.

Each prompt needs a stable ID, non-empty text, a distinct answer shape, and wording that can be read aloud quickly. Vary sentence openings and topics; avoid near-duplicates created by swapping one noun. Avoid trivia that needs a lookup, medical/legal advice, protected lyrics or quotations, unsafe dares, personal data, and prompts that single out a real player unless the game explicitly supports safe, opt-in targeting. Preserve game-specific fields such as Hot Take's `kind`, and validate every mode with tests.

If using deterministic expansion, keep the source templates and topic vocabulary game-owned, mode-aware, and non-repeating after normalization. Expansion is a content system, not AI generation; label it accurately. Add a focused runtime test that loads every mode, asserts the target count, and checks generated IDs/text (and kinds where relevant) for uniqueness. If an AI source is offered, validate and deduplicate its output, cap length, filter unsafe material, and fall back to a curated pack when generation fails or times out.

## Original art and display QA

Use ImageGen for new raster art when bitmap assets are appropriate. Define a small visual system (palette, typography treatment, shapes, contrast, and mood) that is distinct from existing games. Generate an icon/logo, a shared-display stage or hero image, and a background/texture as needed; use transparent backgrounds for foreground marks. Inspect the generated files, keep dimensions appropriate to their actual render size, add accessible labels, and wire the exact paths used by the web build.

Design for a shared 16:9 display first: long prompts must wrap, scores must remain legible from a distance, and dense result states must fit without page scrolling. Test narrow and wide desktop viewports, player names of realistic maximum length, long prompt text, ties, empty states, and reconnects.

## Content QA checklist

- JSON parses and matches the game schema.
- Every supported mode is present and reaches the target count.
- IDs and normalized text are unique within and, where appropriate, across modes.
- Prompt kinds, answer limits, and target references are valid.
- Sampling does not repeat the first prompt on every new session.
- Generated content is bounded, deduplicated, moderated, and has a deterministic curated fallback.
