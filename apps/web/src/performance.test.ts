import assert from 'node:assert/strict';
import test from 'node:test';

import { createBrowserPerformanceMonitor, type PerformanceMonitorOptions } from './performance.js';

type FakeEntry = Record<string, number | boolean | string>;

class FakeObserver {
  static readonly instances: FakeObserver[] = [];
  readonly callback: (list: { getEntries: () => readonly FakeEntry[] }) => void;
  type = '';

  constructor(callback: (list: { getEntries: () => readonly FakeEntry[] }) => void) {
    this.callback = callback;
    FakeObserver.instances.push(this);
  }

  observe(options: { readonly type: string }): void {
    this.type = options.type;
  }

  disconnect(): void {}

  emit(entry: FakeEntry): void {
    this.callback({ getEntries: () => [entry] });
  }
}

test('collects browser performance entries and critical interaction latency', () => {
  FakeObserver.instances.length = 0;
  let now = 100;
  const options: PerformanceMonitorOptions = {
    performance: { now: () => now },
    PerformanceObserver: FakeObserver as never,
  };
  const monitor = createBrowserPerformanceMonitor(options);
  const find = (type: string) => FakeObserver.instances.find((observer) => observer.type === type)!;

  find('largest-contentful-paint').emit({
    entryType: 'largest-contentful-paint',
    startTime: 820,
    duration: 0,
  });
  find('layout-shift').emit({
    entryType: 'layout-shift',
    startTime: 0,
    duration: 0,
    value: 0.12,
    hadRecentInput: false,
  });
  find('layout-shift').emit({
    entryType: 'layout-shift',
    startTime: 0,
    duration: 0,
    value: 0.5,
    hadRecentInput: true,
  });
  find('longtask').emit({ entryType: 'longtask', startTime: 0, duration: 135 });
  find('event').emit({ entryType: 'event', startTime: 10, processingStart: 22, duration: 18 });
  const finish = monitor.recordCriticalInteraction();
  now = 154;
  finish();

  assert.deepEqual(monitor.snapshot(), {
    largestContentfulPaintMs: 820,
    cumulativeLayoutShift: 0.12,
    totalLongTaskMs: 135,
    maxCriticalInteractionLatencyMs: 54,
  });
});

test('degrades to a no-op monitor when browser performance observers are unavailable', () => {
  const monitor = createBrowserPerformanceMonitor({ performance: null, PerformanceObserver: null });
  assert.deepEqual(monitor.snapshot(), {
    largestContentfulPaintMs: null,
    cumulativeLayoutShift: 0,
    totalLongTaskMs: 0,
    maxCriticalInteractionLatencyMs: 0,
  });
  assert.equal(monitor.recordCriticalInteraction()(), 0);
});
