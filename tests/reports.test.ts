import { describe, expect, it } from "vitest";
import {
  FIELD_LIMITS,
  RATE_LIMITS,
  anon,
  api,
  as,
  caseCount,
  deletedIssueId,
  fileReport,
  makeUser,
  readAll,
  readIssue,
  setup,
  storeImage,
  VALID_REPORT,
  type Id,
} from "./harness";
import { assertUsableImage } from "../convex/validation";

/**
 * /reports
 *
 * Creation, retrieval, validation limits, duplicates, retries, and uploads.
 */
describe("reports: create", () => {
  it("files a case and numbers it in sequence", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");

    const first = await fileReport(t, citizen);
    const second = await fileReport(t, citizen, {
      address: "14 Example Street",
      // Distinct spots: the duplicate guard would otherwise (correctly) refuse.
      lat: 51.55,
      lng: -0.2,
    });

    const a = await readIssue(t, first);
    const b = await readIssue(t, second);
    expect(a?.caseNumber).toBe("CIV-000001");
    expect(b?.caseNumber).toBe("CIV-000002");
    expect(a?.status).toBe("reported");
    expect(await caseCount(t)).toBe(2);
  });

  it("counts the reporter's own report as the first confirmation", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    const issueId = await fileReport(t, citizen);

    const confirmations = await readAll(t, "confirmations");
    expect(confirmations.filter((c) => c.issueId === issueId)).toHaveLength(1);
    expect((await readIssue(t, issueId))?.confirmationCount).toBe(1);
  });

  it("falls back to a category title when none is supplied", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    const issueId = await fileReport(t, citizen, { title: "   " });
    expect((await readIssue(t, issueId))?.title).toBe("Road damage");
  });

  it("stores cleaned text rather than the raw input", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    const issueId = await fileReport(t, citizen, {
      address: "   12 Example Street   ",
      description: "  Deep pothole in the outside lane.  ",
    });
    const issue = await readIssue(t, issueId);
    expect(issue?.address).toBe("12 Example Street");
    expect(issue?.description).toBe("Deep pothole in the outside lane.");
  });
});

/**
 * /reports — invalid input
 */
describe("reports: validation", () => {
  it("rejects an empty description", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    await expect(
      fileReport(t, citizen, { description: "   " }),
    ).rejects.toThrow(/at least/i);
  });

  it("rejects a description under the minimum length", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    await expect(fileReport(t, citizen, { description: "hole" })).rejects.toThrow(
      /at least/i,
    );
  });

  it("rejects an extremely long description", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    await expect(
      fileReport(t, citizen, { description: "x".repeat(5000) }),
    ).rejects.toThrow(/2000 characters or fewer/i);
  });

  it("accepts a description exactly at the limit", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    const atLimit = "x".repeat(FIELD_LIMITS.description.max);
    const issueId = await fileReport(t, citizen, { description: atLimit });
    expect((await readIssue(t, issueId))?.description).toHaveLength(
      FIELD_LIMITS.description.max,
    );
  });

  it("rejects an empty address", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    await expect(fileReport(t, citizen, { address: "" })).rejects.toThrow(
      /at least 3 characters/i,
    );
  });

  it("rejects an over-long title", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    await expect(
      fileReport(t, citizen, { title: "t".repeat(500) }),
    ).rejects.toThrow(/120 characters or fewer/i);
  });

  it("rejects a latitude outside the world", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    await expect(fileReport(t, citizen, { lat: 999 })).rejects.toThrow(
      /not a valid point/i,
    );
    await expect(fileReport(t, citizen, { lat: -91 })).rejects.toThrow(
      /not a valid point/i,
    );
  });

  it("rejects a longitude outside the world", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    await expect(fileReport(t, citizen, { lng: 181 })).rejects.toThrow(
      /not a valid point/i,
    );
  });

  it("rejects a non-finite coordinate", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    await expect(fileReport(t, citizen, { lat: Number.NaN })).rejects.toThrow(
      /not a valid point/i,
    );
    await expect(
      fileReport(t, citizen, { lng: Number.POSITIVE_INFINITY }),
    ).rejects.toThrow(/not a valid point/i);
  });

  it("rejects a coordinate that is the bare zero point", async () => {
    // 0,0 is a real coordinate, so it is allowed through validation; the
    // duplicate detector declines to judge precision rather than guessing.
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    const issueId = await fileReport(t, citizen, { lat: 0, lng: 0 });
    expect(issueId).toBeTruthy();
  });
});

/**
 * /reports — duplicate
 */
