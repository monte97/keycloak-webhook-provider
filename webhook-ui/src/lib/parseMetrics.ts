export interface ParsedMetrics {
  dispatches: number | null;
  successRate: number | null;
  eventsReceived: number | null;
  retries: number | null;
  exhausted: number | null;
  queuePending: number | null;
}

function sumMetric(raw: string, name: string): number | null {
  const regex = new RegExp(`^${name}(?:\\{[^}]*\\})?\\s+(\\S+)`, 'gm');
  let total = 0;
  let found = false;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    const val = parseFloat(match[1]!);
    if (!isNaN(val)) {
      total += val;
      found = true;
    }
  }
  return found ? total : null;
}

function sumMetricByLabel(
  raw: string,
  name: string,
  labelKey: string,
  labelValue: string,
): number | null {
  const regex = new RegExp(
    `^${name}\\{[^}]*${labelKey}="${labelValue}"[^}]*\\}\\s+(\\S+)`,
    'gm',
  );
  let total = 0;
  let found = false;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    const val = parseFloat(match[1]!);
    if (!isNaN(val)) {
      total += val;
      found = true;
    }
  }
  return found ? total : null;
}

export function parseMetrics(raw: string): ParsedMetrics {
  const dispatches = sumMetric(raw, 'webhook_dispatches_total');
  const successCount = sumMetricByLabel(
    raw,
    'webhook_dispatches_total',
    'success',
    'true',
  );

  let successRate: number | null = null;
  if (dispatches !== null && dispatches > 0) {
    successRate = ((successCount ?? 0) / dispatches) * 100;
  }

  return {
    dispatches,
    successRate,
    eventsReceived: sumMetric(raw, 'webhook_events_received_total'),
    retries: sumMetric(raw, 'webhook_retries_total'),
    exhausted: sumMetric(raw, 'webhook_retries_exhausted_total'),
    queuePending: sumMetric(raw, 'webhook_queue_pending'),
  };
}
