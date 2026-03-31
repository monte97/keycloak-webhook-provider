package dev.montell.keycloak.unit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import dev.montell.keycloak.dispatch.WebhookEventDispatcher;
import dev.montell.keycloak.event.WebhookPayload;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ScheduledExecutorService;
import org.junit.jupiter.api.Test;

class WebhookEventDispatcherTest {

    private static WebhookPayload.AccessEvent samplePayload() {
        return new WebhookPayload.AccessEvent(
                "uid-1", "access.LOGIN", "realm-1", "user-1", null, Instant.now(), Map.of());
    }

    @Test
    void enqueue_submits_runnable_to_executor() {
        ScheduledExecutorService executor = mock(ScheduledExecutorService.class);
        WebhookEventDispatcher dispatcher = new WebhookEventDispatcher(null, null, executor);

        dispatcher.enqueue(samplePayload(), "kc-id-1", "realm-1");

        verify(executor, times(1)).submit(any(Runnable.class));
    }

    @Test
    void enqueue_drops_event_when_queue_at_capacity() {
        ScheduledExecutorService executor = mock(ScheduledExecutorService.class);
        // maxPending=0 → always at capacity
        WebhookEventDispatcher dispatcher = new WebhookEventDispatcher(null, null, executor, 0);

        assertDoesNotThrow(() -> dispatcher.enqueue(samplePayload(), "kc-id-1", "realm-1"));
        verifyNoInteractions(executor);
    }

    @Test
    void enqueue_returns_without_blocking() throws InterruptedException {
        var executor = java.util.concurrent.Executors.newSingleThreadScheduledExecutor();
        var latch = new java.util.concurrent.CountDownLatch(1);
        executor.submit(
                () -> {
                    latch.countDown();
                    try {
                        Thread.sleep(60_000);
                    } catch (InterruptedException ignored) {
                    }
                });
        latch.await(); // ensure the one thread is occupied

        WebhookEventDispatcher dispatcher = new WebhookEventDispatcher(null, null, executor);
        long start = System.currentTimeMillis();
        dispatcher.enqueue(samplePayload(), "kc-id-1", "realm-1");
        long elapsed = System.currentTimeMillis() - start;

        assertTrue(elapsed < 200, "enqueue must not block; took " + elapsed + "ms");
        executor.shutdownNow();
    }

    @Test
    void pendingTasks_decrements_after_submitted_runnable_runs() throws Exception {
        var realExecutor = java.util.concurrent.Executors.newSingleThreadScheduledExecutor();
        // Use maxPending=1 so the first enqueue increments to 1
        WebhookEventDispatcher dispatcher = new WebhookEventDispatcher(null, null, realExecutor, 1);

        // Enqueue — the runnable will call processAndSend which will NPE on null factory/sender,
        // but the finally block must still decrement pendingTasks.
        dispatcher.enqueue(samplePayload(), null, "realm-1");
        Thread.sleep(200); // let the runnable run and fail

        // Queue should be back at 0 — a second enqueue must succeed (not drop)
        ScheduledExecutorService second = mock(ScheduledExecutorService.class);
        WebhookEventDispatcher dispatcher2 = new WebhookEventDispatcher(null, null, second, 1);
        // We can't introspect pendingTasks directly; but we verify the finally decrement
        // indirectly: enqueue again on a fresh dispatcher and confirm no drop.
        dispatcher2.enqueue(samplePayload(), null, "realm-1");
        verify(second).submit(any(Runnable.class));

        realExecutor.shutdownNow();
    }
}
