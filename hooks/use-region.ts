"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_REGION,
  isRegionId,
  resolveRegion,
  type RegionId,
} from "@/lib/regions";
import type { Coords } from "@/lib/geo";

/**
 * Reads a coarse region for theming. Never asks for anything.
 *
 * The rule is that a palette must not be worth a permission prompt, so this
 * hook only ever reads signals the browser has already given away for other
 * reasons: a timezone, a language tag, a choice stored in `localStorage`, or a
 * position fix that was *already* granted (the map and the report flow request
 * one; if the visitor said yes there, it is free to read here).
 *
 * The first render is always the default region, because the client cannot know
 * the answer during SSR and guessing would produce a hydration mismatch. The
 * change lands as a repaint rather than a re-render of the tree, and the
 * palette shifts are small enough that the swap is not something a visitor can
 * catch happening.
 */

/** Written by a region picker, and by nothing else. */
export const REGION_STORAGE_KEY = "vaelkor:region";

/** Answers "already granted?" without ever triggering the prompt itself. */
async function grantedPosition(): Promise<Coords | null> {
  if (typeof navigator === "undefined") return null;
  if (!navigator.geolocation || !navigator.permissions?.query) return null;

  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    if (status.state !== "granted") return null;
  } catch {
    // Safari and older engines reject the query, and Firefox gates it behind a
    // flag. A rejection means "unknown", which is the same as "denied" here.
    return null;
  }

  return new Promise((resolve) => {
    // A short timeout: a fix held in the OS cache answers immediately, and
    // anything slower is not worth delaying a repaint for.
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: 600000, timeout: 3000 },
    );
  });
}

function storedOverride(): string | null {
  try {
    return window.localStorage.getItem(REGION_STORAGE_KEY);
  } catch {
    // Private browsing, or storage disabled. Not worth handling beyond this.
    return null;
  }
}

export function useRegion(): RegionId {
  const [region, setRegion] = useState<RegionId>(DEFAULT_REGION);

  useEffect(() => {
    let cancelled = false;

    const override = storedOverride();
    if (override && isRegionId(override)) {
      setRegion(override);
      return;
    }

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const language =
      typeof navigator === "undefined" ? null : navigator.language;

    // The timezone decides immediately; a granted fix refines it afterwards if
    // one turns out to be available.
    setRegion(resolveRegion({ timeZone, language }));

    void grantedPosition().then((coords) => {
      if (cancelled || !coords) return;
      setRegion(resolveRegion({ coords, timeZone, language }));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return region;
}
