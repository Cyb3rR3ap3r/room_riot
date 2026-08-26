import type { RoomManagerOperationalStatus } from './room-manager.js';

interface LatencySummary {
  count: number;
  totalMs: number;
  maxMs: number;
}

export interface OperationalMetricsSnapshot {
  readonly startedAt: string;
  readonly uptimeSeconds: number;
  readonly process: {
    readonly rssBytes: number;
    readonly heapUsedBytes: number;
  };
  readonly counters: Readonly<Record<string, number>>;
  readonly latencyMs: Readonly<Record<string, { count: number; averageMs: number; maxMs: number }>>;
  readonly operational?: RoomManagerOperationalStatus;
}

/** In-memory, privacy-safe signals for a single server process. */
export class OperationalMetrics {
  private readonly startedAtMs = Date.now();
  private readonly counters = new Map<string, number>();
  private readonly latencies = new Map<string, LatencySummary>();

  increment(name: string, amount = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + amount);
  }

  observe(name: string, durationMs: number): void {
    const current = this.latencies.get(name) ?? { count: 0, totalMs: 0, maxMs: 0 };
    current.count += 1;
    current.totalMs += Math.max(0, durationMs);
    current.maxMs = Math.max(current.maxMs, durationMs);
    this.latencies.set(name, current);
  }

  snapshot(operational?: RoomManagerOperationalStatus): OperationalMetricsSnapshot {
    const latencyMs = Object.fromEntries(
      [...this.latencies.entries()].map(([name, value]) => [
        name,
        {
          count: value.count,
          averageMs: Number((value.totalMs / value.count).toFixed(2)),
          maxMs: Number(value.maxMs.toFixed(2)),
        },
      ]),
    );
    return {
      startedAt: new Date(this.startedAtMs).toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startedAtMs) / 1000),
      process: {
        rssBytes: process.memoryUsage().rss,
        heapUsedBytes: process.memoryUsage().heapUsed,
      },
      counters: Object.fromEntries(this.counters),
      latencyMs,
      ...(operational ? { operational } : {}),
    };
  }
}
