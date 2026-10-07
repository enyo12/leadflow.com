import { AlertCircle, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Rendered below the description — usually a button or link. */
  action?: React.ReactNode;
  /** "error" switches to the destructive colour treatment. */
  tone?: "default" | "error";
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = "default",
  className,
}: EmptyStateProps) {
  const isError = tone === "error";
  const ResolvedIcon = Icon ?? (isError ? AlertCircle : undefined);

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center",
        isError ? "border-destructive/40 bg-destructive/5" : "border-border",
        className,
      )}
    >
      {ResolvedIcon ? (
        <ResolvedIcon
          className={cn(
            "size-6",
            isError ? "text-destructive" : "text-muted-foreground",
          )}
          aria-hidden="true"
        />
      ) : null}
      <p
        className={cn(
          "text-sm font-medium",
          isError ? "text-destructive" : "text-foreground",
        )}
      >
        {title}
      </p>
      {description ? (
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
