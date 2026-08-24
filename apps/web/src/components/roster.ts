import type { PublicRoomState } from '@room-riot/game-engine';

import type { GamePresentation } from '../games/types.js';

interface DomDocument {
  createElement(tagName: string): HTMLElement;
}

interface RosterRow {
  readonly element: HTMLElement;
  readonly avatar: HTMLElement;
  readonly name: HTMLElement;
  readonly detail: HTMLElement;
}

export interface RosterComponent {
  readonly element: HTMLElement;
  update(state: PublicRoomState, presentation: GamePresentation, now?: number): void;
}

export function createRosterComponent(
  ownerDocument: DomDocument = document,
  extraClass = '',
): RosterComponent {
  const element = ownerDocument.createElement('aside');
  const heading = ownerDocument.createElement('div');
  heading.className = 'experience-section-title';
  const title = ownerDocument.createElement('h2');
  const count = ownerDocument.createElement('span');
  heading.append(title, count);
  const list = ownerDocument.createElement('ul');
  element.append(heading, list);

  const rows = new Map<string, RosterRow>();
  const empty = ownerDocument.createElement('li');
  empty.className = 'experience-empty';

  const createRow = (): RosterRow => {
    const row = ownerDocument.createElement('li');
    const avatar = ownerDocument.createElement('span');
    avatar.className = 'roster-avatar';
    const identity = ownerDocument.createElement('span');
    const name = ownerDocument.createElement('strong');
    const detail = ownerDocument.createElement('small');
    identity.append(name, detail);
    row.append(avatar, identity);
    return { element: row, avatar, name, detail };
  };

  return {
    element,
    update(state, presentation, now = Date.now()) {
      element.className = `${presentation.rosterClass} ${extraClass}`.trim();
      title.textContent = presentation.rosterTitle;
      list.className = presentation.rosterGridClass;
      const activePlayerCount = state.players.filter(
        (player) => player.status !== 'removed',
      ).length;
      count.textContent = `${activePlayerCount}/${state.settings.maxPlayers}`;

      if (state.players.length === 0) {
        empty.textContent = presentation.rosterEmpty;
        list.replaceChildren(empty);
        rows.clear();
        return;
      }

      const activeIds = new Set(state.players.map((player) => player.id));
      for (const playerId of rows.keys()) {
        if (!activeIds.has(playerId)) rows.delete(playerId);
      }
      const orderedRows = state.players.map((player, index) => {
        const row = rows.get(player.id) ?? createRow();
        rows.set(player.id, row);
        row.element.className = player.status === 'connected' ? 'is-connected' : 'is-offline';
        row.avatar.textContent = player.avatar;
        row.name.textContent = player.name;
        row.detail.textContent =
          player.status === 'removed'
            ? 'Left this round'
            : player.status === 'disconnected'
              ? player.reconnectDeadlineAt
                ? `Reconnecting · ${Math.max(0, Math.ceil((player.reconnectDeadlineAt - now) / 1_000))}s grace`
                : 'Reconnecting'
              : state.phase === 'lobby'
                ? `Signal ${index + 1}`
                : `${player.score} pts`;
        return row.element;
      });
      list.replaceChildren(...orderedRows);
    },
  };
}
