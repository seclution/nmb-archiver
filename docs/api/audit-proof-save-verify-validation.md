# Audit-Proof Integration: Save/Verify Validierungs-Matrix

Diese Datei listet die **kernrelevanten Code-Stellen** für die Beweiskette (Ingest/Save/Verify) auf,
inklusive Payload-Form, Hash/Timestamp-Herkunft und den Stellen, an denen Daten ans Audit-Proof-Backend gesendet werden.

## 1) Save-Flow (Ingestion -> `/save`)

### 1.1 E-Mail SHA-256 wird beim Ingest gebildet
- Datei: `packages/backend/src/services/IngestionService.ts`
- Relevanz:
  - `emlBuffer` wird aus der Rohmail gebildet.
  - `emailHash` wird als `sha256(emlBuffer)` berechnet.
  - Dieser Hash wird als `storageHashSha256` in `archived_emails` gespeichert.

### 1.2 Attachment SHA-256 wird beim Ingest gebildet
- Datei: `packages/backend/src/services/IngestionService.ts`
- Relevanz:
  - Für jedes Attachment wird `attachmentHash = sha256(attachmentBuffer)` berechnet.
  - Dieser Hash wird als `contentHashSha256` in `attachments` gespeichert.

### 1.3 Kanonisches Manifest + Root-Hash
- Datei: `packages/backend/src/helpers/verificationManifest.ts`
- Relevanz:
  - `buildVerificationManifest()` sortiert Attachments stabil nach:
    1. `filename`
    2. `sizeBytes`
    3. `contentHashSha256`
  - `computeVerificationRootHash()` bildet `sha256(JSON.stringify({ emailHashSha256, attachments }))`.
  - Die Reihenfolge ist deterministisch, damit Save und Verify identisch rechnen.

### 1.4 Root-Hash in DB + persistente Submission ans Audit-Proof-Backend
- Datei: `packages/backend/src/services/IngestionService.ts`
- Relevanz:
  - `verificationRootHash` wird in `archived_emails.verification_root_hash` gespeichert.
  - Gleichzeitig wird `auditProofSubmissionStatus='pending'` gesetzt.
  - Danach wird ein persistenter Queue-Job für die `/save`-Submission angelegt.

### 1.5 Retry- und Replay-Modell
- Dateien:
  - `packages/backend/src/services/AuditProofEmailSubmissionService.ts`
  - `packages/backend/src/jobs/processors/submit-email-proof.processor.ts`
  - `packages/backend/src/jobs/processors/schedule-audit-proof-submission-retry.processor.ts`
  - `packages/backend/src/jobs/schedulers/sync-scheduler.ts`
  - `packages/backend/src/services/AuditProofService.ts`
- Relevanz:
  - Ein erfolgreicher `/save`-HTTP-Call gilt aus Applikationssicht als `submitted`.
  - Fehlgeschlagene oder noch nicht konfigurierte Submissions bleiben lokal sichtbar und werden über den Scheduler erneut eingereiht.
  - Dadurch gehen Audit-Proof-Submissions nicht mehr verloren, auch wenn das Backend beim Ingest vorübergehend nicht erreichbar ist.
  - `/save`-Requests laufen zusätzlich in ein konfigurierbares Timeout, damit ein hängendes Audit-Proof-Backend den Submission-Worker nicht unbegrenzt blockiert.

### 1.6 Exakte `/save` Request-Form
- Datei: `packages/backend/src/services/AuditProofService.ts`
- Relevanz:
  - `saveEmailHash()` baut den Key als `${instanceId}:${archivedEmailId}`.
  - Gesendet wird `POST {baseUrl}/save` mit JSON:
    - `key: string`
    - `value: string` (hier: `verificationRootHash`)
  - Content-Type: `application/json`.

## 2) Verify-Flow (Rehash -> Manifest -> `/verify`)

### 2.1 Verify wird mit `includeAuditProof: true` erzwungen
- Dateien:
  - `packages/backend/src/services/IntegrityService.ts`
  - `packages/backend/src/services/ArchivedEmailService.ts`
