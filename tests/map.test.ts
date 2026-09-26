/**
 * The public map feed (`issues.listForMap`).
 *
 * Two things are worth pinning here. The first is the bounding box: it is a
 * user-supplied argument reaching a public query, and a sign error there would
 * either leak the whole table or return an empty map. The second is the shape
 * of what comes back — this is the only place a citizen's stored location
 * leaves the server, so the projection has to stay minimal and the coordinates
 * have to stay the already-obfuscated ones.
 */

import { describe, expect, it } from "vitest";
import {
  api,
  as,
  FIELD_LIMITS,
  fileReport,
  makeUser,
  setup,
  VALID_REPORT,
  type Harness,
  type TestUser,
} from "./harness";

/** Somewhere in the sea, so nothing else in the suite can be in the box. */
const ATLANTIC = { lat: 0, lng: -30 };

async function seed(t: Harness, count: number, reporter: TestUser) {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    ids.push(
      await fileReport(t, reporter, {
        lat: ATLANTIC.lat + i * 0.01,
        lng: ATLANTIC.lng + i * 0.01,
        address: `${i} Example Street`,
      }),
    );
  }
  return ids;
}

/** A box around `ATLANTIC` large enough to hold every seeded case. */
const BOX = {
  north: ATLANTIC.lat + 1,
  south: ATLANTIC.lat - 1,
  east: ATLANTIC.lng + 1,
  west: ATLANTIC.lng - 1,
};

function mapQuery(t: Harness, user?: TestUser) {
  const target = user ? as(user)(t) : t;
  return target.query(api.issues.listForMap, BOX);
}

