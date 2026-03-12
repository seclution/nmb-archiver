# Integrity Check

NMB Archiver verifies archived email integrity using a canonical manifest and a root hash.

## What is verified

For each archived email, NMB Archiver builds a canonical manifest with:

- SHA256 of the `.eml` file
- sorted attachment entries with stable fields:
    - `filename`
    - `sizeBytes`
    - `contentHashSha256`

From that manifest, NMB Archiver computes `verificationRootHash` (SHA256).

## Local + external verification

When you run verification, NMB Archiver:

1. re-hashes `.eml` and attachments,
2. rebuilds the same canonical manifest,
3. recalculates `verificationRootHash`,
4. performs:
    - `localIntegrity`: file content vs database hashes
    - `externalProof`: root hash vs audit-proof backend (`/verify`)

So “not manipulated” explicitly means both email and attachments are unchanged and this can be externally backed by audit-proof verification of the root hash.

## Why hashes are calculated again during verify

The SHA256 values stored in the database (`storageHashSha256` for `.eml` and
`contentHashSha256` for attachments) are the reference values created during ingestion.

During verification, NMB Archiver deliberately re-hashes the currently stored files and
compares those values against the stored references. This is required for tamper detection:

- If only stored hashes were reused, manipulation of files in storage would not be detected.
- Re-hashing on verify proves that the bytes on disk/object storage are still identical to
  the originally archived bytes.

In other words, this is not redundant cryptography; it is the actual integrity proof step.

## Additional database consistency check

If `verificationRootHash` is stored in the database, NMB Archiver also compares that stored
value with the root hash that was freshly recomputed from the current email bytes and
attachment bytes.

This closes an important integrity gap:

- If files in storage are unchanged but the DB reference hash was modified, verification still fails.
- If the DB reference hash matches and the external `/verify` check passes, the manifest root is
  consistent across storage, database, and the audit-proof backend.

## Practical optimization strategy

To balance performance and auditability, use two modes:

1. **Fast proof check (optional)**
    - Uses stored `verificationRootHash` and only checks `/verify` with audit-proof backend.
    - Does **not** prove that local files were unchanged since ingest.
2. **Full integrity verification (recommended for compliance)**
    - Re-hashes `.eml` and attachments.
    - Rebuilds canonical manifest and root hash.
    - Checks local hashes + external `/verify` proof.

For revisionssicherheit / non-manipulation claims, only the second mode is sufficient.

## What deletion now proves

Deletion is no longer just a local audit-log event.

Before an archived email is physically removed, NMB Archiver now:

1. requires a reason for manual deletes,
2. builds a canonical tombstone manifest from the archived email metadata and attachment hashes,
3. computes `tombstoneRootHash`,
4. stores that tombstone locally in `deleted_email_tombstones`,
5. submits the tombstone externally through the existing audit-proof `POST /save` mechanism when Audit-Proof is configured,
6. only then performs the physical deletion.

This means a controlled delete can now prove:

- which archived object was deleted,
- which hash evidence existed at delete time,
- who initiated the delete,
- why the delete happened,
- whether the external tombstone submission succeeded,
- whether the physical deletion completed.

If the external submission fails while Audit-Proof is configured, the delete is aborted.

## Remaining boundary

This still does not protect against an operator deleting data directly in database or object
storage outside the application. For that, you still need infrastructure controls and periodic
reconciliation jobs.
