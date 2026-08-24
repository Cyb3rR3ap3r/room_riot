import type { PublicRoomState } from '@room-riot/game-engine';
import type { HotTakeEntryView, HotTakePublicView } from '@room-riot/hot-take';

import {
  appendScoreboard,
  appendStageHeading,
  createProgressMeter,
  createStageFrame,
  createStatusPill,
  textElement,
  type PublicStageDependencies,
} from '../public-stage.js';
import { hotTakePresentation } from './presentation.js';

export function renderHotTakePublicStage(
  state: PublicRoomState,
  game: HotTakePublicView,
  dependencies: PublicStageDependencies,
): HTMLElement {
  const frame = createStageFrame(
    dependencies,
    hotTakePresentation.stageClass,
    dependencies.createArtwork('hot-take'),
  );
  appendStageHeading(
    frame.copy,
    dependencies,
    hotTakePresentation.stageCue(state.phase),
    game.prompt || hotTakePresentation.stageFallbackTitle,
  );
  appendHotTakeStatus(frame.copy, game, dependencies);
  frame.copy.append(
    createProgressMeter(
      dependencies,
      game.submittedCount,
      game.totalPlayers,
      game.status === 'voting' ? 'Takes on stage' : 'Heat building',
    ),
  );
  if (game.status === 'voting' || game.status === 'results' || game.status === 'complete') {
    appendHotTakeEntries(
      frame.copy,
      game.entries,
      game.status === 'voting' ? 'Anonymous takes' : 'The room has spoken',
      game.status === 'results' || game.status === 'complete',
      dependencies,
    );
  }
  if (state.phase === 'winner') appendScoreboard(frame.copy, state, dependencies);
  return frame.element;
}

export function appendHotTakeStatus(
  container: HTMLElement,
  game: HotTakePublicView,
  dependencies: PublicStageDependencies,
): void {
  const phaseText =
    game.status === 'voting' ? 'Vote now' : `${game.submittedCount}/${game.totalPlayers} answered`;
  container.append(
    createStatusPill(
      dependencies,
      `Round ${game.roundNumber}/${game.totalRounds} · ${phaseText}`,
      game.deadlineAt,
    ),
  );
}

export function appendHotTakeEntries(
  container: HTMLElement,
  entries: readonly HotTakeEntryView[],
  title: string,
  showScores: boolean,
  dependencies: Pick<PublicStageDependencies, 'document'>,
): void {
  const section = dependencies.document.createElement('section');
  section.className = 'take-wall';
  section.append(textElement(dependencies.document, 'h2', title));
  const list = dependencies.document.createElement('ul');
  list.className = 'answer-list';
  if (!entries.length) {
    const empty = textElement(dependencies.document, 'li', 'No takes reached the stage.');
    empty.className = 'experience-empty';
    list.append(empty);
  } else {
    for (const entry of entries) {
      const item = dependencies.document.createElement('li');
      item.append(textElement(dependencies.document, 'span', entry.answer));
      if (showScores) {
        const score = textElement(
          dependencies.document,
          'span',
          `${entry.voteCount} vote${entry.voteCount === 1 ? '' : 's'} · ${entry.points} pts`,
        );
        score.className = entry.points > 0 ? 'connected' : 'muted';
        item.append(score);
      }
      list.append(item);
    }
  }
  section.append(list);
  container.append(section);
}
