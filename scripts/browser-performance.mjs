/* global PerformanceObserver, devicePixelRatio, innerHeight, innerWidth, performance, requestAnimationFrame, setTimeout, window */

import { chromium } from 'playwright';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:3100';
const thresholds = {
  largestContentfulPaintMs: 2_500,
  cumulativeLayoutShift: 0.1,
  totalLongTaskMs: 2_000,
  maxCriticalInteractionLatencyMs: 500,
};

const waitForHealth = async () => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return;
    } catch {
      // The compiled server may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Compiled server did not become healthy at ${baseUrl}`);
};

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });

  await page.addInitScript(() => {
    const state = {
      cumulativeLayoutShift: 0,
      layoutShiftSources: [],
      largestContentfulPaintMs: null,
      totalLongTaskMs: 0,
      maxCriticalInteractionLatencyMs: 0,
      syntheticInteractionLatencyMs: null,
      frameDurations: [],
    };
    window.__roomRiotBrowserQa = state;

    if (typeof PerformanceObserver === 'function') {
      const observe = (type, callback, options = { type, buffered: true }) => {
        try {
          const observer = new PerformanceObserver((list) => {
            list.getEntries().forEach(callback);
          });
          observer.observe(options);
        } catch {
          // The entry type is optional across browser engines.
        }
      };

      observe('largest-contentful-paint', (entry) => {
        state.largestContentfulPaintMs = Math.max(
          state.largestContentfulPaintMs ?? 0,
          entry.startTime,
        );
      });
      observe('layout-shift', (entry) => {
        if (!entry.hadRecentInput) {
          state.cumulativeLayoutShift += entry.value ?? 0;
          state.layoutShiftSources.push({
            value: entry.value ?? 0,
            sources: (entry.sources ?? []).map((source) => ({
              node: source.node?.tagName ?? null,
              className: source.node?.className ?? null,
            })),
          });
        }
      });
      observe('longtask', (entry) => {
        state.totalLongTaskMs += entry.duration;
      });
      observe(
        'event',
        (entry) => {
          if (typeof entry.processingStart !== 'number') return;
          state.maxCriticalInteractionLatencyMs = Math.max(
            state.maxCriticalInteractionLatencyMs,
            Math.max(0, entry.processingStart - entry.startTime + entry.duration),
          );
        },
        { type: 'event', buffered: true, durationThreshold: 16 },
      );
    }

    let previousFrame = null;
    const sampleFrame = (timestamp) => {
      if (previousFrame !== null) state.frameDurations.push(timestamp - previousFrame);
      previousFrame = timestamp;
      if (state.frameDurations.length < 180) requestAnimationFrame(sampleFrame);
    };
    requestAnimationFrame(sampleFrame);
  });

  await waitForHealth();
  await page.goto(`${baseUrl}/host`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Create Game' }).waitFor({ state: 'visible' });
  await page.evaluate(() => {
    // The launcher first mounts a transient connection panel. Start CLS collection
    // after that intentional bootstrap swap so the report measures the usable surface.
    window.__roomRiotBrowserQa.cumulativeLayoutShift = 0;
    window.__roomRiotBrowserQa.layoutShiftSources = [];
  });
  await page.waitForTimeout(1_500);

  const interactionStarted = Date.now();
  await page.getByRole('button', { name: /Hot Take/ }).click();
  const syntheticInteractionLatencyMs = Date.now() - interactionStarted;
  await page.evaluate((latency) => {
    window.__roomRiotBrowserQa.syntheticInteractionLatencyMs = latency;
  }, syntheticInteractionLatencyMs);
  await page.waitForTimeout(1_000);

  const report = await page.evaluate((limits) => {
    const qa = window.__roomRiotBrowserQa;
    const frameDurations = [...qa.frameDurations].sort((a, b) => a - b);
    const p95Index = Math.max(0, Math.ceil(frameDurations.length * 0.95) - 1);
    const resources = performance.getEntriesByType('resource');
    const initialTransferBytes = resources.reduce(
      (total, resource) => total + (resource.transferSize || resource.encodedBodySize || 0),
      0,
    );
    const metrics = {
      initialTransferBytes,
      largestContentfulPaintMs: qa.largestContentfulPaintMs,
      cumulativeLayoutShift: qa.cumulativeLayoutShift,
      layoutShiftSources: qa.layoutShiftSources,
      totalLongTaskMs: qa.totalLongTaskMs,
      maxCriticalInteractionLatencyMs: Math.max(
        qa.maxCriticalInteractionLatencyMs,
        qa.syntheticInteractionLatencyMs ?? 0,
      ),
      frameTimeP95Ms: frameDurations[p95Index] ?? null,
      frameTimeMaxMs: frameDurations.at(-1) ?? null,
      resourceCount: resources.length,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    };
    const violations = Object.entries(limits).flatMap(([key, limit]) => {
      const value = metrics[key];
      return typeof value === 'number' && value > limit
        ? [`${key}=${value.toFixed(2)} > ${limit}`]
        : [];
    });
    return { metrics, thresholds: limits, violations };
  }, thresholds);

  console.log(`Browser performance report: ${JSON.stringify(report)}`);
  if (report.violations.length) {
    throw new Error(`Browser performance budget exceeded: ${report.violations.join(', ')}`);
  }
} finally {
  await browser.close();
}
