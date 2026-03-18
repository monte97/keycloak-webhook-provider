// src/test/java/dev/montell/keycloak/it/JpaWebhookProviderIT.java
package dev.montell.keycloak.it;

import dev.montell.keycloak.jpa.JpaWebhookProvider;
import dev.montell.keycloak.jpa.entity.*;
import dev.montell.keycloak.model.*;
import jakarta.persistence.*;
import org.junit.jupiter.api.*;
import org.keycloak.models.RealmModel;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@Testcontainers
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class JpaWebhookProviderIT {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
        .withDatabaseName("webhook_test")
        .withUsername("test")
        .withPassword("test");

    static EntityManagerFactory emf;
    static EntityManager em;
    static JpaWebhookProvider provider;

    static RealmModel mockRealm;

    @BeforeAll
    static void setup() {
        Map<String, String> props = new HashMap<>();
        props.put("jakarta.persistence.jdbc.url",      postgres.getJdbcUrl());
        props.put("jakarta.persistence.jdbc.user",     postgres.getUsername());
        props.put("jakarta.persistence.jdbc.password", postgres.getPassword());
        props.put("jakarta.persistence.jdbc.driver",   "org.postgresql.Driver");
        props.put("hibernate.hbm2ddl.auto",            "create-drop");
        props.put("hibernate.dialect",                 "org.hibernate.dialect.PostgreSQLDialect");
        props.put("hibernate.show_sql",                "false");

        emf = Persistence.createEntityManagerFactory("webhook-test", props);
        em  = emf.createEntityManager();
        provider = new JpaWebhookProvider(em);

        mockRealm = mock(RealmModel.class);
        when(mockRealm.getId()).thenReturn("test-realm");
    }

    @AfterAll
    static void teardown() {
        if (em  != null) em.close();
        if (emf != null) emf.close();
    }

    @BeforeEach
    void beginTx() { em.getTransaction().begin(); }

    @AfterEach
    void rollbackTx() {
        if (em.getTransaction().isActive()) em.getTransaction().rollback();
    }

    @Test
    @Order(1)
    void createAndFindWebhook() {
        WebhookModel w = provider.createWebhook(mockRealm, "https://example.com/hook", null);

        assertNotNull(w.getId());
        assertEquals("https://example.com/hook", w.getUrl());
        assertEquals("test-realm", w.getRealmId());
        assertEquals("CLOSED", w.getCircuitState());
        assertFalse(w.isEnabled());

        WebhookModel found = provider.getWebhookById(mockRealm, w.getId());
        assertNotNull(found);
        assertEquals(w.getId(), found.getId());
    }

    @Test
    @Order(2)
    void getWebhooksStream_paginates() {
        provider.createWebhook(mockRealm, "https://a.com", null);
        provider.createWebhook(mockRealm, "https://b.com", null);
        provider.createWebhook(mockRealm, "https://c.com", null);

        long count = provider.getWebhooksCount(mockRealm);
        assertTrue(count >= 3);

        List<WebhookModel> page = provider.getWebhooksStream(mockRealm, 0, 2).toList();
        assertEquals(2, page.size());
    }

    @Test
    @Order(3)
    void removeWebhook_returnsTrueAndDeletes() {
        WebhookModel w = provider.createWebhook(mockRealm, "https://todelete.com", null);
        String id = w.getId();

        assertTrue(provider.removeWebhook(mockRealm, id));
        assertNull(provider.getWebhookById(mockRealm, id));
    }

    @Test
    @Order(4)
    void storeEvent_idempotent_on_duplicate_kcEventId() {
        // commit first insert so it is visible after savepoint rollback in the catch block
        WebhookEventModel e1 = provider.storeEvent(mockRealm, KeycloakEventType.USER,
            "kc-123", "{\"type\":\"access.LOGIN\"}");
        assertNotNull(e1);
        em.getTransaction().commit(); // make row durable before triggering constraint
        em.getTransaction().begin();  // open new tx for the duplicate attempt

        // second attempt with same kcEventId: catches PersistenceException, rolls back to
        // savepoint, clears EM, returns existing via getEventByKcId
        WebhookEventModel e2 = provider.storeEvent(mockRealm, KeycloakEventType.USER,
            "kc-123", "{\"type\":\"access.LOGIN\"}");
        assertNotNull(e2);
        assertEquals(e1.getId(), e2.getId());
    }

    @Test
    @Order(5)
    void storeSend_uniqueConstraint_prevents_duplicate_records() {
        WebhookModel w = provider.createWebhook(mockRealm, "https://example.com", null);
        WebhookEventModel event = provider.storeEvent(mockRealm, KeycloakEventType.USER,
            "kc-send-test", "{\"type\":\"access.LOGIN\"}");
        em.getTransaction().commit(); // commit webhook + event before storeSend
        em.getTransaction().begin();

        WebhookSendModel s1 = provider.storeSend(mockRealm, w.getId(), event.getId(),
            "access.LOGIN", 200, true, 0);
        assertNotNull(s1);

        WebhookSendModel s2 = provider.storeSend(mockRealm, w.getId(), event.getId(),
            "access.LOGIN", 200, true, 1);
        assertNotNull(s2);
        assertEquals(s1.getId(), s2.getId()); // same ID (upsert)
    }
}
