/**
 * Procedural cues use a conservative peak so several notes can overlap without
 * clipping. The master gain remains separate so user volume changes apply to
 * the mixed cue rather than changing the authored cue data.
 */
export const MAX_PROCEDURAL_CUE_PEAK = 0.045;

export function normalizeProceduralCueVolume(volume: number, noteCount: number): number {
  const safeVolume = Number.isFinite(volume) ? Math.max(0, volume) : 0;
  const safeNoteCount = Math.max(1, Math.floor(noteCount));
  return Math.min(MAX_PROCEDURAL_CUE_PEAK, safeVolume / Math.sqrt(safeNoteCount));
}
