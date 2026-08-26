import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoomStageShellComponent } from './room-stage-shell.js';
import { asFake, fakeDocument } from './test-dom.js';

test('room stage shell retains stable keyed DOM and updates changed stage only', () => {
  const component = createRoomStageShellComponent('host-experience', fakeDocument);
  const calls = { topbar: 0, pass: 0, stage: 0 };
  const roster = fakeDocument.createElement('roster');
  const model = (stageKey: string, phase = 'input') => ({
    shellClass: 'consensus-lab',
    phase,
    topbar: {
      key: 'room:phase',
      render: () => fakeDocument.createElement(`top-${++calls.topbar}`),
    },
    roomPass: { key: 'room', render: () => fakeDocument.createElement(`pass-${++calls.pass}`) },
    stage: {
      key: stageKey,
      render: () => {
        const stage = fakeDocument.createElement(`stage-${++calls.stage}`);
        if (calls.stage > 1) stage.append(fakeDocument.createElement('h2'));
        return stage;
      },
    },
    roster,
  });
  component.update(model('round-1'));
  const shell = asFake(component.element);
  const topbar = shell.children[0];
  const grid = shell.children[1]!;
  const pass = grid.children[0];
  const stage = grid.children[1];
  component.update(model('round-1'));
  assert.equal(shell.children[0], topbar);
  assert.equal(grid.children[0], pass);
  assert.equal(grid.children[1], stage);
  assert.deepEqual(calls, { topbar: 1, pass: 1, stage: 1 });
  component.update(model('round-2', 'results'));
  assert.notEqual(grid.children[1], stage);
  assert.equal(shell.children[0], topbar);
  assert.equal(shell.attributes.get('data-phase'), 'results');
  assert.equal(shell.classList.contains('phase-transitioning'), true);
  const announcement = grid.children[3]!;
  assert.equal(announcement.attributes.get('role'), 'status');
  assert.equal(announcement.attributes.get('aria-live'), 'polite');
  assert.equal(announcement.textContent, 'Phase: results');
  const heading = grid.children[1]!.children[0];
  assert.equal(heading?.tabIndex, -1);
  assert.equal(heading?.focused, true);
  assert.deepEqual(calls, { topbar: 1, pass: 1, stage: 2 });
});
