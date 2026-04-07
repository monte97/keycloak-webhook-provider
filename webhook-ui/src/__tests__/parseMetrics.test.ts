import { describe, it, expect } from 'vitest';
import { parseMetrics } from '../lib/parseMetrics';

const REALISTIC_PROMETHEUS = `# HELP webhook_events_received_total Keycloak events received and enqueued for dispatch
# TYPE webhook_events_received_total counter
webhook_events_received_total{realm="master",event_type="access.LOGIN"} 800.0
webhook_events_received_total{realm="master",event_type="admin.USER-CREATE"} 200.0
# HELP webhook_dispatches_total HTTP send attempts completed
# TYPE webhook_dispatches_total counter
webhook_dispatches_total{realm="master",success="true"} 950.0
webhook_dispatches_total{realm="master",success="false"} 50.0
# HELP webhook_retries_total Retries scheduled via exponential backoff
# TYPE webhook_retries_total counter
webhook_retries_total{realm="master"} 43.0
# HELP webhook_retries_exhausted_total Retry chains terminated without success
# TYPE webhook_retries_exhausted_total counter
webhook_retries_exhausted_total{realm="master"} 3.0
# HELP webhook_queue_pending Tasks currently pending in the executor
# TYPE webhook_queue_pending gauge
webhook_queue_pending 0.0
`;

describe('parseMetrics', () => {
  it('parses realistic Prometheus text', () => {
    const m = parseMetrics(REALISTIC_PROMETHEUS);
    expect(m.dispatches).toBe(1000);
    expect(m.successRate).toBeCloseTo(95.0);
    expect(m.eventsReceived).toBe(1000);
    expect(m.retries).toBe(43);
    expect(m.exhausted).toBe(3);
    expect(m.queuePending).toBe(0);
  });

  it('returns null for missing metric lines', () => {
    const partial = `webhook_dispatches_total{realm="master",success="true"} 10.0
webhook_dispatches_total{realm="master",success="false"} 0.0
`;
    const m = parseMetrics(partial);
    expect(m.dispatches).toBe(10);
    expect(m.successRate).toBeCloseTo(100.0);
    expect(m.eventsReceived).toBeNull();
    expect(m.retries).toBeNull();
    expect(m.exhausted).toBeNull();
    expect(m.queuePending).toBeNull();
  });

  it('returns all null for empty string', () => {
    const m = parseMetrics('');
    expect(m.dispatches).toBeNull();
    expect(m.successRate).toBeNull();
    expect(m.eventsReceived).toBeNull();
    expect(m.retries).toBeNull();
    expect(m.exhausted).toBeNull();
    expect(m.queuePending).toBeNull();
  });

  it('computes successRate when only success="true" exists', () => {
    const text = `webhook_dispatches_total{realm="master",success="true"} 50.0\n`;
    const m = parseMetrics(text);
    expect(m.dispatches).toBe(50);
    expect(m.successRate).toBeCloseTo(100.0);
  });

  it('handles zero dispatches without dividing by zero', () => {
    const text = `webhook_dispatches_total{realm="master",success="true"} 0.0
webhook_dispatches_total{realm="master",success="false"} 0.0
`;
    const m = parseMetrics(text);
    expect(m.dispatches).toBe(0);
    expect(m.successRate).toBeNull();
  });

  it('returns 0% successRate when only failure dispatches exist', () => {
    const text = `webhook_dispatches_total{realm="master",success="false"} 5.0\n`;
    const m = parseMetrics(text);
    expect(m.dispatches).toBe(5);
    expect(m.successRate).toBeCloseTo(0.0);
  });
});
