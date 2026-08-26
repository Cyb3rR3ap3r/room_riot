import { getGamePlayerLimits } from '@room-riot/contracts';

import type { GamePresentation } from '../types.js';

const playerLimits = getGamePlayerLimits('suspect');

export const suspectPresentation: GamePresentation = {
  id: 'suspect',
  minPlayers: playerLimits.minimum,
  maxPlayers: playerLimits.maximum,
  getPlayerLimits: () => playerLimits,
  shellClass: 'case-room',
  hostControlsClass: 'heat-controls',
  controllerClass: 'suspect-controller',
  controllerLobbyTitle: 'Your case file is open.',
  controllerActiveTitle: 'Keep your answer secret, then make your accusation.',
  stageClass: 'heat-stage',
  stageArtAlt: 'Suspect investigation board illustration',
  roomPassClass: 'suspect-room-pass',
  roomPassEyebrow: 'Case file active',
  rosterClass: 'jury-roster',
  rosterTitle: 'The jury',
  rosterGridClass: 'jury-grid',
  rosterEmpty: 'Waiting for witnesses…',
  joinKicker: 'Join the jury',
  joinHelper: 'Enter the room code and keep your answers secret.',
  audioEnableLabel: 'Enable case audio',
  audioOnLabel: 'Case audio on',
  hostLabels: {
    start: 'Start Suspect',
    input: 'Open the Case',
    alibi: 'Close the Alibi Window',
    voting: 'Reveal the Accusations',
    results: 'Open the Next Case',
  },
  stageCue: (phase) =>
    phase === 'lobby'
      ? 'Open case file'
      : phase === 'alibi'
        ? 'The suspect has the floor'
        : phase === 'voting'
          ? 'Accusations are live'
          : 'Investigation in progress',
  stageLobbyTitle: 'Set the jury and open the case.',
  stageFallbackTitle: 'Everybody looks guilty.',
  phaseChoreography: {
    lobby: 'case-idle',
    intro: 'case-ignite',
    prompt: 'case-prompt',
    input: 'case-focus',
    alibi: 'case-focus',
    voting: 'case-reveal',
    results: 'case-score',
    scoring: 'case-score',
    winner: 'case-crown',
  },
  soundCue: (phase) => ({
    notes:
      phase === 'winner'
        ? [196, 293, 440, 587]
        : phase === 'results'
          ? [164, 246, 369]
          : phase === 'alibi'
            ? [220, 277, 330]
            : [147, 196],
    spacing: 0.08,
    duration: 0.2,
    volume: 0.035,
    waveform: () => 'triangle',
  }),
};