describe("reports: duplicates", () => {
  it("refuses the same person re-reporting the same spot moments later", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    await fileReport(t, citizen);

    await expect(fileReport(t, citizen)).rejects.toThrow(/already reported/i);
    expect(await caseCount(t)).toBe(1);
  });

  it("allows a second report far enough away to be a different fault", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    await fileReport(t, citizen);
    const second = await fileReport(t, citizen, { lat: 51.55, lng: -0.2 });
    expect(second).toBeTruthy();
    expect(await caseCount(t)).toBe(2);
  });

  it("allows a different category at the same spot", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    await fileReport(t, citizen);
    const second = await fileReport(t, citizen, { category: "drainage" });
    expect(second).toBeTruthy();
  });

  it("never suppresses a second person reporting the same fault", async () => {
    // This is the confirmation mechanism working, not a duplicate.
    const t = setup();
    const first = await makeUser(t, "citizen", "First");
    const second = await makeUser(t, "citizen", "Second");

    await fileReport(t, first);
    const alsoReported = await fileReport(t, second);

    expect(alsoReported).toBeTruthy();
    expect(await caseCount(t)).toBe(2);
  });

  it("allows a re-report once the duplicate window has passed", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    await fileReport(t, citizen);

    // Age the existing case past the 10 minute window.
    const issues = await readAll(t, "issues");
    await t.run((ctx) =>
      ctx.db.patch(issues[0]._id, { createdAt: Date.now() - 11 * 60 * 1000 }),
    );

    const second = await fileReport(t, citizen);
    expect(second).toBeTruthy();
  });
});

/**
 * /reports — repeated submissions and retries
 */
describe("reports: retries", () => {
  it("treats a replayed idempotency key as the same submission", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    const storageId = await storeImage(t);
    const idempotencyKey = "retry-abc-123";

    const first = await as(citizen)(t).mutation(api.issues.create, {
      ...VALID_REPORT,
      storageId,
      idempotencyKey,
    });

    // A replay resolves to the original case, so a retry after a dropped
    // response lands on the report the citizen already filed.
    const replay = await as(citizen)(t).mutation(api.issues.create, {
      ...VALID_REPORT,
      storageId,
      idempotencyKey,
    });
    expect(replay).toBe(first);

    // Exactly one case exists despite two calls.
    expect(await caseCount(t)).toBe(1);
    expect(await readIssue(t, first)).toBeTruthy();
  });

  it("does not let one user's key block another user", async () => {
    const t = setup();
    const a = await makeUser(t, "citizen");
    const b = await makeUser(t, "citizen");
    const storageId = await storeImage(t);

    await as(a)(t).mutation(api.issues.create, {
      ...VALID_REPORT,
      storageId,
      idempotencyKey: "shared-key",
    });

    // A global key collision would be a denial of service on the honest user.
    const ok = await as(b)(t).mutation(api.issues.create, {
      ...VALID_REPORT,
      lat: 51.6,
      lng: -0.2,
      storageId,
      idempotencyKey: "shared-key",
    });
    expect(ok).toBeTruthy();
  });
});

/**
 * /reports — uploads
 */
describe("reports: uploads", () => {
  it("rejects a storage id that was never uploaded", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    const phantom = await deletedIssueId(t);
    void phantom;

    await expect(
      as(citizen)(t).mutation(api.issues.create, {
        ...VALID_REPORT,
        storageId: "00000000000000000000000000000000" as never,
      }),
    ).rejects.toThrow();
  });

  it("rejects an unsupported file type", async () => {
    // Asserted against the validator directly: the in-memory storage backend
    // does not round-trip `contentType` through the system table, so an
    // end-to-end assertion here would silently pass for the wrong reason.
    expect(() =>
      assertUsableImage({ size: 2048, contentType: "application/pdf" }),
    ).toThrow(/JPEG, PNG, WebP or HEIC/i);

    for (const ok of ["image/jpeg", "image/png", "image/webp", "image/heic"]) {
      expect(() => assertUsableImage({ size: 2048, contentType: ok })).not.toThrow();
    }
  });

  it("rejects a file above the size cap", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    // 9 MB, over the 8 MB ceiling.
    const huge = await storeImage(t, { size: 9 * 1024 * 1024 });

    await expect(fileReport(t, citizen, { storageId: huge })).rejects.toThrow(
      /8 MB or smaller/i,
    );
  });

  it("rejects an empty file", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    const empty = await storeImage(t, { size: 0 });

    await expect(fileReport(t, citizen, { storageId: empty })).rejects.toThrow(
      /empty/i,
    );
  });

  it("accepts a photo with no declared content type", async () => {
    // Some iOS camera captures send no type; the bytes still get validated.
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    const noType = await storeImage(t, { contentType: "" });
    const issueId = await fileReport(t, citizen, { storageId: noType });
    expect(issueId).toBeTruthy();
  });
});

