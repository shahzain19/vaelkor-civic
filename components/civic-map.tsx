"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection } from "geojson";
import {
  Map as MapLibreMap,
  Popup,
  NavigationControl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type MapGeoJSONFeature,
} from "maplibre-gl";
import type { DataDrivenPropertyValueSpecification } from "@maplibre/maplibre-gl-style-spec";
import "maplibre-gl/dist/maplibre-gl.css";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toneFor, TONE_LEGEND, TONE_DOT, categoryLabel } from "@/lib/civic";
import { oklchToHex, readToneHex, toneToken, type ToneHex } from "@/lib/tone";
import { LOCATION_PRIVACY_STORE_M } from "@/lib/geo";
import { cn } from "@/lib/utils";

/**
 * The public infrastructure map (vision doc §17).
 *
 * Painted from the same `--status-*` tokens as the rest of the interface, read
 * live and converted to hex — see `lib/tone.ts`. The alternative, a second copy
 * of the palette in JavaScript, is the kind of drift this design system has
 * otherwise been careful to avoid, and a legend that disagrees with the map
 * would be worse than no map.
 *
 * Privacy: the points rendered here are the *stored* coordinates, which are
 * already offset by up to 250 m from where the citizen actually stood (see
 * `lib/geo.ts`). The map adds no precision and computes no distance — a pan is
 * a viewport query, so the server learns which area was looked at, never who
 * looked or from where. That is stated on screen rather than only in the docs.
 */

export type MapCase = {
  _id: string;
  caseNumber: string;
  category: string;
  status: string;
  title: string;
  lat: number;
  lng: number;
};

/**
 * OpenStreetMap raster tiles.
 *
 * Overridable so a deployment can point at a keyed provider without touching
 * this file. The default needs no API key, which is what makes the map work in
 * a fresh clone with no further configuration.
 */
const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ??
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION ??
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Karachi — the first deployment area named in vision doc §39. */
export const DEFAULT_CENTER = { lat: 24.8607, lng: 67.0011 };
const DEFAULT_ZOOM = 11;

const TILE_SOURCE = "basemap-tiles";
const SOURCE_ID = "civic-cases";
const CLUSTER_LAYER = "case-clusters";
const CLUSTER_COUNT_LAYER = "case-cluster-count";
const POINT_LAYER = "case-points";

/** A MapLibre `match` expression over the five tones. */
function paintFor(tones: Record<string, ToneHex>) {
  const entries = TONE_LEGEND.flatMap(({ tone }) => [
    tone,
    tones[toneToken(tone)],
  ]);

  return [
    "match",
    ["get", "tone"],
    ...entries,
    // Anything the data contains that the legend does not name is drawn as
    // broken, which is the same default `toneFor` applies in the DOM.
    tones[toneToken("broken")],
  ] as unknown as DataDrivenPropertyValueSpecification<string>;
}

function toGeoJson(cases: MapCase[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: cases.map((c) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [c.lng, c.lat] },
      properties: {
        id: c._id,
        caseNumber: c.caseNumber,
        title: c.title,
        category: c.category,
        status: c.status,
        tone: toneFor(c.status),
      },
    })),
  };
}

