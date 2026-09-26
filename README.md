# VAELKOR CIVIC

**Power to the People. Proof for the Problem.**

Civic infrastructure coordination. Citizens report real-world problems with photographic proof, the community confirms them, contractors execute structured work orders, and inspectors prove completion before a case is allowed to close.

Stack: **Next.js 16** · **Convex** · **Clerk** · **Tailwind CSS 4** · **Vitest**

---

## The loop

A case is a chain of custody, not a ticket. Every step is a separate, authenticated write, and the status machine is the single source of truth:

```
reported → confirmed → open → claimed → in_progress
                                     → completion_submitted → inspection → closed
```

| Stage | Who moves it | What it requires |
|---|---|---|
| `reported` | citizen | Photo + location + description |
| `confirmed` | citizens | 3 independent confirmations total (the reporter's own report counts as one) |
| `open` | system | A work order is created automatically at the threshold |
| `claimed` | contractor | Atomic claim; a second contractor loses |
| `in_progress` | contractor | Must explicitly start work |
| `completion_submitted` | contractor | `before` **and** `after` photos, both from the assigned contractor |
| `inspection` | inspector | Independent of the contractor; five-point checklist |
| `closed` | inspector | **Requires** a `pass` decision and a written resolution |

A failed inspection returns the case to `in_progress`. After **3** failures the case is locked for an administrator rather than looping forever. `closed` is terminal.

The invariant the whole product rests on: **a case cannot be `closed` without a resolution record.** The resolution, the inspection result, and the status change are written in a single Convex mutation, so "status says resolved but there is no resolution" is unrepresentable rather than merely unlikely.

## Quick start

```bash
npm install

# Terminal 1 — backend
npx convex dev

# Terminal 2 — frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign up, then choose a role on `/onboarding`. Reports require a photo and real location. All cases, confirmations, and evidence are live data — there are no seeds and no simulated confirmations.

## Setup

### Clerk ⇄ Convex (required, once per Clerk instance)

Convex only accepts a Clerk token whose `aud` claim is `convex`, which `ConvexProviderWithClerk` obtains from a JWT template literally named `convex`. Without it `getToken` fails *silently*, Convex receives no token, and every authenticated call fails with `Not authenticated` even while clearly signed in.

1. **A JWT template named `convex`** with claims `{ "aud": "convex" }` — Clerk Dashboard → API Keys → JWT Templates.
2. **`CLERK_JWT_ISSUER_DOMAIN` set on the Convex deployment**, not just in `.env.local`, matching the `applicationID: "convex"` in `convex/auth.config.ts`:

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-subdomain>.clerk.accounts.dev
```

Verify with `clerk api /jwt_templates`.

### Admin allowlist

Ops-only functions (`admin.clearAll`, `admin.integrityCheck`, `admin.resetRateLimits`) require the `ADMIN_CLERK_IDS` allowlist and **deny by default** when unset:

```bash
npx convex env set ADMIN_CLERK_IDS user_2abc...,user_2def...
```

### Codegen

After changing the schema or adding a Convex function, regenerate the typed bindings:

```bash
npx convex codegen
```

## Routes

| Path | Access | Purpose |
|---|---|---|
| `/` | Public | Landing page — the loop, roles, integrity rules |
| `/ledger` | Public | Case ledger with proximity search |
| `/issues/[id]` | Public | Case dossier: status, evidence, confirmations, history, resolution |
| `/work/[id]` | Public | Public work-order view |
| `/report` | Citizen | File a report |
| `/onboarding` | Signed in | Choose a role |
| `/contractor` | Contractor | Available work + my work orders |
| `/contractor/work/[id]` | Contractor | Claim, start, attach proof, submit |
| `/inspect` | Inspector | Inspection queue |
| `/inspect/[id]` | Inspector | Evidence comparison and pass/fail decision |

Navigation is role-aware and shallow. The header shows only what the signed-in role can actually do, so there are no dead links and no role-switching menus.

## Architecture

```
app/            Next.js routes
components/     Civic Ledger design system (shell, status, evidence, forms, feedback)
convex/
  schema.ts     Tables, validators, indexes
  lifecycle.ts  The status machine — legal transitions and closure preconditions
  validation.ts Field, coordinate, pagination, and upload bounds
  errors.ts     AppError codes + safe error conversion
  rateLimit.ts  Fixed-window per-action budgets
  lib.ts        Case numbering, work-order creation, duplicate + idempotency logic
  auth.ts       Clerk identity → CIVIC user, role gates
  issues.ts workOrders.ts inspections.ts evidence.ts users.ts admin.ts
lib/civic.ts    Domain vocabulary shared by backend and UI
lib/geo.ts      Location privacy and distance maths
tests/          Vitest + convex-test suites
```

### Trust boundary

`proxy.ts` protects **pages**. It does nothing for the Convex deployment, which is a public HTTP endpoint — anything reachable from the client can be called directly with `curl`. Every mutation re-checks identity, role, ownership, stage, and evidence server-side, and internal work lists (`workOrders.listAvailable`, `inspections.listQueue`, `inspections.getForWorkOrder`) are role-gated in the query itself.

The case dossier and ledger are intentionally public.

### Hardening

| Area | Approach |
|---|---|
| Authorization | Role + ownership + stage re-checked in every write; role gates on internal queries |
| Idempotency | Client-minted key, scoped per user, resolved to the original case on replay |
| Double submission | Duplicate detection: same reporter, category, and spot within 10 min |
| Rate limiting | Per-action fixed windows — reports 10/h, confirmations 30/h, upload URLs 40/h, claims 20/h |
| Input validation | Bounded strings, coordinate range checks, clamped pagination, 8 MB image cap, allowlisted MIME types |
| Uploads | Metadata read from the storage system table; size, type, and emptiness checked server-side |
| Errors | Typed `AppError` codes; anything unexpected is replaced with a generic message so a Convex internal cannot leak |
| Integrity | `admin.integrityCheck` reports closed-without-resolution, status desync, and duplicate work orders |

Rate-limit and idempotency keys are scoped per user deliberately: a globally-scoped key would let one account pre-claim a value and deny submission to everyone else who later generates the same key.

## Location privacy

- Raw GPS coordinates never leave the browser — they are held in a React ref and used to centre the map.
- The stored point is offset by up to **250 m**.
- A proximity search re-centres by up to **1500 m**, so the query centre does not leak the searcher's position either.
- Distances are computed client-side and shown as "about N km", so the server never learns what was searched for.

Storing an offset rather than an exact pin means the true location is never recoverable from the database.

## Tests

```bash
npm test           # single run
npm run test:watch # watch mode
```

**89 tests across 3 suites**, running the real mutation handlers against an in-memory Convex via `convex-test` — not mocks.

| Suite | Covers |
|---|---|
| `tests/auth.test.ts` | Identity, role gates, ownership, public projection, direct-API access to internal queries |
| `tests/reports.test.ts` | Creation, validation limits, duplicates, idempotent replay, uploads, pagination, rate limits |
| `tests/status.test.ts` | Transition table both directions, the legal journey, closure invariants, integrity audit, end-to-end |

Test files deliberately live in `tests/`, not `convex/` — Convex codegen treats every file under `convex/` as a deployable function, and including test helpers there produces a circular import alias.

Workflow tests drive cases through the real mutations rather than hand-built fixtures, so a state that the product could never produce cannot appear in a test.

## Checks

```bash
npx tsc --noEmit   # types
npm run lint       # eslint
npm run build      # production build
npm test           # test suite
```

## Ops

```bash
npx convex dashboard          # browse data
npx convex env set ADMIN_CLERK_IDS user_2abc...
clerk api /jwt_templates      # verify the convex template exists
```

`admin.clearAll` wipes demo data. `admin.integrityCheck` returns a list of integrity violations rather than failing, so it can be run on demand against a live deployment.

## Design

The interface is a **civic record**, not a dashboard: a near-white canvas, hairline borders, restrained accent colours, deliberate typography, and generous whitespace. Status colour follows the product's own map legend — broken → confirmed → active → inspection → resolved. Large copy only for genuine empty states, and the first-run experience is an explanation of the loop rather than a form.

## Documentation

- [Docs index](./docs/README.md)
- [Product overview](./docs/product-overview.md)
- [MVP spec](./docs/mvp-spec.md)
- [Data model](./docs/data-model.md)
- [How to use](./docs/how-to-use.md)
- Full vision: [VAELKOR CIVIC.md](./VAELKOR%20CIVIC.md)
