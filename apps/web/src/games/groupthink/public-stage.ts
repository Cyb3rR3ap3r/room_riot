import type { PublicRoomState } from '@room-riot/game-engine';
import type { GroupthinkPublicView } from '@room-riot/groupthink';

import {
  appendScoreboard,
  appendStageHeading,
  createProgressMeter,
  createStageFrame,
  createStatusPill,
  textElement,
  type PublicStageDependencies,
} from '../public-stage.js';
import { groupthinkPresentation } from './presentation.js';

export function renderGroupthinkPublicStage(
  state: PublicRoomState,
  game: GroupthinkPublicView,
  dependencies: PublicStageDependencies,
): HTMLElement {
  const frame = createStageFrame(
    dependencies,
    groupthinkPresentation.stageClass,
    dependencies.createArtwork('groupthink'),
  );
  appendStageHeading(
    frame.copy,
    dependencies,
    groupthinkPresentation.stageCue(state.phase),
    game.prompt || groupthinkPresentation.stageFallbackTitle,
  );
  appendGroupthinkStatus(frame.copy, game, dependencies);
  frame.copy.append(
    createProgressMeter(dependencies, game.submittedCount, game.totalPlayers, 'Mind sync'),
  );
  if (game.status === 'results' || game.status === 'complete') {
    appendGroupthinkResults(frame.copy, game, dependencies);
  }
  if (state.phase === 'winner') appendScoreboard(frame.copy, state, dependencies);
  return frame.element;
}

export function appendGroupthinkStatus(
  container: HTMLElement,
  game: GroupthinkPublicView,
  dependencies: PublicStageDependencies,
): void {
  const prefix = `Round ${game.roundNumber}/${game.totalRounds} · ${game.submittedCount}/${game.totalPlayers} answered`;
  container.append(
    createStatusPill(dependencies, prefix, game.status === 'input' ? game.inputDeadlineAt : null),
  );
}

export function appendGroupthinkResults(
  container: HTMLElement,
  game: GroupthinkPublicView,
  dependencies: Pick<PublicStageDependencies, 'document'>,
): void {
  const section = dependencies.document.createElement('section');
  section.className = 'thought-clusters';
  section.append(textElement(dependencies.document, 'h2', 'Thought clusters'));
  const list = dependencies.document.createElement('ul');
  list.className = 'answer-list';
  if (!game.groups.length) {
    const empty = textElement(dependencies.document, 'li', 'No matching thoughts this round.');
    empty.className = 'experience-empty';
    list.append(empty);
  } else {
    for (const group of game.groups) {
      const item = dependencies.document.createElement('li');
      const score = textElement(
        dependencies.document,
        'span',
        `${group.count} match${group.count === 1 ? '' : 'es'} · ${group.points} pts`,
      );
      score.className = group.points > 0 ? 'connected' : 'muted';
      item.append(textElement(dependencies.document, 'span', group.answer), score);
      list.append(item);
    }
  }
  section.append(list);
  container.append(section);
}