export function CivicMap({
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  className,
  onSelect,
  categories,
  statuses,
}: {
  center?: { lat: number; lng: number };
  zoom?: number;
  className?: string;
  /** Called with the case id when a pin is clicked. Defaults to no navigation. */
  onSelect?: (issueId: string) => void;
  /** Empty or omitted means every category. */
  categories?: string[];
  /** Empty or omitted means every stage. */
  statuses?: string[];
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const popup = useRef<Popup | null>(null);
  // The pin handler is installed once, on the style, and lives far longer than
  // the caller's callback identity. Reading it through a ref is what keeps a
  // fresh inline arrow on every parent render from re-running the install
  // effect — which would add a second copy of every source and layer, and
  // throw on the duplicate id.
  const onSelectRef = useRef(onSelect);
  // Latest-value pattern: refreshed after every render, and always before any
  // click can arrive, since clicks are user events dispatched post-commit.
  useEffect(() => {
    onSelectRef.current = onSelect;
  });
  // Set when the map moves itself, so `moveend` does not then claim the reader
  // panned when they did not.
  const selfMoved = useRef(false);
  const [ready, setReady] = useState(false);
  // Read by the error handler, which is registered before `ready` exists as
  // a state value; a ref keeps it out of the mount effect's dependencies.
  const readyRef = useRef(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [moved, setMoved] = useState(false);

  // The viewport drives the query, so the map only ever asks for what it draws.
  // Debounced: a drag emits a `moveend` per frame, and each one is a query.
  const [view, setView] = useState(() => ({
    north: center.lat + 0.5,
    south: center.lat - 0.5,
    east: center.lng + 0.5,
    west: center.lng - 0.5,
  }));

  // A module-level constant, not an inline `?? []`: a fresh array each
  // render would make the data effect below fire on every render.
  // Keyed on the joined values rather than the array identity: a caller that
  // rebuilds `[...CATEGORIES]` each render would otherwise refetch every time.
  const categoryKey = categories?.join(",") ?? "";
  const statusKey = statuses?.join(",") ?? "";

  const fetched = useQuery(api.issues.listForMap, {
    ...view,
    categories: categoryKey ? categoryKey.split(",") : undefined,
    statuses: statusKey ? statusKey.split(",") : undefined,
  });
  const cases = useMemo(() => fetched ?? [], [fetched]);

  /* Map lifecycle ---------------------------------------------------------- */

  useEffect(() => {
    if (!container.current || map.current) return;

    const instance = new MapLibreMap({
      container: container.current,
      style: {
        version: 8,
        // A deliberately blank basemap: the tiles below are added as a raster
        // source, and the default style would only be overridden.
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {},
        layers: [],
      },
      center: [center.lng, center.lat],
      zoom,
      attributionControl: false,
    });

    // Navigation control without the compass: the map is not a navigation
    // product, and the attribution is rendered in the page footer instead.
    instance.addControl(
      new NavigationControl({ showCompass: false }),
      "top-right",
    );

    instance.on("error", () => {
      // One failed raster tile is not worth reporting — tiles 404 legitimately
      // at the edges of a raster set. Only speak up if the basemap as a whole
      // never rendered, in which case the pins are floating on a blank canvas
      // and the reader deserves to know why.
      if (readyRef.current) return;
      setFailed(
        "The basemap could not be loaded, so the background is missing. The cases themselves are still plotted.",
      );
    });

    map.current = instance;
    popup.current = new Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: "civic-map-popup",
    });

    return () => {
      popup.current?.remove();
      instance.remove();
      map.current = null;
      popup.current = null;
    };
    // Intentionally mount-only: `center`/`zoom` are the initial view, and
    // re-creating the map on every prop identity change would drop the user's
    // pan and zoom on each parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Layers ----------------------------------------------------------------- */

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    const install = () => {
      const tones = readToneHex();
      const ink = readInk();

      instance.addSource(TILE_SOURCE, {
        type: "raster",
        tiles: [TILE_URL],
        tileSize: 256,
        attribution: TILE_ATTRIBUTION,
        maxzoom: 19,
      });
      // Painted first so every data layer sits above it.
      instance.addLayer({
        id: "basemap",
        type: "raster",
        source: TILE_SOURCE,
        paint: { "raster-opacity": 0.9, "raster-saturation": -0.85 },
      });

      instance.addSource(SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        // Clustering is what makes a dense city legible: at low zoom a
        // thousand cases become a dozen circles instead of a solid blob.
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 48,
      });

      instance.addLayer({
        id: CLUSTER_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": ink.muted,
          "circle-opacity": 0.16,
          "circle-stroke-color": ink.strong,
          "circle-stroke-width": 1.25,
          "circle-stroke-opacity": 0.5,
          // Grows with the count, so a cluster's size carries meaning.
          "circle-radius": [
            "step",
            ["get", "point_count"],
            16,
            10,
            21,
            50,
            27,
            200,
            33,
          ],
        },
      });

      instance.addLayer({
        id: CLUSTER_COUNT_LAYER,
        type: "symbol",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 12,
        },
        paint: { "text-color": ink.strong },
      });

      instance.addLayer({
        id: POINT_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": paintFor(tones),
          // A white ring rather than a darker stroke: the pins sit on an
          // unknown photographic background, so separation has to come from
          // contrast the map cannot control.
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.75,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 5, 16, 8],
        },
      });

      instance.on("click", CLUSTER_LAYER, (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
        if (!feature || feature.geometry.type !== "Point") return;

        const clusterId = feature.properties?.cluster_id;
        const source = instance.getSource(SOURCE_ID) as GeoJSONSource | undefined;
        if (clusterId === undefined || !source) return;

        // Read out of the feature before the closure: the narrowing does not
        // survive into an async callback.
        const coords = feature.geometry.coordinates as [number, number];
        // v3 took a callback; v6 returns a promise. The cluster's own expansion
        // zoom is where the pins separate, which is what the click is asking for.
        void source
          .getClusterExpansionZoom(clusterId)
          .then((expansionZoom) => {
            instance.easeTo({ center: coords, zoom: expansionZoom, duration: 400 });
          })
          .catch(() => {
            /* The cluster was collapsed underneath us; nothing to zoom to. */
          });
      });

      instance.on("click", POINT_LAYER, (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
        if (!feature || feature.geometry.type !== "Point") return;
        const props = feature.properties as Record<string, string>;
        const select = onSelectRef.current;
        if (select) {
          select(props.id);
          return;
        }
        popup.current
          ?.setLngLat(feature.geometry.coordinates as [number, number])
          .setHTML(popupHtml(props))
          .addTo(instance);
      });

      for (const layer of [CLUSTER_LAYER, POINT_LAYER]) {
        instance.on("mouseenter", layer, () => {
          instance.getCanvas().style.cursor = "pointer";
        });
        instance.on("mouseleave", layer, () => {
          instance.getCanvas().style.cursor = "";
        });
      }

      readyRef.current = true;
      setReady(true);
    };

    if (instance.isStyleLoaded()) install();
    else instance.once("load", install);
    // Mount-and-style-load only. Sources, layers and handlers are registered
    // exactly once per map instance; re-running this would duplicate them.
  }, []);

  /* Data ------------------------------------------------------------------- */

  useEffect(() => {
    if (!ready) return;
    const source = map.current?.getSource(SOURCE_ID) as
      | GeoJSONSource
      | undefined;
    source?.setData(toGeoJson(cases as MapCase[]));
  }, [cases, ready]);

  /* Recentre --------------------------------------------------------------- */

  // A controlled map without this is a lie: the caller renders "centre on me"
  // from a geolocation hook that resolves after mount, and a mount-only effect
  // would ignore it. Keyed on the coordinates, so panning freely never fights
  // the reader — the effect simply does not re-run.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const c = instance.getCenter();
    if (
      Math.abs(c.lat - center.lat) < 1e-6 &&
      Math.abs(c.lng - center.lng) < 1e-6
    ) {
      return;
    }
    selfMoved.current = true;
    instance.jumpTo({ center: [center.lng, center.lat], zoom });
    setMoved(false);
  }, [center.lat, center.lng, zoom]);

  /* Viewport query --------------------------------------------------------- */

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    let frame = 0;
    const onMoveEnd = () => {
      if (selfMoved.current) {
        // A recentre we triggered. Consume the flag and leave the reset
        // affordance hidden, since the reader did not move anything.
        selfMoved.current = false;
      } else {
        setMoved(true);
      }
      window.clearTimeout(frame);
      frame = window.setTimeout(() => {
        const b = instance.getBounds();
        if (b) {
          setView({
            north: b.getNorth(),
            south: b.getSouth(),
            east: b.getEast(),
            west: b.getWest(),
          });
        }
      }, 350);
    };

    instance.on("moveend", onMoveEnd);
    return () => {
      window.clearTimeout(frame);
      instance.off("moveend", onMoveEnd);
    };
  }, []);

  return (
    <div className={cn("relative", className)}>
      <div
        ref={container}
        className="size-full overflow-hidden rounded-[var(--radius)] border"
        role="application"
        aria-label="Map of reported civic cases. An equivalent list is available on the ledger page."
      />
      {failed && (
        <p
          className="absolute right-3 bottom-3 left-3 z-10 rounded-[var(--radius)] border border-border bg-card/95 p-2.5 text-[0.8125rem] leading-snug text-muted-foreground shadow-sm backdrop-blur"
          role="status"
        >
          {failed}
        </p>
      )}
      <MapLegend
        counts={countByTone(cases)}
        moved={moved}
        onReset={() => {
          map.current?.flyTo({ center: [center.lng, center.lat], zoom });
          setMoved(false);
        }}
      />
      <p className="mt-2 text-[0.75rem] text-muted-foreground">
        {TILE_ATTRIBUTION.replace(/<[^>]+>/g, "")}
      </p>
    </div>
  );
}

