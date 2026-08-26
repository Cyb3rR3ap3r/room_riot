import {
  advanceGroupthinkRound,
  allPlayersSubmitted,
  createGroupthinkSession,
  loadGroupthinkPrompts,
  revealGroupthink,
  submitGroupthinkAnswer,
} from '../games/groupthink/dist/index.js';
import {
  allHotTakePlayersVoted,
  createHotTakeSession,
  loadHotTakePrompts,
  revealHotTakeAnswers,
  revealHotTakeVotes,
  submitHotTakeAnswer,
  submitHotTakeVote,
} from '../games/hot-take/dist/index.js';
import {
  advanceSuspectRound,
  allSuspectPlayersVoted,
  createSuspectSession,
  expireSuspectAlibi,
  loadSuspectPrompts,
  revealSuspectAnswers,
  revealSuspectVotes,
  submitSuspectAnswer,
  submitSuspectVote,
} from '../games/suspect/dist/index.js';
import {
  createDrawnOutSession,
  expireDrawnOutStep,
  loadDrawnOutPrompts,
} from '../games/drawn-out/dist/index.js';

const playerIdsFor = (count) => Array.from({ length: count }, (_, index) => `p${index + 1}`);

function scoreSummary(scores, playerIds) {
  const values = playerIds.map((playerId) => scores[playerId] ?? 0);
  const sorted = [...values].sort((left, right) => right - left);
  return {
    total: values.reduce((sum, value) => sum + value, 0),
    spread: Math.max(...values) - Math.min(...values),
    leaderGap: (sorted[0] ?? 0) - (sorted[1] ?? sorted[0] ?? 0),
    zeroScorePlayers: values.filter((value) => value === 0).length,
  };
}

function runGroupthink(playerIds, submissionOrder = playerIds, allowMissing = false) {
  const prompts = loadGroupthinkPrompts('standard').slice(0, 12);
  let session = createGroupthinkSession(prompts, 12, 0, 1_000, false);
  const scores = Object.fromEntries(playerIds.map((playerId) => [playerId, 0]));
  for (let round = 0; round < 12; round += 1) {
    for (const playerId of submissionOrder) {
      session = submitGroupthinkAnswer(
        session,
        playerId,
        playerId === 'p1' ? 'same' : `answer-${playerId}`,
      );
    }
    if (!allowMissing && !allPlayersSubmitted(session, playerIds))
      throw new Error('Groupthink submission coverage failed.');
    session = revealGroupthink(session);
    Object.entries(session.roundScores).forEach(([playerId, points]) => {
      scores[playerId] += points;
    });
    if (round < 11) session = advanceGroupthinkRound(session, prompts, round + 1, 1_000);
  }
  return { scores, summary: scoreSummary(scores, playerIds), roundDurationMs: 1_000 };
}

function runHotTake(playerIds) {
  const prompts = loadHotTakePrompts('standard').slice(0, 2);
  let session = createHotTakeSession(prompts, 1, 0, 1_000, false);
  for (const playerId of playerIds) {
    session = submitHotTakeAnswer(session, playerId, `take-${playerId}`, undefined, playerIds);
  }
  session = revealHotTakeAnswers(session, 1, 1_000);
  const firstEntryByOwner = new Map(
    Object.entries(session.answers).map(([id, answer]) => [id, answer.entryId]),
  );
  for (const voter of playerIds) {
    const target = [...firstEntryByOwner.entries()].find(([owner]) => owner !== voter)?.[1];
    session = submitHotTakeVote(session, voter, target, 2);
  }
  if (!allHotTakePlayersVoted(session, playerIds))
    throw new Error('Hot Take voting coverage failed.');
  session = revealHotTakeVotes(session);
  return {
    summary: scoreSummary(session.roundScores, playerIds),
    eligibleVoters: Object.keys(session.votes).length,
    roundDurationMs: 1_000,
  };
}

