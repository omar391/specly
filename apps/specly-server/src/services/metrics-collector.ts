/**
 * Metrics Collector Service (SP-012)
 * 
 * In-memory metrics aggregation for observability:
 * - Latency histograms (execution, routing, journal)
 * - Routing decision counters
 * - Hash cache hit rate gauges
 * - Profile inheritance depth gauges
 */

export interface LatencyHistogram {
  count: number;
  sum: number;
  min: number;
  max: number;
  buckets: { le: number; count: number }[]; // cumulative buckets
}

export interface MetricsSnapshot {
  counters: Record<string, number>;
  histograms: Record<string, LatencyHistogram>;
  gauges: Record<string, number>;
  timestamp: string;
}

/**
 * Simple in-memory metrics aggregator with histogram support
 */
export class InMemoryMetricsCollector {
  private counters: Map<string, number> = new Map();
  private histograms: Map<string, LatencyHistogram> = new Map();
  private gauges: Map<string, number> = new Map();

  // Default latency buckets (milliseconds): 1ms, 5ms, 10ms, 50ms, 100ms, 500ms, 1s, 5s, 10s, +Inf
  private readonly DEFAULT_BUCKETS = [1, 5, 10, 50, 100, 500, 1000, 5000, 10000, Infinity];

  inc(counter: string, labels?: Record<string, string>): void {
    const key = this.buildKey(counter, labels);
    this.counters.set(key, (this.counters.get(key) || 0) + 1);
  }

  observe(histogram: string, value: number, labels?: Record<string, string>): void {
    const key = this.buildKey(histogram, labels);
    let hist = this.histograms.get(key);
    if (!hist) {
      hist = {
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity,
        buckets: this.DEFAULT_BUCKETS.map(le => ({ le, count: 0 }))
      };
      this.histograms.set(key, hist);
    }

    // Update histogram
    hist.count++;
    hist.sum += value;
    hist.min = Math.min(hist.min, value);
    hist.max = Math.max(hist.max, value);

    // Update buckets (cumulative counts)
    for (const bucket of hist.buckets) {
      if (value <= bucket.le) {
        bucket.count++;
      }
    }
  }

  set(gauge: string, value: number, labels?: Record<string, string>): void {
    const key = this.buildKey(gauge, labels);
    this.gauges.set(key, value);
  }

  /**
   * Get current metrics snapshot for health endpoint
   */
  snapshot(): MetricsSnapshot {
    const counters: Record<string, number> = {};
    const histograms: Record<string, LatencyHistogram> = {};
    const gauges: Record<string, number> = {};

    this.counters.forEach((value, key) => {
      counters[key] = value;
    });

    this.histograms.forEach((value, key) => {
      histograms[key] = { ...value, buckets: [...value.buckets] };
    });

    this.gauges.forEach((value, key) => {
      gauges[key] = value;
    });

    return {
      counters,
      histograms,
      gauges,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    this.counters.clear();
    this.histograms.clear();
    this.gauges.clear();
  }

  private buildKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return name;
    const labelPairs = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `${name}{${labelPairs}}`;
  }
}

/**
 * Metrics instrumentation helpers
 */

export function withLatencyTracking<T>(
  collector: InMemoryMetricsCollector,
  histogramName: string,
  fn: () => Promise<T>,
  labels?: Record<string, string>
): Promise<T> {
  const start = Date.now();
  return fn().finally(() => {
    const duration = Date.now() - start;
    collector.observe(histogramName, duration, labels);
  });
}

export function instrumentExecution<T>(
  collector: InMemoryMetricsCollector,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  return withLatencyTracking(collector, `specly_${operation}_duration_ms`, fn);
}
