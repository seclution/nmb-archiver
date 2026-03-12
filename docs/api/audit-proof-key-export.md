# Audit-Proof Key Export for Reconciliation

Status: planned extension, not implemented in the current Audit-Proof backend.

This document describes the backend variant with `list` or `export keys` support that would allow
NMB Archiver to detect silent deletes and reconcile its local state against an external proof
inventory.

## Why this is needed

The current Audit-Proof integration can:

- store a proof with `POST /save`
- verify a known proof with `POST /verify`

This is sufficient as long as NMB Archiver still knows the key it wants to verify.

It is not sufficient to reliably detect a complete silent delete where:

- the database row is gone,
- the storage object is gone,
- no tombstone was written,
- and NMB Archiver no longer knows which key should still exist.

For that case, NMB Archiver needs an independent external inventory of anchored keys.

## Goal

The Audit-Proof backend should be able to return the set of known keys, or export them in a
machine-readable format, so NMB Archiver can compare:

1. active archived emails in local DB
2. deleted-email tombstones in local DB
3. externally anchored keys in Audit-Proof backend

This turns the Audit-Proof backend into an external "expected objects" witness.

## Minimal endpoint variants

The smallest useful variant is one of these two options.

### Option A: paginated key listing

```http
GET /keys?prefix={instanceId}:mail:&cursor=...&limit=1000
```

Example response:

```json
{
	"items": [
		{
			"key": "instance-1:mail:archived-email-id",
			"valueHash": "verification-root-hash",
			"createdAt": "2026-03-12T09:30:00.000Z",
			"lastVerifiedAt": "2026-03-12T10:15:00.000Z"
		},
		{
			"key": "instance-1:tombstone:archived-email-id:tombstone-id",
			"valueHash": "tombstone-root-hash",
			"createdAt": "2026-03-12T10:20:00.000Z"
		}
	],
	"nextCursor": "opaque-cursor"
}
```

### Option B: bulk export

```http
GET /keys/export?prefix={instanceId}:mail:&format=ndjson
```

Example NDJSON line:

```json
{
	"key": "instance-1:mail:archived-email-id",
	"valueHash": "verification-root-hash",
	"createdAt": "2026-03-12T09:30:00.000Z"
}
```

For large datasets, export is usually more practical than many paginated API calls.

## Recommended key namespaces

For the future export-friendly model, the external key space should be explicit and queryable by
prefix.

Typical inventory queries would then look like:

- `instance-id:mail:*`
- `instance-id:tombstone:*`

That means a reconciliation job can ask:

- which mail proofs were ever anchored for this instance?
- which tombstones were ever anchored for this instance?

To make external reconciliation deterministic, keys should be clearly namespaced:

- archived email proof:
    - `instance-id:mail:archived-email-id`
- tombstone proof:
    - `instance-id:tombstone:archived-email-id:tombstone-id`

This separation is important because reconciliation needs to distinguish:

- proofs for currently active archived objects
- proofs for controlled deletions

Important implementation note:

- the current NMB Archiver implementation still anchors archived emails with the legacy pattern
  `instanceId:archivedEmailId`
- the tombstone flow already uses an explicit tombstone namespace

If the backend later adds `list/export keys`, the cleanest target model is either:

1. migrate or alias archived email keys to `instance-id:mail:archived-email-id`, or
2. let the backend expose legacy archived-email keys under a virtual `mail` namespace during export

The important point is that reconciliation gets one stable namespace for all archived-email proofs.

## Tombstone reference requirement

A legitimate delete must not only create a tombstone key. It should also be externally relatable to
the original mail proof.

That means the tombstone should reference the original anchored mail key, for example:

- `subjectKey`: `instance-id:mail:archived-email-id`
- `tombstoneKey`: `instance-id:tombstone:archived-email-id:tombstone-id`

This can be represented in one of two ways:

### Variant A: reference inside tombstone metadata

Example export item:

