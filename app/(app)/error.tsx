"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Catches read failures inside the app shell (for example a database that is
 * unreachable) so the user sees a recoverable message instead of a stack
 * trace. The underlying message is intentionally not rendered — it comes from
 * Postgres and can name tables and columns.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[leadflow] app error boundary:", error);
  }, [error]);

  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-4 py-10">
        <span className="flex size-10 items-center justify-center rounded-lg bg-destructive/10">
          <TriangleAlert className="size-5 text-destructive" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            Something went wrong
          </h2>
          <p className="text-sm text-muted-foreground">
            We could not load this page. Check your connection and try again.
          </p>
        </div>
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}
