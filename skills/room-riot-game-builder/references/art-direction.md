# Room Riot art direction

Use this visual system for every new game. The mechanic and symbols should be original; the rendering language should make the game look like it belongs beside Groupthink, Hot Take, and the approved Suspect v2 set.

## Shared visual language

- Render glossy, high-energy pop-comic sticker art with chunky silhouettes.
- Use heavy black ink outlines, a crisp white outer keyline, candy-like highlights, and saturated neon cyan, blue, pink, purple, yellow, and orange.
- Add halftone dots, speed lines, speech bubbles, lightning, stars, bursts, and similar comic punctuation selectively.
- Keep the mood playful, loud, and party-friendly. Avoid photorealism, cinematic noir, horror realism, muted corporate illustration, thin vector linework, and generic esports branding.
- Give the game an identifying motif and palette emphasis. Reuse the brand grammar, not another game's main object or exact composition.
- Do not include readable words inside generated art. Render UI text and game titles in HTML/CSS for accessibility and reliable spelling.

Inspect the current Groupthink and Hot Take icon/background assets and the approved `suspect-icon-v2.png`, `suspect-stage-v2.png`, and `suspect-bg-v2.png` before generating. Use those files as ImageGen style and composition references, clearly identifying each asset's role in the prompt.

## Required asset set

### Catalog icon/logo

- Square composition, ideally 1024–1536 pixels.
- Transparent canvas with a centered sticker silhouette and generous padding.
- Strong enough to read as a small game-card icon.
- No rectangular panel, scene background, baked checkerboard, or readable title.

Prompt pattern:

> Create a square transparent-background catalog sticker for a Room Riot party game about [mechanic]. Match the attached Room Riot references: glossy neon pop-comic rendering, thick black ink, crisp white keyline, candy highlights, saturated [palette], and small halftone/burst accents. Center one bold [game motif] with generous transparent padding and a clean silhouette readable at thumbnail size. No words, letters, rectangle, scene, checkerboard, gray field, or black background.

### Display stage/hero

- Transparent canvas with a compact foreground sticker illustration.
- Readable from TV distance and supportive of the game state rather than decorative clutter.
- No full-scene backdrop or UI text.

Prompt pattern:

> Create a transparent-background stage sticker for the Room Riot game [name]. Show [game-specific action/motif] as one compact, energetic pop-comic silhouette. Match the attached Room Riot references: thick black outlines, white sticker keyline, glossy neon highlights, saturated [palette], halftone accents, and playful motion marks. Leave generous transparent space around the silhouette. No words, letters, rectangle, full scene, checkerboard, gray field, or black background.

### Shared-display background

- Opaque 16:9, ideally 1920×1080 or a proportionate optimized size.
- Full-bleed comic environment with the darkest, quietest central approximately 55% reserved for prompts, choices, and scores.
- Concentrate motifs around the edges and corners. Respect the current layout's principal decorative anchor instead of placing a face or high-contrast object under UI.
- Preserve strong contrast without making the center visually empty or flat.

Prompt pattern:

> Create an opaque 16:9 full-bleed Room Riot game background for [name]. Use a glossy neon pop-comic environment built from [motifs], heavy black ink, saturated [palette], halftone dots, and burst accents. Keep the central 55% dark, quiet, and low-detail for readable TV UI; cluster brighter illustrations around the edges and [layout-compatible anchor]. No words, logos, title text, UI panels, frames, checkerboard, or transparency.

Generate each asset in a separate image-generation call so its canvas and transparency requirements are unambiguous. Inspect the result after every call and iterate before wiring it into the app.

## File and integration rules

- Use lowercase kebab-case names such as `<game>-icon-v2.png`, `<game>-stage-v2.png`, and `<game>-bg-v2.png` while revising.
- Preserve the currently approved asset until the user accepts the replacement.
- Update the game catalog, CSS background URL, renderer/alt text, asset-copy pipeline if explicit, server static handling if explicit, and `scripts/verify-deployment.mjs`.
- Avoid enlarging a bitmap beyond its source resolution. Compress or resize assets whose dimensions materially exceed their rendered use.
- Keep essential instructions, text, or state out of raster art.

## Visual QA

Do not infer transparency from how an image viewer renders it. Inspect PNG metadata and pixels programmatically. A foreground asset passes only when it has an alpha-capable pixel format and transparent outer pixels; a background passes only when it is fully opaque.

On Windows, a quick check is:

```powershell
Add-Type -AssemblyName System.Drawing
$imagePath = (Resolve-Path 'apps/web/assets/<asset>.png').Path
$bitmap = [System.Drawing.Bitmap]::FromFile($imagePath)
[pscustomobject]@{
  Width       = $bitmap.Width
  Height      = $bitmap.Height
  PixelFormat = $bitmap.PixelFormat.ToString()
  CornerAlpha = $bitmap.GetPixel(0, 0).A
}
$bitmap.Dispose()
```

For an icon or stage sticker, expect an alpha-capable format and `CornerAlpha` of `0`. For a background, expect corner alpha `255`; also scan all pixels or use an image tool to confirm no accidental transparency remains.

Finally, build and view the real game card, host screen, player controller, and 16:9 display. Check long prompts, dense results, names near the maximum length, and both wide and narrower desktop viewports. The display must not require scrolling, and decoration must not compete with state or controls.
