import Link from "next/link";
import { Database } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { missingSupabaseEnvVars } from "@/lib/supabase/config";

export const metadata = { title: "Setup required" };

/**
 * Shown when the Supabase environment variables are absent, instead of
 * letting every page throw a stack trace. The missing variable *names* are
 * safe to display; no values are ever read or echoed here.
 */
export default function SetupPage() {
  const missing = missingSupabaseEnvVars();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-6 px-4 py-10 sm:px-6">
      <PageHeader
        title="Connect Supabase to continue"
        description="LeadFlow needs a Supabase project before it can sign users in or store data."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="size-4" aria-hidden="true" />
            Missing environment variables
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ul className="space-y-1.5">
            {missing.map((name) => (
              <li key={name}>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {name}
                </code>
              </li>
            ))}
          </ul>

          <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
            <li>
              Create a project at{" "}
              <a
                className="font-medium text-foreground underline underline-offset-4"
                href="https://supabase.com/dashboard"
                rel="noreferrer noopener"
                target="_blank"
              >
                supabase.com/dashboard
              </a>
              .
            </li>
            <li>
              Open <span className="font-medium text-foreground">Project Settings → API</span> and
              copy the <span className="font-medium text-foreground">Project URL</span> and the{" "}
              <span className="font-medium text-foreground">publishable / anon key</span>.
            </li>
            <li>
              Create a file named{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                .env.local
              </code>{" "}
              in the project root (copy{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                .env.local.example
              </code>
              ) and paste the two values.
            </li>
            <li>
              Run the SQL in{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                supabase/migrations/
              </code>{" "}
              against your project (SQL Editor, or{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                supabase db push
              </code>
              ).
            </li>
            <li>Restart the dev server so the new variables are picked up.</li>
          </ol>

          <p className="text-muted-foreground">
            These two values are public and safe for the browser. Never put a
            service-role key in a <code className="font-mono text-xs">NEXT_PUBLIC_</code>{" "}
            variable.
          </p>

          <Link
            className="inline-block font-medium text-foreground underline underline-offset-4"
            href="/"
          >
            Retry
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
