/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as admin_audit from "../admin_audit.js";
import type * as admin_core from "../admin_core.js";
import type * as admin_demo from "../admin_demo.js";
import type * as admin_export from "../admin_export.js";
import type * as analytics from "../analytics.js";
import type * as auth from "../auth.js";
import type * as errors from "../errors.js";
import type * as evidence from "../evidence.js";
import type * as fund from "../fund.js";
import type * as inspections from "../inspections.js";
import type * as issues from "../issues.js";
import type * as lib from "../lib.js";
import type * as lifecycle from "../lifecycle.js";
import type * as notifications from "../notifications.js";
import type * as notify from "../notify.js";
import type * as oversight from "../oversight.js";
import type * as rateLimit from "../rateLimit.js";
import type * as users from "../users.js";
import type * as validation from "../validation.js";
import type * as workOrders from "../workOrders.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  admin_audit: typeof admin_audit;
  admin_core: typeof admin_core;
  admin_demo: typeof admin_demo;
  admin_export: typeof admin_export;
  analytics: typeof analytics;
  auth: typeof auth;
  errors: typeof errors;
  evidence: typeof evidence;
  fund: typeof fund;
  inspections: typeof inspections;
  issues: typeof issues;
  lib: typeof lib;
  lifecycle: typeof lifecycle;
  notifications: typeof notifications;
  notify: typeof notify;
  oversight: typeof oversight;
  rateLimit: typeof rateLimit;
  users: typeof users;
  validation: typeof validation;
  workOrders: typeof workOrders;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
