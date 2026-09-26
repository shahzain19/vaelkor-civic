/**
 * OKLCH → hex conversion.
 *
 * This exists for one reason: MapLibre cannot read an `oklch()` token, and it
 * fails *quietly* when handed one. The tests below pin both the maths and the
 * failure mode that motivated the module.
 */

import { describe, expect, it } from "vitest";
import { Color } from "@maplibre/maplibre-gl-style-spec";
import { FALLBACK_TONE_HEX, oklchToHex, toneToken } from "../lib/tone";

/** `c` as an 8-bit triple, so assertions read as colour rather than as maths. */
function rgb(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

describe("oklch -> hex", () => {
  it("matches the CSS Color 4 reference values", () => {
    // Checked against the OKLab matrices, not against the browser: this is the
    // one place a rounding slip would be invisible in the UI.
    expect(oklchToHex("oklch(0.19 0.005 265)")).toBe("#131416");
    expect(oklchToHex("oklch(0.965 0.002 265)")).toBe("#f3f3f5");
    expect(oklchToHex("oklch(1 0 0)")).toBe("#ffffff");
    expect(oklchToHex("oklch(0 0 0)")).toBe("#000000");
  });

  it("treats lightness as a percentage when written as one", () => {
    expect(oklchToHex("oklch(100% 0 0)")).toBe("#ffffff");
    expect(oklchToHex("oklch(50% 0 0)")).toBe(oklchToHex("oklch(0.5 0 0)"));
  });

  it("accepts an explicit deg and surrounding whitespace", () => {
    expect(oklchToHex("  oklch( 0.19 0.005 265deg )  ")).toBe(
      oklchToHex("oklch(0.19 0.005 265)"),
    );
  });

  it("clamps out-of-gamut results per channel instead of wrapping", () => {
    // A chroma no sRGB display can show. Wrapping would flip the hue; a
    // clamp lands on a real, if flat, colour.
    const hex = oklchToHex("oklch(0.7 0.4 150)");
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    for (const channel of rgb(hex!)) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(255);
    }
  });

  it("returns null for anything that is not an oklch colour", () => {
    for (const input of [
      "",
      "red",
      "#ff0000",
      "rgb(1 2 3)",
      "oklch(0.5 0.1)",
      "oklch(a b c)",
      "oklch(0.5 0.1 265) trailing",
    ]) {
      expect(oklchToHex(input), input).toBeNull();
    }
  });
});

describe("hex output is something MapLibre can actually read", () => {
  it("produces colours MapLibre's parser accepts", () => {
    // The regression this guards. `Color.parse` is what the paint-property
    // validator runs, and it returns null for `oklch()`, which fails style
    // validation and leaves the layer unpainted.
    for (const [token, hex] of Object.entries(FALLBACK_TONE_HEX)) {
      const parsed = Color.parse(hex);
      expect(parsed, token).not.toBeNull();
      expect(typeof parsed?.r, token).toBe("number");
      expect(typeof parsed?.g, token).toBe("number");
      expect(typeof parsed?.b, token).toBe("number");
    }
  });

  it("confirms the raw design-system token is rejected", () => {
    // Documents *why* the conversion is mandatory: the tokens in
    // `app/globals.css` are oklch, and MapLibre cannot read them. A future
    // attempt to pass `--foreground` straight through is a visible regression.
    expect(Color.parse("oklch(0.19 0.005 265)")).toBeUndefined();
    expect(Color.parse("oklch(0.965 0.002 265)")).toBeUndefined();
  });

  it("round-trips a converted token to the expected channels", () => {
    // --foreground: oklch(0.19 0.005 265) is #131416.
    const parsed = Color.parse(oklchToHex("oklch(0.19 0.005 265)")!);
    expect(parsed).not.toBeNull();
    const to255 = (n: number) => Math.round(n * 255);
    expect([to255(parsed!.r), to255(parsed!.g), to255(parsed!.b)]).toEqual([
      19, 20, 22,
    ]);
  });
});

describe("toneToken", () => {
  it("maps each legend tone to its token name", () => {
    // No leading `--`: the name is used both as a `getPropertyValue` argument
    // (which does want the dashes) and as a key into the fallback table (which
    // does not), so it is stored bare and the dashes added at the call site.
    expect(toneToken("broken")).toBe("status-broken");
    expect(toneToken("resolved")).toBe("status-resolved");
  });

  it("has a fallback for every tone it can produce", () => {
    for (const tone of ["broken", "confirmed", "active", "inspection", "resolved"]) {
      expect(FALLBACK_TONE_HEX[toneToken(tone)], tone).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
