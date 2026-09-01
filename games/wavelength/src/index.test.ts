import { describe, expect, it } from 'vitest';

import type { ContentMode, PlayerId } from '@room-riot/contracts';

import {
  advanceWavelengthRound,
  createWavelengthSession,
  expireWavelengthStep,
  getWavelengthPlayerView,
  getWavelengthPublicView,
  loadWavelengthPrompts,
  submitWavelengthChoice,
  submitWavelengthClue,
} from './index.js';

const players = ['p1', 'p2', 'p3', 'p4'] as PlayerId[];

describe('WaveLength content', () => {
  it.each(['family', 'standard', 'after-dark'] satisfies ContentMode[])(
    'loads 100 unique %s signals across every category',
    (mode) => {
      const prompts = loadWavelengthPrompts(mode);
      expect(prompts).toHaveLength(100);
      expect(new Set(prompts.map((prompt) => prompt.id)).size).toBe(100);
      expect(new Set(prompts.map((prompt) => `${prompt.left}|${prompt.right}`)).size).toBe(100);
      expect(new Set(prompts.map((prompt) => prompt.category))).toEqual(
        new Set(['routines', 'things', 'culture', 'social', 'imagination']),
      );
    },
  );
});

describe('WaveLength round loop', () => {
  it('runs Open Channel with private target data and a weighted consensus', () => {
    const prompts = loadWavelengthPrompts('family');
    let session = createWavelengthSession(prompts, players.slice(0, 3), 1, 'open-channel', 1_000);
    expect(getWavelengthPublicView(session).target).toBeNull();
    expect(getWavelengthPlayerView(session, players[0]!).privateTarget).toBe(22);
    expect(getWavelengthPlayerView(session, players[1]!).privateTarget).toBeNull();

    session = submitWavelengthClue(session, players[0]!, 'Sunday sunrise', 1_100);
    session = submitWavelengthChoice(session, players[1]!, 'marker:20:1', 1_200);
    session = submitWavelengthChoice(session, players[2]!, 'marker:24:3', 1_300);

    expect(session.status).toBe('results');
    expect(session.result).toMatchObject({ consensus: 24, accuracyPoints: 5, syncBonus: 1 });
    expect(session.roomScore).toBe(6);
    expect(getWavelengthPublicView(session).markers).toHaveLength(2);
    expect(advanceWavelengthRound(session, prompts, players.slice(0, 3)).status).toBe('complete');
  });

  it('runs Signal Clash and resolves a three-way rival interception', () => {
    const prompts = loadWavelengthPrompts('standard');
    let session = createWavelengthSession(prompts, players, 2, 'signal-clash', 2_000);
    expect(session.teams).toEqual({ cyan: ['p1', 'p3'], magenta: ['p2', 'p4'] });
    session = submitWavelengthClue(session, players[0]!, 'Sunday sunrise', 2_100);
    session = submitWavelengthChoice(session, players[2]!, 'marker:42:2', 2_200);
    expect(session.status).toBe('intercept');
    session = submitWavelengthChoice(session, players[1]!, 'intercept:high', 2_300);
    session = submitWavelengthChoice(session, players[3]!, 'intercept:high', 2_400);
    expect(session.status).toBe('results');
    expect(session.result).toMatchObject({ interceptOutcome: 'high', interceptCorrect: true });
    expect(session.teamScores.magenta).toBe(2);

    session = advanceWavelengthRound(session, prompts, players, 3_000, 35_000, false);
    expect(session.status).toBe('clue');
    expect(session.activeTeamId).toBe('magenta');
    expect(session.broadcasterId).toBe('p2');
  });

  it('supports a two-player Signal Clash relay without an impossible interception', () => {
    const prompts = loadWavelengthPrompts('family');
    let session = createWavelengthSession(prompts, players.slice(0, 2), 1, 'signal-clash', 5_000);
    expect(session.receiverIds).toEqual(['p2']);
    expect(session.guestReceiverIds).toEqual(['p2']);
    expect(session.interceptorIds).toEqual([]);
    session = submitWavelengthClue(session, players[0]!, 'Sunday sunrise', 5_100);
    session = submitWavelengthChoice(session, players[1]!, 'marker:21:2', 5_200);
    expect(session.status).toBe('results');
  });

  it('rejects illegal clues, duplicate inputs, wrong roles, and expired actions', () => {
    const prompts = loadWavelengthPrompts('family');
    let session = createWavelengthSession(prompts, players.slice(0, 3), 1, 'open-channel', 10_000);
    expect(() => submitWavelengthClue(session, players[1]!, 'Sunrise', 10_100)).toThrow(
      'Only the Broadcaster',
    );
    expect(() => submitWavelengthClue(session, players[0]!, 'Ready at 7', 10_100)).toThrow(
      'numbers',
    );
    expect(() => submitWavelengthClue(session, players[0]!, 'barely', 10_100)).toThrow('pole');
    session = submitWavelengthClue(session, players[0]!, 'Sunday sunrise', 10_100);
    session = submitWavelengthChoice(session, players[1]!, 'marker:20:1', 10_200);
    expect(() => submitWavelengthChoice(session, players[1]!, 'marker:22:2', 10_300)).toThrow(
      'already locked',
    );
    expect(() => submitWavelengthChoice(session, players[2]!, 'marker:101:2', 10_300)).toThrow(
      '0 to 100',
    );
    expect(() => submitWavelengthChoice(session, players[2]!, 'marker:22:2', 70_000)).toThrow(
      'deadline',
    );
  });

  it('advances safely when every deadline expires with no input', () => {
    const prompts = loadWavelengthPrompts('standard');
    let session = createWavelengthSession(prompts, players, 1, 'signal-clash', 100);
    session = expireWavelengthStep(session, 40_000);
    expect(session.status).toBe('tuning');
    session = expireWavelengthStep(session, 100_000);
    expect(session.status).toBe('intercept');
    session = expireWavelengthStep(session, 140_000);
    expect(session.status).toBe('results');
    expect(session.result?.consensus).toBe(50);
  });
});
