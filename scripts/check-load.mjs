import { performance } from 'node:perf_hooks';
import { setTimeout as wait } from 'node:timers/promises';

import { RoomManager } from '../apps/server/dist/room-manager.js';
import { OperationalMetrics } from '../apps/server/dist/metrics.js';

const roomCount = Number(process.env.ROOM_RIOT_LOAD_ROOMS ?? 100);
const playersPerRoom = 12;
const metrics = new OperationalMetrics();
const writeLog = console.log;
console.log = () => {};
const manager = new RoomManager({
  maxRooms: roomCount,
  groupthinkInputDurationMs: 25,
  randomizePrompts: false,
  metrics,
});
const startedAt = performance.now();
const cpuStarted = process.cpuUsage();
const actionLatencies = [];
const reconnectLatencies = [];
const rooms = [];

try {
  for (let roomIndex = 0; roomIndex < roomCount; roomIndex += 1) {
    const roomStarted = performance.now();
    const room = manager.createRoom({});
    rooms.push(room);
    const players = [];
    for (let playerIndex = 0; playerIndex < playersPerRoom; playerIndex += 1) {
      const actionStarted = performance.now();
      const joined = manager.joinRoom({
        roomCode: room.roomCode,
        name: `Load ${roomIndex + 1}-${playerIndex + 1}`,
        avatar: '🎮',
      });
      players.push(joined);
      const actionLatency = performance.now() - actionStarted;
      actionLatencies.push(actionLatency);
      metrics.observe('socket.event_latency_ms', actionLatency);
    }
    manager.startGame(room.roomCode, room.hostToken, 'groupthink');
    const startLatency = performance.now() - roomStarted;
    actionLatencies.push(startLatency);
    metrics.observe('socket.event_latency_ms', startLatency);
    for (const player of players) {
      const reconnectStarted = performance.now();
      manager.joinRoom({
        roomCode: room.roomCode,
        name: 'Reconnected player',
        avatar: '🎮',
        playerToken: player.playerToken,
      });
      const reconnectLatency = performance.now() - reconnectStarted;
      reconnectLatencies.push(reconnectLatency);
      metrics.observe('socket.event_latency_ms', reconnectLatency);
    }
  }

  await wait(100);
  const snapshot = metrics.snapshot(manager.getOperationalStatus());
  const timerDrift = snapshot.latencyMs['timer.drift_ms'];
  const eventLatency = snapshot.latencyMs['socket.event_latency_ms'];
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage(cpuStarted);
  const elapsedMs = performance.now() - startedAt;
  const maxActionLatencyMs = Math.max(...actionLatencies);
  const maxReconnectLatencyMs = Math.max(...reconnectLatencies);
  const passed =
    snapshot.operational?.activeRooms === roomCount &&
    snapshot.operational.activePlayers === roomCount * playersPerRoom &&
    (timerDrift?.maxMs ?? 0) < 1_000 &&
    maxActionLatencyMs < 1_000 &&
    maxReconnectLatencyMs < 1_000;

  console.log = writeLog;
  console.log(
    JSON.stringify(
      {
        passed,
        rooms: roomCount,
        players: roomCount * playersPerRoom,
        elapsedMs: Number(elapsedMs.toFixed(2)),
        timerDriftMs: timerDrift ?? null,
        eventLatencyMs: eventLatency ?? null,
        actionLatencyMs: {
          count: actionLatencies.length,
          max: Number(maxActionLatencyMs.toFixed(2)),
        },
        reconnectLatencyMs: {
          count: reconnectLatencies.length,
          max: Number(maxReconnectLatencyMs.toFixed(2)),
        },
        cpuMicros: cpu,
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
      },
      null,
      2,
    ),
  );
  if (!passed) process.exitCode = 1;
} finally {
  console.log = writeLog;
  manager.close();
}
