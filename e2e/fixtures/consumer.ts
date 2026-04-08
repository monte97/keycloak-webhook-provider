import { expect } from '@playwright/test';

/**
 * Poll the webhook-tester (`tarampampam/webhook-tester`) session API until at
 * least `min` requests have been recorded for the given UUID. Replaces ad-hoc
 * `page.waitForTimeout(N)` sleeps after triggering admin events.
 *
 * The webhook-tester records every incoming HTTP request against a session;
 * `GET /api/session/{uuid}/requests` returns the list. We poll for length
 * rather than reading a count field because the schema is array-based.
 */
export async function waitForDelivery(
  consumerPublicUrl: string,
  uuid: string,
  min = 1,
  timeoutMs = 15_000,
): Promise<void> {
  await expect
    .poll(
      async () => {
        try {
          const r = await fetch(
            `${consumerPublicUrl}/api/session/${uuid}/requests`,
          );
          if (!r.ok) return -1;
          const body = (await r.json()) as unknown;
          return Array.isArray(body) ? body.length : -1;
        } catch {
          return -1;
        }
      },
      { timeout: timeoutMs, intervals: [250, 500, 1000] },
    )
    .toBeGreaterThanOrEqual(min);
}
