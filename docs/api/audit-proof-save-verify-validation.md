# Audit-Proof Integration: Save/Verify Validierungs-Matrix

Diese Datei beschreibt die revisionssichere Beweiskette von NMB Archiver zwischen
lokaler Archivierung, kanonischer Hash-Bildung und externer Audit-Proof-Verankerung.
Sie ist als technische Referenz fuer Entwicklung, Audit, Forensik und Compliance gedacht.

## 1. Ziel und Aussage der Beweiskette

Die Kette soll fuer eine archivierte E-Mail nachweisbar machen:

1. welche Bytes beim Ingest archiviert wurden,
2. welcher deterministische Root-Hash daraus entstanden ist,
3. welcher Root-Hash extern im Audit-Proof-Backend verankert wurde,
4. ob spaeter bei einer Verifikation dieselben Bytes und dieselbe Root-Hash-Kette erneut belegt werden koennen.

Die zentrale Aussage lautet damit nicht nur "Datei vorhanden", sondern:

- die gespeicherte `.eml` ist unveraendert,
- die gespeicherten Attachments sind unveraendert,
- das daraus abgeleitete kanonische Manifest ist unveraendert,
- der gespeicherte `verificationRootHash` in der Datenbank ist unveraendert,
- der externe Audit-Proof-Nachweis passt weiterhin zu genau diesem Root-Hash.

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
        +--> POST /save an Audit-Proof-Backend

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

### 3.4 Speicherung in der DB und externer Push

- Datei: `packages/backend/src/services/IngestionService.ts`
- Relevanz:
  - `verificationRootHash` wird in `archived_emails.verification_root_hash` gespeichert.
  - Danach folgt `AuditProofService.saveEmailHash(systemSettings, archivedEmail.id, verificationRootHash)`.
  - Fehler beim externen Push blockieren den Ingest aktuell nicht; sie werden geloggt.

### 3.5 Exakte `/save`-Payload

- Datei: `packages/backend/src/services/AuditProofService.ts`
- Key-Form:
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
7. Sind bei Bedarf die Debug-Logs vorhanden, um Payload und Response forensisch nachzuvollziehen?

## 10. Grenzen der aktuellen Loesung

Die aktuelle Implementierung deckt Save und Verify fuer die unveraenderte Existenz eines Archivobjekts gut ab, aber nicht jede denkbare Compliance-Anforderung:

- Wenn der externe `/save`-Call fehlschlaegt, wird der Ingest aktuell nicht hart abgebrochen.
- Die externe Beweiskette verankert aktuell keinen eigenen Delete- oder Tombstone-Eintrag.
- Die Aussage ist objektbezogen. Prozesskontrollen wie Vier-Augen-Freigaben oder Retention-Governance liegen ausserhalb dieser Datei.

Diese Grenzen sollten in einer formalen Verfahrensdokumentation explizit benannt werden.

## 11. Loeschungen und Audit-Spur

Die aktuelle Audit-Proof-Integration deckt extern nur `save` und `verify` ab. Fuer Loeschungen gibt es derzeit keinen separaten `/delete`- oder Tombstone-Call an das Audit-Proof-Backend.

Trotzdem werden Loeschungen nicht spurlos:

- Vor der physischen Loeschung schreibt NMB Archiver einen Audit-Log-Eintrag.
- Dieser Eintrag enthaelt belastbare Evidenz zum geloeschten Objekt:
  - `messageIdHeader`
  - `storageHashSha256`
  - `verificationRootHash`
  - Attachment-Hashes und Metadaten
- Die Audit-Logs selbst sind hash-verkettet und lokal auf Integritaet pruefbar.

Damit ist heute bereits sichtbar, dass ein Objekt existiert hat und geloescht wurde. Was fuer eine voll externe, revisionssichere Loeschspur noch fehlt, ist ein unveraenderlicher Tombstone, der selbst wieder ans Audit-Proof-Backend verankert wird.

## 12. Empfohlener naechster Ausbau fuer Tombstones

Fuer eine auditorisch starke Delete-Beweiskette ist der naechste sinnvolle Ausbau:

1. Vor jeder physischen Loeschung einen unveraenderlichen Tombstone erzeugen.
2. Darin mindestens `emailId`, `instanceId`, `deletedAt`, `deletedBy`, `reason`,
   `storageHashSha256`, `verificationRootHash` und das Attachment-Manifest sichern.
3. Ueber einen separaten Endpunkt oder denselben Audit-Proof-Mechanismus den Tombstone extern verankern.
4. In der UI und API geloeschte Objekte als nachvollziehbare Audit-Ereignisse ausweisen.

Erst damit wird nicht nur "unveraendert vorhanden", sondern auch "nachweisbar entfernt" revisionssicher und fuer Auditoren ohne Luecke belegbar.

## 13. Kurzfazit

Die aktuelle Save/Verify-Kette von NMB Archiver ist fuer den Objektbestand bereits belastbar:

1. Save verankert den deterministisch gebildeten `verificationRootHash`, nicht nur den Rohmail-Hash.
2. Verify rehasht E-Mail und Attachments aus dem aktuellen Storage erneut.
3. Verify prueft zusaetzlich den in der DB gespeicherten `verification_root_hash`.
4. Verify sendet `key + value(rootHash) + timestamp(archivedAt)` an `/verify`.
5. Loeschungen hinterlassen bereits heute eine lokale, hash-verkettete Audit-Spur.

Fuer eine vollstaendige externe Delete-Beweiskette fehlt als letzter grosser Baustein noch ein externer Tombstone-Mechanismus.