/* Legend -------------------------------------------------------------------- */

/**
 * The legend the status colours were always drawn from.
 *
 * Rendered beside the map rather than inside it, so it is real text: legible
 * without colour vision, reachable by a screen reader, and selectable. The
 * counts are computed client-side from the cases already fetched, so the legend
 * cannot disagree with the pins.
 */
function MapLegend({
  counts,
  moved,
  onReset,
}: {
  counts: Record<string, number>;
  moved: boolean;
  onReset: () => void;
}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div className="absolute top-3 left-3 z-10 max-w-[min(18rem,calc(100%-1.5rem))] rounded-[var(--radius)] border bg-background/95 p-3 shadow-sm backdrop-blur">
      <p className="text-[0.6875rem] font-semibold tracking-[0.07em] text-muted-foreground uppercase">
        Infrastructure conditions
      </p>
      <ul className="mt-2 space-y-1">
        {TONE_LEGEND.map(({ tone, label, blurb }) => (
          <li key={tone} className="flex items-baseline gap-2 text-[0.8125rem]">
            <span
              className={cn("mt-1 size-2 shrink-0 rounded-full", TONE_DOT[tone])}
              aria-hidden
            />
            <span className="font-medium">{label}</span>
            <span className="text-muted-foreground">{blurb}</span>
            <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">
              {counts[tone] ?? 0}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 border-t pt-2 text-[0.75rem] leading-relaxed text-muted-foreground">
        {total.toLocaleString()} case{total === 1 ? "" : "s"} in view. Pins are
        randomised by up to {LOCATION_PRIVACY_STORE_M} m, so a dot marks an area
        rather than a spot.
      </p>
      {moved && (
        <button
          type="button"
          onClick={onReset}
          className="mt-2 text-[0.75rem] font-medium underline underline-offset-2"
        >
          Reset view
        </button>
      )}
    </div>
  );
}

function countByTone(cases: MapCase[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of cases) {
    const tone = toneFor(c.status);
    counts[tone] = (counts[tone] ?? 0) + 1;
  }
  return counts;
}

/* Popup --------------------------------------------------------------------- */

/**
 * Built as an HTML string because MapLibre popups are not React portals.
 *
 * Every interpolated value is a case field the product itself generated, and
 * `escapeHtml` is applied to all of them regardless — the popup is the one place
 * in this component that would execute markup rather than render it as text.
 */
function popupHtml(props: Record<string, string>): string {
  const esc = escapeHtml;
  return `
    <div class="civic-popup">
      <p class="civic-popup-ref">${esc(props.caseNumber)}</p>
      <p class="civic-popup-title">${esc(props.title)}</p>
      <p class="civic-popup-meta">${esc(categoryLabel(props.category))} · ${esc(
        props.status.replaceAll("_", " "),
      )}</p>
    </div>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/* Ink ----------------------------------------------------------------------- */

/**
 * Text and outline colours, resolved the same way as the tones.
 *
 * The conversion is not optional. These tokens are `oklch()`, and MapLibre's
 * paint-property parser does not understand that syntax: `Color.parse` returns
 * undefined for it, so an unconverted token fails style validation and the
 * layer it was meant to colour is never drawn. Convert at the boundary.
 */
function readInk(): { strong: string; muted: string } {
  if (typeof document === "undefined") {
    return { strong: "#1a1c20", muted: "#8b8f99" };
  }
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => {
    const raw = styles.getPropertyValue(name).trim();
    return oklchToHex(raw) ?? (raw.startsWith("#") ? raw : fallback);
  };
  return {
    strong: read("--foreground", "#1a1c20"),
    muted: read("--muted", "#8b8f99"),
  };
}
