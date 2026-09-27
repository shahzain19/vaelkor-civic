/**
 * Regional palettes.
 *
 * The interface is deliberately achromatic (see `globals.css`): the only
 * saturated colour on screen is a lifecycle status, so status reads as meaning
 * rather than decoration. This module adds the one thing that was missing — a
 * sense of where you are — without spending that budget.
 *
 * Three rules keep it from turning into a themed website:
 *
 * 1. Nothing here touches `--status-*`. A status colour is a fact about a
 *    case, and it must mean the same thing in Karachi as it does in London.
 * 2. The shifts are small. Chroma moves in the second decimal, and the
 *    light/dark surfaces stay within a hair of the paper they replace. A
 *    visitor who did not notice should not be able to prove it changed.
 * 3. One region is the default and is the current design. Karachi is what you
 *    get with no signal at all, so the fallback is not a special case.
 *
 * Resolution is deliberately coarse. A palette is not worth a location
 * prompt, so nothing here asks for one: the timezone is the primary signal, an
 * already-granted fix is used if the browser happens to hold one, and the
 * answer is the default whenever the evidence is thin.
 *
 * Palettes live in `globals.css` under `[data-region]`. Keeping the colours in
 * CSS means dark mode keeps working without a second serialised copy, and
 * adding a region is one CSS block plus one row in `REGIONS` below.
 */

import { distanceKm, type Coords } from "./geo";

export const REGION_IDS = [
  "karachi",
  "lahore",
  "islamabad",
  "peshawar",
  "quetta",
  "kashmir",
] as const;

export type RegionId = (typeof REGION_IDS)[number];

export type Region = {
  id: RegionId;
  label: string;
  timeZones: readonly string[];
  near?: { at: Coords; radiusKm: number };
  languageTags: readonly string[];
};

export const DEFAULT_REGION: RegionId = "karachi";

export const REGIONS: readonly Region[] = [
  {
    id: "karachi",
    label: "Karachi",
    timeZones: ["Asia/Karachi"],
    near: { at: { lat: 24.86, lng: 67.01 }, radiusKm: 180 },
    languageTags: ["PK"],
  },

  {
    id: "lahore",
    label: "Lahore",
    timeZones: ["Asia/Karachi"],
    near: { at: { lat: 31.55, lng: 74.34 }, radiusKm: 150 },
    languageTags: ["PK"],
  },

  {
    id: "islamabad",
    label: "Islamabad",
    timeZones: ["Asia/Karachi"],
    near: { at: { lat: 33.69, lng: 73.04 }, radiusKm: 100 },
    languageTags: ["PK"],
  },

  {
    id: "peshawar",
    label: "Peshawar",
    timeZones: ["Asia/Karachi"],
    near: { at: { lat: 34.01, lng: 71.52 }, radiusKm: 140 },
    languageTags: ["PK"],
  },

  {
    id: "quetta",
    label: "Quetta",
    timeZones: ["Asia/Karachi"],
    near: { at: { lat: 30.18, lng: 66.98 }, radiusKm: 180 },
    languageTags: ["PK"],
  },

  {
    id: "kashmir",
    label: "Kashmir",
    timeZones: ["Asia/Karachi"],
    near: { at: { lat: 34.08, lng: 74.80 }, radiusKm: 220 },
    languageTags: ["PK"],
  },
];

const BY_ID = new Map<RegionId, Region>(
  REGIONS.map((r) => [r.id, r])
);

export function isRegionId(value: unknown): value is RegionId {
  return typeof value === "string" && BY_ID.has(value as RegionId);
}

export function regionById(id: RegionId): Region {
  const region = BY_ID.get(id);

  if (!region) {
    throw new Error(`Unknown region: ${id}`);
  }

  return region;
}

export function regionForCoords(
  coords: Coords | null | undefined
): RegionId {
  if (!coords) return DEFAULT_REGION;

  if (
    !Number.isFinite(coords.lat) ||
    !Number.isFinite(coords.lng)
  ) {
    return DEFAULT_REGION;
  }

  let best: RegionId = DEFAULT_REGION;
  let bestKm = Infinity;

  for (const region of REGIONS) {
    if (!region.near) continue;

    const km = distanceKm(
      coords.lat,
      coords.lng,
      region.near.at.lat,
      region.near.at.lng
    );

    if (km <= region.near.radiusKm && km < bestKm) {
      best = region.id;
      bestKm = km;
    }
  }

  return best;
}

export function regionForTimeZone(
  timeZone: string | null | undefined
): RegionId {
  // Pakistan shares one timezone, so timezone alone cannot
  // distinguish Pakistani cities. Keep Karachi as the fallback.
  if (timeZone === "Asia/Karachi") {
    return DEFAULT_REGION;
  }

  return DEFAULT_REGION;
}

export function regionForLanguageTag(
  tag: string | null | undefined
): RegionId {
  if (!tag) return DEFAULT_REGION;

  const subtags = tag.split("-");

  for (let i = subtags.length - 1; i >= 1; i--) {
    const match = REGIONS.find((r) =>
      r.languageTags.includes(subtags[i].toUpperCase())
    );

    if (match) return match.id;
  }

  return DEFAULT_REGION;
}

export type RegionSignals = {
  override?: string | null;
  coords?: Coords | null;
  timeZone?: string | null;
  language?: string | null;
};

export function resolveRegion(
  signals: RegionSignals
): RegionId {
  if (
    signals.override &&
    isRegionId(signals.override)
  ) {
    return signals.override;
  }

  // Location is the only reliable way to distinguish
  // Pakistani cities because they share Asia/Karachi.
  if (signals.coords) {
    return regionForCoords(signals.coords);
  }

  return DEFAULT_REGION;
}