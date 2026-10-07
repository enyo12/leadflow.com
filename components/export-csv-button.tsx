"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Triggers a CSV download for the currently selected leads.
 *
 * Sends only ids to the server, which re-fetches the rows under the caller's own
 * session. Nothing about the rows themselves is trusted from here — this
 * component does not even hold them.
 */

interface ExportCsvButtonProps {
  /** Lead ids currently selected. Empty disables the action. */
  leadIds: string[];
  size?: "sm" | "default";
  variant?: "default" | "outline";
}

type Status =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

/** Pulls the filename the server chose out of Content-Disposition. */
function filenameFrom(header: string | null): string {
  const match = header?.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? "leadflow-leads.csv";
}

export function ExportCsvButton({
  leadIds,
  size = "default",
  variant = "default",
}: ExportCsvButtonProps) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const disabled = leadIds.length === 0 || status.kind === "working";

  async function handleExport() {
    if (leadIds.length === 0) return;
    setStatus({ kind: "working" });

    try {
      const response = await fetch("/api/leads/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds }),
      });

      if (!response.ok) {
        // The route returns a friendly message; fall back to a generic one
        // rather than surfacing anything else it might have sent.
        const message = await response
          .json()
          .then((data: { error?: unknown }) =>
            typeof data?.error === "string" ? data.error : null,
          )
          .catch(() => null);

        setStatus({
          kind: "error",
          message: message ?? "Unable to export the selected leads. Please try again.",
        });
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filenameFrom(response.headers.get("Content-Disposition"));
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      URL.revokeObjectURL(url);

      // The server reports how many of the requested leads it could actually
      // read. A gap means the selection was stale — say so instead of letting
      // a short file pass as complete.
      const requested = Number(response.headers.get("X-LeadFlow-Requested"));
      const exported = Number(response.headers.get("X-LeadFlow-Exported"));

      setStatus({
        kind: "done",
        message:
          Number.isFinite(requested) && Number.isFinite(exported) && exported < requested
            ? `Exported ${exported} of ${requested} leads. ${requested - exported} were no longer available.`
            : "CSV downloaded.",
      });
    } catch {
      // Network failure, blocked download, revoked object URL — all the same to
      // the user, and none of them are worth surfacing raw.
      setStatus({
        kind: "error",
        message: "Unable to export the selected leads. Please try again.",
      });
    }
  }

  return (
    <div className="flex min-w-0 flex-col items-start gap-1.5">
      <Button
        type="button"
        size={size}
        variant={variant}
        onClick={handleExport}
        disabled={disabled}
        title={
          leadIds.length === 0 ? "Select at least one lead to export." : undefined
        }
      >
        {status.kind === "working" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="size-4" aria-hidden="true" />
        )}
        {status.kind === "working" ? "Preparing CSV…" : "Export CSV"}
      </Button>

      <span className="sr-only" role="status" aria-live="polite">
        {status.kind === "working" ? "Preparing CSV" : ""}
      </span>

      {status.kind === "error" ? (
        <p role="alert" className="max-w-xs text-xs break-words text-destructive">
          {status.message}
        </p>
      ) : null}

      {status.kind === "done" ? (
        <p className="max-w-xs text-xs break-words text-muted-foreground">
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
