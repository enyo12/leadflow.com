import Link from "next/link";

/**
 * Layout for the signed-out routes. Deliberately has no navigation — there is
 * nothing to navigate to until the user signs in.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10 sm:px-6">
      <Link href="/login" className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
          LF
        </span>
        <span className="text-base font-semibold tracking-tight">LeadFlow</span>
      </Link>

      <div className="w-full max-w-sm">{children}</div>

      <p className="max-w-sm text-center text-xs text-muted-foreground">
        Prototype build. Lead data and AI analysis are simulated until the
        later phases are wired up.
      </p>
    </div>
  );
}
