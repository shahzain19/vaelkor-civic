"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, MessageSquare, MapPin, Plus, Trash2, X, Users } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CaseRef, PhaseRail, StatusTag } from "@/components/status";
import { EmptyState, ErrorState, Skeleton } from "@/components/feedback";
import { PageHeader, PageShell, Section, ScrollRow } from "@/components/shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EvidenceItem, ProofPair, ContactSheet } from "@/components/evidence";
import { categoryShort, affectedLabel, AFFECTED_LABEL, statusLabel } from "@/lib/civic";

const PostDetailSkeleton = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-[1fr] md:grid-cols-[3rem_minmax(0,1fr)] gap-4">
      <Skeleton className="h-8 w-20" />
      <div className="space-y-2">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    </div>
    <Skeleton className="h-4 w-3/4" />
    <Skeleton className="h-20 w-full" />
    <Skeleton className="h-20 w-full" />
  </div>
);

export default function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const router = useRouter();
  const post = useQuery(api.posts.get, { postId: id as Id<"posts"> });
  const createComment = useMutation(api.postComments.add);
  const removeComment = useMutation(api.postComments.remove);
  const toggleAffected = useMutation(api.posts.toggleAffected);
  const removePost = useMutation(api.posts.remove);

  const [commentBody, setCommentBody] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [toggled, setToggled] = useState(false);

  if (authLoading) {
    return (
      <PageShell width="wide">
        <PageHeader
          eyebrow="Civic Network"
          title="Loading…"
        />
        <PostDetailSkeleton />
      </PageShell>
    );
  }

  if (!post) {
    return (
      <PageShell width="wide">
        <PageHeader
          eyebrow="Civic Network"
          title="Post not found"
        />
        <EmptyState
          title="This post doesn't exist"
          body="It may have been removed by the author or an administrator."
          action={
            <Link href="/network" className={buttonVariants()}>
              Back to network
            </Link>
          }
          icon={X}
        />
      </PageShell>
    );
  }

  const linked = post.linkedCase;

  const evidence = post.evidence.map((e): EvidenceItem => ({
    _id: e.id,
    kind: "report",
    url: e.url ?? undefined,
    note: e.note ?? undefined,
    userName: e.userName,
    createdAt: post.createdAt,
  }));

  const caseEvidence: EvidenceItem[] = [];
  if (linked?.beforeUrl) {
    caseEvidence.push({
      _id: `${id}-before`,
      kind: "before",
      url: linked.beforeUrl,
      createdAt: post.createdAt,
      userName: "Work order",
    });
  }
  if (linked?.afterUrl) {
    caseEvidence.push({
      _id: `${id}-after`,
      kind: "after",
      url: linked.afterUrl,
      createdAt: post.createdAt,
      userName: "Work order",
    });
  }

  async function handleToggleAffected() {
    if (!isAuthenticated) {
      router.push("/sign-in");
      return;
    }
    setToggled(true);
    try {
      await toggleAffected({ postId: id as Id<"posts"> });
    } catch (e) {
      console.error(e);
    } finally {
      setToggled(false);
    }
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!isAuthenticated) {
      router.push("/sign-in");
      return;
    }
    if (!commentBody.trim()) return;
    setSubmittingComment(true);
    setCommentError(null);
    try {
      await createComment({ postId: id as Id<"posts">, body: commentBody.trim() });
      setCommentBody("");
    } catch (e) {
      setCommentError(e instanceof Error ? e.message : "Could not add comment. Try again.");
    } finally {
      setSubmittingComment(false);
    }
  }

  async function handleRemoveComment(commentId: string) {
    if (!confirm("Remove this comment?")) return;
    try {
      await removeComment({ commentId: commentId as Id<"comments"> });
    } catch (e) {
      console.error(e);
    }
  }

  async function handleRemovePost() {
    if (!confirm("Remove this post? This cannot be undone.")) return;
    try {
      await removePost({ postId: id as Id<"posts"> });
      router.push("/network");
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <PageShell width="wide">
      <div className="pt-6">
        <Link
          href="/network"
          className="inline-flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Network
        </Link>
      </div>

      <PageHeader
        eyebrow="Civic Network"
        title={post.title}
        description={
          <>
            <span className="text-[0.6875rem] font-medium tracking-[0.07em] uppercase text-muted-foreground">
              {categoryShort(post.category)}
            </span>
            {" · "}
            <span className="text-muted-foreground">{post.authorName}</span>
            {" · "}
            <time className="text-muted-foreground" dateTime={new Date(post.createdAt).toISOString()}>
              {new Date(post.createdAt).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" })}
            </time>
          </>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_32rem]">
        <div className="space-y-6">
          {/* Post content */}
          <Section label="Post" rule={false}>
            <div className="prose max-w-none">
              <p className="text-[0.9375rem] leading-relaxed text-pretty">{post.body}</p>
            </div>
            {post.address && (
              <p className="mt-3 flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
                <MapPin className="size-3.5" aria-hidden /> {post.address}
              </p>
            )}

            {/* Post evidence */}
            {post.evidence.length > 0 && (
              <Section label="Evidence attached to this post" rule>
                <ContactSheet evidence={evidence} />
              </Section>
            )}
          </Section>

          {/* Affected confirmation */}
          <Section label="Community confirmation" rule>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3">
                <Users className="size-5 text-muted-foreground" aria-hidden />
                <div>
                  <p className="text-[0.9375rem] font-medium">{affectedLabel(post.confirmationCount)}</p>
                  <p className="text-xs text-muted-foreground">
                    {post.affectedByMe ? "You have confirmed this affects you" : "Toggle to confirm you are also affected"}
                  </p>
                </div>
              </div>
              <Button
                variant={post.affectedByMe ? "secondary" : "outline"}
                size="lg"
                onClick={handleToggleAffected}
                disabled={!isAuthenticated || toggled}
                className="gap-2"
              >
                {post.affectedByMe ? (
                  <>
                    <Users className="size-3.5" aria-hidden />
                    Confirmed
                  </>
                ) : (
                  <>
                    <Plus className="size-3.5" aria-hidden />
                    {AFFECTED_LABEL}
                  </>
                )}
              </Button>
            </div>
          </Section>

          {/* Linked case */}
          {linked && (
            <Section label="Linked case" rule>
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2.5 rounded-[var(--radius)] border border-border bg-muted/40 px-3 py-2.5">
                  <CaseRef value={linked.caseNumber} className="text-foreground" />
                  <StatusTag status={linked.status} emphasis />
                  {linked.workOrder && (
                    <>
                      <span className="text-muted-foreground">→</span>
                      <span className="text-[0.8125rem] font-medium">
                        Work order: {linked.workOrder.status}
                      </span>
                      {linked.workOrder.contractorName && (
                        <span className="text-muted-foreground">· {linked.workOrder.contractorName}</span>
                      )}
                    </>
                  )}
                </div>

                <PhaseRail status={linked.status} labels />
              </div>

              {/* Case evidence - Proof pair */}
              {caseEvidence.length === 2 && (
                <Section label="Before / After evidence" rule>
                  <ProofPair evidence={caseEvidence} />
                </Section>
              )}
            </Section>
          )}

          {/* Comments */}
          <Section label={`Comments (${post.comments.length})`} rule>
            <form onSubmit={handleAddComment} className="space-y-4">
              <div className="flex gap-3">
                <div className="size-8 shrink-0 rounded-full bg-muted flex items-center justify-center">
                  <Camera className="size-4 text-muted-foreground" aria-hidden />
                </div>
                <div className="flex-1 space-y-2">
                  <Textarea
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    placeholder="Add a comment…"
                    rows={3}
                    className="resize-y"
                    disabled={submittingComment}
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Comments are public and cannot be edited — only removed by the author or an administrator.
                    </p>
                    <Button type="submit" size="sm" disabled={submittingComment || !commentBody.trim()}>
                      {submittingComment ? "Posting…" : "Post comment"}
                    </Button>
                  </div>
                </div>
              </div>
              {commentError && <ErrorState title="Could not post comment" body={commentError} />}
            </form>

            {post.comments.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No comments yet. Be the first to add one.</p>
            ) : (
              <div className="mt-6 space-y-4 border-t border-border pt-4">
                {post.comments.map((comment) => (
                  <CommentItem
                    key={comment.id}
                    comment={comment}
                    isAuthenticated={isAuthenticated}
                    onRemove={handleRemoveComment}
                  />
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-6 lg:sticky lg:top-(--header-h) lg:mt-8">
          <div className="rounded-[var(--radius)] border border-border bg-card p-5">
            <h3 className="text-[0.8125rem] font-medium">Post details</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">Category</dt>
                <dd className="font-mono text-foreground capitalize">{post.category.replace("_", " ")}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">Author</dt>
                <dd className="font-mono text-foreground">{post.authorName}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">Posted</dt>
                <dd className="font-mono text-foreground">
                  {new Date(post.createdAt).toLocaleString(undefined, { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </dd>
              </div>
              {linked && (
                <>
                  <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3">
                    <dt className="text-muted-foreground">Linked case</dt>
                    <dd className="font-mono text-foreground">{linked.caseNumber}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-muted-foreground">Case status</dt>
                    <dd className="font-mono text-foreground capitalize">{statusLabel(linked.status)}</dd>
                  </div>
                  {linked.workOrder && (
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-muted-foreground">Work order</dt>
                      <dd className="font-mono text-foreground capitalize">{linked.workOrder.status}</dd>
                    </div>
                  )}
                </>
              )}
            </dl>

            {isAuthenticated && post.authorId === post.viewerId && (
              <Button
                variant="destructive"
                className="mt-4 w-full"
                onClick={handleRemovePost}
              >
                <Trash2 className="size-3.5 mr-1.5" aria-hidden />
                Remove post
              </Button>
            )}
          </div>
        </aside>
      </div>

      <ScrollRow className="mt-12 justify-center pb-2">
        <p className="text-center text-xs text-muted-foreground">
          Posts are public. Confirmations are one per person. Comments cannot be edited — only removed.
        </p>
      </ScrollRow>
    </PageShell>
  );
}

function CommentItem({
  comment,
  isAuthenticated,
  onRemove,
}: {
  comment: {
    id: string;
    body: string;
    createdAt: number;
    authorId: string;
    authorName: string;
    isMine: boolean;
  };
  isAuthenticated: boolean;
  onRemove: (id: string) => void;
}) {
  return (
    <article className="flex gap-3">
      <div className="size-8 shrink-0 rounded-full bg-muted flex items-center justify-center">
        <MessageSquare className="size-4 text-muted-foreground" aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-medium">{comment.authorName}</p>
          <time className="text-xs text-muted-foreground">
            {new Date(comment.createdAt).toLocaleString(undefined, { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </time>
        </div>
        <p className="mt-1 text-[0.875rem] leading-relaxed">{comment.body}</p>
        {isAuthenticated && comment.isMine && (
          <button
            type="button"
            onClick={() => onRemove(comment.id)}
            className="mt-1.5 text-xs text-destructive hover:underline"
          >
            Remove
          </button>
        )}
      </div>
    </article>
  );
}