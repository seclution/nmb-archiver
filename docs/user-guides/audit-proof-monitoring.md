# Audit-Proof Monitoring Proposal

This page describes a **planned monitoring concept** for NMB Archiver instances that use the external audit-proof backend.

It is intentionally a **TODO / operations proposal for later**. The functionality described here is **not yet implemented inside the application**. The goal is to document the recommended monitoring model early so it can be implemented consistently later.

## Goal

The audit-proof integration is asynchronous:

1. NMB Archiver stores the mail locally.
2. A deterministic `verificationRootHash` is generated.
3. The root hash is submitted to the external audit-proof backend via `/save`.
4. A scheduler retries failed or deferred submissions later.

From an operations perspective, the critical question is therefore not only "is the queue alive?", but:

**Which archived emails are still not submitted to the audit-proof backend?**

That should be monitored continuously.

## Multi-Instance Requirement

The target operating model is:

- one VM
- multiple customer-specific NMB Archiver container stacks
- one instance per customer

Monitoring must therefore work **per instance**, not only per VM.

The recommended design is:

- one **Check_MK local check script on the host**
- one inventory/config file listing all customer instances on that VM
- one service output per customer instance
- optional one aggregated summary service for the VM

Example instance inventory:

```yaml
instances:
  - name: customer-a
    project: nmb-customer-a
    db_dsn: postgresql://readonly:***@127.0.0.1:5541/open_archive
    expected_audit_proof_enabled: true
  - name: customer-b
    project: nmb-customer-b
    db_dsn: postgresql://readonly:***@127.0.0.1:5542/open_archive
    expected_audit_proof_enabled: true
```

The important point is that the check must not assume a single global database or a single container set.

## Why DB Backlog Is the Primary Signal

The existing audit-proof submission queue is operationally useful, but it is **not the source of truth**.

Reasons:

- completed and failed BullMQ jobs are rotated out
- a queue may be empty even though emails are still not `submitted`
- replay jobs can re-enqueue emails later
- the real business state is persisted in `archived_emails`

Relevant schema fields:

- [archived-emails.ts](../../packages/backend/src/database/schema/archived-emails.ts)
  - `audit_proof_submission_status`
  - `audit_proof_submitted_at`
  - `audit_proof_last_submission_attempt_at`
  - `audit_proof_submission_attempts`
  - `audit_proof_last_submission_error`

Therefore:

- **Primary signal**: database backlog
- **Secondary signal**: queue liveness and worker health

## Primary Metrics Per Instance

Each customer instance should expose the following logical metrics to Check_MK:

- `pending_count`
- `failed_count`
- `skipped_not_configured_count`
- `backlog_total`
- `oldest_backlog_age_seconds`

Meaning:

- `pending_count`: submissions that are queued or waiting to be replayed
- `failed_count`: submissions that were attempted and failed
- `skipped_not_configured_count`: submissions deferred because APS was not configured
- `backlog_total`: total count of emails not yet `submitted`
- `oldest_backlog_age_seconds`: age of the oldest unresolved backlog item

## Recommended SQL Query

The host-side Check_MK plugin should query each instance database directly with a read-only account.

Recommended query:

```sql
SELECT
  count(*) FILTER (
    WHERE audit_proof_submission_status = 'pending'
  ) AS pending_count,
  count(*) FILTER (
    WHERE audit_proof_submission_status = 'failed'
  ) AS failed_count,
  count(*) FILTER (
    WHERE audit_proof_submission_status = 'skipped_not_configured'
  ) AS skipped_not_configured_count,
  count(*) FILTER (
    WHERE audit_proof_submission_status IN ('pending', 'failed', 'skipped_not_configured')
  ) AS backlog_total,
  COALESCE(
    EXTRACT(EPOCH FROM (
      now() - MIN(archived_at) FILTER (
        WHERE audit_proof_submission_status IN ('pending', 'failed', 'skipped_not_configured')
      )
    )),
    0
  )::bigint AS oldest_backlog_age_seconds;
```

