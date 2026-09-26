"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCents, FUND_CONTRIBUTION } from "@/lib/civic";
import { useState } from "react";

interface FundingSectionProps {
  issueId: string;
  goalCents: number;
  onSuccess: () => void;
}

export function FundingSection({
  issueId,
  goalCents,
  onSuccess,
}: FundingSectionProps) {
  const typedIssueId = issueId as import("../convex/_generated/dataModel").Id<"issues">;
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const contribute = useMutation(api.fund.contribute);
  const fundData = useQuery(api.fund.fund, { issueId: typedIssueId });
  
  if (!fundData) {
    return (
      <div className="rounded-[var(--radius)] border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">Loading funding information...</p>
      </div>
    );
  }

  const totalRaised = fundData.totalCents;
  const formattedGoal = formatCents(goalCents);
  const formattedTotal = formatCents(totalRaised);
  
  const handleContribute = async () => {
    if (!amount) {
      setError("Please enter an amount.");
      return;
    }
    
    const amountInPounds = parseFloat(amount);
    if (isNaN(amountInPounds)) {
      setError("Invalid amount.");
      return;
    }
    
    const cents = Math.round(amountInPounds * 100);
    
    if (cents < FUND_CONTRIBUTION.min) {
      setError(`Choose at least PKR ${formatCents(FUND_CONTRIBUTION.min)}.`);
      return;
    }
    
    if (cents > FUND_CONTRIBUTION.max) {
      setError(`Maximum contribution is PKR ${formatCents(FUND_CONTRIBUTION.max)}.`);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      await contribute({ issueId: typedIssueId, amountCents: cents });
      setAmount("");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to contribute.");
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="rounded-[var(--radius)] border border-border bg-card p-4">
      <div className="flex flex-col gap-4">
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm font-medium">Goal</span>
            <span className="text-sm font-medium">PKR {formattedGoal}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Raised</span>
            <span className="text-sm font-medium">PKR {formattedTotal}</span>
          </div>
        </div>
        <div className="space-y-2">
          <Input
            type="number"
            placeholder="Enter amount (e.g., 5.00)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button
            onClick={handleContribute}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? "Processing..." : `Chip in PKR ${amount || ""}`}
          </Button>
        </div>
      </div>
    </div>
  );
}