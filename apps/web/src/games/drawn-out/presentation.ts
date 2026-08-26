import { getGamePlayerLimits } from '@room-riot/contracts';

import type { GamePresentation } from '../types.js';

const classicPlayerLimits = getGamePlayerLimits('drawn-out', 'classic');

export const drawnOutPresentation: GamePresentation = {
  id: 'drawn-out',
  minPlayers: classicPlayerLimits.minimum,
  maxPlayers: classicPlayerLimits.maximum,
  getPlayerLimits: (drawnOutMode = 'classic') => getGamePlayerLimits('drawn-out', drawnOutMode),
  shellClass: 'sketch-studio',
  hostControlsClass: 'heat-controls',
  controllerClass: 'drawn-out-controller',
  controllerLobbyTitle: 'Your sketchbook is open.',
  controllerActiveTitle: 'Art was a mistake. Make it worse.',
  stageClass: 'drawn-out-stage',
  stageArtAlt: 'Drawn Out chaotic sketchbook illustration',
  roomPassClass: 'drawn-out-room-pass',
  roomPassEyebrow: 'Sketchbook open',
  rosterClass: 'artist-roster',
  rosterTitle: 'Questionable artists',
  rosterGridClass: 'artist-grid',
  rosterEmpty: 'Waiting for bad ideas…',
  joinKicker: 'Grab a marker',
  joinHelper: 'Enter the room code and prepare to draw something regrettable.',
  audioEnableLabel: 'Enable sketch audio',
  audioOnLabel: 'Sketch audio on',
  hostLabels: {
    start: 'Start Drawn Out',
    input: 'Advance the Art Disaster',
    alibi: 'Close the Alibi Window',
    voting: 'Reveal the Art Disaster',
    results: 'Start the Next Sketch',
  },
  stageCue: () => 'Fresh sketchbook',
  stageLobbyTitle: 'Get your drawing finger ready.',
  stageFallbackTitle: 'Art was a mistake.',
  phaseChoreography: {
    lobby: 'sketch-idle',
    intro: 'sketch-ignite',
    prompt: 'sketch-prompt',
    input: 'sketch-focus',
    alibi: 'sketch-focus',
    voting: 'sketch-reveal',
    results: 'sketch-score',
    scoring: 'sketch-score',
    winner: 'sketch-crown',
  },
  soundCue: (phase) => ({
    notes:
      phase === 'winner'
        ? [196, 293, 440, 587]
        : phase === 'results'
          ? [164, 246, 369]
          : [147, 196],
    spacing: 0.065,
    duration: 0.2,
    volume: 0.035,
    waveform: (index) => (index === 0 ? 'sawtooth' : 'square'),
  }),
};