```json
{
	"key": "instance-1:tombstone:archived-email-id:tombstone-id",
	"valueHash": "tombstone-root-hash",
	"kind": "tombstone",
	"subjectKey": "instance-1:mail:archived-email-id",
	"createdAt": "2026-03-12T10:20:00.000Z"
}
```

### Variant B: implicit correlation by key structure

If metadata is not available, NMB Archiver can still correlate:

- `instance-id:mail:archived-email-id`
- `instance-id:tombstone:archived-email-id:tombstone-id`

by the shared `archived-email-id`.

Variant A is better because it survives future key-format changes and is more auditor-friendly.

## Recommended response fields

At minimum, each exported key should contain:

- `key`
- `valueHash`
- `createdAt`

Useful optional fields:

- `namespace`
- `kind`
- `subjectKey`
- `lastVerifiedAt`
- `backendRecordId`
- `metadata` if the backend stores safe, non-sensitive classification metadata

NMB Archiver should not depend on business metadata being present. The key format itself should be
enough to classify the entry.

## How NMB Archiver would use it

With a `list/export keys` endpoint, a reconciliation job can build three sets:

1. local active email keys
2. local tombstone keys
3. external Audit-Proof keys

Then it can detect several classes of findings.

### Finding: local active object has no external key

- Local DB says the archived email exists.
- Audit-Proof backend has no matching email key.

Interpretation:

- ingest proof missing
- external anchor failed
- data set is locally present but externally incomplete

### Finding: local tombstone has no external tombstone key

- Local tombstone exists.
- Audit-Proof backend has no matching tombstone key.

Interpretation:

- delete process was incomplete
- external tombstone anchor failed
- deletion proof is not fully externally backed

### Finding: external mail key exists, but local active object and local tombstone are both missing

- Audit-Proof backend still knows the email proof key.
- Local DB has no active archived email.
- Local DB has no tombstone for that archived email.

Interpretation:

- strong indicator for silent delete or uncontrolled data loss

This is the key scenario that the current `save`/`verify` only model cannot reliably detect.

### Finding: external mail key exists and local active object is gone, but matching tombstone reference is missing

- Audit-Proof backend knows `instance-id:mail:archived-email-id`.
- The local archived email no longer exists.
- A tombstone either does not exist or does not point back to the mail key.

Interpretation:

- delete is not externally justified
- strong indicator for uncontrolled or incomplete deletion

This is why "authorized delete must be visible as tombstone reference" is the correct target model.

## Security and integrity requirements

If the backend exposes `list/export keys`, the endpoint should be treated as sensitive.

Minimum requirements:

- strong authentication
- explicit authorization for reconciliation or audit operators
- tenant or instance scoping
- support for prefix filtering, never unrestricted cross-tenant listing
- rate limiting and export size controls
- full audit logging of every export request

Recommended hardening:

- signed export file or response digest
- export watermark such as `exportedAt` and backend-side `exportHash`
- optional snapshot token so a long-running export can be proven to belong to one consistent backend state

## Recommended future NMB Archiver flow

If the Audit-Proof backend later provides this capability, the intended NMB Archiver flow is:

1. fetch external key inventory for the current `auditProofInstanceId`
2. derive expected local email keys from `archived_emails`
3. derive expected local tombstone keys from `deleted_email_tombstones`
4. compare local and external sets
5. write a reconciliation report with findings such as:
    - `missing_external_email_key`
    - `missing_external_tombstone_key`
    - `orphan_external_email_key`
    - `orphan_external_tombstone_key`
    - `possible_silent_delete`

## Why this is better than local-only detection

Without a local append-only registry, a fully deleted DB row can remove the last local trace that an
object ever existed.

An external key inventory changes that:

- even if local DB rows disappear,
- the external proof key still exists,
- and the mismatch becomes detectable.

This does not replace infrastructure controls, but it creates an independent forensic witness
outside the primary application database.
