# Audit-Proof Integration: Save/Verify Validierungs-Matrix

Diese Datei beschreibt die revisionssichere Beweiskette von NMB Archiver zwischen
lokaler Archivierung, kanonischer Hash-Bildung und asynchroner Audit-Proof-Submission.
Sie ist als technische Referenz fuer Entwicklung, Audit, Forensik und Compliance gedacht.

## 1. Ziel und Aussage der Beweiskette

Die Kette soll fuer eine archivierte E-Mail nachweisbar machen:

1. welche Bytes beim Ingest archiviert wurden,
2. welcher deterministische Root-Hash daraus entstanden ist,
3. welcher Root-Hash dem externen Audit-Proof-Backend erfolgreich uebergeben wurde,
4. ob spaeter bei einer Verifikation dieselben Bytes und dieselbe Root-Hash-Kette erneut belegt werden koennen.

Die zentrale Aussage lautet damit nicht nur "Datei vorhanden", sondern:

- die gespeicherte `.eml` ist unveraendert,
- die gespeicherten Attachments sind unveraendert,
- das daraus abgeleitete kanonische Manifest ist unveraendert,
- der gespeicherte `verificationRootHash` in der Datenbank ist unveraendert,
- die `/save`-Submission wurde lokal nachvollziehbar erfasst,
- der externe Audit-Proof-Nachweis passt bei einer spaeteren `/verify`-Momentaufnahme weiterhin zu genau diesem Root-Hash.

## 2. Architekturueberblick

```text
Raw mail + attachments
        |
        v
SHA256 ueber .eml und alle Attachments
        |
        v
Kanonisches Manifest (deterministische Reihenfolge)
        |
        v
verificationRootHash = SHA256(JSON(manifest))
        |
        +--> Speicherung in archived_emails.verification_root_hash
        |
        +--> Status "pending" + Queue-Job
                    |
                    v
              POST /save an Audit-Proof-Backend
                    |
                    v
              Status "submitted"

Spaetere Verifikation:
Storage-Bytes neu lesen -> neu hashen -> Manifest neu bilden -> Root neu berechnen
        |
        +--> Vergleich gegen DB-Referenzen
        |
        +--> Vergleich gegen gespeicherten verification_root_hash
        |
        +--> POST /verify an Audit-Proof-Backend
```

## 3. Save-Flow (Ingestion -> `/save`)

### 3.1 SHA-256 der E-Mail wird beim Ingest gebildet

- Datei: `packages/backend/src/services/IngestionService.ts`
- Relevanz:
    - `emlBuffer` wird aus der Rohmail gebildet.
    - `emailHash = sha256(emlBuffer)`.
    - Dieser Wert wird als `storageHashSha256` in `archived_emails` gespeichert.

### 3.2 SHA-256 der Attachments wird beim Ingest gebildet

- Datei: `packages/backend/src/services/IngestionService.ts`
- Relevanz:
    - Fuer jedes Attachment wird `attachmentHash = sha256(attachmentBuffer)` berechnet.
    - Dieser Wert wird als `contentHashSha256` in `attachments` gespeichert.

### 3.3 Kanonisches Manifest und Root-Hash

- Datei: `packages/backend/src/helpers/verificationManifest.ts`
- Relevanz:
    - `buildVerificationManifest()` sortiert Attachments stabil nach:
        1. `filename`
        2. `sizeBytes`
        3. `contentHashSha256`
    - `computeVerificationRootHash()` bildet:
      `sha256(JSON.stringify({ emailHashSha256, attachments }))`
    - Die Reihenfolge ist deterministisch. Save und Verify rechnen damit ueber dieselbe logische Struktur.

### 3.4 Speicherung in der DB und persistente Submission

- Datei: `packages/backend/src/services/IngestionService.ts`
- Relevanz:
    - `verificationRootHash` wird in `archived_emails.verification_root_hash` gespeichert.
    - Gleichzeitig wird `auditProofSubmissionStatus='pending'` gesetzt.
    - Danach wird ein persistenter Queue-Job fuer die externe `/save`-Submission angelegt.

### 3.5 Retry- und Replay-Modell

- Dateien:
    - `packages/backend/src/services/AuditProofEmailSubmissionService.ts`
    - `packages/backend/src/jobs/processors/submit-email-proof.processor.ts`
    - `packages/backend/src/jobs/processors/schedule-audit-proof-submission-retry.processor.ts`
    - `packages/backend/src/jobs/schedulers/sync-scheduler.ts`
