import { describe, expect, it } from "vitest";
import {
  distanceKm,
  formatCoord,
  formatDistance,
  obfuscateCoords,
  offsetCoords,
} from "../lib/geo";

describe("formatDistance", () => {
  it("handles non-finite values", () => {
    expect(formatDistance(NaN)).toBe("—");
    expect(formatDistance(Infinity)).toBe("—");
    expect(formatDistance(-Infinity)).toBe("—");
  });

  it("formats sub-kilometer distances correctly in 50m intervals", () => {
    expect(formatDistance(0)).toBe("50 m");
    expect(formatDistance(0.02)).toBe("50 m");
    expect(formatDistance(0.04)).toBe("50 m");
    expect(formatDistance(0.08)).toBe("100 m");
    expect(formatDistance(0.12)).toBe("100 m");
    expect(formatDistance(0.14)).toBe("150 m");
    expect(formatDistance(0.48)).toBe("500 m");
    expect(formatDistance(0.52)).toBe("500 m");
    expect(formatDistance(0.75)).toBe("750 m");
    expect(formatDistance(0.96)).toBe("950 m");
    expect(formatDistance(0.98)).toBe("1.0 km");
  });

  it("formats 1km to 10km distances with one decimal place", () => {
    expect(formatDistance(1.0)).toBe("1.0 km");
    expect(formatDistance(1.23)).toBe("1.2 km");
    expect(formatDistance(2.87)).toBe("2.9 km");
    expect(formatDistance(9.44)).toBe("9.4 km");
  });

  it("formats distances >= 10km as rounded integers", () => {
    expect(formatDistance(10.2)).toBe("10 km");
    expect(formatDistance(24.8)).toBe("25 km");
    expect(formatDistance(100.4)).toBe("100 km");
  });
});

describe("distanceKm", () => {
  it("calculates zero distance between identical coordinates", () => {
    expect(distanceKm(24.8607, 67.0011, 24.8607, 67.0011)).toBe(0);
  });

  it("calculates realistic distances between known cities", () => {
    // Karachi to Lahore is approx 1020-1030 km great circle
    const d = distanceKm(24.8607, 67.0011, 31.5204, 74.3587);
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(1050);
  });
});

describe("obfuscateCoords", () => {
  it("keeps non-finite coordinates unchanged", () => {
    expect(obfuscateCoords(NaN, 67.0, 250)).toEqual({ lat: NaN, lng: 67.0 });
  });

  it("offsets coordinates within maxMeters radius", () => {
    const origLat = 24.8607;
    const origLng = 67.0011;
    const maxMeters = 250;

    for (let i = 0; i < 20; i++) {
      const { lat, lng } = obfuscateCoords(origLat, origLng, maxMeters);
      const dKm = distanceKm(origLat, origLng, lat, lng);
      // dKm in meters should be <= maxMeters (with tiny margin for precision rounding)
      expect(dKm * 1000).toBeLessThanOrEqual(maxMeters + 5);
    }
  });
});

describe("offsetCoords", () => {
  it("offsets north and east correctly", () => {
    const orig = { lat: 24.0, lng: 67.0 };
    const north = offsetCoords(orig.lat, orig.lng, 1000, 0);
    expect(north.lat).toBeGreaterThan(orig.lat);
    expect(north.lng).toBeCloseTo(orig.lng, 4);

    const east = offsetCoords(orig.lat, orig.lng, 1000, 90);
    expect(east.lat).toBeCloseTo(orig.lat, 4);
    expect(east.lng).toBeGreaterThan(orig.lng);
  });
});

describe("formatCoord", () => {
  it("formats coordinates to 4 decimal places", () => {
    expect(formatCoord(24.860721, 67.001149)).toBe("24.8607, 67.0011");
  });
});
