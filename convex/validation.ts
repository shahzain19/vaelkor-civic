/**
 * Server-side input validation.
 *
 * Convex `v.*` validators check *shape* only. They do not bound string length,
 * constrain coordinate ranges, or cap a client-supplied `limit`. Every one of
 * those is an abuse vector, so they are enforced here as a second layer, after
 * the argument has already passed its type validator.
 *
 * All limits live in one place so the UI can import and mirror them.
 */

import { err } from "./errors";

/* Field limits ------------------------------------------------------------- */

export const LIMITS = {
  title: { min: 3, max: 120 },
  description: { min: 10, max: 2000 },
  address: { min: 3, max: 200 },
  note: { min: 0, max: 500 },
  checklistNotes: { min: 0, max: 2000 },
  scopeItem: { min: 3, max: 200 },
  /** Hard ceiling on any client-supplied page size. */
  pageSize: { def: 20, max: 100 },
  nearby: { def: 60, max: 100, scan: 500 },
} as const;

/* Coordinates -------------------------------------------------------------- */

/**
 * WGS84 bounds. `NaN` and `Infinity` are rejected explicitly: `v.number()`
 * accepts both, and a NaN latitude silently poisons distance sorting and the
 * map.
 */
export function assertCoordinate(lat: number, lng: number): void {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw err.invalid("That location is not a valid point on the map.");
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw err.invalid("That location is not a valid point on the map.");
  }
}

/* Strings ------------------------------------------------------------------ */

/**
 * Trims, then enforces a length window. Returns the cleaned value so callers
 * cannot accidentally persist the untrimmed original.
 */
export function cleanString(
  value: string,
  field: string,
  { min, max }: { min: number; max: number },
): string {
  const trimmed = value.trim();
  if (trimmed.length < min) {
    throw err.invalid(
      min === 1
        ? `${field} is required.`
        : `${field} must be at least ${min} characters.`,
    );
  }
  if (trimmed.length > max) {
    throw err.invalid(`${field} must be ${max} characters or fewer.`);
  }
  return trimmed;
}

/** Optional string: trims, and rejects if present-but-empty or over-long. */
export function cleanOptionalString(
  value: string | undefined,
  field: string,
  { min, max }: { min: number; max: number },
): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length < min) {
    throw err.invalid(`${field} must be at least ${min} characters.`);
  }
  if (trimmed.length > max) {
    throw err.invalid(`${field} must be ${max} characters or fewer.`);
  }
  return trimmed;
}

/* Pagination --------------------------------------------------------------- */

/**
 * Clamps a client-supplied page size. `NaN` falls back to the default rather
 * than propagating into `.take()`, which would throw.
 */
export function clampLimit(
  value: number | undefined,
  def: number,
  max: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return def;
  return Math.min(Math.max(Math.trunc(value), 1), max);
}

/**
 * Bounds a client-supplied search radius in kilometres.
 *
 * `NaN` is the dangerous input here: `Math.max(NaN, min)` is `NaN`, and every
 * distance comparison against `NaN` is false, so the query would silently
 * return nothing instead of reporting a bad request.
 */
export function clampRadiusKm(
  value: number | undefined,
  def: number,
  min: number,
  max: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return def;
  return Math.min(Math.max(value, min), max);
}

/**
 * Bounds a client-supplied idempotency key.
 *
 * The key is stored verbatim in the database, so an unbounded string is both a
 * storage cost and a way to write a row the client could never match again.
 * Returns `""` for an absent or blank key, which the claim helper treats as
 * "no key supplied".
 */
export function cleanIdempotencyKey(value: string | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length > 100) {
    throw err.precondition("That submission key is too long.");
  }
  return trimmed;
}

/* Uploads ------------------------------------------------------------------ */

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export type StorageMetadata = {
  size: number;
  contentType?: string;
} | null;

/** Any Convex context that can read the system table. */
type SystemReader = { db: { system: { get: (...args: never[]) => Promise<unknown> } } };

/**
 * Reads upload metadata from the `_storage` system table.
 *
 * Uses `ctx.db.system.get` rather than the deprecated `ctx.storage.getMetadata`.
 * Returns `null` for a file that was never uploaded, was deleted, or belongs to
 * another deployment — all of which must be treated as "no usable photo".
 */
export async function readUploadMetadata(
  ctx: SystemReader,
  storageId: unknown,
): Promise<StorageMetadata> {
  const get = ctx.db.system.get as unknown as (
    table: string,
    id: unknown,
  ) => Promise<unknown>;
  const row = (await get("_storage", storageId)) as
    | { size: number; contentType?: string }
    | undefined
    | null;
  if (!row) return null;
  return { size: row.size, contentType: row.contentType };
}

/** Convenience wrapper that validates an upload in one call. */
export async function assertFreshUpload(
  ctx: SystemReader,
  storageId: unknown,
  maxBytes = MAX_UPLOAD_BYTES,
): Promise<void> {
  assertUsableImage(await readUploadMetadata(ctx, storageId), maxBytes);
}

/**
 * Verifies an upload after it lands in storage.
 *
 * `generateUploadUrl` cannot constrain the request body, so the bytes are
 * inspected once they exist. This is the only place that decides whether a file
 * may be attached to a case.
 */
export function assertUsableImage(
  metadata: StorageMetadata,
  maxBytes = MAX_UPLOAD_BYTES,
): void {
  if (!metadata) {
    throw err.storageMissing("That photo did not finish uploading. Try again.");
  }
  if (metadata.size <= 0) {
    throw err.unsupportedMedia("That file is empty.");
  }
  if (metadata.size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    throw err.tooLarge(`Photos must be ${mb} MB or smaller.`);
  }
  // Browsers occasionally send no type for camera captures. An absent type is
  // tolerated; a present-but-wrong type is not.
  if (
    metadata.contentType &&
    !ALLOWED_IMAGE_TYPES.includes(
      metadata.contentType as (typeof ALLOWED_IMAGE_TYPES)[number],
    )
  ) {
    throw err.unsupportedMedia(
      "Only JPEG, PNG, WebP or HEIC photos are accepted.",
    );
  }
}