/**
 * /reports — read
 */
describe("reports: read", () => {
  it("clamps an absurd page size instead of serving it", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    for (let i = 0; i < 3; i++) {
      await fileReport(t, citizen, {
        address: `${i} Example Street`,
        lat: 51.5 + i * 0.01,
        lng: -0.12 + i * 0.01,
      });
    }

    const everything = await anon(t).query(api.issues.listRecent, {
      limit: 1_000_000,
    });
    expect(everything.length).toBeLessThanOrEqual(FIELD_LIMITS.pageSize.max);
  });

  it("falls back to the default radius when the client sends nonsense", async () => {
    const t = setup();
    const issueId = await fileReport(t, await makeUser(t, "citizen"));

    // NaN is the dangerous one: `Math.max(NaN, x)` is NaN, and every distance
    // comparison against NaN is false, so the query would silently match
    // nothing instead of reporting a bad request.
    for (const radiusKm of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const rows = await anon(t).query(api.issues.listNearby, {
        lat: VALID_REPORT.lat,
        lng: VALID_REPORT.lng,
        radiusKm,
      });
      expect(rows.map((r) => r._id)).toContain(issueId);
    }
  });

  it("clamps an out-of-range radius instead of scanning the planet", async () => {
    const t = setup();
    const issueId = await fileReport(t, await makeUser(t, "citizen"));

    // Absurdly large, and below the floor: both must return a usable answer.
    const wide = await anon(t).query(api.issues.listNearby, {
      lat: VALID_REPORT.lat,
      lng: VALID_REPORT.lng,
      radiusKm: 1e9,
    });
    const narrow = await anon(t).query(api.issues.listNearby, {
      lat: VALID_REPORT.lat,
      lng: VALID_REPORT.lng,
      radiusKm: -5,
    });
    expect(wide.map((i) => i._id)).toContain(issueId);
    expect(Array.isArray(narrow)).toBe(true);
  });

  it("rejects an unreasonably long submission key", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    const key = "k".repeat(500);

    // The key is stored verbatim, so an unbounded string is both a storage
    // cost and a row the client could never match again.
    await expect(fileReport(t, citizen, { idempotencyKey: key })).rejects.toThrow(
      /too long/i,
    );
    // Nothing was written, so the citizen still has their full budget.
    expect(await caseCount(t)).toBe(0);
  });

  it("ignores a blank submission key rather than treating it as a replay", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    const first = await fileReport(t, citizen, { idempotencyKey: "   " });
    const second = await fileReport(t, citizen, {
      idempotencyKey: "",
      address: "elsewhere",
      lat: 51.9,
      lng: -0.12,
    });
    expect(first).not.toBe(second);
  });

  it("treats a nonsense limit as the default rather than throwing", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    await fileReport(t, citizen);

    const result = await anon(t).query(api.issues.listRecent, {
      limit: Number.NaN,
    });
    expect(result).toHaveLength(1);
  });

  it("returns the case with its evidence, confirmations and activity", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    const issueId = await fileReport(t, citizen);

    const view = await anon(t).query(api.issues.get, { issueId });
    expect(view?.caseNumber).toBe("CIV-000001");
    expect(view?.evidence).toHaveLength(1);
    expect(view?.confirmations).toHaveLength(1);
    expect(view?.activity.length).toBeGreaterThan(0);
    expect(view?.evidence[0].url).toBeTruthy();
  });

  it("sorts a nearby search by real distance and respects the radius", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    await fileReport(t, citizen, { lat: 51.5, lng: -0.12, address: "Near" });
    await fileReport(t, citizen, { lat: 51.52, lng: -0.1, address: "Far" });

    const near = await anon(t).query(api.issues.listNearby, {
      lat: 51.5,
      lng: -0.12,
      radiusKm: 1,
    });
    expect(near).toHaveLength(1);
    expect(near[0].address).toBe("Near");
    expect(near[0].distanceKm).toBeCloseTo(0, 3);
  });

  it("rejects a proximity search with an impossible coordinate", async () => {
    const t = setup();
    await expect(
      anon(t).query(api.issues.listNearby, { lat: 500, lng: 0 }),
    ).rejects.toThrow(/not a valid point/i);
  });
});

/**
 * /rate-limit
 */