- Relevanz:
    - Die Anwendung behandelt einen erfolgreichen `/save`-HTTP-Call als `submitted`.
    - Das ist kein spaeter persistierter "verified"-Status, sondern nur der belastbare Handover an das Audit-Proof-Backend.
    - Falls `/save` fehlschlaegt, bleibt der Datensatz in `failed` und wird ueber den Scheduler erneut eingereiht.
    - Falls Audit-Proof noch nicht konfiguriert ist, wird `skipped_not_configured` gesetzt; nach spaeterer Konfiguration koennen dieselben Datensaetze rueckwirkend erneut eingereicht werden.
    - Damit gehen `/save`-Requests aus Applikationssicht nicht mehr verloren.

### 3.6 Exakte `/save`-Payload

- Datei: `packages/backend/src/services/AuditProofService.ts`
- Key-Form aktuell:
    - `${instanceId}:${archivedEmailId}`
- Request:

```json
{
	"key": "instance-id:archived-email-id",
	"value": "verification-root-hash"
}
```

- Transport:
    - `POST {baseUrl}/save`
    - `Content-Type: application/json`

### 3.7 Bedeutung von `submitted`

Ein `submitted` in NMB Archiver bedeutet:

1. der Datensatz wurde lokal archiviert,
2. der deterministische Root-Hash wurde gespeichert,
3. das Audit-Proof-Backend hat die `/save`-Submission ohne Fehler angenommen.

Es bedeutet bewusst **nicht**, dass NMB Archiver einen finalen externen Anchor-Zeitpunkt lokal
persistiert. Die eigentliche Spaetverarbeitung liegt im Audit-Proof-Backend.

## 4. Verify-Flow (Rehash -> Manifest -> `/verify`)

### 4.1 Verify wird aktiv mit Audit-Proof ausgefuehrt

- Dateien:
    - `packages/backend/src/services/IntegrityService.ts`
    - `packages/backend/src/services/ArchivedEmailService.ts`
- Relevanz:
    - Integrity-Endpoint ruft `verifyEmail(..., { includeAuditProof: true })` auf.
    - Die Detailansicht kann dieselbe Verifikation ebenfalls inklusive Audit-Proof ausloesen.

### 4.2 E-Mail wird neu gehasht

- Datei: `packages/backend/src/services/EmailVerificationService.ts`
- Relevanz:
    - Die Mail wird erneut aus dem Storage geladen.
    - `hashSha256 = sha256(raw)` wird frisch berechnet.
    - Der Wert wird mit `email.storageHashSha256` verglichen.

### 4.3 Attachments werden neu gehasht

- Datei: `packages/backend/src/services/EmailVerificationService.ts`
- Relevanz:
    - Jedes Attachment wird aus dem Storage geladen und neu gehasht.
    - Vergleich gegen `attachments.contentHashSha256`.
    - Fuer das neue Verify-Manifest werden die aktuellen Rehash-Werte genutzt.

### 4.4 Root-Hash wird neu berechnet

- Dateien:
    - `packages/backend/src/services/EmailVerificationService.ts`
    - `packages/backend/src/helpers/verificationManifest.ts`
- Relevanz:
    - `manifest = buildVerificationManifest(hashSha256, attachmentManifestEntries)`
    - `verificationRootHash = computeVerificationRootHash(manifest)`
    - Extern verifiziert wird damit immer der aus den aktuellen Storage-Bytes abgeleitete Root-Hash.

### 4.5 Gespeicherter DB-Root-Hash wird gegengeprueft

- Datei: `packages/backend/src/services/EmailVerificationService.ts`
- Relevanz:
    - Wenn `archived_emails.verification_root_hash` gesetzt ist, wird dieser Wert gegen den frisch berechneten `verificationRootHash` verglichen.
    - Ein Mismatch erzeugt einen lokalen Integrity-Befund vom Typ `verification_root`.
    - Dadurch werden auch Manipulationen an der DB-Referenz der Beweiskette sichtbar, selbst wenn die Storage-Dateien unveraendert waeren.

### 4.6 Timestamp-Herkunft fuer `/verify`

- Datei: `packages/backend/src/services/EmailVerificationService.ts`
- Relevanz:
    - Der Timestamp wird aus `archived_emails.archived_at` abgeleitet:
      `Math.floor(new Date(email.archivedAt).getTime() / 1000)`
    - Damit wird in Unix-Sekunden der Archivierungszeitpunkt als Teil des Verify-Calls uebergeben.
    - Die Applikation speichert keinen separaten "extern final verankert"-Status; `verify` bleibt eine reine Punkt-in-Zeit-Pruefung.

