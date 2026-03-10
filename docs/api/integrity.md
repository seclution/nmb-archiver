# Integrity Check API

The Integrity Check API verifies a canonical verification manifest per archived email. The manifest includes:

- `emailHashSha256` for the `.eml` file
- a stable, sorted attachment list with `filename`, `sizeBytes`, `contentHashSha256`

Open Archiver then computes `verificationRootHash = SHA256(canonicalManifestJson)` and uses this root hash for external audit-proof storage and verification.

## Get Archived Email (with Optional Verification)

Returns archived email details. Optionally, it can include a `verification` object with separate local and external verification statements.

- **URL:** `/api/v1/archived-emails/:id?includeVerification=true`
- **Method:** `GET`
- **Query Params:**
    - `includeVerification=[boolean]` (optional)

### Verification Fields

- `verification.localIntegrity`: local file-vs-DB check (email + attachments)
- `verification.externalProof`: verification of `verificationRootHash` against the audit-proof backend
- `verification.manifest`: canonical manifest used for root calculation
- `verification.verificationRootHash`: SHA256 root over the canonical manifest

## Check Email Integrity

- **URL:** `/api/v1/integrity/:id`
- **Method:** `GET`
- **Success Response:**

```json
{
	"localIntegrity": {
		"isValid": true,
		"integrityReport": [
			{ "type": "email", "id": "...", "isValid": true },
			{ "type": "attachment", "id": "...", "filename": "invoice.pdf", "isValid": true }
		]
	},
	"externalProof": {
		"isValid": true,
		"verificationRootHash": "...",
		"details": { "res": "PASSED", "msg": "verified" }
	}
}
```

This means “not manipulated” explicitly covers both the email body (`.eml`) and all linked attachments, and can be externally backed by audit-proof verification of the root hash.
