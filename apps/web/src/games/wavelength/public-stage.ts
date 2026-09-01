import type { WavelengthPublicView, WavelengthTeamId } from '@room-riot/wavelength';
import type { PublicRoomState } from '@room-riot/game-engine';

import {
  appendStageHeading,
  createProgressMeter,
  createStatusPill,
  textElement,
  type PublicStageDependencies,
} from '../public-stage.js';
import { wavelengthPresentation } from './presentation.js';

export function renderWavelengthPublicStage(
  state: PublicRoomState,
  game: WavelengthPublicView,
  dependencies: PublicStageDependencies,
): HTMLElement {
  const stage = dependencies.document.createElement('main');
  stage.className = `wavelength-stage wavelength-${game.status}`;
  stage.setAttribute(
    'data-phase-choreography',
    wavelengthPresentation.phaseChoreography[state.phase],
  );

  const command = dependencies.document.createElement('section');
  command.className = 'wavelength-command-panel';
  const heading = dependencies.document.createElement('header');
  heading.className = 'wavelength-stage-heading';
  appendStageHeading(heading, dependencies, stageCue(game), stageTitle(game, state));
  heading.append(
    createStatusPill(
      dependencies,
      `Round ${game.roundNumber}/${game.totalRounds}`,
      game.deadlineAt,
    ),
  );
  command.append(heading, createSpectrum(game, state, dependencies));

  const telemetry = dependencies.document.createElement('aside');
  telemetry.className = 'wavelength-telemetry';
  telemetry.append(createModeBadge(game, dependencies));
  if (game.mode === 'signal-clash') appendTeamScores(telemetry, game, dependencies);
  else appendOpenScore(telemetry, game, dependencies);

  if (game.status === 'clue') appendBroadcaster(telemetry, game, state, dependencies);
  if (game.status === 'tuning' || game.status === 'intercept') {
    telemetry.append(
      createProgressMeter(
        dependencies,
        game.submittedCount,
        game.expectedCount,
        game.status === 'tuning' ? 'Receivers locked' : 'Intercepts sealed',
      ),
    );
  }
  if (game.status === 'results' || game.status === 'complete') {
    appendResultTelemetry(telemetry, game, dependencies);
  }
  if (game.status === 'complete') appendWinner(telemetry, game, dependencies);

  stage.append(command, telemetry);
  return stage;
}

function createSpectrum(
  game: WavelengthPublicView,
  state: PublicRoomState,
  dependencies: PublicStageDependencies,
): HTMLElement {
  const shell = dependencies.document.createElement('section');
  shell.className = 'wavelength-spectrum-shell';
  const clue = dependencies.document.createElement('div');
  clue.className = `wavelength-clue${game.clue ? ' is-live' : ''}`;
  const broadcaster = state.players.find((player) => player.id === game.broadcasterId);
  clue.append(
    textElement(
      dependencies.document,
      'small',
      game.clue ? `${broadcaster?.name ?? 'Broadcaster'} transmitted` : 'Awaiting transmission',
    ),
    textElement(dependencies.document, 'strong', game.clue ? `“${game.clue}”` : 'SIGNAL MASKED'),
  );

  const dial = dependencies.document.createElement('div');
  dial.className = 'wavelength-spectrum';
  dial.setAttribute('role', 'img');
  dial.setAttribute('aria-label', `${game.leftPole} to ${game.rightPole}`);
  const energy = dependencies.document.createElement('div');
  energy.className = 'wavelength-energy-field';
  energy.setAttribute('aria-hidden', 'true');
  dial.append(energy);

  if (game.target !== null) {
    const target = dependencies.document.createElement('div');
    target.className = 'wavelength-target-window';
    target.setAttribute('style', `--signal-position: ${game.target}%`);
    target.append(textElement(dependencies.document, 'span', 'TARGET'));
    dial.append(target);
  }
  if (game.consensus !== null) {
    const lock = dependencies.document.createElement('div');
    lock.className = 'wavelength-consensus-lock';
    lock.setAttribute('style', `--signal-position: ${game.consensus}%`);
    lock.append(textElement(dependencies.document, 'span', 'TEAM LOCK'));
    dial.append(lock);
  }
  for (const [index, marker] of game.markers.entries()) {
    const player = state.players.find((candidate) => candidate.id === marker.playerId);
    const dot = dependencies.document.createElement('div');
    dot.className = 'wavelength-player-marker';
    dot.setAttribute('style', `--signal-position: ${marker.position}%; --marker-index: ${index}`);
    dot.title = `${player?.name ?? 'Receiver'}: ${marker.position}`;
    dot.append(textElement(dependencies.document, 'span', player?.avatar ?? '•'));
    dial.append(dot);
  }

  const poles = dependencies.document.createElement('div');
  poles.className = 'wavelength-stage-poles';
  poles.append(
    textElement(dependencies.document, 'strong', game.leftPole),
    textElement(dependencies.document, 'strong', game.rightPole),
  );
  shell.append(clue, dial, poles);
  return shell;
}

function createModeBadge(
  game: WavelengthPublicView,
  dependencies: PublicStageDependencies,
): HTMLElement {
  const badge = dependencies.document.createElement('div');
  badge.className = 'wavelength-mode-badge';
  badge.append(
    textElement(
      dependencies.document,
      'span',
      game.mode === 'open-channel' ? 'OPEN CHANNEL' : 'SIGNAL CLASH',
    ),
    textElement(
      dependencies.document,
      'strong',
      game.mode === 'open-channel' ? 'One room. One frequency.' : 'Cyan vs Magenta',
    ),
  );
  return badge;
}