### 4.7 Exakte `/verify`-Payload

- Datei: `packages/backend/src/services/AuditProofService.ts`
- Request:

```json
{
	"key": "instance-id:archived-email-id",
	"value": "verification-root-hash",
	"timestamp": 1735137000
}
```

- Transport:
    - `POST {baseUrl}/verify`
    - `Content-Type: application/json`

## 5. Was genau als integer gilt

Die Audit-Aussage ist nur dann belastbar, wenn alle folgenden Ebenen zusammenpassen:

1. `storageHashSha256` der E-Mail passt zu den aktuellen `.eml`-Bytes.
2. `contentHashSha256` aller Attachments passt zu den aktuellen Attachment-Bytes.
3. Das aus diesen Werten gebildete kanonische Manifest ergibt denselben `verificationRootHash`.
4. Der in der DB gespeicherte `verification_root_hash` passt zu diesem frisch berechneten Wert.
5. Das Audit-Proof-Backend bestaetigt denselben Wert ueber `/verify`.

Erst die Kombination aus lokaler Rehash-Pruefung und externer Root-Hash-Verifikation ist aus Auditor-Sicht der belastbare Nachweis gegen nachtraegliche Manipulation.

## 6. Konfigurationsstellen

### 6.1 System-Settings

- Dateien:
    - `packages/types/src/system.types.ts`
    - `packages/backend/src/services/SettingsService.ts`
- Relevante Felder:
    - `auditProofInstanceId`
    - `auditProofInstanceServerAddr`
    - `auditProofDebugRequests`

### 6.2 Aktivierungslogik

- Datei: `packages/backend/src/services/AuditProofService.ts`
- Relevanz:
    - Die Integration ist nur aktiv, wenn URL und `instanceId` vorhanden sind.
    - Optionaler URL-Fallback ueber `AUDIT_PROOF_BACKEND_URL`.

### 6.3 Scheduler fuer persistente `/save`-Submissions

- Dateien:
    - `.env.example`
    - `open-archiver.yml`
    - `packages/backend/src/config/app.ts`
- Relevanz:
    - `AUDIT_PROOF_SUBMISSION_FREQUENCY` steuert den Replay-Zyklus fuer `pending`, `failed` und `skipped_not_configured`.
    - Standard ist `* * * * *`, also ein Retry pro Minute.

## 7. Debugging und Nachvollziehbarkeit

### 7.1 Debug-Logs fuer Request und Response

- Datei: `packages/backend/src/services/AuditProofService.ts`
- Relevanz:
    - Bei `auditProofDebugRequests=true` werden geloggt:
        - Endpoint (`/save` oder `/verify`)
        - Ziel-URL
        - Payload
        - Response-Status
        - Response-Body

### 7.2 API-Einstiegspunkt fuer Verifikation

- Dateien:
    - `packages/backend/src/api/routes/integrity.routes.ts`
    - `packages/backend/src/api/controllers/integrity.controller.ts`
- Relevanz:
    - `GET /v1/integrity/:id` fuehrt die vollstaendige Integritaetspruefung inklusive Audit-Proof aus.

## 8. Relevante DB-Felder der Beweiskette

### 8.1 E-Mail

- Datei: `packages/backend/src/database/schema/archived-emails.ts`
- Felder:
    - `storage_hash_sha256`
    - `verification_root_hash`
    - `audit_proof_submission_status`
    - `audit_proof_submitted_at`
    - `audit_proof_last_submission_attempt_at`
    - `audit_proof_submission_attempts`
    - `audit_proof_last_submission_error`
    - `archived_at`

### 8.2 Attachments

- Datei: `packages/backend/src/database/schema/attachments.ts`
- Felder:
    - `content_hash_sha256`

## 9. Auditor-Checkliste

Fuer eine belastbare Stichprobe oder einen formalen Audit-Check sollten mindestens diese Punkte nachvollzogen werden:

1. Ist fuer die Instanz eine eindeutige `auditProofInstanceId` gesetzt?
2. Ist das Audit-Proof-Backend konfiguriert und erreichbar?
3. Laesst sich fuer eine Stichprobe `GET /v1/integrity/:id` erfolgreich ausfuehren?
4. Sind `localIntegrity` und `externalProof` jeweils gueltig?
5. Enthalten die Befunde keine `email`, `attachment` oder `verification_root`-Fehler?
6. Wurde fuer denselben Datensatz ein plausibler `archived_at`-Zeitpunkt an `/verify` uebergeben?
7. Ist fuer den Datensatz `audit_proof_submission_status='submitted'` oder gibt es einen nachvollziehbaren Retry-/Fehlerstatus?
8. Sind bei Bedarf die Debug-Logs vorhanden, um Payload und Response forensisch nachzuvollziehen?

