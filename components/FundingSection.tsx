"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCents, FUND_CONTRIBUTION, PAYMENT_METHODS } from "@/lib/civic";
import { useState } from "react";
import { ArrowUpRight, CheckCircle, Clock, XCircle, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { FileDrop } from "@/components/form";
import type { Id } from "@/convex/_generated/dataModel";

interface FundingSectionProps {
  issueId: string;
  goalCents: number;
  myClaimStatus: "none" | "pending" | "approved" | "rejected" | null;
  myClaimAmount?: number;
  onSuccess: () => void;
}

export function FundingSection({
  issueId,
  goalCents,
  myClaimStatus,
  myClaimAmount,
  onSuccess,
}: FundingSectionProps) {
  const typedIssueId = issueId as Id<"issues">;
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<typeof PAYMENT_METHODS[number]>(PAYMENT_METHODS[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showContributors, setShowContributors] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const submitClaim = useMutation(api.fund.submitClaim);
  const generateUploadUrl = useMutation(api.evidence.generateUploadUrl);
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
  const canContribute = fundData.contributionsOpen && !isFullFunded;

  const uploadScreenshot = async (): Promise<Id<"_storage">> => {
    if (!selectedFile) throw new Error("Please select a screenshot.");
    setIsUploading(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": selectedFile.type || "image/png" },
        body: selectedFile,
      });
      if (!res.ok) throw new Error("Upload failed.");
      const data = await res.json();
      return data.storageId as Id<"_storage">;
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmitClaim = async () => {
    if (!amount) {
      setError("Please enter the amount you sent.");
      return;
    }
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (isNaN(amountCents)) {
      setError("Invalid amount.");
      return;
    }
    if (amountCents < FUND_CONTRIBUTION.min) {
      setError(`Minimum claim is PKR ${formatCents(FUND_CONTRIBUTION.min)}.`);
      return;
    }
    if (amountCents > FUND_CONTRIBUTION.max) {
      setError(`Maximum claim is PKR ${formatCents(FUND_CONTRIBUTION.max)}.`);
      return;
    }
    if (!selectedFile) {
      setError("Please attach a screenshot of your payment confirmation.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const storageId = await uploadScreenshot();
      await submitClaim({
        issueId: typedIssueId,
        amountCents,
        paymentMethod,
        screenshotStorageId: storageId,
      });
      setAmount("");
      setSelectedFile(null);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit claim.");
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

      {/* Status badges */}
      <div className="flex flex-wrap items-center gap-2">
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
        {fundData.pendingClaimCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700">
            <Clock className="size-3" />
            {fundData.pendingClaimCount} pending review
          </span>
        )}
      </div>

      {/* My claim status */}
      {myClaimStatus === "pending" && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-yellow-600" />
            <span className="text-sm font-medium text-yellow-800">Claim under review</span>
          </div>
          <p className="mt-1 text-xs text-yellow-700">
            Your claim of PKR {formatCents(myClaimAmount!)} is being reviewed by an administrator.
          </p>
        </div>
      )}
      {myClaimStatus === "approved" && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="size-4 text-green-600" />
            <span className="text-sm font-medium text-green-800">Claim approved</span>
          </div>
          <p className="mt-1 text-xs text-green-700">
            Your contribution of PKR {formatCents(myClaimAmount!)} has been credited. Thank you!
          </p>
        </div>
      )}
      {myClaimStatus === "rejected" && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3">
          <div className="flex items-center gap-2">
            <XCircle className="size-4 text-red-600" />
            <span className="text-sm font-medium text-red-800">Claim rejected</span>
          </div>
          <p className="mt-1 text-xs text-red-700">
            Your claim was rejected. Please contact an administrator if you believe this is an error.
          </p>
        </div>
      )}

      {/* Submit claim form */}
      {myClaimStatus === "none" && canContribute && (
        <div className="space-y-3 rounded-md border border-border p-3">
          <h3 className="text-sm font-medium">Submit a payment claim</h3>
          <p className="text-xs text-muted-foreground">
            Send the amount to the project bank account, then submit your claim with a screenshot.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Amount (PKR)</label>
              <Input
                type="number"
                step="0.01"
                placeholder="e.g. 500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Payment method</label>
              <select
                value={paymentMethod}
                onChange={(e) => {
                  const method = e.target.value as typeof PAYMENT_METHODS[number];
                  setPaymentMethod(method);
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m === "bank_transfer" ? "Bank Transfer" : m === "easypaisa" ? "EasyPaisa" : "JazzCash"}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Payment screenshot</label>
            <FileDrop
              id="fund-screenshot"
              accept="image/*"
              capture="environment"
              disabled={isUploading}
              onSelect={(file) => setSelectedFile(file ?? null)}
              emptyLabel="Attach screenshot of payment confirmation"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button
            onClick={handleSubmitClaim}
            disabled={isLoading || isUploading}
            className="w-full"
          >
            {isLoading ? "Submitting…" : "Submit Claim"}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Min: PKR {formatCents(FUND_CONTRIBUTION.min)} | Max: PKR {formatCents(FUND_CONTRIBUTION.max)}
          </p>
        </div>
      )}

      {myClaimStatus !== "none" && canContribute && (
        <Button disabled className="w-full">
          {myClaimStatus === "pending" ? "Claim Pending" : myClaimStatus === "approved" ? "Already Contributed" : "Claim Rejected"}
        </Button>
      )}

      {!canContribute && !isFullFunded && (
        <Button disabled className="w-full">
          Contributions Closed
        </Button>
      )}
      {isFullFunded && (
        <Button disabled className="w-full bg-green-500">
          Goal Reached!
        </Button>
      )}

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
        <ArrowUpRight className={cn("size-4 text-muted-foreground transition-transform", showContributors && "rotate-45")} />
      </button>

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