# NMB Archiver

[![Docker Compose](https://img.shields.io/badge/Docker%20Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Meilisearch](https://img.shields.io/badge/Meilisearch-FF5A5F?style=for-the-badge&logo=meilisearch&logoColor=white)](https://www.meilisearch.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io)
[![SvelteKit](https://img.shields.io/badge/SvelteKit-FF3E00?style=for-the-badge&logo=svelte&logoColor=white)](https://svelte.dev/)

**Ein selbst gehostetes E-Mail-Archiv mit revisionssicherer Prüfkette und externer Audit-Proof-Integration.**

NMB Archiver ist ein Fork von [Open Archiver](https://github.com/LogicLabs-OU/OpenArchiver). Vielen Dank an LogicLabs OÜ und alle bisherigen Contributor für die Grundlage dieses Projekts.

Der Fokus dieses Forks liegt auf dem produktiven Einsatz für unsere Kundenumgebungen und auf der Erweiterung um die Integration in unser hauseigenes revisionssicheres Backend. Ziel ist eine belastbare Beweiskette für Archivierung, Ansicht und Verifikation von E-Mails und Attachments, ohne die Offenheit und Nachvollziehbarkeit des Upstream-Projekts aufzugeben.

## Zielbild

- Revisionssichere Archivierung mit deterministischer Hash- und Manifestbildung
- Asynchrone Submission der Verifikationswurzel an ein separates Audit-Proof-Backend
- Prüfbarkeit von `save`- und `verify`-Pfaden über eine dokumentierte Beweiskette
- Selbst gehostete Infrastruktur ohne Vendor-Lock-in
- Fork-fähige Weiterentwicklung auf Basis des öffentlichen AGPL-Upstreams

## Funktionsumfang

- **Universal Ingestion**: Google Workspace, Microsoft 365, IMAP, PST, `.eml`-Archive und Mbox
- **Archivspeicherung im Standardformat**: E-Mails werden als `.eml` archiviert, Attachments separat verwaltet
- **Pluggable Storage**: lokales Dateisystem oder S3-kompatibler Objektspeicher
- **Suche und eDiscovery**: Volltextsuche über E-Mails und Attachments
- **Integritätsprüfung**: lokale Rehash-Prüfung für Mail und Attachments
- **Audit-Proof-Verifikation**: externer Nachweis über `verificationRootHash`
- **Delete Tombstones**: kontrollierte Löschungen mit Begründung, Tombstone-Manifest und externer Submission
- **Audit-Log**: nachvollziehbare System- und Löschereignisse mit Hash-Evidenz

## Revisionssichere Kette

NMB Archiver erweitert den Upstream um eine dokumentierte Prüfkette:

1. Beim Ingest werden Mail- und Attachment-Hashes berechnet.
2. Daraus wird ein kanonisches Manifest gebildet.
3. Aus dem Manifest wird ein deterministischer `verificationRootHash` abgeleitet.
4. Dieser Root-Hash wird lokal gespeichert, als `pending` markiert und ueber eine persistente Queue an das externe Audit-Proof-Backend uebergeben.
5. Das Audit-Proof-Backend verarbeitet diese `/save`-Submissions asynchron; der spaetere Verify ist die belastbare Punkt-in-Zeit-Pruefung.
6. Vor jeder kontrollierten Loeschung wird ein Tombstone mit eigener Hash-Evidenz erzeugt und bei konfigurierter Audit-Proof-Integration extern ueber `/save` eingereicht.

Die zugehörige technische Dokumentation liegt in [docs/api/audit-proof-save-verify-validation.md](docs/api/audit-proof-save-verify-validation.md), [docs/api/deletion-tombstones.md](docs/api/deletion-tombstones.md) und [docs/user-guides/integrity-check.md](docs/user-guides/integrity-check.md).

## Tech Stack

- **Frontend**: SvelteKit mit Svelte 5
- **Backend**: Node.js, Express.js und TypeScript
- **Queueing**: BullMQ auf Redis/Valkey
- **Search**: Meilisearch
- **Database**: PostgreSQL
- **Deployment**: Docker Compose

## Deployment

### Voraussetzungen

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)
- Ein Host mit mindestens 4 GB RAM, oder weniger bei extern betriebenem Postgres/Redis/Meilisearch

### Installation

1. Repository klonen:

```bash
git clone https://github.com/seclution/nmb-archiver.git nmb-archiver
cd nmb-archiver
```

2. Umgebungsdatei anlegen:

```bash
cp .env.example .env
```

3. Konfiguration in `.env` anpassen.

4. Stack starten:

```bash
docker compose up -d
```

5. Danach ist das Web-Interface standardmäßig unter `http://localhost:3000` erreichbar.

## Dokumentation

- Einstieg: [docs/index.md](docs/index.md)
- Installation: [docs/user-guides/installation.md](docs/user-guides/installation.md)
- Integritätsprüfung: [docs/user-guides/integrity-check.md](docs/user-guides/integrity-check.md)
- Audit-Proof-Validierung: [docs/api/audit-proof-save-verify-validation.md](docs/api/audit-proof-save-verify-validation.md)
- Delete Tombstones: [docs/api/deletion-tombstones.md](docs/api/deletion-tombstones.md)
- Audit-Proof Key Export: [docs/api/audit-proof-key-export.md](docs/api/audit-proof-key-export.md)

## Upstream

Dieser Fork verfolgt bewusst eine enge Anbindung an den öffentlichen Upstream:

- Upstream-Projekt: `https://github.com/LogicLabs-OU/OpenArchiver`
- Fork-Repository: `https://github.com/seclution/nmb-archiver`

Für Upstream-Syncs ist ein zusätzlicher Git-Remote `upstream` sinnvoll, damit Unterschiede zwischen Originalprojekt und Fork jederzeit sauber nachvollziehbar bleiben.
