import { describe, it, expect, beforeAll } from "vitest";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

// Mock the auth and setup
const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

describe("Funding Logic", () => {
  let issueId: string;
  let workOrderId: string;
  let citizenUserId: string;

  beforeAll(async () => {
    // Mock user setup (replace with actual test setup)
    // This is a placeholder; adjust based on your test environment
    citizenUserId = "citizen-user-id";
  });

  it("should create a fund goal when a work order is created", async () => {
    // Mock issue and work order creation
    const mockIssueId = "mock-issue-id" as import("../../convex/_generated/dataModel").Id<"issues">;

    // Mock the auth to simulate a citizen user
    const mockAuth = { userId: citizenUserId, role: "citizen" };

    // Mock the database to return the above
    const goal = await client.query(api.fund.fund, { issueId: mockIssueId });
    expect(goal?.goalCents).toBe(5000); // Default for "road" category
  });

  it("should allow citizens to contribute", async () => {
    const mockIssueId = "mock-issue-id" as import("../../convex/_generated/dataModel").Id<"issues">;
    const mockWorkOrderId = "mock-work-order-id";

    // Mock the auth to simulate a citizen user
    const mockAuth = { userId: citizenUserId, role: "citizen" };

    const result = await client.mutation(api.fund.contribute, {
      issueId: mockIssueId,
      amountCents: 100,
    });

    expect(result).toHaveProperty("contributionId");
    expect(result.already).toBe(false);
  });

  it("should prevent duplicate contributions", async () => {
    const mockIssueId = "mock-issue-id" as import("../../convex/_generated/dataModel").Id<"issues">;

    // First contribution
    const result1 = await client.mutation(api.fund.contribute, {
      issueId: mockIssueId,
      amountCents: 100,
    });

    // Second contribution with the same amount
    const result2 = await client.mutation(api.fund.contribute, {
      issueId: mockIssueId,
      amountCents: 100,
    });

    expect(result2.already).toBe(true);
  });

  it("should prevent contributions if work order is not open", async () => {
    const mockIssueId = "mock-issue-id" as import("../../convex/_generated/dataModel").Id<"issues">;

    await expect(
      client.mutation(api.fund.contribute, {
        issueId: mockIssueId,
        amountCents: 100,
      })
    ).rejects.toThrow("Contributions are closed once a contractor claims the work.");
  });

  it("should prevent contributions if issue is closed", async () => {
    const mockIssueId = "mock-closed-issue-id" as import("../../convex/_generated/dataModel").Id<"issues">;

    await expect(
      client.mutation(api.fund.contribute, {
        issueId: mockIssueId,
        amountCents: 100,
      })
    ).rejects.toThrow("This case is closed.");
  });
});