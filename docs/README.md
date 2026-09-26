# VAELKOR CIVIC — Documentation

**Power to the People. Proof for the Problem.**

CIVIC turns citizen observations of real-world infrastructure problems into structured, verifiable work orders — and closes the loop with proof.

| Doc | What it covers |
|-----|----------------|
| [Product overview](./product-overview.md) | Thesis, core loop, MVP scope |
| [MVP spec](./mvp-spec.md) | Screens, roles, status machine, acceptance |
| [Data model](./data-model.md) | Convex schema and transitions |
| [How to use](./how-to-use.md) | Real-data workflow |

Source vision: [`VAELKOR CIVIC.md`](../VAELKOR%20CIVIC.md)

## Run locally

```bash
# Terminal 1 — Convex backend
npx convex dev

# Terminal 2 — Next.js
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up, then pick your role
on `/onboarding`. All cases, confirmations, and evidence are live data.

## Clerk ⇄ Convex setup (required, once per Clerk instance)

Convex only accepts a Clerk token whose `aud` claim is `convex`, which
`ConvexProviderWithClerk` obtains from a JWT template literally named `convex`.
Without it, `getToken` fails silently, Convex receives no token, and every
authenticated call fails with `Not authenticated` — even while clearly signed in.

Two pieces must both be in place:

1. **A JWT template named `convex`** with claims `{ "aud": "convex" }`.
   Clerk Dashboard → API Keys → JWT Templates → New template.
2. **`CLERK_JWT_ISSUER_DOMAIN`** set on the Convex deployment (not just in
   `.env.local`), matching the `applicationID: "convex"` in
   `convex/auth.config.ts`:

   ```bash
   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-subdomain>.clerk.accounts.dev
   ```

Verify the template exists:

```bash
clerk api /jwt_templates
```

## Ops

`admin.clearAll` (demo data wipe) requires the `ADMIN_CLERK_IDS` allowlist on the
deployment and denies by default when unset:

```bash
npx convex env set ADMIN_CLERK_IDS user_2abc...
```
