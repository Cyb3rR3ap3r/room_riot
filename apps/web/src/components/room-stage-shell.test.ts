import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoomStageShellComponent } from './room-stage-shell.js';
import { asFake, fakeDocument } from './test-dom.js';

test('room stage shell retains stable keyed DOM and updates changed stage only', () => {
  const component = createRoomStageShellComponent('host-experience', fakeDocument);
  const calls = { topbar: 0, pass: 0, stage: 0 };
  const roster = fakeDocument.createElement('roster');
  const model = (stageKey: string) => ({
    shellClass: 'consensus-lab',
    topbar: {
      key: 'room:phase',
      render: () => fakeDocument.createElement(`top-${++calls.topbar}`),
    },
    roomPass: { key: 'room', render: () => fakeDocument.createElement(`pass-${++calls.pass}`) },
    stage: { key: stageKey, render: () => fakeDocument.createElement(`stage-${++calls.stage}`) },
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
  component.update(model('round-2'));
  assert.notEqual(grid.children[1], stage);
  assert.equal(shell.children[0], topbar);
  assert.deepEqual(calls, { topbar: 1, pass: 1, stage: 2 });
});
