import { getGamePlayerLimits } from '@room-riot/contracts';

import type { GamePresentation } from '../types.js';

const playerLimits = getGamePlayerLimits('groupthink');

export const groupthinkPresentation: GamePresentation = {
  id: 'groupthink',
  minPlayers: playerLimits.minimum,
  maxPlayers: playerLimits.maximum,
  getPlayerLimits: () => playerLimits,
  shellClass: 'consensus-lab',
  hostControlsClass: 'lab-controls',
  controllerClass: 'consensus-controller',
  controllerLobbyTitle: 'Your mind is in the loop.',
  controllerActiveTitle: 'Send a thought to the reactor.',
  stageClass: 'consensus-stage',
  stageArtAlt: 'Consensus reactor illustration',
  roomPassClass: 'lab-room-pass',
  roomPassEyebrow: 'Mind link active',
  rosterClass: 'mind-roster',
  rosterTitle: 'Connected minds',
  rosterGridClass: 'mind-grid',
  rosterEmpty: 'Scanning for minds…',
  joinKicker: 'Connect your mind',
  joinHelper: 'Enter the room code and tune into the consensus reactor.',
  audioEnableLabel: 'Enable lab audio',
  audioOnLabel: 'Lab audio on',
  hostLabels: {
    start: 'Start Groupthink',
    input: 'Open the Thought Clusters',
    alibi: 'Close the Alibi Window',
    voting: 'Reveal the Results',
    results: 'Sync the Next Round',
  },
  stageCue: (phase) =>
    phase === 'lobby' ? 'Calibrating the consensus reactor' : 'Consensus reactor online',
  stageLobbyTitle: 'Bring every brain into the loop.',
  stageFallbackTitle: 'Think alike.',
  phaseChoreography: {
    lobby: 'reactor-idle',
    intro: 'reactor-ignite',
    prompt: 'reactor-prompt',
    input: 'reactor-focus',
    alibi: 'reactor-focus',
    voting: 'reactor-reveal',
    results: 'reactor-score',
    scoring: 'reactor-score',
    winner: 'reactor-crown',
  },
  soundCue: (phase) => ({
    notes:
      phase === 'winner'
        ? [523, 659, 784, 1047]
        : phase === 'results'
          ? [440, 554, 659]
          : phase === 'input'
            ? [392, 523]
            : [330, 392],
    spacing: 0.09,
    duration: 0.28,
    volume: 0.065,
    waveform: (index) => (index % 2 ? 'triangle' : 'sine'),
  }),
};
