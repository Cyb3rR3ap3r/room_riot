import type { DrawnOutMode } from '@room-riot/contracts';
import type { PublicRoomState } from '@room-riot/game-engine';
import type { DrawnOutChainEntry, DrawnOutPublicView } from '@room-riot/drawn-out';

import {
  appendScoreboard,
  appendStageHeading,
  createStageFrame,
  createStatusPill,
  textElement,
  type PublicStageDependencies,
} from '../public-stage.js';

export function renderDrawnOutPublicStage(
  state: PublicRoomState,
  game: DrawnOutPublicView,
  dependencies: PublicStageDependencies,
): HTMLElement {
  const artwork = game.drawing
    ? dependencies.createDrawingPreview(game.drawing, 'display-drawing')
    : dependencies.createArtwork('drawn-out');
  const frame = createStageFrame(
    dependencies,
    'drawn-out-stage',
    artwork,
    'stage-copy drawn-out-stage-copy',
  );
  frame.visual.className = 'drawn-out-canvas-stage';
  appendStageHeading(
    frame.copy,
    dependencies,
    `${drawnOutModeLabel(game.mode)} mode`,
    drawnOutStageTitle(game),
  );
  appendDrawnOutStatus(frame.copy, game, dependencies);
  if (game.status === 'results' || game.status === 'complete') {
    appendDrawnOutResults(frame.copy, game, state, dependencies);
  }
  if (state.phase === 'winner') appendScoreboard(frame.copy, state, dependencies);
  return frame.element;
}

export function appendDrawnOutStatus(
  container: HTMLElement,
  game: DrawnOutPublicView,
  dependencies: PublicStageDependencies,
): void {
  const phaseText =
    game.status === 'drawing'
      ? 'Featured artist is drawing'
      : game.status === 'guessing'
        ? `${game.submittedCount}/${Math.max(0, game.totalPlayers - 1)} guesses locked`
        : game.status === 'telephone'
          ? `Chain link ${Math.min(game.submittedCount + 1, game.totalPlayers)}/${game.totalPlayers}`
          : game.status === 'fake-drawing'
            ? 'Shared sketch in progress'
            : game.status === 'fake-voting'
              ? `${game.submittedCount}/${game.totalPlayers} votes locked`
              : 'The damage is done';
  container.append(
    createStatusPill(
      dependencies,
      `Round ${game.roundNumber}/${game.totalRounds} · ${drawnOutModeLabel(game.mode)} · ${phaseText}`,
      game.deadlineAt,
    ),
  );
}

export function appendDrawnOutResults(
  container: HTMLElement,
  game: DrawnOutPublicView,
  state: PublicRoomState,
  dependencies: Pick<PublicStageDependencies, 'document' | 'createDrawingPreview'>,
): void {
  const reveal = textElement(
    dependencies.document,
    'p',
    `Original prompt: ${game.prompt ?? 'Mystery prompt'}`,
  );
  reveal.className = 'drawn-out-prompt-reveal';
  container.append(reveal);

  if (game.mode === 'classic') appendClassicResults(container, game, state, dependencies);
  if (game.mode === 'telephone') appendTelephoneResults(container, game, state, dependencies);
  if (game.mode === 'fake-artist') appendFakeArtistResults(container, game, state, dependencies);
}

function appendClassicResults(
  container: HTMLElement,
  game: DrawnOutPublicView,
  state: PublicRoomState,
  dependencies: Pick<PublicStageDependencies, 'document'>,
): void {
  const list = dependencies.document.createElement('ul');
  list.className = 'answer-list drawn-out-guesses';
  if (!game.guesses.length) {
    const empty = textElement(dependencies.document, 'li', 'No guesses made it onto the page.');
    empty.className = 'experience-empty';
    list.append(empty);
  } else {
    for (const guess of game.guesses) {
      const player = state.players.find((candidate) => candidate.id === guess.playerId);
      const item = textElement(
        dependencies.document,
        'li',
        `${guess.correct ? '✓' : '×'} ${player?.name ?? 'Player'}: ${guess.text}`,
      );
      item.classList.toggle('connected', guess.correct);
      list.append(item);
    }
  }
  container.append(list);
}

function appendTelephoneResults(
  container: HTMLElement,
  game: DrawnOutPublicView,
  state: PublicRoomState,
  dependencies: Pick<PublicStageDependencies, 'document' | 'createDrawingPreview'>,
): void {
  const chain = dependencies.document.createElement('ol');
  chain.className = 'drawn-out-chain';
  if (!game.chain.length) {
    const empty = textElement(dependencies.document, 'li', 'The chain ended before it began.');
    empty.className = 'experience-empty';
    chain.append(empty);
  } else {
    for (const entry of game.chain) appendChainEntry(chain, entry, state, dependencies);
  }
  container.append(chain);
}

function appendChainEntry(
  chain: HTMLElement,
  entry: DrawnOutChainEntry,
  state: PublicRoomState,
  dependencies: Pick<PublicStageDependencies, 'document' | 'createDrawingPreview'>,
): void {
  const player = state.players.find((candidate) => candidate.id === entry.playerId);
  const item = dependencies.document.createElement('li');
  item.append(
    textElement(
      dependencies.document,
      'strong',
      `${player?.avatar ?? '🎨'} ${player?.name ?? 'Player'}`,
    ),
  );
  item.append(
    entry.kind === 'drawing'
      ? dependencies.createDrawingPreview(entry.drawing, 'chain-drawing')
      : textElement(dependencies.document, 'span', entry.text),
  );
  chain.append(item);
}

function appendFakeArtistResults(
  container: HTMLElement,
  game: DrawnOutPublicView,
  state: PublicRoomState,
  dependencies: Pick<PublicStageDependencies, 'document'>,
): void {
  if (!game.fakeArtistPlayerId) {
    const empty = textElement(dependencies.document, 'p', 'The fake artist stayed hidden.');
    empty.className = 'experience-empty';
    container.append(empty);
    return;
  }
  const fake = state.players.find((player) => player.id === game.fakeArtistPlayerId);
  const reveal = textElement(
    dependencies.document,
    'p',
    `${fake?.avatar ?? '🖊️'} ${fake?.name ?? 'The mystery player'} was the fake artist.`,
  );
  reveal.className = 'drawn-out-fake-reveal';
  container.append(reveal);
  const votes = textElement(
    dependencies.document,
    'p',
    game.votes
      .map((vote) => {
        const player = state.players.find((candidate) => candidate.id === vote.playerId);
        return `${player?.name ?? 'Player'}: ${vote.count}`;
      })
      .join(' · '),
  );
  votes.className = 'muted';
  container.append(votes);
}

function drawnOutModeLabel(mode: DrawnOutMode): string {
  return mode === 'classic' ? 'Classic' : mode === 'telephone' ? 'Telephone' : 'Fake Artist';
}

function drawnOutStageTitle(game: DrawnOutPublicView): string {
  switch (game.status) {
    case 'drawing':
      return 'The artist is making choices.';
    case 'guessing':
      return 'What was this supposed to be?';
    case 'telephone':
      return 'The chain is getting worse.';
    case 'fake-drawing':
      return 'One artist has no idea.';
    case 'fake-voting':
      return 'Spot the suspicious strokes.';
    case 'results':
    case 'complete':
      return 'Art was a mistake.';
  }
}
