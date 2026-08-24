# Room Riot production asset pipeline

The PNG files in `apps/web/assets` are lossless source masters. `apps/web/asset-manifest.json` owns
the source/output mapping, maximum decoded dimensions, and WebP quality. Production pages reference
only those derived WebP files; `copy-assets.mjs` deliberately excludes the masters from `dist`.

## Regenerating assets

Run the deterministic Pillow script after changing a source master:

```powershell
python apps/web/scripts/optimize-assets.py
pnpm --filter @room-riot/web build
```

Foreground artwork is resized for its largest CSS size at common high-density display ratios:

- launcher icons: maximum 512 × 512;
- stage artwork: maximum 1024 px on either edge;
- Room Riot brand artwork: maximum 768 px on either edge;
- full-screen backgrounds: retain their source dimensions.

The production build fails if any derived image exceeds 350 KiB, if the complete raster set exceeds
3 MiB, or if the manifest is empty, duplicated, invalid, or incomplete. Preserve alpha on foreground
art and visually inspect transparent edges plus at least one full-screen background after
regeneration.

Backgrounds are intentionally decorative and may upscale softly on 4K displays beneath gradients
and content panels. Essential text, controls, QR codes, and drawings are rendered by HTML, SVG, or
canvas rather than baked into those images.
