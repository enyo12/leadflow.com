import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Native <select>. Radix's listbox is intentionally avoided here: the MVP has
 * three fixed options, and the native control is smaller, accessible by
 * default, and works on touch devices without extra code.
 */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Select };
