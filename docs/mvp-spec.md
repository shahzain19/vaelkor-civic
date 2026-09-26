# MVP specification

## Acceptance criteria

1. Citizen reports an issue with GPS + photo.  
2. Other users confirm; at **3 confirmations** the issue becomes verified and a work order is created.  
3. Contractor accepts work, uploads before / during / after photos, submits completion.  
4. Inspector passes → case closed; or fails → returns to in progress.  
5. Case file shows full activity timeline.  
6. Accounts are real sign-ups (Clerk identity + name + role) — no seed data or simulated confirmations.

## Screens

| Route | Purpose |
|-------|---------|
| `/sign-up`, `/sign-in` | Clerk authentication |
| `/onboarding` | Choose civic role (citizen / contractor / inspector) |
| `/` | Landing: what the product is, the chain of custody, live recent cases |
| `/ledger` | Public ledger: nearby/recent cases, search and filters |
| `/report` | Create issue with category, description, severity, location, photo |
| `/issues/[id]` | Case file: evidence, confirmations, timeline, work order |
| `/work/[id]` | Work order detail + status stepper |
| `/contractor` | Available work board |
| `/contractor/work/[id]` | Execution: evidence upload + submit |
| `/inspect` | Inspection queue |
| `/inspect/[id]` | Checklist + pass / fail |

`/`, `/ledger`, `/issues/*` and `/work/*` are public (case files are public
information).
`/report`, `/contractor`, `/contractor/work/*` and `/inspect/*` require sign-in
(enforced in `proxy.ts`).

## Status machine

```
reported → confirmed → verified → open → claimed → in_progress
  → completion_submitted → inspection → closed
                                        ↘ (fail) → in_progress
```

Work orders mirror the same operational states from `open` onward.

### Where each transition happens

| Transition | Trigger |
|---|---|
| `reported` → `confirmed` | Second citizen confirms |
| `confirmed` → `open` | 3rd confirmation: issue is verified and a work order is opened in the same mutation |
| `open` → `claimed` | Contractor accepts |
| `claimed` → `in_progress` | Contractor starts work |
| `in_progress` → `completion_submitted` | Contractor submits completion (own before + after evidence required) |
| `completion_submitted` → `inspection` | An inspector opens the case (`inspections.beginInspection`) |
| `inspection` → `closed` | Inspector passes |
| `inspection` → `in_progress` | Inspector fails |

`verified` is a milestone rather than a resting state: the issue cannot hold both
`verified` and `open` at once, so verification is recorded in the activity log
and rendered by the status stepper while `status` advances to `open`.

## Confirmation threshold

- Each unique user may confirm an issue once (reporter’s report counts as the first confirmation).  
- At **3 confirmations** a work order is auto-generated with category-default scope.  
- The threshold is one-way: once a work order exists, further confirmations are
  rejected so the count cannot inflate after verification.

## Evidence kinds

| Kind | Who | When |
|------|-----|------|
| `report` | Citizen | On report or add-on, before work starts |
| `before` | Assigned contractor | While claimed / in progress |
| `during` | Assigned contractor | While claimed / in progress |
| `after` | Assigned contractor | While claimed / in progress |
| `inspection` | Inspector | While awaiting or under inspection |

`evidence.attach` enforces role, work-order ownership and stage. Execution proof
must be filed by the contractor assigned to the work order, and a case cannot be
closed unless the assigned contractor supplied before + after evidence — so
proof cannot be supplied by a third party.

## Location privacy

A citizen's raw GPS fix is their home address. Because issues and reporters are
public, storing or transmitting the exact position would let anyone with a few
reports triangulate where a person lives — a realistic stalking and doxxing
vector for someone reporting a broken streetlight outside their own house.

The rule is that **raw device coordinates never leave the browser**.

| Purpose | Value used | Max random offset |
|---------|-----------|-------------------|
| Proximity search centre | Obfuscated | 1500 m |
| Stored pin on a new report | Obfuscated | 250 m |
| Distance labels shown to the user | Recomputed in memory from the raw fix | 0 (never transmitted) |

Implementation notes:

- The raw fix is held in a `useRef` in `hooks/use-geolocation.ts`, never in
  state, so it cannot be rendered, serialised into a query, or logged.
- `obfuscateCoords` in `lib/geo.ts` displaces a coordinate uniformly across a
  disc, sampling radius as `R * sqrt(u)` so the offset is uniform over area.
  A uniform-in-radius offset would cluster points near the centre and leak
  information through the offset distribution.
- Proximity queries send only the obfuscated centre, so exact coordinates never
  appear in Convex query arguments, function logs, or the dashboard.
- The search radius absorbs the privacy offset (`25 km + 1.5 km`) so no case is
  hidden near the edge of the citizen's actual area.
- Distances are recomputed client-side from the in-memory fix, so the citizen
  sees an accurate "1.2 km away" without leaking anything.
- Adoption is opt-in: the report form only uses the device fix when the citizen
  presses **Use my location**, and a **Nudge pin** control lets them move the
  (already offset) pin to the real spot. Manual coordinate entry is treated as
  citizen-chosen and is not offset further.
- Displayed coordinates are rounded to 4 decimal places (~11 m) to avoid
  implying precision the model does not support.

The UI states plainly that the location shown is an approximate area.

## Inspection integrity

- A `pass` requires every checklist item to be true (enforced server-side, not
  just in the UI) and requires the assigned contractor's before/after evidence.
- The inspection screen renders before/after as a side-by-side pair, because the
  decision hinges on whether the site visibly changed.

## Admin

`admin.clearAll` (ops data wipe) is not exposed in the UI and is restricted to
the `ADMIN_CLERK_IDS` allowlist. Convex mutations are reachable by anyone who can
read the public deployment URL, so the guard is enforced server-side and denies
by default when unset:

```bash
npx convex env set ADMIN_CLERK_IDS user_2abc...,user_2def...
```

## Out of scope

AI classification, payments/funding, government APIs, reputation, map product
tiles, video, NGO/sponsor UIs. Clerk is the authentication backbone for the MVP.

Reverse-geocoding an issue pin to a street address is also out of scope: it would
re-identify the obfuscated location and undo the privacy model above. The
citizen supplies the human-readable address instead.