function appendTeamScores(
  container: HTMLElement,
  game: WavelengthPublicView,
  dependencies: PublicStageDependencies,
): void {
  const scores = dependencies.document.createElement('div');
  scores.className = 'wavelength-team-scores';
  (['cyan', 'magenta'] as const).forEach((teamId) => {
    const card = dependencies.document.createElement('article');
    card.className = `wavelength-team-card team-${teamId}${game.activeTeamId === teamId ? ' is-active' : ''}`;
    card.append(
      textElement(dependencies.document, 'span', teamId === 'cyan' ? 'CYAN' : 'MAGENTA'),
      textElement(dependencies.document, 'strong', String(game.teamScores[teamId])),
      textElement(
        dependencies.document,
        'small',
        game.activeTeamId === teamId ? 'TRANSMITTING' : 'STANDING BY',
      ),
    );
    scores.append(card);
  });
  container.append(scores);
}

function appendOpenScore(
  container: HTMLElement,
  game: WavelengthPublicView,
  dependencies: PublicStageDependencies,
): void {
  const score = dependencies.document.createElement('div');
  score.className = 'wavelength-room-score';
  score.append(
    textElement(dependencies.document, 'span', 'ROOM SIGNAL'),
    textElement(dependencies.document, 'strong', String(game.roomScore)),
    textElement(dependencies.document, 'small', signalRating(game.roomScore, game.roundNumber)),
  );
  container.append(score);
}

function appendBroadcaster(
  container: HTMLElement,
  game: WavelengthPublicView,
  state: PublicRoomState,
  dependencies: PublicStageDependencies,
): void {
  const player = state.players.find((candidate) => candidate.id === game.broadcasterId);
  const card = dependencies.document.createElement('div');
  card.className = 'wavelength-broadcaster-card';
  card.append(
    textElement(dependencies.document, 'span', 'BROADCASTER'),
    textElement(
      dependencies.document,
      'strong',
      `${player?.avatar ?? '◉'} ${player?.name ?? 'Signal operator'}`,
    ),
    textElement(dependencies.document, 'small', 'Reading the hidden frequency…'),
  );
  container.append(card);
}

function appendResultTelemetry(
  container: HTMLElement,
  game: WavelengthPublicView,
  dependencies: PublicStageDependencies,
): void {
  const result = game.result;
  if (!result) return;
  const stats = dependencies.document.createElement('div');
  stats.className = 'wavelength-result-grid';
  const values: readonly [string, string][] = [
    ['Accuracy', `+${result.accuracyPoints}`],
    ['Drift', String(result.distance)],
    ['Sync', result.syncBonus ? '+1' : result.spread === null ? '—' : `${result.spread} spread`],
    [
      'Intercept',
      result.interceptPrediction === null
        ? 'No lock'
        : result.interceptCorrect
          ? `+${result.interceptPoints}`
          : 'Missed',
    ],
  ];
  for (const [label, value] of values) {
    const item = dependencies.document.createElement('article');
    item.append(
      textElement(dependencies.document, 'span', label),
      textElement(dependencies.document, 'strong', value),
    );
    stats.append(item);
  }
  container.append(stats);
}

function appendWinner(
  container: HTMLElement,
  game: WavelengthPublicView,
  dependencies: PublicStageDependencies,
): void {
  const winner = dependencies.document.createElement('section');
  winner.className = 'wavelength-winner';
  if (game.mode === 'open-channel') {
    winner.append(
      textElement(dependencies.document, 'span', 'FINAL ROOM RATING'),
      textElement(dependencies.document, 'h2', signalRating(game.roomScore, game.totalRounds)),
    );
  } else {
    const winningTeam: WavelengthTeamId | null =
      game.teamScores.cyan === game.teamScores.magenta
        ? null
        : game.teamScores.cyan > game.teamScores.magenta
          ? 'cyan'
          : 'magenta';
    winner.append(
      textElement(dependencies.document, 'span', 'FINAL TRANSMISSION'),
      textElement(
        dependencies.document,
        'h2',
        winningTeam ? `${winningTeam.toUpperCase()} OWNS THE AIRWAVES` : 'PERFECT SIGNAL TIE',
      ),
    );
  }
  container.append(winner);
}

function stageCue(game: WavelengthPublicView): string {
  if (game.status === 'clue') return 'Private frequency acquired';
  if (game.status === 'tuning') return 'Collective receiver field';
  if (game.status === 'intercept') return 'Rival triangulation';
  if (game.status === 'complete') return 'Channel closed';
  return 'Signal scan complete';
}

function stageTitle(game: WavelengthPublicView, state: PublicRoomState): string {
  const broadcaster = state.players.find((player) => player.id === game.broadcasterId);
  if (game.status === 'clue')
    return `${broadcaster?.name ?? 'The Broadcaster'} is choosing one clue.`;
  if (game.status === 'tuning') return 'Talk it out. Then trust your private read.';
  if (game.status === 'intercept') return 'Did the lock drift low, land, or drift high?';
  if (game.status === 'complete') return 'The room has found its frequency.';
  return game.result?.distance === 0
    ? 'DEAD CENTER.'
    : `The lock missed by ${game.result?.distance ?? 0}.`;
}

function signalRating(score: number, rounds: number): string {
  const possible = Math.max(1, rounds * 6);
  const ratio = score / possible;
  if (ratio >= 0.8) return 'CRYSTAL CLEAR';
  if (ratio >= 0.55) return 'LOCKED IN';
  if (ratio >= 0.3) return 'TUNING UP';
  return 'BEAUTIFUL STATIC';
}
