# How to use (real data)

No seed data. No simulated confirmations. Everything in the database comes from real accounts and real reports.

## 1. Sign up and pick a role

1. Open the app and choose **Sign up** (Clerk handles the account).
2. You land on **onboarding** — pick your civic role:
   - **Citizen** — report and confirm
   - **Contractor** — accept and execute work
   - **Inspector** — pass or fail completions

You can change roles any time by revisiting `/onboarding`. To play several roles
on one machine, sign out and create another account from the header.

## 2. Report (citizen)

1. Press **Use my location**, or enter coordinates manually. Location is opt-in
   and is never auto-filled.
2. Add address, category, description, severity. The **nearest block or
   landmark** is more useful to the crew than coordinates.
3. Attach a **required** photo.
4. Submit → case created as `reported` (your report counts as the first confirmation).

Your device location is offset by up to 250 m before it is stored, and search
queries run from a point up to 1500 m away, so a public case cannot be used to
find your home. If the pin looks off, use **Nudge pin** to move it to the real
spot.

## 3. Confirm (other citizens)

Distinct citizens open the case and tap **Confirm**. At **3 confirmations** a work
order is created automatically and the case is verified. After that the case no
longer accepts confirmations.

The ledger at `/ledger` lists cases nearest-first once location is enabled. Distances are
computed on your device, so the ranking is accurate even though the search is
anonymised.

## 4. Execute (contractor)

1. Sign in as a contractor.
2. Open **Work board** → **Accept**.
3. Upload **your own** before / during / after photos.
4. Submit completion → moves to `completion_submitted`.

## 5. Inspect

1. Sign in as an inspector.
2. Open the queue → open the case (this moves it to `inspection`).
3. Optionally attach an inspection photo.
4. **Pass** (closes) or **Fail** (returns to in progress).

Passing requires every checklist item to be ticked and the contractor's before +
after evidence to be on file.

## Notes

- Photo evidence is required on every new report.
- Location must be real GPS or manually entered coordinates — no default city filler.
- Work orders only appear after enough independent citizen confirmations.
- Evidence is role-locked: only the assigned contractor can file before/during/
  after proof, and only an inspector can file an inspection record.

## Resetting demo data

`admin.clearAll` wipes every table. It is not exposed in the UI and requires your
Clerk user id in the deployment's `ADMIN_CLERK_IDS` allowlist:

```bash
npx convex env set ADMIN_CLERK_IDS user_2abc...
```

It is then callable from the Convex dashboard. With the variable unset, nobody
can run it.
