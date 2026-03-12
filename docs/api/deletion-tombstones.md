# Deletion Tombstones

NMB Archiver creates an immutable tombstone record before an archived email is physically deleted.

This closes the audit gap between "object existed" and "object was removed in a controlled process".

## Current behavior

When an archived email is deleted through the application:

1. authorization and retention checks are executed,
2. a delete reason is required for manual deletes,
3. a canonical tombstone manifest is built from the archived email metadata and attachment hashes,
4. `tombstoneRootHash = SHA256(canonicalTombstoneManifestJson)` is computed,
5. the tombstone is persisted in `deleted_email_tombstones`,
6. if Audit-Proof is configured, the tombstone hash is anchored externally via the existing `POST /save` mechanism,
7. only after that succeeds does NMB Archiver physically remove the archived email from storage and database.

If the external anchor fails while Audit-Proof is configured, physical deletion is aborted.

## Manual delete requirements

Manual deletes remain available for privileged users, but they are controlled:

- a human-readable reason is mandatory,
- the reason must be at least 10 characters long,
- the delete leaves both a tombstone row and a chained audit-log entry.

Retention or other system deletes can use the same mechanism with a system-generated reason and an optional governing rule.

## External anchoring

Tombstones currently reuse the same Audit-Proof backend pattern as archived emails:

- endpoint: `POST /save`
- payload:

```json
{
	"key": "instance-id:tombstone:archived-email-id:tombstone-id",
	"value": "tombstone-root-hash"
}
```

The key namespace is intentionally separate from normal archived-email verification keys.

## Tombstone data model

The `deleted_email_tombstones` table stores:

- archived email identifier and ingestion source identifier
- actor identifier and actor IP
- delete reason and deletion mode
- archived metadata such as `messageIdHeader`, `subject`, `senderEmail`, `archivedAt`
- `storageHashSha256` and `verificationRootHash`
- attachment manifest with file hashes
- canonical tombstone manifest
- `tombstoneRootHash`
- external anchor state and response payload
- physical deletion state

This lets auditors distinguish between:

- tombstone created, but external anchor failed
- tombstone externally anchored, but physical deletion failed
- tombstone externally anchored and physical deletion completed

## Audit interpretation

A successful delete now means:

1. the system knew exactly which archived object was being deleted,
2. the object's hash evidence was frozen into the tombstone,
3. the tombstone was locally persisted,
4. the tombstone was externally anchored if Audit-Proof was configured,
5. only then was the object physically removed.

This does not protect against out-of-band manual deletion directly in database or object storage. For that, infrastructure controls and reconciliation jobs are still required.
