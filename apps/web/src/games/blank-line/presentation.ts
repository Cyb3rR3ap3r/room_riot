import { getGamePlayerLimits } from '@room-riot/contracts';

import type { GamePresentation } from '../types.js';

const playerLimits = getGamePlayerLimits('blank-line');

export const blankLinePresentation: GamePresentation = {
  id: 'blank-line',
  minPlayers: playerLimits.minimum,
  maxPlayers: playerLimits.maximum,
  getPlayerLimits: () => playerLimits,
  shellClass: 'blank-line-studio',
  hostControlsClass: 'blank-line-controls',
  controllerClass: 'blank-line-controller',
  controllerLobbyTitle: 'The canvas is clean. Your alibi should be too.',
  controllerActiveTitle: 'One line. No hesitation.',
  stageClass: 'blank-line-stage',
  stageArtAlt: 'A neon collaborative drawing with one mysterious missing artist',
  roomPassClass: 'blank-line-room-pass',
  roomPassEyebrow: 'Studio access',
  rosterClass: 'blank-line-roster',
  rosterTitle: 'Artists under suspicion',
  rosterGridClass: 'blank-line-artist-grid',
  rosterEmpty: 'Waiting for suspicious talent…',
  joinKicker: 'Take the marker',
  joinHelper: 'Join the studio. You may know the topic—or you may have to bluff every line.',
  audioEnableLabel: 'Enable studio audio',
  audioOnLabel: 'Studio audio on',
  hostLabels: {
    start: 'Start Blank Line',
    input: 'Skip This Stroke',
    alibi: 'Close Discussion',
    voting: 'Reveal the Blank',
    results: 'Open a Fresh Canvas',
  },
  stageCue: (phase) =>
    phase === 'voting'
      ? 'Interrogation live'
      : phase === 'results'
        ? 'Identity exposed'
        : 'Live canvas',
  stageLobbyTitle: 'Every line leaves a clue.',
  stageFallbackTitle: 'Someone is drawing blind.',
  phaseChoreography: {
    lobby: 'blank-idle',
    intro: 'blank-ignite',
    prompt: 'blank-seal',
    input: 'blank-stroke',
    alibi: 'blank-scan',
    voting: 'blank-scan',
    results: 'blank-reveal',
    scoring: 'blank-score',
    winner: 'blank-crown',
  },
  soundCue: (phase) => ({
    notes:
      phase === 'winner'
        ? [196, 294, 392, 588]
        : phase === 'results'
          ? [110, 220, 330]
          : [165, 247],
    spacing: 0.075,
    duration: 0.22,
    volume: 0.035,
    waveform: (index) => (index === 0 ? 'triangle' : 'sawtooth'),
  }),
};
