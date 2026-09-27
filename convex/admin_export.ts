import { query } from "./_generated/server";
import { requireOversight } from "./auth";

/** Most rows one export will return. See the note on `exportCsv` about reporting it. */
const EXPORT_ROW_CAP = 5000;

/**
 * The full case ledger as CSV.
 *
 * Each row is one issue with its current status, category, severity, location,
 * confirmation count, and whether it has a work order. No per-user PII is
 * included — only the reporter's display name. Intended for admin reporting and
 * offline analysis.
 *
 * The read is capped, because a query that walks an unbounded ledger is a query
 * that eventually takes the whole function down. A cap that is not reported is
 * a lie, though: an administrator who exported 5,000 rows and was handed a file
 * with no note that 6,000-odd cases were missing would draw conclusions from
 * partial data without knowing it was partial. So the response says whether it
 * was cut short, and the caller is expected to say so on screen.
 */
export const exportCsv = query({
  args: {},
  handler: async (ctx) => {
    await requireOversight(ctx, "Only administrators can export the ledger.");

    // One row past the cap is the cheapest way to find out whether the cap
    // bit, without paying for a count over the whole table.
    const overCap = await ctx.db
      .query("issues")
      .withIndex("by_createdAt")
      .order("asc")
      .take(EXPORT_ROW_CAP + 1);
    const truncated = overCap.length > EXPORT_ROW_CAP;
    const issues = truncated ? overCap.slice(0, EXPORT_ROW_CAP) : overCap;

    const headers = [
      "Case Number",
      "Category",
      "Title",
      "Description",
      "Severity",
      "Status",
      "Address",
      "Latitude",
      "Longitude",
      "Confirmations",
      "Evidence Count",
      "Reporter",
      "Created",
      "Updated",
    ];

    const rows: string[] = [headers.join(",")];

    for (const issue of issues) {
      const reporter = await ctx.db.get(issue.reporterId);
      const row = [
        issue.caseNumber,
        issue.category,
        `"${(issue.title || "").replace(/"/g, '""')}"`,
        `"${(issue.description || "").replace(/"/g, '""')}"`,
        issue.severity,
        issue.status,
        `"${(issue.address || "").replace(/"/g, '""')}"`,
        issue.lat,
        issue.lng,
        issue.confirmationCount,
        issue.evidenceCount,
        `"${(reporter?.name ?? "Unknown").replace(/"/g, '""')}"`,
        new Date(issue.createdAt).toISOString(),
        new Date(issue.updatedAt).toISOString(),
      ];
      rows.push(row.join(","));
    }

    return {
      csv: rows.join("\n"),
      rowCount: issues.length,
      truncated,
    };
  },
});
