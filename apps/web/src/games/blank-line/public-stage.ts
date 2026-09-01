import type { BlankLinePublicView } from '@room-riot/blank-line';
import type { PublicRoomState } from '@room-riot/game-engine';

import {
  appendScoreboard,
  appendStageHeading,
  createProgressMeter,
  createStatusPill,
  textElement,
  type PublicStageDependencies,
} from '../public-stage.js';
import { blankLinePresentation } from './presentation.js';

export function renderBlankLinePublicStage(
  state: PublicRoomState,
  game: BlankLinePublicView,
  dependencies: PublicStageDependencies,
): HTMLElement {
  const stage = dependencies.document.createElement('main');
  stage.className = 'blank-line-stage';
  stage.setAttribute(
    'data-phase-choreography',
    blankLinePresentation.phaseChoreography[state.phase],
  );

  const canvasPanel = dependencies.document.createElement('section');
  canvasPanel.className = 'blank-line-canvas-panel';
  const canvasHeader = dependencies.document.createElement('header');
  canvasHeader.className = 'blank-line-canvas-header';
  canvasHeader.append(
    textElement(dependencies.document, 'span', 'Collective evidence'),
    textElement(
      dependencies.document,
      'strong',
      game.status === 'drawing'
        ? `Circuit ${game.circuit} of ${game.totalCircuits}`
        : `${game.strokeTimeline.length} total strokes`,
    ),
  );
  const canvasStack = dependencies.document.createElement('div');
  canvasStack.className = 'blank-line-canvas-stack';
  canvasStack.append(dependencies.createDrawingPreview(game.drawing, 'blank-line-live-drawing'));
  const latest = game.strokeTimeline.at(-1);
  if (latest && game.status === 'drawing') {
    const pulse = dependencies.createDrawingPreview(
      { strokes: [latest.stroke] },
      'blank-line-latest-stroke',
    );
    pulse.setAttribute('aria-hidden', 'true');
    canvasStack.append(pulse);
  }
  canvasPanel.append(canvasHeader, canvasStack);

  const briefing = dependencies.document.createElement('section');
  briefing.className = 'blank-line-briefing';
  appendStageHeading(
    briefing,
    dependencies,
    game.status === 'voting' ? 'Discussion window' : 'Drawing intelligence',
    stageTitle(game, state),
  );
  briefing.append(
    createStatusPill(
      dependencies,
      `Round ${game.roundNumber}/${game.totalRounds}`,
      game.deadlineAt,
    ),
  );

  if (game.status === 'drawing') appendTurnQueue(briefing, game, state, dependencies);
  if (game.status === 'voting') appendVotingBrief(briefing, game, dependencies);
  if (game.status === 'results' || game.status === 'complete') {
    appendReveal(briefing, game, state, dependencies);
  }
  if (state.phase === 'winner') appendScoreboard(briefing, state, dependencies);

  stage.append(canvasPanel, briefing);
  return stage;
}

function appendTurnQueue(
  container: HTMLElement,
  game: BlankLinePublicView,
  state: PublicRoomState,
  dependencies: PublicStageDependencies,
): void {
  const active = state.players.find((player) => player.id === game.activePlayerId);
  const turn = dependencies.document.createElement('div');
  turn.className = 'blank-line-now-drawing';
  const avatar = textElement(dependencies.document, 'span', active?.avatar ?? '✦');
  avatar.className = 'blank-line-active-avatar';
  const copy = dependencies.document.createElement('div');
  copy.append(
    textElement(dependencies.document, 'small', 'Marker live'),
    textElement(dependencies.document, 'strong', active?.name ?? 'Next artist'),
    textElement(dependencies.document, 'span', 'One continuous stroke. Make it count.'),
  );
  turn.append(avatar, copy);

  const queue = dependencies.document.createElement('ol');
  queue.className = 'blank-line-turn-queue';
  for (const [index, playerId] of game.nextPlayerIds.entries()) {
    const player = state.players.find((candidate) => candidate.id === playerId);
    const item = dependencies.document.createElement('li');
    item.append(
      textElement(dependencies.document, 'span', index === 0 ? 'Up next' : 'On deck'),
      textElement(
        dependencies.document,
        'strong',
        `${player?.avatar ?? '✎'} ${player?.name ?? 'Artist'}`,
      ),
    );
    queue.append(item);
  }
  container.append(
    turn,
    queue,
    createProgressMeter(dependencies, game.turnIndex, game.totalTurns, 'Shared drawing progress'),
  );
}

function appendVotingBrief(
  container: HTMLElement,
  game: BlankLinePublicView,
  dependencies: PublicStageDependencies,
): void {
  const briefing = textElement(
    dependencies.document,
    'p',
    'Study the order. Defend your lines. Ask what each artist intended—without saying the hidden topic.',
  );
  briefing.className = 'blank-line-discussion-copy';
  container.append(
    briefing,
    createProgressMeter(dependencies, game.submittedCount, game.totalPlayers, 'Secret ballots'),
  );
}

function appendReveal(
  container: HTMLElement,
  game: BlankLinePublicView,
  state: PublicRoomState,
  dependencies: PublicStageDependencies,
): void {
  const blank = state.players.find((player) => player.id === game.blankPlayerId);
  const reveal = dependencies.document.createElement('div');
  reveal.className = `blank-line-reveal ${game.blankCaught ? 'is-caught' : 'is-escaped'}`;
  reveal.append(
    textElement(
      dependencies.document,
      'span',
      game.blankCaught ? 'Blank exposed' : 'Blank escaped',
    ),
    textElement(
      dependencies.document,
      'h3',
      `${blank?.avatar ?? '◌'} ${blank?.name ?? 'The Blank'}`,
    ),
    textElement(dependencies.document, 'p', `The topic was: ${game.prompt ?? 'Unknown'}`),
  );
  const votes = dependencies.document.createElement('ol');
  votes.className = 'blank-line-vote-reveal';
  for (const vote of game.voteSummary) {
    const player = state.players.find((candidate) => candidate.id === vote.playerId);
    const item = dependencies.document.createElement('li');
    item.classList.toggle('is-blank', vote.playerId === game.blankPlayerId);
    item.append(
      textElement(
        dependencies.document,
        'span',
        `${player?.avatar ?? '✎'} ${player?.name ?? 'Artist'}`,
      ),
      textElement(dependencies.document, 'strong', String(vote.count)),
    );
    votes.append(item);
  }
  container.append(reveal, votes);
}

function stageTitle(game: BlankLinePublicView, state: PublicRoomState): string {
  if (game.status === 'voting') return 'Who drew without a clue?';
  if (game.status === 'results' || game.status === 'complete') {
    return game.blankCaught ? 'The line gave them away.' : 'The bluff stayed inside the lines.';
  }
  const active = state.players.find((player) => player.id === game.activePlayerId);
  return `${active?.name ?? 'An artist'} has the marker.`;
}
