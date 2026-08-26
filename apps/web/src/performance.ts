export interface BrowserPerformanceMetrics {
  readonly largestContentfulPaintMs: number | null;
  readonly cumulativeLayoutShift: number;
  readonly totalLongTaskMs: number;
  readonly maxCriticalInteractionLatencyMs: number;
}

interface PerformanceEntryLike {
  readonly entryType?: string;
  readonly startTime: number;
  readonly duration: number;
  readonly value?: number;
  readonly hadRecentInput?: boolean;
  readonly processingStart?: number;
}

interface PerformanceEntryListLike {
  getEntries(): readonly PerformanceEntryLike[];
}

interface PerformanceObserverLike {
  observe(options: { readonly type: string; readonly buffered?: boolean }): void;
  disconnect(): void;
}

type PerformanceObserverConstructor = new (
  callback: (list: PerformanceEntryListLike) => void,
) => PerformanceObserverLike;

interface PerformanceRuntime {
  now(): number;
}

export interface BrowserPerformanceMonitor {
  snapshot(): BrowserPerformanceMetrics;
  recordCriticalInteraction(startTime?: number): () => number;
  disconnect(): void;
}

export interface PerformanceMonitorOptions {
  readonly performance?: PerformanceRuntime | null;
  readonly PerformanceObserver?: PerformanceObserverConstructor | null;
}

export function createBrowserPerformanceMonitor(
  options: PerformanceMonitorOptions = {},
): BrowserPerformanceMonitor {
  const runtime =
    options.performance !== undefined
      ? options.performance
      : typeof performance === 'undefined'
        ? null
        : (performance as unknown as PerformanceRuntime);
  const Observer =
    options.PerformanceObserver !== undefined
      ? options.PerformanceObserver
      : typeof PerformanceObserver === 'undefined'
        ? null
        : PerformanceObserver;
  let largestContentfulPaintMs: number | null = null;
  let cumulativeLayoutShift = 0;
  let totalLongTaskMs = 0;
  let maxCriticalInteractionLatencyMs = 0;
  const observers: PerformanceObserverLike[] = [];

  const consume = (entry: PerformanceEntryLike): void => {
    if (entry.entryType === 'largest-contentful-paint') {
      largestContentfulPaintMs = Math.max(largestContentfulPaintMs ?? 0, entry.startTime);
    } else if (entry.entryType === 'layout-shift' && !entry.hadRecentInput) {
      cumulativeLayoutShift += entry.value ?? 0;
    } else if (entry.entryType === 'longtask') {
      totalLongTaskMs += entry.duration;
    } else if (entry.entryType === 'event' && typeof entry.processingStart === 'number') {
      maxCriticalInteractionLatencyMs = Math.max(
        maxCriticalInteractionLatencyMs,
        Math.max(0, entry.processingStart - entry.startTime + entry.duration),
      );
    }
  };

  if (Observer) {
    for (const type of ['largest-contentful-paint', 'layout-shift', 'longtask', 'event']) {
      const observer = new Observer((list) => list.getEntries().forEach(consume));
      try {
        observer.observe({ type, buffered: true });
        observers.push(observer);
      } catch {
        observer.disconnect();
      }
    }
  }

  return {
    snapshot: () => ({
      largestContentfulPaintMs,
      cumulativeLayoutShift,
      totalLongTaskMs,
      maxCriticalInteractionLatencyMs,
    }),
    recordCriticalInteraction(startTime = runtime?.now() ?? 0) {
      return () => {
        const elapsed = Math.max(0, (runtime?.now() ?? startTime) - startTime);
        maxCriticalInteractionLatencyMs = Math.max(maxCriticalInteractionLatencyMs, elapsed);
        return elapsed;
      };
    },
    disconnect() {
      observers.forEach((observer) => observer.disconnect());
      observers.length = 0;
    },
  };
}

declare global {
  interface Window {
    __roomRiotPerformance?: BrowserPerformanceMonitor;
  }
}
