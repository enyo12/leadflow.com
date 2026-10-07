/**
 * Supabase configuration.
 *
 * Both values are public (they ship to the browser), so they live in
 * NEXT_PUBLIC_* variables. Security comes from Row Level Security, not from
 * keeping these secret. Any *server-only* key (for example a service-role key)
 * must never be read here.
 *
 * Supabase's dashboard now labels this key "publishable key" on newer
 * projects; it is the same client credential as the legacy "anon key".
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_CLIENT_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const SUPABASE_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

/** True when both values are present. Used to show setup instructions instead of crashing. */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_CLIENT_KEY);
}

/** Which of the required variables are missing — safe to render in the UI. */
export function missingSupabaseEnvVars(): string[] {
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!SUPABASE_CLIENT_KEY) {
    missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return missing;
}

export function getSupabaseConfig(): { url: string; key: string } {
  if (!SUPABASE_URL || !SUPABASE_CLIENT_KEY) {
    throw new Error(
      `Supabase is not configured. Missing: ${missingSupabaseEnvVars().join(", ")}. ` +
        "Add them to .env.local (see .env.local.example).",
    );
  }
  return { url: SUPABASE_URL, key: SUPABASE_CLIENT_KEY };
}
