import { describe, expect, it } from "vitest";
import {
  DEFAULT_REGION,
  REGIONS,
  isRegionId,
  regionById,
  regionForCoords,
  regionForLanguageTag,
  regionForTimeZone,
  resolveRegion,
} from "../lib/regions";

describe("region table", () => {
  it("defaults to Karachi", () => {
    expect(DEFAULT_REGION).toBe("karachi");
    expect(REGIONS[0].id).toBe(DEFAULT_REGION);
  });

  it("gives every region a label and a way to be reached", () => {
    for (const region of REGIONS) {
      expect(region.label.length).toBeGreaterThan(0);
      const reachable =
        region.timeZones.length > 0 ||
        region.languageTags.length > 0 ||
        region.near !== undefined;
      expect(reachable, `${region.id} is unreachable`).toBe(true);
    }
  });

  it("resolves each region's own centre to itself", () => {
    // Radii may overlap — Islamabad sits inside Kashmir's circle — because
    // `regionForCoords` takes the nearest match. What must never happen is one
    // city's centre resolving to a different city, because that would mean the
    // palette for a visitor standing in that city is a matter of table order.
    for (const region of REGIONS) {
      if (!region.near) continue;
      expect(regionForCoords(region.near.at), `${region.id} centre`).toBe(region.id);
    }
  });

  it("has a unique id per row", () => {
    const ids = REGIONS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("isRegionId", () => {
  it("accepts a shipped region", () => {
    expect(isRegionId("kashmir")).toBe(true);
  });

  it("rejects anything else, including near-misses", () => {
    // A stale bookmark can carry an id this build dropped, and an unvalidated
    // value would render an attribute with no palette behind it.
    for (const value of ["Kashmir", "kashmir ", " karachi", "", null, 7, {}]) {
      expect(isRegionId(value)).toBe(false);
    }
  });
});

describe("regionById", () => {
  it("returns the row", () => {
    expect(regionById("peshawar").label).toBe("Peshawar");
  });

  it("throws rather than returning undefined", () => {
    // @ts-expect-error deliberately wrong: a bad id is a programming error.
    expect(() => regionById("atlantis")).toThrow();
  });
});

describe("regionForTimeZone", () => {
  it("returns the first region claiming a zone", () => {
    // Every region in the table is inside Asia/Karachi, so a bare timezone
    // resolves to the default and nothing else. This is the documented
    // behaviour rather than an accident: it is pinned here so that adding a
    // row ahead of Karachi cannot silently change what a bare timezone means.
    expect(regionForTimeZone("Asia/Karachi")).toBe(DEFAULT_REGION);
  });

  it("falls back for an unknown or missing zone", () => {
    expect(regionForTimeZone("Pacific/Auckland")).toBe(DEFAULT_REGION);
    expect(regionForTimeZone("")).toBe(DEFAULT_REGION);
    expect(regionForTimeZone(null)).toBe(DEFAULT_REGION);
    expect(regionForTimeZone(undefined)).toBe(DEFAULT_REGION);
  });
});

describe("regionForLanguageTag", () => {
  it("reads the region subtag in any position", () => {
    expect(regionForLanguageTag("en-PK")).toBe(DEFAULT_REGION);
    expect(regionForLanguageTag("ur-PK")).toBe(DEFAULT_REGION);
    // A script subtag sits between the language and the region.
    expect(regionForLanguageTag("en-Latn-PK")).toBe(DEFAULT_REGION);
  });

  it("falls back when the tag carries no region", () => {
    expect(regionForLanguageTag("en")).toBe(DEFAULT_REGION);
    expect(regionForLanguageTag("en-US")).toBe(DEFAULT_REGION);
    expect(regionForLanguageTag(null)).toBe(DEFAULT_REGION);
  });
});

describe("regionForCoords", () => {
  it("matches a point inside a radius", () => {
    expect(regionForCoords({ lat: 34.08, lng: 74.8 })).toBe("kashmir");
    expect(regionForCoords({ lat: 24.86, lng: 67.01 })).toBe("karachi");
    expect(regionForCoords({ lat: 31.55, lng: 74.34 })).toBe("lahore");
  });

  it("takes the nearest match where two circles overlap", () => {
    // Islamabad's centre is inside Kashmir's circle too; the nearer one wins,
    // so the order of the table cannot decide it.
    expect(regionForCoords({ lat: 33.69, lng: 73.04 })).toBe("islamabad");
  });

  it("returns the default for a point inside no region", () => {
    expect(regionForCoords({ lat: -33.87, lng: 151.21 })).toBe(DEFAULT_REGION);
  });

  it("survives a missing or malformed position", () => {
    expect(regionForCoords(null)).toBe(DEFAULT_REGION);
    expect(regionForCoords(undefined)).toBe(DEFAULT_REGION);
    expect(regionForCoords({ lat: NaN, lng: 74.8 })).toBe(DEFAULT_REGION);
    expect(regionForCoords({ lat: 34, lng: Infinity })).toBe(DEFAULT_REGION);
  });
});

describe("resolveRegion", () => {
  it("prefers an explicit choice over every signal", () => {
    expect(
      resolveRegion({
        override: "quetta",
        coords: { lat: 24.86, lng: 67.01 },
        timeZone: "Asia/Karachi",
        language: "en-PK",
      }),
    ).toBe("quetta");
  });

  it("ignores an override this build does not ship", () => {
    expect(resolveRegion({ override: "atlantis", coords: { lat: 31.55, lng: 74.34 } })).toBe(
      "lahore",
    );
  });

  it("prefers a fix to a timezone, because one zone covers the country", () => {
    // This is the only signal that can tell Lahore from Karachi, so it has to
    // outrank the timezone or the table is decorative.
    expect(resolveRegion({ timeZone: "Asia/Karachi" })).toBe(DEFAULT_REGION);
    expect(
      resolveRegion({ coords: { lat: 31.55, lng: 74.34 }, timeZone: "Asia/Karachi" }),
    ).toBe("lahore");
  });

  it("prefers a timezone to a language tag", () => {
    expect(resolveRegion({ timeZone: "Pacific/Auckland", language: "en-PK" })).toBe(
      DEFAULT_REGION,
    );
  });

  it("falls through to the default with no signal at all", () => {
    expect(resolveRegion({})).toBe(DEFAULT_REGION);
    expect(
      resolveRegion({ override: null, coords: null, timeZone: null, language: null }),
    ).toBe(DEFAULT_REGION);
  });
});