- Relevanz:
  - Integrity-Endpoint ruft `verifyEmail(..., { includeAuditProof: true })` auf.
  - Detailansicht ruft ebenfalls Verify inkl. Audit-Proof.

### 2.2 E-Mail wird neu gehasht (nicht nur DB-Wert benutzt)
- Datei: `packages/backend/src/services/EmailVerificationService.ts`
- Relevanz:
  - Mail wird aus Storage gelesen.
  - `hashSha256 = sha256(raw)` wird **neu** berechnet.
  - Vergleich gegen `email.storageHashSha256` für lokalen Integritätsnachweis.

### 2.3 Attachments werden neu gehasht
- Datei: `packages/backend/src/services/EmailVerificationService.ts`
- Relevanz:
  - Jedes Attachment wird aus Storage geladen und neu gehasht.
  - Vergleich gegen `attachments.contentHashSha256`.
  - Für das Verify-Manifest wird der **aktuelle** Hash verwendet.

### 2.4 Root-Hash wird auf Verify-Seite neu berechnet
- Dateien:
  - `packages/backend/src/services/EmailVerificationService.ts`
  - `packages/backend/src/helpers/verificationManifest.ts`
- Relevanz:
  - `manifest = buildVerificationManifest(hashSha256, attachmentManifestEntries)`
  - `verificationRootHash = computeVerificationRootHash(manifest)`
  - Somit wird extern immer der aus **aktuellen Storage-Bytes** abgeleitete Root-Hash verifiziert.

### 2.5 Gespeicherter DB-Root-Hash wird gegen den Rehash geprüft
- Datei: `packages/backend/src/services/EmailVerificationService.ts`
- Relevanz:
  - Wenn `archived_emails.verification_root_hash` gesetzt ist, wird dieser Wert
    gegen den frisch aus Manifest + Storage-Bytes berechneten `verificationRootHash`
    verglichen.
  - Ein Mismatch erzeugt einen lokalen Integrity-Fehler vom Typ `verification_root`.
  - Damit werden nicht nur manipulierte Dateiinhalte erkannt, sondern auch Änderungen
    an der in der DB abgelegten Referenz der Beweiskette.

### 2.6 Timestamp-Herkunft für `/verify`
- Datei: `packages/backend/src/services/EmailVerificationService.ts`
- Relevanz:
  - Timestamp wird als
    - `Math.floor(new Date(email.archivedAt).getTime() / 1000)`
    - also Unix-Sekunden aus `archived_emails.archived_at`
    gesendet.

### 2.7 Exakte `/verify` Request-Form
- Datei: `packages/backend/src/services/AuditProofService.ts`
- Relevanz:
  - `verifyEmailHash()` sendet `POST {baseUrl}/verify` mit JSON:
    - `key: string` (`${instanceId}:${archivedEmailId}`)
    - `value: string` (`verificationRootHash` aus Rehash+Manifest)
    - `timestamp: number` (Unix-Sekunden aus `archivedAt`)
  - Auch `/verify` nutzt dasselbe Request-Timeout, damit ein hängendes Audit-Proof-Backend keinen Integrity-Request unbegrenzt offen haelt.

## 3) Konfigurationsstellen, die Save/Verify aktivieren

### 3.1 System-Settings (Instanz-ID, Backend-URL, Debug)
- Dateien:
  - `packages/types/src/system.types.ts`
  - `packages/backend/src/services/SettingsService.ts`
- Relevanz:
  - `auditProofInstanceId`
  - `auditProofInstanceServerAddr`
  - `auditProofDebugRequests`

### 3.2 Aktivierungslogik
- Datei: `packages/backend/src/services/AuditProofService.ts`
- Relevanz:
  - Integration ist aktiv nur wenn **URL und Instance-ID** vorhanden sind.
  - URL-Fallback optional über `AUDIT_PROOF_BACKEND_URL`.

