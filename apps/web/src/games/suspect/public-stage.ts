import type { PublicRoomState } from '@room-riot/game-engine';
import type { SuspectPublicView } from '@room-riot/suspect';

import {
  appendScoreboard,
  appendStageHeading,
  createProgressMeter,
  createStageFrame,
  createStatusPill,
  textElement,
  type PublicStageDependencies,
} from '../public-stage.js';
import { suspectPresentation } from './presentation.js';

export function renderSuspectPublicStage(
  state: PublicRoomState,
  game: SuspectPublicView,
  dependencies: PublicStageDependencies,
): HTMLElement {
  const frame = createStageFrame(
    dependencies,
    suspectPresentation.stageClass,
    dependencies.createArtwork('suspect'),
  );
  frame.element.setAttribute(
    'data-phase-choreography',
    suspectPresentation.phaseChoreography[state.phase],
  );
  appendStageHeading(
    frame.copy,
    dependencies,
    suspectPresentation.stageCue(state.phase),
    game.prompt || suspectPresentation.stageFallbackTitle,
  );
  appendSuspectStatus(frame.copy, game, dependencies);
  const progressLabel =
    game.status === 'input'
      ? 'Private answers'
      : game.status === 'alibi'
        ? 'Alibi window'
        : game.status === 'voting'
          ? 'Accusations'
          : 'Case resolved';
  if (game.status === 'voting') {
    const privacyNotice = textElement(
      dependencies.document,
      'p',
      'Ballots stay sealed until the case reveal.',
    );
    privacyNotice.className = 'suspect-callout';
    frame.copy.append(privacyNotice);
  } else {
    frame.copy.append(
      createProgressMeter(dependencies, game.submittedCount, game.totalPlayers, progressLabel),
    );
  }
  if (game.status === 'alibi' && game.alibiPlayerId) {
    const accused = state.players.find((player) => player.id === game.alibiPlayerId);
    const callout = textElement(
      dependencies.document,
      'p',
      `${accused?.avatar ?? '🕵️'} ${accused?.name ?? 'A player'} has been selected for questioning.`,
    );
    callout.className = 'suspect-callout';
    frame.copy.append(callout);
  }
  if (game.status === 'results' || game.status === 'complete') {
    appendSuspectResults(frame.copy, game, state, dependencies);
  }
  if (state.phase === 'winner') appendScoreboard(frame.copy, state, dependencies);
  return frame.element;
}

export function appendSuspectStatus(
  container: HTMLElement,
  game: SuspectPublicView,
  dependencies: PublicStageDependencies,
): void {
  const phaseText =
    game.status === 'input'
      ? `${game.submittedCount}/${game.totalPlayers} answered privately`
      : game.status === 'alibi'
        ? 'Alibi window'
        : game.status === 'voting'
          ? 'Accuse someone'
          : 'Case resolved';
  container.append(
    createStatusPill(
      dependencies,
      `Round ${game.roundNumber}/${game.totalRounds} · ${phaseText}`,
      game.deadlineAt,
    ),
  );
}

export function appendSuspectResults(
  container: HTMLElement,
  game: SuspectPublicView,
  state: PublicRoomState,
  dependencies: Pick<PublicStageDependencies, 'document'>,
): void {
  const section = dependencies.document.createElement('section');
  section.className = 'suspect-results';
  section.append(
    textElement(
      dependencies.document,
      'h2',
      game.roundType === 'false-accusation' ? 'The accusation was fake' : 'Case results',
    ),
  );
  const selected = textElement(dependencies.document, 'p', selectedPlayersCopy(game, state));
  selected.className = 'suspect-result-callout';
  section.append(selected);
  if (game.alibiText) {
    const alibi = textElement(dependencies.document, 'p', `Alibi: “${game.alibiText}”`);
    alibi.className = 'muted';
    section.append(alibi);
  }
  const votes = dependencies.document.createElement('ul');
  votes.className = 'answer-list suspect-vote-summary';
  if (!game.voteSummary.length) {
    const empty = textElement(dependencies.document, 'li', 'No accusations were cast.');
    empty.className = 'experience-empty';
    votes.append(empty);
  } else {
    for (const vote of game.voteSummary) {
      const names = vote.targetPlayerIds.length
        ? vote.targetPlayerIds
            .map((id) => state.players.find((player) => player.id === id)?.name ?? 'Unknown')
            .join(' + ')
        : 'No match';
      votes.append(
        textElement(
          dependencies.document,
          'li',
          `${names} · ${vote.count} vote${vote.count === 1 ? '' : 's'}`,
        ),
      );
    }
  }
  section.append(votes);
  container.append(section);
}

function selectedPlayersCopy(game: SuspectPublicView, state: PublicRoomState): string {
  if (!game.selectedPlayerIds.length) {
    if (game.roundType === 'false-accusation') {
      return 'No match. The sharp-eyed players saw through it.';
    }
    if (game.roundType === 'most-likely') {
      return 'No consensus. The jury could not agree on a best fit.';
    }
    return 'No match. The clue did not point to anyone.';
  }
  const names = game.selectedPlayerIds.map((id) => {
    const player = state.players.find((candidate) => candidate.id === id);
    return `${player?.avatar ?? '🕵️'} ${player?.name ?? 'Unknown player'}`;
  });
  return `${game.roundType === 'double-trouble' ? 'The pair was' : 'The suspect was'} ${names.join(' and ')}.`;
}
