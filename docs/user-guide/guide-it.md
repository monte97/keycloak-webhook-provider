# Webhook Admin UI — Guida Utente

Questa guida descrive l'interfaccia di amministrazione dei webhook, accessibile all'indirizzo:

```
/realms/{realm}/webhooks/ui
```

L'accesso richiede il ruolo realm `webhook-admin`.

---

## 1. Lista webhook

![Lista webhook](screenshots/01-webhooks-list.png)

La schermata principale mostra tutti i webhook configurati nel realm. Per ogni webhook sono visibili:

| Colonna | Descrizione |
|---------|-------------|
| **URL** | L'endpoint che riceve le richieste POST |
| **Enabled** | Toggle per abilitare o disabilitare la consegna senza eliminare il webhook |
| **Circuit** | Stato attuale del circuit breaker: `OPEN` (funzionante) o `CLOSED` (scattato) |
| **Events** | Numero di tipi di evento sottoscritti |
| **Actions** | Menu per modifica ed eliminazione |

Cliccando su una riga si apre il **pannello Delivery** per quel webhook.

---

## 2. Creazione di un webhook

![Modale creazione webhook](screenshots/02-create-webhook-modal.png)

Cliccando su **+ Create webhook** si apre il form di creazione. I campi disponibili sono:

- **URL** — l'endpoint HTTPS che riceverà gli eventi.
- **Enabled** — indica se la consegna inizia subito dopo la creazione.
- **Secret** — segreto HMAC opzionale. Quando impostato, ogni richiesta include l'header `X-Webhook-Signature` per consentire la verifica dell'autenticità da parte del ricevitore.
- **Algorithm** — algoritmo HMAC per la firma (`HmacSHA256` consigliato).
- **Max-retry duration** — finestra temporale totale in secondi entro cui vengono effettuati i retry (default: 900 s / 15 min).
- **Max-retry interval** — intervallo massimo di back-off in secondi tra un tentativo e il successivo.

Cliccare **Save** per creare il webhook. Cliccare **Cancel** o premere `Esc` per annullare.

---

## 3. Cronologia consegne

![Pannello consegne](screenshots/03-delivery-drawer.png)

Cliccando su una riga si apre un pannello laterale con i dettagli delle consegne per quel webhook.

L'intestazione del pannello mostra:
- L'**URL** di destinazione completo
- Il badge del **circuit breaker** (`OPEN` / `CLOSED`) e il pulsante **Reset circuit**

La scheda **Delivery history** elenca i tentativi di consegna recenti. Ogni riga mostra:
- Il codice di **status** HTTP (spunta verde = 2xx, X rosso = errore)
- Il numero di **retry** per quel tentativo
- Il timestamp di **inizio**
- Una colonna **Actions** con l'opzione di reinvio

Il pulsante **Resend failed** permette di ripetere tutte le consegne fallite per quel webhook.

### Paginazione

I pulsanti **← Prev** e **Next →** in fondo alla tabella permettono di navigare tra le pagine. Il numero di righe per pagina è configurabile in **Impostazioni → Cronologia consegne** (predefinito: 50). Il pulsante **Next** è disabilitato sull'ultima pagina; **Prev** è disabilitato sulla prima pagina.

---

## 4. Circuit breaker

![Circuit breaker](screenshots/04-circuit-breaker.png)

Il circuit breaker protegge i servizi downstream da richieste ripetute in caso di errori. Quando troppi tentativi di consegna consecutivi falliscono, il circuit **scatta** (lo stato passa da `OPEN` a `CLOSED`) e la consegna viene sospesa.

- **OPEN** — il circuit è funzionante; le consegne procedono normalmente.
- **CLOSED** — il circuit è scattato; le consegne sono in pausa finché non viene ripristinato.

Cliccare **Reset circuit** nell'intestazione del pannello per riaprire manualmente il circuit e riprendere le consegne.

---

## 5. Metriche

