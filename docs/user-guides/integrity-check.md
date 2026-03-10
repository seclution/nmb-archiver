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
