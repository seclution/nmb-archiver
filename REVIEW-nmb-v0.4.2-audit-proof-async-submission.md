# Review Guide: `feature/nmb-v0.4.2-audit-proof-async-submission`

## Kontext

Diese Branch ist die saubere NMB-Ausbaustufe auf Basis des Upstream-Releases `v0.4.2`.
Sie enthaelt bewusst **kein** Delete-/Tombstone-/Retention-Feature. Der Fokus liegt nur auf:

- NMB-Branding
- Audit-Proof-Integration fuer `save` und `verify`
- deterministische Root-Hash-Bildung
- persistente Async-Submission der `save`-Requests

## Review-Links

- Upstream-Release-Tag: [`v0.4.2`](https://github.com/LogicLabs-OU/OpenArchiver/tree/v0.4.2)
- Upstream-Basis-Commit: [`3434e8d`](https://github.com/LogicLabs-OU/OpenArchiver/commit/3434e8d)
- NMB-Branch-Head: [`75e4267`](https://github.com/seclution/nmb-archiver/commit/75e4267e5b0c9316a741bd034619a947916800eb)
- Stabiler Commit-Compare: <https://github.com/seclution/nmb-archiver/compare/3434e8d...75e4267>
- Branch: <https://github.com/seclution/nmb-archiver/tree/feature/nmb-v0.4.2-audit-proof-async-submission>

## Scope der Anpassungen

High level wurden folgende Bereiche angepasst:

1. Audit-Proof-Settings und HTTP-Client fuer `/save` und `/verify`
2. deterministische Manifest- und `verificationRootHash`-Bildung
3. Verify-Refactoring: Rehash aus aktuellen Storage-Bytes statt Vertrauen auf Altwerte
4. DB-Referenzschutz: gespeicherter `verification_root_hash` wird gegen den frisch berechneten Root-Hash geprueft
5. persistente Async-Submission mit Queue, Retry und Submission-Status
6. NMB-Branding und Doku-Nachzug fuer die Release-basierte Fork-Linie

Nicht Teil dieser Branch:

- Delete/Tombstone
- Retention Policy
- sonstige spaetere Upstream-`main`-Entwicklungsfeatures

## Empfohlene Review-Reihenfolge

1. Architektur und Doku
   - [README.md](README.md)
   - [docs/api/audit-proof-save-verify-validation.md](docs/api/audit-proof-save-verify-validation.md)
2. Konfiguration und API-Client
   - [packages/types/src/system.types.ts](packages/types/src/system.types.ts)
   - [packages/backend/src/services/SettingsService.ts](packages/backend/src/services/SettingsService.ts)
   - [packages/backend/src/services/AuditProofService.ts](packages/backend/src/services/AuditProofService.ts)
3. Root-Hash-Bildung
   - [packages/backend/src/helpers/verificationManifest.ts](packages/backend/src/helpers/verificationManifest.ts)
4. Ingest und Queueing
   - [packages/backend/src/services/IngestionService.ts](packages/backend/src/services/IngestionService.ts)
   - [packages/backend/src/services/AuditProofEmailSubmissionService.ts](packages/backend/src/services/AuditProofEmailSubmissionService.ts)
   - [packages/backend/src/jobs/queues.ts](packages/backend/src/jobs/queues.ts)
   - [packages/backend/src/jobs/schedulers/sync-scheduler.ts](packages/backend/src/jobs/schedulers/sync-scheduler.ts)
   - [packages/backend/src/workers/audit-proof.worker.ts](packages/backend/src/workers/audit-proof.worker.ts)
5. Verify-Pfad
   - [packages/backend/src/services/EmailVerificationService.ts](packages/backend/src/services/EmailVerificationService.ts)
   - [packages/backend/src/services/IntegrityService.ts](packages/backend/src/services/IntegrityService.ts)
6. Persistenz
   - [packages/backend/src/database/schema/archived-emails.ts](packages/backend/src/database/schema/archived-emails.ts)
   - [packages/backend/src/database/migrations/0024_canonical_verification_root_hash.sql](packages/backend/src/database/migrations/0024_canonical_verification_root_hash.sql)
   - [packages/backend/src/database/migrations/0025_careful_starjammers.sql](packages/backend/src/database/migrations/0025_careful_starjammers.sql)

## Was technisch geaendert wurde

### 1. Deterministische Beweiskette eingefuehrt

Die Branch fuehrt ein kanonisches Manifest ein, aus dem ein stabiler Root-Hash entsteht. Dadurch haengt der externe Beweis nicht an der Reihenfolge der Attachments oder an transienten DB-Werten, sondern an einer deterministischen Darstellung des archivierten Inhalts.

Referenzen:

- [verificationManifest.ts#L14-L45](packages/backend/src/helpers/verificationManifest.ts#L14-L45)
- [IngestionService.ts#L558-L577](packages/backend/src/services/IngestionService.ts#L558-L577)
- [EmailVerificationService.ts#L132-L175](packages/backend/src/services/EmailVerificationService.ts#L132-L175)

Snippet:

```ts
const verificationManifest = buildVerificationManifest(
	emailHash,
	archivedAttachmentManifestEntries
);
const verificationRootHash = computeVerificationRootHash(verificationManifest);
```

Der reviewer sollte hier besonders pruefen:

- ist das Sorting der Attachments stabil und vollstaendig?
- geht wirklich nur der kanonische Inhalt in den Root-Hash ein?
- wird derselbe Algorithmus bei Save und Verify benutzt?

### 2. Save-Semantik auf asynchrone Submission ausgerichtet

Wichtig: `save` bedeutet in dieser Architektur **nicht** "bereits final extern verankert", sondern "vom Audit-Proof-Backend angenommen und zur asynchronen Verankerung uebergeben".

Die Applikation speichert deshalb nur einen Submission-Zustand:

- `pending`
- `submitted`
- `failed`
- `skipped_not_configured`

Referenzen:

- [archived-emails.ts#L39-L52](packages/backend/src/database/schema/archived-emails.ts#L39-L52)
- [AuditProofEmailSubmissionService.ts#L123-L149](packages/backend/src/services/AuditProofEmailSubmissionService.ts#L123-L149)

Snippet:

```ts
const submissionAccepted =
	response !== null &&
	response.httpStatus >= 200 &&
	response.httpStatus < 300 &&
	response.res !== 'ERROR';
```

Review-Fragen:

- ist `submitted` fachlich korrekt als "accepted for async anchoring" modelliert?
- werden Fehlerfaelle sauber sichtbar und wiederholbar gehalten?
- wird bewusst **kein** dauerhafter `verified`-Status gespeichert?

### 3. Save-Requests gehen nicht mehr verloren

Vorher war der `save`-Call ein Fire-and-forget-artiger Direktaufruf im Ingest-Pfad. Diese Branch stellt auf persistentes Queueing um. Das ist fuer die Beweiskette entscheidend, weil ein kurzzeitig nicht verfuegbares Audit-Proof-Backend sonst unbemerkt zu Luecken fuehren wuerde.

Referenzen:

- [IngestionService.ts#L564-L583](packages/backend/src/services/IngestionService.ts#L564-L583)
- [AuditProofEmailSubmissionService.ts#L19-L64](packages/backend/src/services/AuditProofEmailSubmissionService.ts#L19-L64)
- [AuditProofEmailSubmissionService.ts#L98-L163](packages/backend/src/services/AuditProofEmailSubmissionService.ts#L98-L163)
- [sync-scheduler.ts#L19-L32](packages/backend/src/jobs/schedulers/sync-scheduler.ts#L19-L32)

Snippet:

```ts
await db
	.update(archivedEmails)
	.set({
		verificationRootHash,
		auditProofSubmissionStatus: 'pending',
		auditProofSubmittedAt: null,
		auditProofLastSubmissionError: null,
	})
	.where(eq(archivedEmails.id, archivedEmail.id));

await IngestionService.auditProofEmailSubmissionService.enqueueEmailSubmission(
	archivedEmail.id
);
```

Das ist der zentrale Punkt fuer die manuelle Review:

- Der Root-Hash wird zuerst lokal persistiert.
- Danach wird der Submit-Job persistent eingereiht.
- Ein Scheduler replayt `pending`, `failed` und `skipped_not_configured`.

Damit ist der Handover an das externe System nicht mehr nur Glueckssache des Ingest-Moments.

### 4. Verify prueft gegen den Ist-Zustand aus dem Storage

Der Verify-Pfad benutzt nicht einfach DB-Hashes, sondern liest die aktuelle Mail und alle Attachments erneut aus dem Storage, bildet daraus wieder das Manifest und leitet den Root-Hash neu ab.

Referenzen:

- [EmailVerificationService.ts#L49-L99](packages/backend/src/services/EmailVerificationService.ts#L49-L99)
- [EmailVerificationService.ts#L132-L153](packages/backend/src/services/EmailVerificationService.ts#L132-L153)
- [EmailVerificationService.ts#L167-L197](packages/backend/src/services/EmailVerificationService.ts#L167-L197)

Snippet:

```ts
const raw = await streamToBuffer(emailStream);
const hashSha256 = createHash('sha256').update(raw).digest('hex');

const manifest = buildVerificationManifest(hashSha256, attachmentManifestEntries);
const verificationRootHash = computeVerificationRootHash(manifest);
```

Das ist revisionsrelevant, weil damit nicht nur "die Datenbank sagt passt" geprueft wird, sondern "die aktuell vorhandenen Bytes passen noch zur Beweiskette".

### 5. DB-Referenz wird gegen den Rehash abgesichert

Zusatzschutz: Wenn `verification_root_hash` in der DB manipuliert wird, faellt das bei Verify auf. Es wird also nicht nur Storage gegen DB geprueft, sondern auch die gespeicherte Root-Referenz gegen den frisch berechneten Manifest-Hash.

Referenzen:

- [EmailVerificationService.ts#L135-L152](packages/backend/src/services/EmailVerificationService.ts#L135-L152)
- [packages/types/src/integrity.types.ts](packages/types/src/integrity.types.ts)

Snippet:

```ts
email.verificationRootHash === verificationRootHash
	? { type: 'verification_root', id: email.id, isValid: true }
	: {
			type: 'verification_root',
			id: email.id,
			isValid: false,
			reason:
				'Stored verification root hash does not match the recomputed manifest hash.',
		}
```

### 6. Externe Verifikation ist eine Momentaufnahme, kein dauerhafter Status

Die Anwendung speichert **nicht** "verified". Stattdessen fuehrt sie bei Bedarf einen aktuellen `/verify`-Call aus.

Referenzen:

- [AuditProofService.ts#L80-L100](packages/backend/src/services/AuditProofService.ts#L80-L100)
- [EmailVerificationService.ts#L167-L197](packages/backend/src/services/EmailVerificationService.ts#L167-L197)

Snippet:

```ts
auditProofVerification = await this.auditProofService.verifyEmailHash(
	systemSettings,
	email.id,
	verificationRootHash,
	Math.floor(new Date(email.archivedAt).getTime() / 1000)
);
```

Fachlich heisst das:

- `save` = Submission an das externe Backend
- `verify` = spaetere punktuelle Pruefung gegen den extern verankerten Stand

Das ist absichtlich kein synchrones "DB-Commit-im-Fremdsystem".

## Warum die Daten in diesem Modell revisionssicherer sind

Technisch wird die Kette auf diesem Branch durch folgende Eigenschaften belastbar:

1. Die Mail und alle Attachments werden gehasht und in ein kanonisches Manifest ueberfuehrt.
2. Daraus entsteht ein deterministischer `verificationRootHash`.
3. Dieser Root-Hash wird lokal in der DB referenziert.
4. Der externe `save`-Handover wird persistent mit Queue und Retry abgesichert.
5. Ein spaeteres `verify` rehasht die realen Storage-Bytes und prueft:
   - Mail-Hash
   - Attachment-Hashes
   - gespeicherten DB-Root-Hash
   - externen Audit-Proof-Nachweis

Wichtig fuer die Review: Diese Branch behauptet **nicht**, dass der externe Save synchron final verankert ist. Die Aussage ist enger und technisch sauberer:

- Ein 2xx-/kein-Fehler-`/save` wird als erfolgreicher Handover ins externe System behandelt.
- Die belastbare spaetere Aussenpruefung passiert ueber `/verify`.

## Konkrete Review-Foki

Ein Entwickler sollte bei der manuellen Review insbesondere pruefen:

1. Ist die Manifest-Bildung deterministisch und reproduzierbar?
2. Sind Save und Verify auf exakt denselben Root-Hash-Algorithmus ausgerichtet?
3. Kann ein fehlgeschlagener `/save`-Handover verloren gehen oder wird er sicher erneut verarbeitet?
4. Ist `submitted` semantisch sauber von spaeterer externer Verifikation getrennt?
5. Deckt der Verify-Pfad wirklich den Ist-Zustand im Storage ab und nicht nur gespeicherte Referenzwerte?
6. Sind Migration `0024` und `0025` fuer die Release-basierte Linie upgrade-sicher?
7. Ist im Scope dieser Branch versehentlich Delete-/Retention-Code mitgerutscht?

## Erwartetes Review-Ergebnis

Wenn die Review positiv ausfaellt, sollte die Branch fuer die erste NMB-Ausbaustufe folgendes belastbar liefern:

- E-Mails werden archiviert und durchsuchbar gespeichert.
- Fuer jede archivierte Mail wird ein deterministischer Root-Hash gebildet.
- Der Root-Hash wird ans externe Audit-Proof-Backend uebergeben, ohne dass Requests verloren gehen.
- Ein spaeteres Verify kann lokal und extern pruefen, ob der heutige Byte-Zustand noch zur damaligen Beweiskette passt.

Als Detailreferenz fuer das Gesamtsystem dient zusaetzlich:

- [docs/api/audit-proof-save-verify-validation.md](docs/api/audit-proof-save-verify-validation.md)
