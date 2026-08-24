import assert from 'node:assert/strict';
import test from 'node:test';
import type { PublicRoomState } from '@room-riot/game-engine';
import { getGamePresentation } from '../games/presentation.js';
import { createRosterComponent } from './roster.js';
import { asFake, fakeDocument } from './test-dom.js';

function state(players: unknown[]): PublicRoomState {
  return { phase: 'lobby', settings: { maxPlayers: 12 }, players } as unknown as PublicRoomState;
}

test('roster updates copy in place and retains rows by player ID', () => {
  const component = createRosterComponent(fakeDocument, 'controller-roster');
  const presentation = getGamePresentation('groupthink');
  component.update(
    state([
      { id: 'one', name: 'One', avatar: '1', score: 0, status: 'connected' },
      { id: 'two', name: 'Two', avatar: '2', score: 0, status: 'connected' },
    ]),
    presentation,
  );
  const roster = asFake(component.element);
  const list = roster.children[1]!;
  const firstRow = list.children[0];
  const secondRow = list.children[1];
  component.update(
    state([
      { id: 'two', name: 'Two updated', avatar: '2', score: 0, status: 'connected' },
      { id: 'one', name: 'One', avatar: '1', score: 0, status: 'disconnected' },
    ]),
    presentation,
  );
  assert.equal(list.children[0], secondRow);
  assert.equal(list.children[1], firstRow);
  assert.equal(list.children[0]!.children[1]!.children[0]!.textContent, 'Two updated');
  assert.equal(roster.classList.contains('controller-roster'), true);
});
