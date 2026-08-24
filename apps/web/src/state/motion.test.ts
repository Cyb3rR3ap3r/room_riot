import assert from 'node:assert/strict';
import test from 'node:test';

import { installMotionVisibility, type MotionVisibilityDocument } from './motion.js';

test('continuous motion follows page visibility and removes its listener', () => {
  let hidden = false;
  let paused = false;
  let listener: (() => void) | null = null;
  const ownerDocument = {
    get hidden() {
      return hidden;
    },
    documentElement: {
      classList: {
        toggle(token: string, force?: boolean) {
          assert.equal(token, 'motion-paused');
          paused = Boolean(force);
          return paused;
        },
      },
    },
    addEventListener(type: 'visibilitychange', nextListener: () => void) {
      assert.equal(type, 'visibilitychange');
      listener = nextListener;
    },
    removeEventListener(type: 'visibilitychange', nextListener: () => void) {
      assert.equal(type, 'visibilitychange');
      if (listener === nextListener) listener = null;
    },
  } satisfies MotionVisibilityDocument;

  const dispose = installMotionVisibility(ownerDocument);
  const fireVisibilityChange = (): void => {
    assert.ok(listener);
    (listener as () => void)();
  };
  assert.equal(paused, false);
  hidden = true;
  fireVisibilityChange();
  assert.equal(paused, true);
  hidden = false;
  fireVisibilityChange();
  assert.equal(paused, false);
  dispose();
  assert.equal(listener, null);
});