describe("listForMap", () => {
  it("returns the cases inside the box, and nothing outside it", async () => {
    const t = setup();
    const reporter = await makeUser(t);
    const ids = await seed(t, 5, reporter);
    // A case deliberately far away, in the default city.
    await fileReport(t, reporter, {
      lat: VALID_REPORT.lat,
      lng: VALID_REPORT.lng,
      address: "Far away",
    });

    const rows = await mapQuery(t);
    expect(rows).toHaveLength(ids.length);
    for (const id of ids) expect(rows.map((r) => r._id)).toContain(id);
  });

  it("treats the bounds as inclusive", async () => {
    const t = setup();
    const reporter = await makeUser(t);
    const [id] = await seed(t, 1, reporter);

    // A zero-area box sitting exactly on the point.
    const rows = await t.query(api.issues.listForMap, {
      north: ATLANTIC.lat,
      south: ATLANTIC.lat,
      east: ATLANTIC.lng,
      west: ATLANTIC.lng,
    });
    expect(rows.map((r) => r._id)).toEqual([id]);
  });

  it("unions rather than intersects across the antimeridian", async () => {
    const t = setup();
    const reporter = await makeUser(t);
    // Two cases either side of the 180th meridian.
    const east = await fileReport(t, reporter, {
      lat: 0,
      lng: 179.5,
      address: "Just east",
    });
    const west = await fileReport(t, reporter, {
      lat: 0,
      lng: -179.5,
      address: "Just west",
    });
    await fileReport(t, reporter, {
      lat: 0,
      lng: 0,
      address: "Far from the seam",
    });

    // A viewport spanning the seam arrives as west > east.
    const rows = await t.query(api.issues.listForMap, {
      north: 1,
      south: -1,
      east: -179,
      west: 179,
    });
    const ids = rows.map((r) => r._id);
    expect(ids).toContain(east);
    expect(ids).toContain(west);
    expect(ids).toHaveLength(2);
  });

  it("projects only what a pin and a link need", async () => {
    const t = setup();
    const reporter = await makeUser(t);
    await seed(t, 1, reporter);

    const [row] = await mapQuery(t);
    expect(Object.keys(row).sort()).toEqual(
      [
        "_id",
        "caseNumber",
        "category",
        "lat",
        "lng",
        "status",
        "title",
      ].sort(),
    );
    // Notably absent: description, address, reporterId, evidence, and any
    // storage id. The public map has no need to carry a citizen's prose.
    expect(row).not.toHaveProperty("reporterId");
    expect(row).not.toHaveProperty("description");
    expect(row).not.toHaveProperty("address");
  });

  it("returns the stored coordinates unchanged", async () => {
    const t = setup();
    const reporter = await makeUser(t);
    // `fileReport` stores what the caller passes; obfuscation happens in the
    // report form before this point, so the map must add no further offset.
    const lat = 12.3456;
    const lng = -45.6789;
    const id = await fileReport(t, reporter, { lat, lng });

    const [row] = await t
      .query(api.issues.listForMap, {
        north: 13,
        south: 12,
        east: -45,
        west: -46,
      })
      .then((rows) => rows.filter((r) => r._id === id));

    expect(row.lat).toBeCloseTo(lat, 6);
    expect(row.lng).toBeCloseTo(lng, 6);
  });

  it("is readable without signing in", async () => {
    const t = setup();
    const reporter = await makeUser(t);
    await seed(t, 2, reporter);
    // Anonymous, i.e. the public /map page.
    expect(await mapQuery(t)).toHaveLength(2);
  });

  it("applies the stage and category filters", async () => {
    const t = setup();
    const reporter = await makeUser(t);
    await fileReport(t, reporter, {
      category: "road",
      lat: ATLANTIC.lat + 0.001,
      lng: ATLANTIC.lng + 0.001,
      address: "Road case",
    });
    await fileReport(t, reporter, {
      category: "drainage",
      lat: ATLANTIC.lat + 0.002,
      lng: ATLANTIC.lng + 0.002,
      address: "Drainage case",
    });

    const drainage = await t.query(api.issues.listForMap, {
      ...BOX,
      categories: ["drainage"],
    });
    expect(drainage).toHaveLength(1);
    expect(drainage[0].category).toBe("drainage");

    // Both categories at once is a union, not an intersection with nothing.
    expect(
      await t.query(api.issues.listForMap, {
        ...BOX,
        categories: ["road", "drainage"],
      }),
    ).toHaveLength(2);

    // Absent or empty means "no filter", not "match nothing".
    expect(await t.query(api.issues.listForMap, { ...BOX, categories: [] })).toHaveLength(2);
    expect(await t.query(api.issues.listForMap, BOX)).toHaveLength(2);
  });

  it("defaults the limit and honours a lower one", async () => {
    const t = setup();
    const reporter = await makeUser(t);
    await seed(t, 4, reporter);

    const all = await mapQuery(t);
    expect(all.length).toBeLessThanOrEqual(FIELD_LIMITS.map.def);

    const some = await t.query(api.issues.listForMap, { ...BOX, limit: 2 });
    expect(some).toHaveLength(2);
  });

  it("rejects a coordinate off the globe", async () => {
    const t = setup();
    // The bound that actually protects this query: `assertCoordinate` runs
    // first, so latitude is range-checked before any scanning happens.
    await expect(
      t.query(api.issues.listForMap, {
        north: 90.5,
        south: -90.5,
        east: 179,
        west: -179,
      }),
    ).rejects.toThrow(/not a valid point/i);
    await expect(
      t.query(api.issues.listForMap, {
        north: 10,
        south: -10,
        east: 181,
        west: -10,
      }),
    ).rejects.toThrow(/not a valid point/i);
  });

  it("accepts a full-height box", async () => {
    const t = setup();
    // The whole globe is the largest legal viewport. `assertViewport` also has a
    // `> 180` height guard, but it cannot be reached: `assertCoordinate` caps
    // latitude at +/-90 first, so this is the true ceiling rather than a limit
    // that happens to bite.
    expect(
      await t.query(api.issues.listForMap, {
        north: 90,
        south: -90,
        east: 179,
        west: -179,
      }),
    ).toEqual([]);
  });

  it("rejects inverted bounds", async () => {
    const t = setup();
    await expect(
      t.query(api.issues.listForMap, {
        north: 10,
        south: 20,
        east: 10,
        west: 20,
      }),
    ).rejects.toThrow();
  });
});
