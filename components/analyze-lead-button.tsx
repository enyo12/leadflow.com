"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";

import { analyzeLeadAction } from "@/app/(app)/leads/actions";
import { Button } from "@/components/ui/button";
import {
  AI_NOT_CONFIGURED_MESSAGE,
  EMPTY_ANALYZE_STATE,
} from "@/lib/analyze-form";

/**
 * The only thing in the application that can start an AI analysis.
 *
 * Analysis is never triggered by a search, by loading a page, or by any effect
 * in this component. It runs when — and only when — the user presses the
 * button, which is the cost-control requirement of the phase.
 *
 * The result is not rendered from the action's return value. On success this
 * refreshes the route and lets the server component render the persisted row,
 * so what the user sees is always what was actually saved.
 */

interface AnalyzeLeadButtonProps {
  companyId: string;
  /** True when the lead already has a stored analysis. */
  analyzed: boolean;
  /** False when ANTHROPIC_API_KEY is absent — the action is hidden, not broken. */
  aiConfigured: boolean;
  size?: "sm" | "default";
}

export function AnalyzeLeadButton({
  companyId,
  analyzed,
  aiConfigured,
  size = "default",
}: AnalyzeLeadButtonProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    analyzeLeadAction,
    EMPTY_ANALYZE_STATE,
  );

  // The action returns a fresh analyzedAt on success; refresh once per success,
  // not on every render.
  const lastHandled = useRef<string | null>(null);
  useEffect(() => {
    if (state.status !== "success" || !state.analyzedAt) return;
    if (lastHandled.current === state.analyzedAt) return;
    lastHandled.current = state.analyzedAt;
    router.refresh();
  }, [state.status, state.analyzedAt, router]);

  if (!aiConfigured) {
    return (
      <p className="max-w-xs text-xs break-words text-muted-foreground">
        {AI_NOT_CONFIGURED_MESSAGE}
      </p>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <form action={formAction}>
        <input type="hidden" name="companyId" value={companyId} />
        {/* Absent on the first analysis, "reanalyze" only after an explicit
            press of the Re-analyze button. */}
        {analyzed ? <input type="hidden" name="mode" value="reanalyze" /> : null}

        <Button type="submit" size={size} disabled={isPending}>
          {isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : analyzed ? (
            <RefreshCw className="size-4" aria-hidden="true" />
          ) : (
            <Sparkles className="size-4" aria-hidden="true" />
          )}
          {isPending ? "Analyzing lead…" : analyzed ? "Re-analyze" : "Analyze lead"}
        </Button>
      </form>

      {/* Announces the in-flight state to assistive tech without stealing focus. */}
      <span className="sr-only" role="status" aria-live="polite">
        {isPending ? "Analyzing lead" : ""}
      </span>

      {state.error ? (
        <p
          role="alert"
          className="max-w-xs text-xs break-words text-destructive"
        >
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
