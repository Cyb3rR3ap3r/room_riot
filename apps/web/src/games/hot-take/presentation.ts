import { getGamePlayerLimits } from '@room-riot/contracts';

import type { GamePresentation } from '../types.js';

const playerLimits = getGamePlayerLimits('hot-take');

export const hotTakePresentation: GamePresentation = {
  id: 'hot-take',
  minPlayers: playerLimits.minimum,
  maxPlayers: playerLimits.maximum,
  getPlayerLimits: () => playerLimits,
  shellClass: 'live-heat',
  hostControlsClass: 'heat-controls',
  controllerClass: 'live-heat-controller',
  controllerLobbyTitle: 'Your backstage pass is live.',
  controllerActiveTitle: 'The stage is yours.',
  stageClass: 'heat-stage',
  stageArtAlt: 'Hot Take stage illustration',
  roomPassClass: 'heat-room-pass',
  roomPassEyebrow: 'Backstage access',
  rosterClass: 'audience-roster',
  rosterTitle: 'Tonight’s audience',
  rosterGridClass: 'audience-grid',
  rosterEmpty: 'Doors are open…',
  joinKicker: 'Claim your backstage pass',
  joinHelper: 'Enter the room code and step into tonight’s live audience.',
  audioEnableLabel: 'Enable stage audio',
  audioOnLabel: 'Stage audio on',
  hostLabels: {
    start: 'Start Hot Take',
    input: 'Put the Takes on Stage',
    alibi: 'Close the Alibi Window',
    voting: 'Reveal the Hottest Take',
    results: 'Turn Up the Next Round',
  },
  stageCue: (phase) =>
    phase === 'lobby'
      ? 'Pre-show'
      : phase === 'voting'
        ? 'The vote is live'
        : 'Live on the Hot Take stage',
  stageLobbyTitle: 'Get the room ready to bring the heat.',
  stageFallbackTitle: 'Make it spicy.',
  soundCue: (phase) => ({
    notes:
      phase === 'winner'
        ? [220, 330, 440, 660]
        : phase === 'results'
          ? [196, 294, 494]
          : phase === 'voting'
            ? [260, 390, 520]
            : [174, 261],
    spacing: 0.065,
    duration: 0.2,
    volume: 0.035,
    waveform: (index) => (index === 0 ? 'sawtooth' : 'square'),
  }),
};
