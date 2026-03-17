# Review Guide: `feature/nmb-revision-proof`

## Kontext

Dieser Branch basiert bewusst auf `original` Tag `v0.4.2` des echten OpenArchiver-Upstreams. Er fuehrt die NMB-Anpassungen fuer ein revisionssicheres Backend als moeglichst separierten Delta ein:

- eigener Namespace `nmbRevisionProof`
- eigene Sidecar-Persistenz
- eigene Queue, eigener Worker, eigener Scheduler
- eigener Konfigurationsblock in `system_settings.config`
- Verify ueber lokalen Rehash plus externes NMB-Backend

Wichtig fuer das Review: `v0.4.2` enthaelt **noch keinen** generischen Audit-Proof- oder Revision-Proof-Pfad. Die hier eingefuehrten NMB-Bausteine sind also ein Add-on auf die echte Upstream-Basis und keine Umbenennung eines schon vorhandenen Upstream-Subsystems.

## Teil 1: Relevante Upstream-Grundlagen in `v0.4.2`

### 1. Die Ingestion archiviert bereits die Mail-Rohdaten und Attachment-Hashes

Relevante Dateien:

- `packages/backend/src/services/IngestionService.ts`
- `packages/backend/src/database/schema/archived-emails.ts`
- `packages/backend/src/database/schema/attachments.ts`

Upstream speichert bereits:

- die EML-Bytes im Storage
- den SHA-256-Hash der Mail in `archived_emails.storage_hash_sha256`
- fuer Attachments den SHA-256-Hash und den Storage-Pfad in `attachments`

Das ist fuer unsere Anpassung die fachliche Grundlage, weil der NMB-Pfad auf denselben archivierten Bytes und Hashes aufsetzt.

### 2. Upstream hat bereits einen lokalen Integritaets-Check gegen aktuelle Storage-Bytes

Relevante Datei:

- `packages/backend/src/services/IntegrityService.ts`

Upstream-Prinzip:

- die E-Mail wird aus dem Storage gelesen
- ihr aktueller SHA-256-Hash wird neu berechnet
- fuer Attachments passiert dasselbe
- verglichen wird jeweils gegen die in der Datenbank gespeicherten Hash-Werte

Das ist fuer unsere Anpassung wichtig, weil unser Verify-Pfad dieselbe Grundidee weiterfuehrt, aber zusaetzlich einen deterministischen Root-Hash bildet und diesen gegen den externen NMB-Proof prueft.

### 3. Upstream besitzt bereits BullMQ fuer Hintergrundarbeit

Relevante Dateien:

- `packages/backend/src/jobs/queues.ts`
- `packages/backend/src/workers/ingestion.worker.ts`
- `packages/backend/src/workers/indexing.worker.ts`
- `packages/backend/src/jobs/schedulers/sync-scheduler.ts`

Der Upstream bringt bereits Queueing und Scheduler fuer:

- Ingestion
- Indexing
- kontinuierliche Synchronisation

Das ist fuer unsere Anpassung relevant, weil wir keine parallele zweite Scheduling-Infrastruktur erfinden, sondern einen **eigenen NMB-Pfad innerhalb derselben BullMQ-/Redis-Basis** anlegen.

### 4. Upstream hat eine zentrale JSON-Konfiguration in `system_settings`

Relevante Dateien:

- `packages/backend/src/database/schema/system-settings.ts`
- `packages/backend/src/services/SettingsService.ts`
- `packages/frontend/src/routes/dashboard/settings/system/+page.server.ts`
- `packages/frontend/src/routes/dashboard/settings/system/+page.svelte`

Upstream speichert Systemkonfiguration bereits als JSON in `system_settings.config`. Das ist fuer unsere Anpassung wichtig, weil wir keinen zweiten globalen Settings-Mechanismus einfuehren, sondern den NMB-Block sauber in diesen bestehenden Mechanismus einhaengen.

### 5. Upstream-Datenmodell enthaelt in `v0.4.2` noch keine Revision-Proof-Felder

Relevante Datei:

- `packages/backend/src/database/schema/archived-emails.ts`

Wichtig fuer das Review:

- `archived_emails` kennt in `v0.4.2` noch keinen `verification_root_hash`
- es gibt keinen vorhandenen Submission-Status fuer externen Proof
- es gibt keinen generischen Audit-Proof-Service im Upstream

Genau deshalb fuehrt dieser Branch den revisionssicheren Betriebszustand bewusst in einer separaten NMB-Sidecar-Tabelle ein, statt spaetere Fork-Strukturen in den Upstream zurueckzupressen.