### 3.3 Retry-Scheduler
- Dateien:
  - `.env.example`
  - `open-archiver.yml`
  - `packages/backend/src/config/app.ts`
- Relevanz:
  - `AUDIT_PROOF_SUBMISSION_FREQUENCY` steuert den Replay-Zyklus für `pending`, `failed` und `skipped_not_configured`.
  - Standard ist `* * * * *`, also ein Retry pro Minute.
  - `AUDIT_PROOF_REQUEST_TIMEOUT_MS` begrenzt `/save`- und `/verify`-HTTP-Aufrufe gegen das Audit-Proof-Backend.
  - Standard ist `5000`, also 5 Sekunden.

## 4) Wo du Payloads/Ergebnisse eindeutig prüfen kannst

### 4.1 Debug-Logs für Request/Response aktivieren
- Datei: `packages/backend/src/services/AuditProofService.ts`
- Relevanz:
  - Bei `auditProofDebugRequests=true` werden geloggt:
    - endpoint (`/save` oder `/verify`)
    - vollständiges `payload`
    - target URL
    - response body + status

### 4.2 API-Einstiegspunkt für Verify
- Dateien:
  - `packages/backend/src/api/routes/integrity.routes.ts`
  - `packages/backend/src/api/controllers/integrity.controller.ts`
- Relevanz:
  - `GET /v1/integrity/:id` löst vollständige Integritätsprüfung inkl. Audit-Proof aus.

## 5) DB-Felder der Beweiskette

### 5.1 E-Mail
- Datei: `packages/backend/src/database/schema/archived-emails.ts`
- Felder:
  - `storage_hash_sha256` (Referenzhash der E-Mail)
  - `verification_root_hash` (beim Save berechneter Root-Hash)
  - `audit_proof_submission_status`
  - `audit_proof_submitted_at`
  - `audit_proof_last_submission_attempt_at`
  - `audit_proof_submission_attempts`
  - `audit_proof_last_submission_error`
  - `archived_at` (Basis für Verify-Timestamp)

### 5.2 Attachments
- Datei: `packages/backend/src/database/schema/attachments.ts`
- Feld:
  - `content_hash_sha256` (Referenzhash pro Attachment)

## 6) Kurzfazit für deine Audit-Validierung

Für die Beweiskette sind die zentralen Garantien:
1. Save sendet **nicht** den Rohmail-Hash, sondern den deterministisch abgeleiteten `verificationRootHash` an `/save`.
2. Die Anwendung persistiert nur den Handover-Zustand `pending/submitted/failed/skipped_not_configured`, aber keinen dauerhaften `verified`-Status.
3. Verify berechnet den Root-Hash aus **neu gehashten** Storage-Dateien (Mail + Attachments) erneut.
4. Verify prüft zusätzlich den in der DB gespeicherten `verification_root_hash` gegen den frisch berechneten Manifest-Hash.
5. Verify sendet `key + value(rootHash) + timestamp(archivedAt in Unix-Sekunden)` an `/verify`.
6. Durch deterministisches Sorting im Manifest ist die Root-Hash-Bildung zwischen Save und Verify konsistent.

## 7) Löschungen und Audit-Spur

Die aktuelle Audit-Proof-Integration deckt extern nur `save` und `verify` ab. Für Löschungen gibt es derzeit keinen separaten `/delete`- oder Tombstone-Call an das Audit-Proof-Backend.

Trotzdem werden Löschungen nicht spurlos:
- Vor der physischen Löschung schreibt NMB Archiver einen Audit-Log-Eintrag.
- Dieser Eintrag enthält belastbare Evidenz zum Objekt:
  - `messageIdHeader`
  - `storageHashSha256`
  - `verificationRootHash`
  - Attachment-Hashes und Metadaten
- Die Audit-Logs selbst sind hash-verkettet und lokal auf Integrität prüfbar.

Für eine voll externe, revisionssichere Löschspur fehlt als nächster Ausbauschritt noch ein unveränderlicher Tombstone, der ebenfalls an das Audit-Proof-Backend verankert wird.
