import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getDrawingStrokePresentation,
  SHARED_DRAWING_STROKE_OPACITY,
} from './drawing-presentation.js';

test('inherited drawing strokes are visually softened while new strokes stay prominent', () => {
  assert.equal(getDrawingStrokePresentation(0, 2).opacity, SHARED_DRAWING_STROKE_OPACITY);
  assert.equal(getDrawingStrokePresentation(1, 2).opacity, SHARED_DRAWING_STROKE_OPACITY);
  assert.equal(getDrawingStrokePresentation(2, 2).opacity, 1);
});
