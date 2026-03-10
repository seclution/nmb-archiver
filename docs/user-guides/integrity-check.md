# Integrity Check

Open Archiver verifies archived email integrity using a canonical manifest and a root hash.

## What is verified

For each archived email, Open Archiver builds a canonical manifest with:

- SHA256 of the `.eml` file
- sorted attachment entries with stable fields:
    - `filename`
    - `sizeBytes`
    - `contentHashSha256`

From that manifest, Open Archiver computes `verificationRootHash` (SHA256).

## Local + external verification

When you run verification, Open Archiver:

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

During verification, Open Archiver deliberately re-hashes the currently stored files and
compares those values against the stored references. This is required for tamper detection:

- If only stored hashes were reused, manipulation of files in storage would not be detected.
- Re-hashing on verify proves that the bytes on disk/object storage are still identical to
  the originally archived bytes.

In other words, this is not redundant cryptography; it is the actual integrity proof step.

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