function runSuspect(playerIds) {
  const prompts = loadSuspectPrompts('standard').filter(
    (prompt) => prompt.roundType === 'standard',
  );
  let session = createSuspectSession(
    prompts,
    12,
    0,
    1_000,
    1_000,
    1_000,
    false,
    undefined,
    'balance-seed',
  );
  const scores = Object.fromEntries(playerIds.map((playerId) => [playerId, 0]));
  const exposure = Object.fromEntries(playerIds.map((playerId) => [playerId, 0]));
  for (let round = 0; round < 12; round += 1) {
    for (const playerId of playerIds)
      session = submitSuspectAnswer(session, playerId, true, round + 1);
    session = revealSuspectAnswers(session, playerIds, round + 2, 1_000, 1_000);
    if (session.status === 'alibi') session = expireSuspectAlibi(session, round + 3, 1_000);
    for (const playerId of playerIds)
      session = submitSuspectVote(session, playerId, [], playerIds, round + 4);
    if (!allSuspectPlayersVoted(session, playerIds))
      throw new Error('Suspect voting coverage failed.');
    session = revealSuspectVotes(session);
    session.selectedPlayerIds.forEach((playerId) => {
      exposure[playerId] += 1;
    });
    Object.entries(session.roundScores).forEach(([playerId, points]) => {
      scores[playerId] += points;
    });
    if (round < 11) session = advanceSuspectRound(session, prompts, round + 5, 1_000, 1_000, 1_000);
  }
  return {
    summary: scoreSummary(scores, playerIds),
    targetExposure: exposure,
    exposureSpread: Math.max(...Object.values(exposure)) - Math.min(...Object.values(exposure)),
    eligibleVoters: playerIds.length,
    roundDurationMs: 1_000,
  };
}

function runDrawnOutDeadline(playerIds) {
  const prompts = loadDrawnOutPrompts('standard').slice(0, 8);
  const drawPlayers = playerIds.length >= 3 ? playerIds.slice(0, 3) : playerIdsFor(3);
  const session = createDrawnOutSession(prompts, drawPlayers, 'telephone', 1, 0, 1_000, false);
  const expired = expireDrawnOutStep(session, 1_001, 1_000, 1_000);
  return {
    deadlineAdvanced:
      expired.deadlineAt !== session.deadlineAt || expired.status !== session.status,
    roundDurationMs: 1_000,
  };
}

const reports = [];
for (const count of [2, 4, 6, 8, 12]) {
  const playerIds = playerIdsFor(count);
  const normal = runGroupthink(playerIds);
  const reversed = runGroupthink(playerIds, [...playerIds].reverse());
  const disconnected = runGroupthink(playerIds, playerIds.slice(0, -1), true);
  const noInput = runGroupthink(playerIds, [], true);
  const joinOrderDelta = playerIds.reduce(
    (sum, playerId) => sum + Math.abs(normal.scores[playerId] - reversed.scores[playerId]),
    0,
  );
  reports.push({
    players: count,
    groupthink: { ...normal, joinOrderDelta, disconnected, noInput },
    hotTake: runHotTake(playerIds.slice(0, Math.max(3, Math.min(count, 6)))),
    suspect: runSuspect(playerIds),
    drawnOut: runDrawnOutDeadline(playerIds),
  });
}

const maxJoinOrderDelta = Math.max(...reports.map((report) => report.groupthink.joinOrderDelta));
const maxScoreSpread = Math.max(
  ...reports.flatMap((report) => [
    report.groupthink.summary.spread,
    report.hotTake.summary.spread,
    report.suspect.summary.spread,
  ]),
);
const maxSuspectExposureSpread = Math.max(
  ...reports.map((report) => report.suspect.exposureSpread),
);
const deadlinePathsPassed = reports.every((report) => report.drawnOut.deadlineAdvanced);
const passed = maxJoinOrderDelta === 0 && maxSuspectExposureSpread <= 1 && deadlinePathsPassed;
console.log(
  JSON.stringify(
    {
      passed,
      seed: 'balance-seed',
      maxJoinOrderDelta,
      maxScoreSpread,
      maxSuspectExposureSpread,
      deadlinePathsPassed,
      reports,
    },
    null,
    2,
  ),
);
if (!passed) process.exitCode = 1;