## 10. Grenzen der aktuellen Loesung

Die aktuelle Implementierung deckt Save und Verify fuer die unveraenderte Existenz eines Archivobjekts gut ab, aber nicht jede denkbare Compliance-Anforderung:

- Die App speichert bewusst keinen finalen externen Verankerungsstatus; sie kennt nur den erfolgreichen `/save`-Handover (`submitted`) und den spaeteren Punkt-in-Zeit-Befund aus `/verify`.
- Die Anwendung kann technische Out-of-Band-Loeschungen in Datenbank oder Object Storage nicht verhindern.
- Fuer Tombstones gibt es aktuell noch keine eigene Auditor-UI oder einen separaten Verify-Endpunkt in der API.
- Die Aussage ist objektbezogen. Prozesskontrollen wie Vier-Augen-Freigaben oder Retention-Governance liegen ausserhalb dieser Datei.

Diese Grenzen sollten in einer formalen Verfahrensdokumentation explizit benannt werden.

## 11. Loeschungen und Audit-Spur

Loeschungen laufen jetzt ueber einen kontrollierten Tombstone-Pfad.

Vor der physischen Loeschung passiert:

1. Das zu loeschende Objekt wird geladen und autorisiert.
2. Fuer manuelle Loeschungen ist eine Begruendung Pflicht.
3. Es wird ein kanonisches Tombstone-Manifest aus E-Mail-Metadaten, `storageHashSha256`,
   `verificationRootHash` und Attachment-Hashes gebildet.
4. Daraus wird ein eigener `tombstoneRootHash` berechnet.
5. Der Tombstone wird lokal in `deleted_email_tombstones` gespeichert.
6. Wenn Audit-Proof konfiguriert ist, wird derselbe Tombstone ueber den bestehenden `POST /save`
   Mechanismus extern uebergeben und als `submitted` behandelt.
7. Erst danach werden Dateien, Suchindex und Datenbankeintrag physisch entfernt.

Wenn die externe Tombstone-Submission fehlschlaegt und Audit-Proof aktiv ist, wird die physische Loeschung abgebrochen.

## 12. Aktueller Tombstone-Nachweis

Der Delete-Nachweis besteht jetzt aus drei Ebenen:

1. **Lokaler Tombstone-Datensatz**
    - mit Manifest, Root-Hash, Loeschgrund, Actor und Status des physisch abgeschlossenen Deletes
2. **Externe Submission**
    - ueber separaten Key-Namespace wie
      `instance-id:tombstone:archived-email-id:tombstone-id`
3. **Hash-verkettetes Audit-Log**
    - mit Verweis auf `tombstoneRootHash`, Evidenzdaten und Loeschmodus

Damit ist heute bereits nicht nur "unveraendert vorhanden", sondern auch "kontrolliert und nachvollziehbar entfernt" belastbar dokumentiert.

## 13. Kurzfazit

Die aktuelle Save/Verify-Kette von NMB Archiver ist fuer den Objektbestand bereits belastbar:

1. Save uebergibt den deterministisch gebildeten `verificationRootHash` asynchron an das Audit-Proof-Backend, nicht nur den Rohmail-Hash.
2. Verify rehasht E-Mail und Attachments aus dem aktuellen Storage erneut.
3. Verify prueft zusaetzlich den in der DB gespeicherten `verification_root_hash`.
4. Verify sendet `key + value(rootHash) + timestamp(archivedAt)` an `/verify`.
5. Kontrollierte Loeschungen erzeugen jetzt einen eigenen Tombstone mit `tombstoneRootHash`, lokaler Persistenz und externer Submission ueber den bestehenden Audit-Proof-Mechanismus.
6. Das Audit-Log verweist zusaetzlich auf denselben Delete-Nachweis.

Der wichtigste verbleibende Ausbaupunkt liegt jetzt nicht mehr im Tombstone selbst, sondern in Auditor-UI, Tombstone-Verifikation und Reconciliation gegen unkontrollierte Out-of-Band-Loeschungen.

Die geplante Backend-Variante mit `list/export keys` fuer genau diese Reconciliation ist in
`docs/api/audit-proof-key-export.md` beschrieben.
