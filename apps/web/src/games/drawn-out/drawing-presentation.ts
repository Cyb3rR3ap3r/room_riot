export const SHARED_DRAWING_STROKE_OPACITY = 0.45;

export function getDrawingStrokePresentation(
  strokeIndex: number,
  sharedStrokeCount: number,
): { opacity: number } {
  return {
    opacity: strokeIndex < Math.max(0, sharedStrokeCount) ? SHARED_DRAWING_STROKE_OPACITY : 1,
  };
}
