// src/main/java/dev/montell/keycloak/resources/WebhookRepresentation.java
package dev.montell.keycloak.resources;

import com.fasterxml.jackson.annotation.JsonInclude;
import dev.montell.keycloak.model.WebhookModel;
import java.time.Instant;
import java.util.Set;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class WebhookRepresentation {

    public String id;
    public String url;
    public String secret;
    public String algorithm;
    public Boolean enabled;
    public Set<String> eventTypes;
    public String circuitState;
    public Integer failureCount;
    public Instant createdAt;
    public Integer retryMaxElapsedSeconds;
    public Integer retryMaxIntervalSeconds;
    // secret not included in from() — dedicated endpoint GET /{id}/secret

    public static WebhookRepresentation from(WebhookModel m) {
        WebhookRepresentation r = new WebhookRepresentation();
        r.id                      = m.getId();
        r.url                     = m.getUrl();
        r.algorithm               = m.getAlgorithm();
        r.enabled                 = m.isEnabled();
        r.eventTypes              = m.getEventTypes();
        r.circuitState            = m.getCircuitState();
        r.failureCount            = m.getFailureCount();
        r.createdAt               = m.getCreatedAt();
        r.retryMaxElapsedSeconds  = m.getRetryMaxElapsedSeconds();
        r.retryMaxIntervalSeconds = m.getRetryMaxIntervalSeconds();
        return r;
    }
}
