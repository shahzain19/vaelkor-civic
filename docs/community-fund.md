# The Community Fund

**Power to the People, paid for by the People.**

A case needs a crew and a crew needs a crew. Today the product stops there — a
work order opens, a contractor claims it, and the work happens. The community
fund adds the missing half of the loop: nearby residents collect the money to
do the work, and it is released to the contractor only when an inspector signs
off on it.

## The idea, in one sentence

People report a problem. Nearby residents chip in to build a fund. When a
contractor completes the job and an inspector verifies it, the fund is
released — in one move, in the same mutation that closes the case.

## Why this fits the slogan

"Power to the People" only means something if the people control the work.
Confirmations give them a voice in *what* gets done. The fund gives them the
means. Without it, a case with no contractor interested is a case that never
happens, and the community's vote evaporates. With it, the community holds the
money and the contractor holds the accountability — and the inspector is the
referee between the two.

## What the fund is, and is not

The fund is a **commitment ledger**. Amounts are pledges that the administrator
records offline — the app never processes real money. There is no payment
provider, no PCI surface, and no refunds. The UI must never imply that money
moves through the product.

The fund moves in exactly one direction: residents → contractor. It leaves the
ledger only on a verified closure, and only in full.

## The invariant

**A payout and a closure are the same fact.** They are written in one Convex
mutation, so "the case is closed" and "the contractor was paid" cannot disagree.
This is the same atomicity the product already uses for resolutions — the fund
reuses the pattern rather than inventing a new one.

## Architecture

The fund is a **derived property**, exactly like the inspection failure
allowance. No new status machine entries — the transition table, validators,
integrity check, and phase rail are all untouched.

### Tables

| Table | Purpose | Indexes |
|---|---|---|
| `fundGoals` | The target amount, set when the work order opens | `by_issue`, `by_workOrder` |
| `fundContributions` | One row per (user, case) — a pledge | `by_issue`, `by_issue_user` |
| `fundPayouts` | Released on verified completion | `by_issue`, `by_workOrder` |

### Where the gates land

- `convex/lib.ts` — `createWorkOrderForIssue` mints the `fundGoal` from a
  category default when the work order opens, alongside `scope`.
- `convex/issues.ts` — new `contribute` mutation (idempotent per user per
  case, rate-limited, only while `open`).
- `convex/issues.ts` — new `fund` query (goal, total, contributions, whether
  contributions are still open).
- `convex/workOrders.ts` — `accept` checks the fund before allowing
  `open → claimed` (Phase 2).
- `convex/inspections.ts` — `decide` inserts the `fundPayout` to the
  contractor in the same mutation that closes the case (Phase 3).
- `convex/oversight.ts` — unfunded cases escalate to the admin queue (Phase 2);
  `adjustFundGoal` is the escape hatch for stuck cases (Phase 2).

### The two design decisions

1. **Contributions freeze when a contractor claims the work** — mirroring the
   existing "confirmations freeze once work starts" rule. The community decides
   the fund before the work is taken on. A contractor cannot chip into a case
   they then claim.
2. **The fund is held, not spent.** It only leaves the ledger on a passed
   inspection. Fail → back to `in_progress`, money stays held. This is the
   escrow that makes the slogan real.

## Phases

### Phase 1 — The contribution ledger (no behavioral change)

`fundContributions` + `fundGoals` tables, `contribute` mutation, `fund` query,
fund section on the case dossier with a "Chip in" button and contributor list.
Safe to ship immediately; the community can start pledging while the gate is
built.

### Phase 2 — The funding gate on claim

`accept` checks the fund; the contractor board shows fund status and disables
"Accept" with a reason if unfunded; unfunded cases appear in the admin
escalation queue after a timeout. This is where "power to the people" becomes
load-bearing.

### Phase 3 — Payout on completion

`fundPayouts` written atomically with closure; case dossier shows "released to
contractor" on closed cases; new integrity check that payouts never exceed
contributions.

### Phase 4 — Polish

Ledger filter by fund status, "funds near you", funding-success analytics
(all aggregate, no per-person data — matches the existing analytics
philosophy).

## Open questions

1. **Who sets the goal?** Category default at work order creation, overridable
   by the reporter at report time and adjustable by an admin. Without an admin
   override, a case with an unreachable goal sits in `open` forever.
2. **One pledge per person, or can they top up?** One amount per user per
   case, not updatable. Topping-up is v2.
3. **What happens to money if the case never funds?** Admin closes the case
   with the fund forfeited to a general pool. Refunds are a whole subsystem —
   deferred.

## Amounts

Defaults, in cents:

| Category | Goal |
|---|---|
| road | 5000 |
| garbage | 2000 |
| drainage | 8000 |
| streetlight | 4000 |

Single contributions: 100–50000 cents.