This query is intentionally based on business state, not queue internals.

## Secondary Signals

Queue metrics still make sense as supporting signals.

Relevant code:

- [JobsService.ts](../../packages/backend/src/services/JobsService.ts)
- [jobs.routes.ts](../../packages/backend/src/api/routes/jobs.routes.ts)

Useful secondary signals:

- `audit-proof-submission` queue `waiting`
- `active`
- `failed`
- worker process alive yes/no

These should be treated as **operational diagnostics**, not as the main compliance signal.

## Recommended Check_MK Service Model

For one VM with multiple customer instances, the local check should emit:

- one service per customer instance
- optional one aggregate VM-level service

Suggested service names:

- `NMB Audit-Proof Backlog customer-a`
- `NMB Audit-Proof Backlog customer-b`
- `NMB Audit-Proof Aggregate`

Each per-instance service should include:

- backlog counts
- oldest backlog age
- short reason summary if `failed_count > 0`

Example local check output:

```text
0 "NMB Audit-Proof Backlog customer-a" backlog_total=0;5;20 oldest_age=0s;900;3600 pending=0 failed=0 skipped_not_configured=0 APS submissions are healthy
2 "NMB Audit-Proof Backlog customer-b" backlog_total=14;5;20 oldest_age=8120s;900;3600 pending=3 failed=11 skipped_not_configured=0 Audit-proof backlog is too old
```

## Threshold Proposal

Suggested initial thresholds per instance:

- `CRIT` if `failed_count > 0`
- `WARN` if `backlog_total > 0` and `oldest_backlog_age_seconds > 900`
- `CRIT` if `oldest_backlog_age_seconds > 3600`
- `CRIT` if `skipped_not_configured_count > 0` in production environments where APS is expected

These thresholds should later be configurable per customer if needed.

## Operational Interpretation

Typical situations:

### Healthy

- `backlog_total = 0`
- `oldest_backlog_age_seconds = 0`

Interpretation:

- all persisted emails that should be submitted are currently marked `submitted`

### Temporary APS disturbance

- `pending_count > 0`
- `oldest_backlog_age_seconds` small

Interpretation:

- queue/replay is still catching up
- short-lived issue, likely no manual intervention yet required

### Real incident

- `failed_count > 0`
- or very old backlog

Interpretation:

- APS requests are failing or hanging repeatedly
- operator must inspect worker logs, APS availability and instance configuration

### Misconfiguration

- `skipped_not_configured_count > 0`

Interpretation:

- instance is ingesting mail but APS is not configured
- acceptable only for explicitly non-APS instances

## Recommended Deployment Pattern

For multiple customer instances on one VM:

1. Each customer stack gets its own read-only database credentials for monitoring.
2. The host runs one Check_MK local plugin that iterates over all configured instances.
3. The plugin queries each instance database independently.
4. Optional: the plugin additionally checks the corresponding worker container or process.

This keeps monitoring independent from:

- frontend login state
- API permissions
- queue retention details

It also scales better when several customer instances share one host.

## Future Implementation Options

The recommended first implementation is:

- host-side Check_MK local plugin
- direct read-only PostgreSQL query

Possible later extension:

- dedicated internal monitoring endpoint exposing the same backlog metrics
- optional Prometheus/OpenMetrics export

The DB-backed model should remain the canonical interpretation, even if an HTTP metrics endpoint is added later.

## Relation to the Current Audit-Proof Flow

This monitoring proposal is based on the async submission model documented here:

- [Audit-Proof Integration: Save/Verify Validierungs-Matrix](../api/audit-proof-save-verify-validation.md)

Key principle:

- the application persists whether a mail is still `pending`, already `submitted`, or `failed`
- monitoring must validate that unresolved backlog does not silently grow over time

## Summary

For NMB Archiver, the correct compliance-relevant monitoring target is:

**not** "how many jobs are in BullMQ right now?"

but:

**"how many archived emails of each customer instance are still not submitted to the audit-proof backend, and how old is that backlog?"**

That is the model this project should implement later for Check_MK.
