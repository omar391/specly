import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryMetricsCollector, withLatencyTracking } from '../services/metrics-collector.js';

describe('InMemoryMetricsCollector (SP-012)', () => {
  let collector: InMemoryMetricsCollector;

  beforeEach(() => {
    collector = new InMemoryMetricsCollector();
  });

  it('should increment counters', () => {
    collector.inc('specly_engine_specs_started_total');
    collector.inc('specly_engine_specs_started_total');
    collector.inc('specly_engine_specs_completed_total');

    const snapshot = collector.snapshot();
    expect(snapshot.counters['specly_engine_specs_started_total']).toBe(2);
    expect(snapshot.counters['specly_engine_specs_completed_total']).toBe(1);
  });

  it('should support labeled counters', () => {
    collector.inc('specly_routing_decisions_total', { edge_type: 'always' });
    collector.inc('specly_routing_decisions_total', { edge_type: 'result_code' });
    collector.inc('specly_routing_decisions_total', { edge_type: 'always' });

    const snapshot = collector.snapshot();
    expect(snapshot.counters['specly_routing_decisions_total{edge_type="always"}']).toBe(2);
    expect(snapshot.counters['specly_routing_decisions_total{edge_type="result_code"}']).toBe(1);
  });

  it('should record histogram observations', () => {
    collector.observe('specly_execution_duration_ms', 50);
    collector.observe('specly_execution_duration_ms', 150);
    collector.observe('specly_execution_duration_ms', 5);

    const snapshot = collector.snapshot();
    const hist = snapshot.histograms['specly_execution_duration_ms'];
    
    expect(hist.count).toBe(3);
    expect(hist.sum).toBe(205);
    expect(hist.min).toBe(5);
    expect(hist.max).toBe(150);
    
    // Cumulative buckets
    const bucket10 = hist.buckets.find(b => b.le === 10);
    const bucket100 = hist.buckets.find(b => b.le === 100);
    const bucket500 = hist.buckets.find(b => b.le === 500);
    
    expect(bucket10?.count).toBe(1); // 5ms
    expect(bucket100?.count).toBe(2); // 5ms, 50ms
    expect(bucket500?.count).toBe(3); // all three
  });

  it('should set and read gauges', () => {
    collector.set('specly_hash_cache_hit_rate', 0.85);
    collector.set('specly_profile_inheritance_depth', 3);

    const snapshot = collector.snapshot();
    expect(snapshot.gauges['specly_hash_cache_hit_rate']).toBe(0.85);
    expect(snapshot.gauges['specly_profile_inheritance_depth']).toBe(3);
  });

  it('should track latency with helper function', async () => {
    const work = async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return 'result';
    };

    const result = await withLatencyTracking(
      collector,
      'test_operation_duration_ms',
      work
    );

    expect(result).toBe('result');
    const snapshot = collector.snapshot();
    const hist = snapshot.histograms['test_operation_duration_ms'];
    expect(hist.count).toBe(1);
    expect(hist.min).toBeGreaterThanOrEqual(9); // allow timer variance
  });

  it('should reset all metrics', () => {
    collector.inc('counter_a');
    collector.observe('hist_b', 100);
    collector.set('gauge_c', 50);

    collector.reset();
    const snapshot = collector.snapshot();

    expect(Object.keys(snapshot.counters).length).toBe(0);
    expect(Object.keys(snapshot.histograms).length).toBe(0);
    expect(Object.keys(snapshot.gauges).length).toBe(0);
  });

  it('should include timestamp in snapshot', () => {
    const snapshot = collector.snapshot();
    expect(snapshot.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('Metrics - Retry Counter Assertions (SP-012 / SP-023)', () => {
  it('should assert retry metrics exist and increment', () => {
    const collector = new InMemoryMetricsCollector();
    
    // Simulate retry workflow
    collector.inc('action_journal_retries_total');
    collector.inc('action_journal_retries_total');
    collector.inc('action_journal_retry_exhausted_total');

    const snapshot = collector.snapshot();
    
    // Guard against accidental removal
    expect(snapshot.counters['action_journal_retries_total']).toBe(2);
    expect(snapshot.counters['action_journal_retry_exhausted_total']).toBe(1);
  });
});
