# Integrity Check API

The Integrity Check API provides endpoints to verify the cryptographic hash of an archived email and its attachments against the stored values in the database. This allows you to ensure that the stored files have not been tampered with or corrupted since they were archived.

For each verification run, Open Archiver reads the `.eml` file exactly once and computes the SHA256 exactly once. The resulting hash is reused for both local DB comparison (`storageHashSha256`) and (when requested) audit-proof verification.

## Get Archived Email (with Optional Verification)

Returns archived email details. Optionally, it can include a `verification` object that contains the local integrity result for the `.eml` file and the audit-proof verification result.

- **URL:** `/api/v1/archived-emails/:id?includeVerification=true`
- **Method:** `GET`
- **URL Params:**
    - `id=[string]` (required) - The UUID of the archived email.
- **Query Params:**
    - `includeVerification=[boolean]` (optional) - When `true`, verification data is included.
- **Permissions:** `read:archive`

## Check Email Integrity

Verifies the integrity of a specific archived email and all of its associated attachments.

- **URL:** `/api/v1/integrity/:id`
- **Method:** `GET`
- **URL Params:**
    - `id=[string]` (required) - The UUID of the archived email to check.
- **Permissions:** `read:archive`
- **Implementation note:** The email file hash is generated once per request and reused internally.
- **Success Response:**
    - **Code:** 200 OK
    - **Content:** `IntegrityCheckResult[]`

### Response Body `IntegrityCheckResult`

An array of objects, each representing the result of an integrity check for a single file (either the email itself or an attachment).

| Field      | Type                      | Description                                                                 |
| :--------- | :------------------------ | :-------------------------------------------------------------------------- |
| `type`     | `'email' \| 'attachment'` | The type of the file being checked.                                         |
| `id`       | `string`                  | The UUID of the email or attachment.                                        |
| `filename` | `string` (optional)       | The filename of the attachment. This field is only present for attachments. |
| `isValid`  | `boolean`                 | `true` if the current hash matches the stored hash, otherwise `false`.      |
| `reason`   | `string` (optional)       | A reason for the failure. Only present if `isValid` is `false`.             |

### Example Response

```json
[
	{
		"type": "email",
		"id": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
		"isValid": true
	},
	{
		"type": "attachment",
		"id": "b2c3d4e5-f6a7-8901-2345-67890abcdef1",
		"filename": "document.pdf",
		"isValid": false,
		"reason": "Stored hash does not match current hash."
	}
]
```

- **Error Response:**
    - **Code:** 404 Not Found
    - **Content:** `{ "message": "Archived email not found" }`
