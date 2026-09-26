"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCents, FUND_CONTRIBUTION } from "@/lib/civic";
import { useState } from "react";
import { ArrowUpRight, Users } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [showContributors, setShowContributors] = useState(false);

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
  const progress = Math.min(100, Math.round((totalRaised / goalCents) * 100));
  const isFullFunded = totalRaised >= goalCents;

  const handleContribute = async () => {
    if (!amount) {
      setError("Please enter an amount.");
      return;
    }
    
    const amountInPkr = parseFloat(amount);
    if (isNaN(amountInPkr)) {
      setError("Invalid amount.");
      return;
    }
    
    const cents = Math.round(amountInPkr * 100);
    
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
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium">Funding Progress</span>
          <span className="text-muted-foreground">{progress}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted">
          <div
            className={cn(
              "h-2 rounded-full transition-all duration-500",
              isFullFunded ? "bg-green-500" : "bg-primary"
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>PKR {formattedTotal} raised</span>
          <span>Goal: PKR {formattedGoal}</span>
        </div>
      </div>

      {/* Status badge */}
      <div className="flex items-center gap-2">
        {fundData.contributionsOpen ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
            <span className="size-1.5 rounded-full bg-green-500" />
            Accepting contributions
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
            <span className="size-1.5 rounded-full bg-gray-400" />
            Contributions closed
          </span>
        )}
        {isFullFunded && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
            <span className="size-1.5 rounded-full bg-blue-500" />
            Fully funded!
          </span>
        )}
      </div>

      {/* Contribute form */}
      <div className="space-y-2">
        <Input
          type="number"
          step="0.01"
          placeholder="Enter amount in PKR (e.g., 500)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={!fundData.contributionsOpen || isFullFunded}
          className="w-full"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button
          onClick={handleContribute}
          disabled={isLoading || !fundData.contributionsOpen || isFullFunded}
          className="w-full"
        >
          {isLoading 
            ? "Processing..." 
            : isFullFunded 
              ? "Goal Reached!" 
              : !fundData.contributionsOpen 
                ? "Contributions Closed"
                : `Chip in PKR ${amount || "0"}`}
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          Min: PKR {formatCents(FUND_CONTRIBUTION.min)} | Max: PKR {formatCents(FUND_CONTRIBUTION.max)}
        </p>
      </div>

      {/* Contributors toggle */}
      <button
        type="button"
        onClick={() => setShowContributors(!showContributors)}
        className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/50"
      >
        <span className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          Contributors ({fundData.funderCount})
        </span>
        <ArrowUpRight className={cn(
          "size-4 text-muted-foreground transition-transform",
          showContributors && "rotate-45"
        )} />
      </button>

      {/* Contributors list */}
      {showContributors && (
        <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
          {fundData.contributions.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">No contributions yet. Be the first!</p>
          ) : (
            <ul className="space-y-1.5">
              {fundData.contributions.map((c) => (
                <li key={c._id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{c.contributorName}</span>
                  <span className="font-mono font-medium">PKR {formatCents(c.amountCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}