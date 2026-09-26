# Data model

Convex tables for the MVP.

## users

| Field | Type | Notes |
|-------|------|-------|
| clerkId | string | Clerk identity subject; indexed, unique in practice |
| name | string | Display name |
| email | string? | |
| role | `"citizen" \| "contractor" \| "inspector"`? | Persona role, set at onboarding |
| createdAt | number | ms |

Users are created on first authenticated request (`users.ensure`) and given a role
at **onboarding**. No seeded accounts.

Indexes: `by_clerkId`, `by_role`.

Ops-only mutations (`admin.clearAll`) are gated by the `ADMIN_CLERK_IDS` env
allowlist rather than by a role, since no civic role carries admin rights.

## issues

| Field | Type | Notes |
|-------|------|-------|
| caseNumber | string | e.g. `CIV-000001` |
| category | enum | `road` `garbage` `drainage` `streetlight` |
| title | string | Short label |
| description | string | Free text |
| severity | `"low" \| "medium" \| "high"` | Optional default medium |
| status | string | See status machine |
| lat, lng | number | **Approximate** — offset up to 250 m from the device fix; never the raw position |
| address | string | Human-readable, supplied by the citizen |
| reporterId | Id\<users\> | Creator |
| confirmationCount | number | Unique confirmations |
| evidenceCount | number | Denormalized |
| workOrderId | Id\<workOrders\>? | Set when WO created |
| createdAt, updatedAt | number | |

Indexes: `by_status`, `by_caseNumber`, `by_createdAt`.

`lat`/`lng` are deliberately imprecise. The raw device fix is never persisted or
transmitted — see **Location privacy** in `mvp-spec.md`. Anything that needs true
distance computes it client-side from the in-memory fix.

## confirmations

| Field | Type |
|-------|------|
| issueId | Id\<issues\> |
| userId | Id\<users\> |
| createdAt | number |

Index: `by_issue`, `by_issue_user` (uniqueness).

Inserted once at report time for the reporter, then once per confirming citizen.
Frozen once the issue has a work order.

## evidence

| Field | Type |
|-------|------|
| issueId | Id\<issues\> |
| userId | Id\<users\> |
| kind | `report` \| `before` \| `during` \| `after` \| `inspection` |
| storageId | Id\<\_storage\> | Convex file |
| note | string? |
| createdAt | number |

`attach` enforces kind → role mapping and work-order ownership; see
[mvp-spec](./mvp-spec.md#evidence-kinds).

## workOrders

| Field | Type |
|-------|------|
| issueId | Id\<issues\> |
| caseNumber | string |
| scope | string[] | Checklist of work items |
| status | string | open → … → closed |
| contractorId | Id\<users\>? | |
| priority | `"low" \| "medium" \| "high"` | |
| createdAt, updatedAt | number | |

Indexes: `by_status`, `by_issue`, `by_contractor`.

## inspections

| Field | Type |
|-------|------|
| workOrderId | Id\<workOrders\> |
| issueId | Id\<issues\> |
| inspectorId | Id\<users\> |
| result | `"pass" \| "fail"` |
| checklist | object | Boolean flags |
| notes | string? |
| createdAt | number |

## activityLogs

Append-only case history: `issueId`, `actorId?`, `action`, `message`, `createdAt`.