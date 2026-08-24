import type { DrawnOutMode, GamePlayerLimits, RoomPhase } from '@room-riot/contracts';

import type { SupportedGameId } from '../app/catalog.js';

export interface SoundCueModel {
  readonly notes: readonly number[];
  readonly spacing: number;
  readonly duration: number;
  readonly volume: number;
  readonly waveform: (index: number) => OscillatorType;
}

export interface GamePresentation {
  readonly id: SupportedGameId;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly getPlayerLimits: (drawnOutMode?: DrawnOutMode) => GamePlayerLimits;
  readonly shellClass: string;
  readonly hostControlsClass: string;
  readonly controllerClass: string;
  readonly controllerLobbyTitle: string;
  readonly controllerActiveTitle: string;
  readonly stageClass: string;
  readonly stageArtAlt: string;
  readonly roomPassClass: string;
  readonly roomPassEyebrow: string;
  readonly rosterClass: string;
  readonly rosterTitle: string;
  readonly rosterGridClass: string;
  readonly rosterEmpty: string;
  readonly joinKicker: string;
  readonly joinHelper: string;
  readonly audioEnableLabel: string;
  readonly audioOnLabel: string;
  readonly hostLabels: Readonly<{
    start: string;
    input: string;
    alibi: string;
    voting: string;
    results: string;
  }>;
  stageCue(phase: RoomPhase): string;
  stageLobbyTitle: string;
  stageFallbackTitle: string;
  soundCue(phase: RoomPhase): SoundCueModel;
}