## Teil 2: Unsere Anpassungen Schritt fuer Schritt

### 1. Eigene NMB-Namenswelt statt generischer Erweiterung des Upstreams

Neue Kernbausteine:

- `packages/backend/src/services/NmbRevisionProofService.ts`
- `packages/backend/src/services/NmbRevisionProofSubmissionService.ts`
- `packages/backend/src/database/schema/nmb-revision-proof-email-records.ts`
- `packages/backend/src/jobs/schedulers/nmb-revision-proof-scheduler.ts`
- `packages/backend/src/workers/nmb-revision-proof.worker.ts`

Begruendung:

- NMB-spezifische Logik bleibt klar auffindbar
- Upstream-Dateien werden nur an den notwendigen Integrationsstellen beruehrt
- spaetere Upstream-Merges bleiben leichter lesbar

### 2. Deterministische Manifest- und Root-Hash-Bildung

Neue Datei:

- `packages/backend/src/helpers/verificationManifest.ts`

Snippet:

```ts
const verificationManifest = buildVerificationManifest(emailHashSha256, attachments);
const verificationRootHash = computeVerificationRootHash(verificationManifest);
```

Technische Idee:

- Mail-Hash plus Attachment-Metadaten werden in eine kanonische Struktur ueberfuehrt
- Attachments werden deterministisch sortiert
- daraus wird der Root-Hash per SHA-256 gebildet

Begruendung:

- derselbe Archivinhalt muss immer denselben Root-Hash ergeben
- die Root-Hash-Bildung darf nicht von Attachment-Reihenfolge im Laufzeitkontext abhaengen

### 3. Sidecar-Tabelle fuer den revisionssicheren Submission-State

Neue Datei:

- `packages/backend/src/database/schema/nmb-revision-proof-email-records.ts`

Snippet:

```ts
export const nmbRevisionProofEmailRecords = pgTable(
	'nmb_revision_proof_email_records',
	{
		archivedEmailId: uuid('archived_email_id')
			.notNull()
			.references(() => archivedEmails.id, { onDelete: 'cascade' })
			.unique(),
		verificationRootHash: text('verification_root_hash').notNull(),
		submissionStatus: nmbRevisionProofSubmissionStatusEnum('submission_status')
			.notNull()
			.default('pending'),
		...
	}
);
```

Begruendung:

- `archived_emails` bleibt moeglichst upstream-nah
- NMB-spezifische Betriebsdaten liegen logisch getrennt
- bei spaeteren Upstream-Aenderungen an `archived_emails` sinkt das Konfliktpotenzial

### 4. Ingestion uebergibt nach dem Archivieren an den separaten NMB-Pfad

Relevante Datei:

- `packages/backend/src/services/IngestionService.ts`

Snippet:

```ts
const verificationManifest = buildVerificationManifest(
	emailHash,
	archivedAttachmentManifestEntries
);
const verificationRootHash = computeVerificationRootHash(verificationManifest);

await IngestionService.nmbRevisionProofSubmissionService.upsertPendingSubmission(
	archivedEmail.id,
	verificationRootHash
);

await IngestionService.nmbRevisionProofSubmissionService.enqueueEmailSubmission(
	archivedEmail.id
);
```

Begruendung:

- der Root-Hash wird dort gebildet, wo Mail und Attachments bereits vollstaendig vorliegen
- der revisionssichere Submission-State wird direkt im NMB-Sidecar vorbereitet
- der Upstream-Ingestion-Flow bleibt ansonsten unveraendert

### 5. Eigene Queue, eigener Worker, eigener Scheduler

Relevante Dateien:

- `packages/backend/src/jobs/queues.ts`
- `packages/backend/src/jobs/processors/submit-nmb-revision-proof-email.processor.ts`
- `packages/backend/src/jobs/processors/schedule-nmb-revision-proof-submission-retry.processor.ts`
- `packages/backend/src/workers/nmb-revision-proof.worker.ts`
- `packages/backend/src/jobs/schedulers/nmb-revision-proof-scheduler.ts`
- `package.json`
- `packages/backend/package.json`

Snippet:

```ts
export const nmbRevisionProofQueue = new Queue('nmb-revision-proof', {
	connection,
	defaultJobOptions,
});
```

#### Einordnung zum eigenen Scheduler in Node.js

Ein "eigener Scheduler" bedeutet hier **keinen separaten Thread innerhalb desselben JavaScript-Event-Loops**, sondern einen **eigenen Prozess- und Queue-Pfad** fuer die NMB-spezifischen Wiederholungen.

Technisch relevant:

- Node.js fuehrt JavaScript pro Prozess grundsaetzlich single-threaded aus
- BullMQ, Redis und externe HTTP-Requests arbeiten I/O-lastig und non-blocking ueber den Event Loop
- die Trennung in einen eigenen NMB-Scheduler ist deshalb eine klare **betriebliche und fachliche Separierung**, nicht das Einfuehren einer neuen Threading-Architektur

Warum das hier sinnvoll ist:

- der Upstream-Basisscheduler `sync-scheduler.ts` bleibt unveraendert
- NMB-Retry-Logik bekommt eigene Namen, eigene Logs und eigenen Lifecycle
- Failures und Betriebssignale lassen sich klar dem NMB-Pfad zuordnen

### 6. Eigener NMB-Konfigurationsblock in `system_settings.config`

Relevante Dateien:

- `packages/types/src/system.types.ts`
- `packages/backend/src/services/SettingsService.ts`
- `packages/frontend/src/routes/dashboard/settings/system/+page.server.ts`
- `packages/frontend/src/routes/dashboard/settings/system/+page.svelte`

Snippet:

```ts
nmbRevisionProof: {
	instanceId: null,
	backendUrl: null,
	debugRequests: false,
	requestTimeoutMs: 5000,
}
```

Begruendung:

- NMB-Konfiguration ist logisch gekapselt
- Upstream-Settings-Mechanik wird weiterverwendet
- UI und Backend muessen keinen separaten allgemeinen Settings-Pfad lernen

### 7. Verify ueber aktuellen Rehash plus externes NMB-`/verify`

Relevante Dateien:

- `packages/backend/src/services/EmailVerificationService.ts`
- `packages/backend/src/services/ArchivedEmailService.ts`
- `packages/backend/src/services/NmbRevisionProofService.ts`
- `packages/backend/src/api/controllers/archived-email.controller.ts`

Snippet:

```ts
const manifest = buildVerificationManifest(hashSha256, attachmentManifestEntries);
const verificationRootHash = computeVerificationRootHash(manifest);
const storedVerificationRootHash = nmbRevisionProofState?.verificationRootHash ?? null;
```

Ablauf:

1. aktuelle Mail-Bytes aus dem Storage lesen
2. aktuelle Attachment-Bytes aus dem Storage lesen
3. Root-Hash neu bilden
4. gegen den im Sidecar gespeicherten Root-Hash pruefen
5. denselben Root-Hash extern ueber `/verify` beim NMB-Backend pruefen

Begruendung:

- lokale Integritaet und externer Proof bleiben sauber getrennt
- nicht nur alte DB-Werte, sondern der aktuelle Storage-Zustand zaehlt
- der Read-Pfad bleibt fachlich nah an der Upstream-Integritaetspruefung, erweitert aber den Umfang fuer Revisionssicherheit

### 8. Admin-UI und Detailansicht zeigen nur den separaten NMB-State

Relevante Dateien:

- `packages/frontend/src/routes/dashboard/settings/system/+page.svelte`
- `packages/frontend/src/routes/dashboard/archived-emails/[id]/+page.server.ts`
- `packages/frontend/src/routes/dashboard/archived-emails/[id]/+page.svelte`

Umsetzung:

- Settings-Seite bearbeitet den `nmbRevisionProof`-Block
- Settings-Seite zeigt zusaetzlich eine NMB-Statusuebersicht
- Detailansicht ruft `includeVerification=true` auf
- Detailansicht zeigt Submission-Status, Root-Hash, Verify-Ergebnis und lokalen Integritaetsreport aus dem NMB-Pfad

Begruendung:

- Reviewer sehen die Trennung direkt in der UI wieder
- es wird kein generischer Audit-Proof-Begriff in den echten Upstream hineingetragen

## Review-Fokus

Beim Review sollten vor allem diese Punkte geprueft werden:

1. Bleibt `v0.4.2` ausserhalb der definierten Integrationspunkte unveraendert?
2. Sind alle neuen Namen, Queues und Scheduler sauber unter `nmbRevisionProof` separiert?
3. Entsteht der Root-Hash deterministisch aus denselben archivierten Bytes?
4. Liegt der revisionssichere Betriebszustand wirklich in der Sidecar-Tabelle und nicht verstreut im Upstream-Schema?
5. Ist der eigene Scheduler technisch sauber als separater Prozess-/Queue-Pfad umgesetzt und nicht mit dem Basisscheduler vermischt?
6. Spiegelt die Detailansicht die lokale Integritaetspruefung und den externen NMB-Proof nachvollziehbar wider?
