# Data model

Convex tables for the MVP.

## users

| Field | Type | Notes |
|-------|------|-------|
| clerkId | string | Clerk identity subject; indexed, unique in practice |
| name | string | Display name |
| email | string? | |
| role | `"citizen" \| "contractor" \| "inspector" \| "admin"`? | Persona role; the first three are set at onboarding, `admin` never is |
| createdAt | number | ms |

Users are created on first authenticated request (`users.ensure`) and given a role
at **onboarding**. No seeded accounts.

Indexes: `by_clerkId`, `by_role`.

### Two different kinds of authority

`admin` is an **oversight** role, not a superuser. It grants exactly one power:
allowing a case that has spent its inspection budget another attempt. It cannot
report, claim work, submit proof, inspect, close a case, or reach the destructive
functions in `admin.ts`. The three civic roles are peers; `admin` is not a peer of
them.

| | `admin` role | `ADMIN_CLERK_IDS` |
|---|---|---|
| Lives in | `users.role` | Deployment env |
| Held by | A signed-in person | An operator, in CI or a shell |
| Allows | Grant an inspection attempt | `clearAll`, `resetRateLimits`, `integrityCheck`, `grantRole` |

They are kept apart on purpose. `admin.clearAll` deletes the `users` table, so a
role-based admin could delete its own authority and any live deployment with it —
and municipal staff wiping a production ledger is not a capability oversight
needs.

`admin` is also **not self-selectable**. `users.setRole` refuses it outright; the
refusal is uniform and mentions no configuration state, because telling a
signed-in user whether ops access is set would leak how the deployment is
administered. Granting and revoking happen through `admin.grantRole`, which is
ops-gated, refuses to create a row for a subject that has never signed in, and
refuses to let an operator change their own role.

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

Indexes: `by_status`, `by_caseNumber`, `by_createdAt`, `by_updatedAt`,
`by_reporter`.

`by_updatedAt` exists for the escalation queue, which orders by what moved most
recently; `by_reporter` narrows duplicate-report detection to the reporter's own
recent cases.

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

## budgetGrants

Extra inspection attempts allowed on a case by an administrator.

`issueId`, `grantedBy`, `attempts`, `note?`, `createdAt`.

Indexes: `by_issue`, `by_grantedAt`.

Append-only, and that is the entire design. Whether a case is **stuck** is
*derived* — failed inspections counted against a budget of
`MAX_INSPECTION_FAILURES` (3) plus everything summed here — so there is no
`locked` flag that can fall out of step with the inspection history, which is
exactly the drift `admin.integrityCheck` exists to catch. The effective allowance
is computed by `inspectionFailureAllowance` and enforced by `assertFailureBudget`
when an inspection decision is recorded.

What is deliberately absent:

- **No `locked` column.** The budget is the record.
- **No way to delete a failed inspection.** The inspection row is the evidence;
  editing an inspector's ruling would make the audit trail a fiction.
- **No way to close a case without a pass.** Closure still requires a resolution
  record, and there is no admin path to one.
- **No per-grant edit or revoke.** An allowance that could be withdrawn would
  reintroduce the mutable counter this table exists to avoid; a second grant
  supersedes the first by adding to it.

`grantedBy` is kept even if the account is later removed, so the decision stays
attributable. Each grant also writes an `activityLogs` entry, because the reporter
is entitled to know a human looked at their case.

## activityLogs

Append-only case history: `issueId`, `actorId?`, `action`, `message`, `createdAt`.

Actions include every lifecycle transition plus `budget_granted`, which is the
only action an administrator can produce.

## notifications

Per-recipient inbox rows, written by `notifyForTransition` from inside the
lifecycle mutation so a status change and its notification land together.

`userId`, `issueId`, `workOrderId?`, `kind`, `caseNumber`, `title`, `body`,
`readAt?`, `createdAt`.

- `caseNumber`, `title` and `body` are **denormalised at write time** so the
  inbox renders without a lookup per row. A case number is permanent, and the
  wording is a record of what the reader was told, not a live view of the case.
- `readAt` absent means unread, and is set once and never cleared.
- Indexed `by_user` (`userId`, `createdAt`) for the page, and `by_user_unread`
  (`userId`, `readAt`) for the header badge.
- There is no outbox and no delivery worker: the row *is* the delivery, and only
  the recipient's own query can mark it read.

Recipient rules — a notification goes to people with standing on the case, and
never to whoever performed the action:

| Transition | Notified |
|---|---|
| Work order created | Reporter |
| Claimed | Reporter, contractor |
| Started | Reporter, contractor |
| Completion submitted | Reporter |
| Inspection started | Reporter, contractor |
| Inspection passed / failed | Reporter, contractor, the ruling inspector's queue |

Inspector-directed notifications fan out to the inspection queue and are capped
at 50 recipients, because an unbounded broadcast to every inspector on the
platform is a different product decision, not a detail.

