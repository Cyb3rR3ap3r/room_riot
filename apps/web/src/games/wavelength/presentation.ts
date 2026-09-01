import { getGamePlayerLimits } from '@room-riot/contracts';

import type { GamePresentation } from '../types.js';

const playerLimits = getGamePlayerLimits('wavelength');

export const wavelengthPresentation: GamePresentation = {
  id: 'wavelength',
  minPlayers: playerLimits.minimum,
  maxPlayers: playerLimits.maximum,
  getPlayerLimits: () => playerLimits,
  shellClass: 'wavelength-command',
  hostControlsClass: 'wavelength-controls',
  controllerClass: 'wavelength-controller',
  controllerLobbyTitle: 'Your receiver is standing by.',
  controllerActiveTitle: 'Read the clue. Trust your signal.',
  stageClass: 'wavelength-stage',
  stageArtAlt: 'A neon broadcast receiver firing cyan and magenta signal waves',
  roomPassClass: 'wavelength-room-pass',
  roomPassEyebrow: 'Receiver access',
  rosterClass: 'wavelength-roster',
  rosterTitle: 'Receivers online',
  rosterGridClass: 'wavelength-receiver-grid',
  rosterEmpty: 'Searching for a signal…',
  joinKicker: 'Join the frequency',
  joinHelper: 'Connect your receiver, debate the clue, and lock your private read.',
  audioEnableLabel: 'Enable signal audio',
  audioOnLabel: 'Signal audio on',
  hostLabels: {
    start: 'Open the Channel',
    input: 'Force Next Signal Phase',
    alibi: 'Close Channel',
    voting: 'Force Scan Reveal',
    results: 'Transmit Next Signal',
  },
  stageCue: (phase) =>
    phase === 'voting'
      ? 'Rival intercept live'
      : phase === 'results'
        ? 'Signal scan complete'
        : 'Broadcast channel live',
  stageLobbyTitle: 'Find the signal between the extremes.',
  stageFallbackTitle: 'The room is tuning in.',
  phaseChoreography: {
    lobby: 'wave-idle',
    intro: 'wave-boot',
    prompt: 'wave-pair',
    input: 'wave-tune',
    alibi: 'wave-scan',
    voting: 'wave-intercept',
    results: 'wave-reveal',
    scoring: 'wave-score',
    winner: 'wave-victory',
  },
  soundCue: (phase) => ({
    notes:
      phase === 'winner'
        ? [146, 220, 330, 440, 660]
        : phase === 'results'
          ? [110, 330, 550]
          : phase === 'voting'
            ? [98, 147, 196]
            : [165, 220, 277],
    spacing: 0.06,
    duration: 0.2,
    volume: 0.03,
    waveform: (index) => (index % 2 === 0 ? 'sine' : 'triangle'),
  }),
};
