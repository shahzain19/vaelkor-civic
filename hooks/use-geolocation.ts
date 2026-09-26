"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LOCATION_PRIVACY_QUERY_M,
  LOCATION_PRIVACY_STORE_M,
  type Coords,
  distanceKm,
  obfuscateCoords,
} from "@/lib/geo";

export type { Coords };

const OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  // Reuse a recent fix rather than re-prompting on every navigation.
  maximumAge: 60000,
};

/**
 * Device location with privacy-by-default handling.
 *
 * The raw fix is held in a ref and is never written to state, so it cannot be
 * rendered, serialised into a query, or logged. Consumers only ever receive
 * obfuscated coordinates plus `distanceToKm`, which measures locally.
 */
export function useGeolocation() {
  const [center, setCenter] = useState<Coords | null>(null);
  const [reportPin, setReportPin] = useState<Coords | null>(null);
  const [denied, setDenied] = useState(false);
  const [locating, setLocating] = useState(true);

  const raw = useRef<Coords | null>(null);

  const supported =
    typeof navigator === "undefined" ? true : Boolean(navigator.geolocation);

  const consume = useCallback((pos: GeolocationPosition) => {
    const exact = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
    };
    raw.current = exact;
    // Derived, safe-to-send coordinates. Obfuscated once per fix so the
    // query centre stays stable across re-renders.
    setCenter(obfuscateCoords(exact.lat, exact.lng, LOCATION_PRIVACY_QUERY_M));
    setReportPin(
      obfuscateCoords(exact.lat, exact.lng, LOCATION_PRIVACY_STORE_M),
    );
    setLocating(false);
  }, []);

  const fail = useCallback(() => {
    setDenied(true);
    setLocating(false);
  }, []);

  const request = useCallback(() => {
    const geo =
      typeof navigator === "undefined" ? undefined : navigator.geolocation;
    if (!geo) return;
    setLocating(true);
    geo.getCurrentPosition(consume, fail, OPTIONS);
  }, [consume, fail]);

  useEffect(() => {
    const geo =
      typeof navigator === "undefined" ? undefined : navigator.geolocation;
    // Nothing to subscribe to. `supported` is false in this case and takes
    // priority in `note`, so there is no state to write here.
    if (!geo) return;
    geo.getCurrentPosition(consume, fail, OPTIONS);
  }, [consume, fail]);

  /**
   * Distance from the user's true position, computed in memory only. Used to
   * show an accurate "1.2 km away" without ever transmitting the raw fix.
   */
  const distanceToKm = useCallback(
    (lat: number, lng: number): number | null => {
      const fix = raw.current;
      if (!fix) return null;
      return distanceKm(fix.lat, fix.lng, lat, lng);
    },
    [],
  );

  const note = !supported
    ? "Geolocation unavailable"
    : denied
      ? "Location denied"
      : locating
        ? "Locating…"
        : "Approximate location active";

  return {
    /** Obfuscated, safe to send to the server. */
    center,
    /** Obfuscated pin to store on a new report. */
    reportPin,
    supported,
    locating,
    denied,
    note,
    request,
    distanceToKm,
    /** Maximum random offset applied to the search centre, in metres. */
    queryPrivacyM: LOCATION_PRIVACY_QUERY_M,
    storePrivacyM: LOCATION_PRIVACY_STORE_M,
  };
}
