// src/main/java/dev/montell/keycloak/spi/WebhookProviderFactory.java
package dev.montell.keycloak.spi;

import org.keycloak.provider.ProviderFactory;

/**
 * Factory interface for creating {@link WebhookProvider} instances. Discovered by Keycloak's
 * ServiceLoader mechanism via {@code @AutoService}.
 */
public interface WebhookProviderFactory extends ProviderFactory<WebhookProvider> {}