![Pagina metriche](screenshots/05-metrics-page.png)

La scheda **Metriche** mostra statistiche aggregate sulle consegne per il realm.

| Card | Descrizione |
|------|-------------|
| **Dispatches** | Totale tentativi di consegna HTTP |
| **Events received** | Totale eventi Keycloak ricevuti e accodati |
| **Retries** | Totale retry pianificati |
| **Queue pending** | Task attualmente in attesa nell'esecutore |

Il tasso di successo viene mostrato sotto il contatore delle consegne:
- **Verde** — ≥ 95% di successo
- **Arancione** — < 95% di successo

Il toggle **Auto-refresh** abilita l'aggiornamento automatico. L'intervallo è configurabile nel tab **Impostazioni** (default: 10 secondi).  
Il pulsante **Aggiorna** forza un aggiornamento immediato.

---

## 6. Metriche raw Prometheus

![Metriche Prometheus](screenshots/06-metrics-raw-prometheus.png)

Espandere la sezione **Raw Prometheus** in fondo alla pagina Metriche per visualizzare l'output nel formato testo Prometheus.

Lo stesso endpoint è disponibile direttamente per lo scraping:

```
GET /realms/{realm}/webhooks/metrics
Authorization: Bearer <token>
```

La risposta usa il formato testo Prometheus 0.0.4 ed espone le seguenti famiglie di metriche:

| Metrica | Tipo | Descrizione |
|---------|------|-------------|
| `webhook_events_received_total` | counter | Eventi ricevuti per realm e tipo |
| `webhook_dispatches_total` | counter | Tentativi di consegna per esito (successo/errore) |
| `webhook_retries_total` | counter | Retry pianificati |
| `webhook_retries_exhausted_total` | counter | Catene di retry terminate senza successo |
| `webhook_queue_pending` | gauge | Task in attesa nell'esecutore |

---

## 7. Impostazioni

![Pagina impostazioni](screenshots/07-settings-page.png)

Il tab **Impostazioni** espone le opzioni di configurazione dell'interfaccia, persistite nel `localStorage` del browser tra una sessione e l'altra.

### Intervallo auto-refresh metriche

Controlla la frequenza con cui la pagina Metriche interroga automaticamente l'endpoint `/metrics` quando l'**Auto-refresh** è abilitato.

| Opzione | Valore |
|---------|--------|
| 5 secondi | 5 s |
| **10 secondi** *(default)* | 10 s |
| 30 secondi | 30 s |
| 60 secondi | 60 s |

La selezione ha effetto immediato — non è richiesto alcun salvataggio. L'impostazione persiste al ricaricamento della pagina.

### Webhook — valori predefiniti

Valori predefiniti applicati alla **creazione** di un nuovo webhook. I webhook esistenti non vengono modificati.

| Impostazione | Default | Descrizione |
|--------------|---------|-------------|
| **Enabled by default** | Attivo | Se i nuovi webhook iniziano attivi (consegnano eventi) subito dopo la creazione. Disattivare per creare webhook in stato disabilitato e abilitarli manualmente quando pronti. |
| **Max retry duration (seconds)** | Vuoto (default server: 900) | Finestra temporale totale per i tentativi di retry. Lasciare vuoto per usare il default del server (900 s / 15 min). |
| **Max retry interval (seconds)** | Vuoto (default server: 180) | Intervallo massimo di back-off tra i tentativi di retry. Lasciare vuoto per usare il default del server (180 s / 3 min). |

Le modifiche hanno effetto immediato — non è richiesto alcun salvataggio. Le impostazioni persistono al ricaricamento della pagina.

### Cronologia consegne

Controlla il numero di righe visualizzate per pagina nel drawer della cronologia consegne.

| Opzione | Valore |
|---------|--------|
| 10 | 10 righe |
| 25 | 25 righe |
| **50** *(default)* | 50 righe |
| 100 | 100 righe |