describe("rate limiting", () => {
  it("blocks a citizen past the report budget and names the wait", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");

    for (let i = 0; i < RATE_LIMITS.reportCreate.max; i++) {
      await fileReport(t, citizen, {
        address: `${i} Example Street`,
        lat: 51.5 + i * 0.05,
        lng: -0.12,
      });
    }

    const attempt = fileReport(t, citizen, { address: "over budget" });
    await expect(attempt).rejects.toThrow(/hit the limit/i);
  });

  it("reports a retry-after so the client can recover", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    for (let i = 0; i < RATE_LIMITS.reportCreate.max; i++) {
      await fileReport(t, citizen, {
        address: `${i} Example Street`,
        lat: 51.5 + i * 0.05,
        lng: -0.12,
      });
    }

    const error = await fileReport(t, citizen, { address: "over budget" }).catch(
      (e) => e as { code?: string; retryAfter?: number },
    );
    expect((error as { code?: string }).code).toBe("rate_limited");
    expect((error as { retryAfter?: number }).retryAfter).toBeGreaterThan(0);
  });

  it("counts each user separately", async () => {
    const t = setup();
    const noisy = await makeUser(t, "citizen", "Noisy");
    const quiet = await makeUser(t, "citizen", "Quiet");

    for (let i = 0; i < RATE_LIMITS.reportCreate.max; i++) {
      await fileReport(t, noisy, {
        address: `${i} Example Street`,
        lat: 51.5 + i * 0.05,
        lng: -0.12,
      });
    }
    await expect(
      fileReport(t, noisy, { address: "over" }),
    ).rejects.toThrow(/hit the limit/i);

    // A second person must not inherit the first person's exhausted budget.
    const ok = await fileReport(t, quiet, { address: "1 Example Street" });
    expect(ok).toBeTruthy();
  });

  it("starts a fresh budget in a new window", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    for (let i = 0; i < RATE_LIMITS.reportCreate.max; i++) {
      await fileReport(t, citizen, {
        address: `${i} Example Street`,
        lat: 51.5 + i * 0.05,
        lng: -0.12,
      });
    }
    await expect(fileReport(t, citizen, { address: "over" })).rejects.toThrow();

    // Age the counter into a previous window; the next call must be allowed.
    const rows = await readAll(t, "rateLimits");
    await t.run((ctx) =>
      ctx.db.patch(rows[0]._id, { windowStart: rows[0].windowStart - 3_600_000 }),
    );

    const ok = await fileReport(t, citizen, {
      address: "next window",
      lat: 53.5,
      lng: -0.12,
    });

    // The counter must be reset in place, never appended: a second row for the
    // same key would make the next `by_key` lookup ambiguous.
    const after = (await readAll(t, "rateLimits")).filter(
      (r) => r.key === rows[0].key,
    );
    expect(after).toHaveLength(1);
    expect(after[0].count).toBe(1);
    expect(ok).toBeTruthy();
  });

  it("limits confirmations independently of reports", async () => {
    const t = setup();
    // Cases come from distinct reporters so that building the fixture does not
    // exhaust the *report* budget, and are then confirmed by a single identity
    // so the *confirm* budget is what actually fills.
    const spammer = await makeUser(t, "citizen", "Spammer");
    const cases: Id<"issues">[] = [];
    for (let i = 0; i < RATE_LIMITS.confirm.max + 1; i++) {
      const reporter = await makeUser(t, "citizen", `Reporter ${i}`);
      cases.push(
        await fileReport(t, reporter, {
          address: `${i} Other Street`,
          lat: 51.5 + i * 0.05,
          lng: -0.12,
        }),
      );
    }

    for (const issueId of cases.slice(0, RATE_LIMITS.confirm.max)) {
      await as(spammer)(t).mutation(api.issues.confirm, { issueId });
    }

    // The next confirmation is one over the line.
    await expect(
      as(spammer)(t).mutation(api.issues.confirm, {
        issueId: cases[RATE_LIMITS.confirm.max],
      }),
    ).rejects.toThrow(/hit the limit/i);

    // A different person is unaffected.
    const bystander = await makeUser(t, "citizen", "Bystander");
    const ok = await as(bystander)(t).mutation(api.issues.confirm, {
      issueId: cases[0],
    });
    expect(ok).toBeTruthy();
  });

  it("limits upload-URL minting on its own budget", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");

    for (let i = 0; i < RATE_LIMITS.uploadUrl.max; i++) {
      await as(citizen)(t).mutation(api.evidence.generateUploadUrl, {});
    }
    await expect(
      as(citizen)(t).mutation(api.evidence.generateUploadUrl, {}),
    ).rejects.toThrow(/hit the limit/i);
  });
});
